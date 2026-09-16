import type {Address} from "viem";

import {roundV2Abi, erc4626Abi} from "../chain/abis.js";
import {num} from "../db/index.js";
import {splitYield, type YieldSplit} from "../yield/math.js";
import type {Context} from "./context.js";

export type SidePosition = {
  principal: bigint;
  redeemed: bigint;
  redeemable: bigint;
  /** Vault shares this side's deposits bought, from the offchain ledger. */
  shares: bigint;
};

export type PositionSummary = {
  user: Address;
  custodial: Address | null;
  registered: boolean;
  sides: [SidePosition, SidePosition];
  launchBps: number | null;
  launchCommitment: bigint;
  launchReleased: boolean;
  launchSpent: boolean;
  vault: {shares: bigint; assets: bigint};
  /**
   * Principal still in custody against the vault's current value. What the user sees is
   * `netYield` and `redeemable`; `fee` is shown so the 10% is never a surprise.
   */
  yield: YieldSplit;
  feeBps: number;
  openWithdrawals: number;
};

/**
 * The figure the interface shows. Principal and launch state come from the round ledger,
 * value from the vault, shares from the offchain ledger. Yield is computed here and only
 * here, so every screen agrees.
 *
 * Hot path (polled once per visitor per 6s): the two contract reads go out as one
 * multicall, and the share price comes from a short-lived cache — one eth_call per
 * request instead of three.
 */
export async function positionSummary(ctx: Context, user: Address): Promise<PositionSummary> {
  const {clients, round, vault, accounts} = ctx;
  const account = await accounts.get(user, round.id);
  const custodial = account?.address ?? null;

  let onchain: Awaited<ReturnType<typeof round.readPosition>>;
  let vaultShares = 0n;
  if (custodial) {
    const [position, shares] = await clients.publicClient.multicall({
      allowFailure: false,
      contracts: [
        {address: round.address, abi: roundV2Abi, functionName: "getPosition", args: [user]},
        {address: vault.address, abi: erc4626Abi, functionName: "balanceOf", args: [custodial]},
      ],
    });
    onchain = {...position, launchBps: Number(position.launchBps)};
    vaultShares = shares;
  } else {
    onchain = await round.readPosition(user);
  }
  const vaultAssets = await vault.assetsFromShares(vaultShares);

  const rows = await ctx.sql<{side: number; shares: string}[]>`
    select side, shares from positions
    where user_wallet = ${user.toLowerCase()} and round_id = ${ctx.round.id}
  `;
  const sharesBySide = [0n, 0n] as [bigint, bigint];
  for (const row of rows) sharesBySide[row.side as 0 | 1] = num(row.shares);

  const openRows = await ctx.sql<{count: string}[]>`
    select count(*)::text as count from withdrawals
    where user_wallet = ${user.toLowerCase()} and round_id = ${ctx.round.id}
      and state not in ('done', 'failed')
  `;
  const count = openRows[0]?.count ?? "0";

  const principalInCustody =
    onchain.principalA - onchain.redeemedA + (onchain.principalB - onchain.redeemedB);

  return {
    user,
    custodial,
    registered: account?.registeredTx != null,
    sides: [
      {
        principal: onchain.principalA,
        redeemed: onchain.redeemedA,
        redeemable: onchain.redeemableA,
        shares: sharesBySide[0],
      },
      {
        principal: onchain.principalB,
        redeemed: onchain.redeemedB,
        redeemable: onchain.redeemableB,
        shares: sharesBySide[1],
      },
    ],
    launchBps: onchain.launchBpsSet ? onchain.launchBps : null,
    launchCommitment: onchain.launchCommitment,
    launchReleased: onchain.launchReleased,
    launchSpent: onchain.launchSpent,
    vault: {shares: vaultShares, assets: vaultAssets},
    yield: splitYield(principalInCustody, vaultAssets, ctx.cfg.FEE_BPS),
    feeBps: ctx.cfg.FEE_BPS,
    openWithdrawals: Number(count),
  };
}
