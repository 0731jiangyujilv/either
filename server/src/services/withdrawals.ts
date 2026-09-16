import type {Address, Hex} from "viem";

import {ensureGas} from "../chain/gas.js";
import {LaunchState} from "../chain/round.js";
import {num} from "../db/index.js";
import {splitYield} from "../yield/math.js";
import type {Context} from "./context.js";

export type WithdrawalKind = "pre_settlement" | "redemption" | "launch_release";

export type WithdrawalRow = {
  id: number;
  user_wallet: string;
  side: number;
  kind: WithdrawalKind;
  principal: string;
  shares: string;
  gross_assets: string | null;
  fee: string | null;
  net_payout: string | null;
  state: string;
  release_tx: string | null;
  redeem_tx: string | null;
  payout_tx: string | null;
  fee_tx: string | null;
  record_tx: string | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

export class WithdrawalError extends Error {}

/**
 * Withdrawals are whole-position and multi-step. `request` decides what is owed and
 * writes one row; `tick` walks each open row through
 *
 *   pending → (release) → redeeming → redeemed → paying → paid → recording → done
 *
 * saving every transaction hash as it goes, so a crash at any point resumes from the
 * last completed step instead of paying twice.
 *
 *   pre_settlement  the whole side comes back, score drops        (recordWithdraw)
 *   redemption      what the ledger says is redeemable; a winner's launch share stays in
 *                   the vault, everything else including all yield comes back (recordRedeem)
 *   launch_release  a winner gives up the launch share, then redeems everything
 */
export class WithdrawalService {
  constructor(private readonly ctx: Context) {}

  async list(user: Address): Promise<WithdrawalRow[]> {
    return this.ctx.sql<WithdrawalRow[]>`
      select * from withdrawals
      where user_wallet = ${user.toLowerCase()} and round_id = ${this.ctx.round.id}
      order by id desc
    `;
  }

  async request(user: Address, side: 0 | 1, kind: WithdrawalKind): Promise<WithdrawalRow> {
    const {sql, round, vault} = this.ctx;
    const wallet = user.toLowerCase();

    const open = await sql`
      select id from withdrawals
      where user_wallet = ${wallet} and round_id = ${round.id} and side = ${side}
        and state not in ('done', 'failed')
    `;
    if (open.length > 0) throw new WithdrawalError("a withdrawal on this side is already in progress");

    const [state, position] = await Promise.all([round.readRound(), round.readPosition(user)]);
    const principalOnSide = side === 0 ? position.principalA : position.principalB;
    const redeemable = side === 0 ? position.redeemableA : position.redeemableB;
    const isWinner = state.settled && state.winner === side;

    let principal: bigint;
    let keepAssets = 0n;

    switch (kind) {
      case "pre_settlement":
        if (state.settled) throw new WithdrawalError("the round has settled — redeem instead");
        principal = principalOnSide;
        break;
      case "redemption":
        if (!state.settled) throw new WithdrawalError("the round has not settled yet");
        principal = redeemable;
        if (isWinner && !position.launchReleased && !position.launchSpent) {
          keepAssets = position.launchCommitment;
        }
        break;
      case "launch_release":
        if (!state.settled) throw new WithdrawalError("the round has not settled yet");
        if (!isWinner) throw new WithdrawalError("only the winning side has a launch share");
        if (state.launchState !== LaunchState.Pending) throw new WithdrawalError("the launch window has closed");
        if (position.launchReleased || position.launchCommitment === 0n) {
          throw new WithdrawalError("nothing committed to release");
        }
        principal = redeemable + position.launchCommitment;
        break;
    }
    if (principal === 0n) throw new WithdrawalError("nothing to withdraw on this side");

    const [row] = await sql<{shares: string}[]>`
      select shares::text as shares from positions
      where user_wallet = ${wallet} and round_id = ${round.id} and side = ${side}
    `;
    const heldShares = num(row?.shares);
    if (heldShares === 0n) throw new WithdrawalError("deposit is still on its way into the vault — try again shortly");

    let shares = heldShares;
    if (keepAssets > 0n) {
      const keepShares = await vault.sharesFor(keepAssets);
      shares = keepShares >= heldShares ? 0n : heldShares - keepShares;
      if (shares === 0n) throw new WithdrawalError("nothing beyond the launch share to redeem");
    }

    const [created] = await sql<WithdrawalRow[]>`
      insert into withdrawals (user_wallet, round_id, side, kind, principal, shares)
      values (${wallet}, ${round.id}, ${side}, ${kind}, ${principal.toString()}, ${shares.toString()})
      returning *
    `;
    if (!created) throw new Error("withdrawal insert returned nothing");
    return created;
  }

  async tick(): Promise<void> {
    const rows = await this.ctx.sql<WithdrawalRow[]>`
      select * from withdrawals
      where round_id = ${this.ctx.round.id} and state not in ('done', 'failed')
      order by id
      limit 5
    `;
    for (const row of rows) {
      try {
        await this.advance(row);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[withdrawal ${row.id}] ${message}`);
        await this.ctx.sql`update withdrawals set error = ${message}, updated_at = now() where id = ${row.id}`;
      }
    }
  }

  /** Run every remaining step for one row, saving after each. */
  private async advance(row: WithdrawalRow): Promise<void> {
    const {sql, clients, cfg, round, vault, accounts} = this.ctx;
    const user = row.user_wallet as Address;
    const side = row.side as 0 | 1;
    const account = await accounts.get(user, round.id);
    if (!account) throw new Error("no custodial account");

    const set = async (fields: Record<string, string | number | null>) => {
      await sql`update withdrawals set ${sql(fields)}, updated_at = now() where id = ${row.id}`;
      Object.assign(row, fields);
    };

    if (row.state === "pending") {
      if (row.kind === "launch_release" && !row.release_tx) {
        const releaseTx = await round.releaseLaunch(user);
        await set({release_tx: releaseTx});
      }
      await set({state: "redeeming"});
    }

    if (row.state === "redeeming") {
      await ensureGas(clients, cfg.CUSTODIAL_GAS_TARGET_WEI, account.address);
      const {hash, assets} = await accounts.withSigner(account, (signer) => vault.redeem(signer, num(row.shares)));
      await set({state: "redeemed", redeem_tx: hash, gross_assets: assets.toString()});
    }

    if (row.state === "redeemed") {
      const split = splitYield(num(row.principal), num(row.gross_assets), cfg.FEE_BPS);
      await set({
        state: "paying",
        fee: split.fee.toString(),
        net_payout: split.redeemable.toString(),
      });
    }

    if (row.state === "paying") {
      const net = num(row.net_payout);
      const fee = num(row.fee);
      if (!row.payout_tx && net > 0n) {
        const payoutTx = await accounts.withSigner(account, (signer) => vault.transferUsdg(signer, user, net));
        await set({payout_tx: payoutTx});
      }
      if (!row.fee_tx && fee > 0n) {
        const feeTx = await accounts.withSigner(account, (signer) =>
          vault.transferUsdg(signer, cfg.FEE_RECIPIENT as Address, fee),
        );
        await set({fee_tx: feeTx});
      }
      await set({state: "paid"});
    }

    if (row.state === "paid") {
      await set({state: "recording"});
    }

    if (row.state === "recording") {
      const principal = num(row.principal);
      if (!row.record_tx) {
        const recordTx: Hex =
          row.kind === "pre_settlement"
            ? await round.recordWithdraw(user, side, principal)
            : await round.recordRedeem(user, side, principal);
        await set({record_tx: recordTx});
      }
      await sql.begin(async (tx) => {
        await tx`
          update positions
          set principal = greatest(principal - ${principal.toString()}, 0),
              shares = greatest(shares - ${row.shares}, 0),
              updated_at = now()
          where user_wallet = ${row.user_wallet} and round_id = ${round.id} and side = ${side}
        `;
        await tx`update withdrawals set state = 'done', error = null, updated_at = now() where id = ${row.id}`;
      });
    }
  }
}
