import type {Address, Hex} from "viem";

import {roundV2Abi} from "../chain/abis.js";
import {ensureGas} from "../chain/gas.js";
import {num} from "../db/index.js";
import type {Context} from "./context.js";

const CURSOR = "deposits";
const MAX_RANGE = 2_000n;

/**
 * Follows `Backed` events on the round and turns each one into a pending `vault_deposit`
 * job. Waits `CONFIRMATIONS` blocks so a reorg cannot leave a phantom deposit behind, and
 * keys every event on `(txHash, logIndex)` so a re-scan is a no-op.
 */
export class DepositIndexer {
  constructor(private readonly ctx: Context) {}

  async tick(): Promise<void> {
    const {sql, clients, round, cfg} = this.ctx;

    const head = await clients.publicClient.getBlockNumber();
    const safe = head - BigInt(cfg.CONFIRMATIONS);

    const [cursor] = await sql<{block_number: bigint}[]>`
      select block_number from indexer_cursor where name = ${CURSOR}
    `;
    const from = cursor ? BigInt(cursor.block_number) : cfg.V1_DEPLOY_BLOCK;
    if (from > safe) return;
    const to = from + MAX_RANGE < safe ? from + MAX_RANGE : safe;

    const logs = await clients.publicClient.getContractEvents({
      address: round.address,
      abi: roundV2Abi,
      eventName: "Backed",
      fromBlock: from,
      toBlock: to,
      strict: true,
    });

    for (const log of logs) {
      const {user, side, amount, launchBps} = log.args;
      const txHash = log.transactionHash;
      const logIndex = log.logIndex;
      if (!txHash || logIndex === null) continue;

      await sql.begin(async (tx) => {
        const fresh = await tx`
          insert into processed_events (tx_hash, log_index, block_number)
          values (${txHash}, ${logIndex}, ${log.blockNumber.toString()})
          on conflict do nothing
          returning tx_hash
        `;
        if (fresh.length === 0) return;

        const wallet = user.toLowerCase();
        await tx`insert into users (wallet_address) values (${wallet}) on conflict do nothing`;
        await tx`
          insert into positions (user_wallet, round_id, side, principal, launch_bps)
          values (${wallet}, ${round.id}, ${side}, ${amount.toString()}, ${launchBps})
          on conflict (user_wallet, round_id, side) do update
            set principal = positions.principal + excluded.principal,
                launch_bps = excluded.launch_bps,
                updated_at = now()
        `;
        await tx`
          insert into transactions
            (operation_id, user_wallet, round_id, kind, side, amount, block_number, log_index, status)
          values
            (${`vault_deposit:${txHash}:${logIndex}`}, ${wallet}, ${round.id}, 'vault_deposit',
             ${side}, ${amount.toString()}, ${log.blockNumber.toString()}, ${logIndex}, 'pending')
          on conflict (operation_id) do nothing
        `;
      });
    }

    await sql`
      insert into indexer_cursor (name, block_number) values (${CURSOR}, ${(to + 1n).toString()})
      on conflict (name) do update set block_number = excluded.block_number
    `;
  }
}

type PendingDeposit = {
  id: number;
  operation_id: string;
  user_wallet: string;
  side: number;
  amount: string;
};

/**
 * Moves usdg that has landed in a custodial account into the vault, one pending job at a
 * time, and books the shares it bought against the side that deposited.
 */
export class VaultDepositExecutor {
  constructor(private readonly ctx: Context) {}

  async tick(): Promise<void> {
    const {sql} = this.ctx;
    const jobs = await sql<PendingDeposit[]>`
      select id, operation_id, user_wallet, side, amount::text as amount
      from transactions
      where kind = 'vault_deposit' and status = 'pending'
      order by id
      limit 5
    `;
    for (const job of jobs) {
      try {
        await this.run(job);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[vault-deposit] ${job.operation_id}: ${message}`);
        await sql`update transactions set error = ${message}, updated_at = now() where id = ${job.id}`;
      }
    }
  }

  private async run(job: PendingDeposit): Promise<void> {
    const {sql, clients, cfg, vault, accounts, round} = this.ctx;
    const user = job.user_wallet as Address;
    const account = await accounts.get(user, round.id);
    if (!account) throw new Error("no custodial account for a recorded deposit");

    // The custodial account only ever receives usdg through the router, so a balance
    // below the recorded amount means an earlier run already swept this deposit before
    // it could mark the job. Deposit what is there and never more than was recorded.
    const recorded = num(job.amount);
    const balance = await vault.usdgBalance(account.address);
    const assets = balance < recorded ? balance : recorded;

    if (assets === 0n) {
      await sql`
        update transactions set status = 'confirmed', error = 'nothing left to deposit', updated_at = now()
        where id = ${job.id}
      `;
      return;
    }

    await ensureGas(clients, cfg.CUSTODIAL_GAS_TARGET_WEI, account.address);
    await sql`update transactions set status = 'sent', updated_at = now() where id = ${job.id}`;

    const {hash, shares} = await accounts.withSigner(account, (signer) => vault.deposit(signer, assets));

    await sql.begin(async (tx) => {
      await tx`
        update positions set shares = shares + ${shares.toString()}, updated_at = now()
        where user_wallet = ${job.user_wallet} and round_id = ${round.id} and side = ${job.side}
      `;
      await tx`
        update transactions
        set status = 'confirmed', tx_hash = ${hash as Hex}, shares = ${shares.toString()}, updated_at = now()
        where id = ${job.id}
      `;
    });
  }
}
