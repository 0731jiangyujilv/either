import {num} from "../db/index.js";
import type {Context} from "../services/context.js";
import {annualizedApy, netApy, pricePerShare} from "../yield/math.js";

/** Records the vault's totals so apy can be derived without depending on the morpho api. */
export class SnapshotJob {
  constructor(private readonly ctx: Context) {}

  async tick(): Promise<void> {
    const {sql, round, vault} = this.ctx;
    const {totalAssets, totalSupply, block} = await vault.totals();
    await sql`
      insert into vault_snapshots (round_id, vault, block_number, total_assets, total_supply)
      values (${round.id}, ${vault.address.toLowerCase()}, ${block.toString()}, ${totalAssets.toString()}, ${totalSupply.toString()})
    `;
  }
}

export type VaultInfo = {
  address: string;
  totalAssets: bigint;
  /** Annualised from snapshots at least a day apart; null until there is enough history. */
  grossApy: number | null;
  netApy: number | null;
  feeBps: number;
  sampledOver: {from: string; to: string} | null;
};

export async function vaultInfo(ctx: Context): Promise<VaultInfo> {
  const {sql, round, vault, cfg} = ctx;
  type Row = {total_assets: string; total_supply: string; taken_at: Date};

  const [latest] = await sql<Row[]>`
    select total_assets::text, total_supply::text, taken_at from vault_snapshots
    where round_id = ${round.id} order by taken_at desc limit 1
  `;
  // the oldest reading at least a day back, or failing that the oldest we have
  const [earlier] = await sql<Row[]>`
    (select total_assets::text, total_supply::text, taken_at from vault_snapshots
     where round_id = ${round.id} and taken_at <= now() - interval '1 day'
     order by taken_at desc limit 1)
    union all
    (select total_assets::text, total_supply::text, taken_at from vault_snapshots
     where round_id = ${round.id} order by taken_at asc limit 1)
    limit 1
  `;

  const totalAssets = latest ? num(latest.total_assets) : (await vault.totals()).totalAssets;

  let grossApy: number | null = null;
  let sampledOver: VaultInfo["sampledOver"] = null;
  if (latest && earlier) {
    grossApy = annualizedApy(
      {pricePerShare: pricePerShare(num(earlier.total_assets), num(earlier.total_supply)), at: earlier.taken_at},
      {pricePerShare: pricePerShare(num(latest.total_assets), num(latest.total_supply)), at: latest.taken_at},
    );
    if (grossApy !== null) {
      sampledOver = {from: earlier.taken_at.toISOString(), to: latest.taken_at.toISOString()};
    }
  }

  return {
    address: vault.address,
    totalAssets,
    grossApy,
    netApy: grossApy === null ? null : netApy(grossApy, cfg.FEE_BPS),
    feeBps: cfg.FEE_BPS,
    sampledOver,
  };
}
