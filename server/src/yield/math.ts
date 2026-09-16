/**
 * The fee and split arithmetic, in bigint base units, with no dependency on the chain or
 * the database so it can be tested exhaustively.
 */

export const BPS = 10_000n;

export type YieldSplit = {
  /** What the vault would hand back right now. */
  currentAssets: bigint;
  /** `max(0, currentAssets - principal)`. */
  grossYield: bigint;
  /** `grossYield × feeBps / 10_000` — zero whenever there is no positive yield. */
  fee: bigint;
  netYield: bigint;
  /** `principal + netYield`, or `currentAssets` when the vault is under water. */
  redeemable: bigint;
  /** True when `currentAssets < principal`; the platform neither tops up nor charges. */
  underwater: boolean;
};

/**
 * Split a position's current value into principal, platform fee and user yield.
 *
 * Fees come only out of positive yield. A loss passes straight through to the user as a
 * lower redeemable, with no fee — the published terms, and invariant 2 in CLAUDE.md.
 */
export function splitYield(principal: bigint, currentAssets: bigint, feeBps: bigint | number): YieldSplit {
  const bps = BigInt(feeBps);
  if (principal < 0n || currentAssets < 0n) throw new RangeError("amounts must be non-negative");
  if (bps < 0n || bps > BPS) throw new RangeError("feeBps must be within 0..10000");

  if (currentAssets <= principal) {
    return {
      currentAssets,
      grossYield: 0n,
      fee: 0n,
      netYield: 0n,
      redeemable: currentAssets,
      underwater: currentAssets < principal,
    };
  }

  const grossYield = currentAssets - principal;
  const fee = (grossYield * bps) / BPS;
  const netYield = grossYield - fee;
  return {
    currentAssets,
    grossYield,
    fee,
    netYield,
    redeemable: principal + netYield,
    underwater: false,
  };
}

export type WinnerSplit = {
  /** Principal held back for the launch: `principal × launchBps / 10_000`, floored. */
  launchpad: bigint;
  /** Principal returned to the user right after settlement. */
  free: bigint;
};

/** Mirrors `EitherRoundV2._bps` exactly, so the two ledgers never disagree by a unit. */
export function winnerSplit(principal: bigint, launchBps: number): WinnerSplit {
  if (launchBps < 0 || launchBps > Number(BPS)) throw new RangeError("launchBps must be within 0..10000");
  const launchpad = (principal * BigInt(launchBps)) / BPS;
  return {launchpad, free: principal - launchpad};
}

/**
 * Price per share as a fixed-point ratio scaled by 1e18, from vault totals. Returns 1e18
 * for an empty vault so a first snapshot never divides by zero.
 */
export function pricePerShare(totalAssets: bigint, totalSupply: bigint): bigint {
  if (totalSupply === 0n) return 10n ** 18n;
  return (totalAssets * 10n ** 18n) / totalSupply;
}

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

/**
 * Annualised growth between two price-per-share readings. Display only — a float is fine
 * here and nowhere else. Returns null when the window is empty or too short to mean anything.
 */
export function annualizedApy(
  earlier: {pricePerShare: bigint; at: Date},
  later: {pricePerShare: bigint; at: Date},
  minSeconds = 60 * 60,
): number | null {
  const dt = (later.at.getTime() - earlier.at.getTime()) / 1000;
  if (dt < minSeconds || earlier.pricePerShare === 0n) return null;
  const growth = Number(later.pricePerShare) / Number(earlier.pricePerShare);
  if (!Number.isFinite(growth) || growth <= 0) return null;
  return Math.pow(growth, SECONDS_PER_YEAR / dt) - 1;
}

/** The apy a user actually sees once the platform's share of yield is removed. */
export function netApy(grossApy: number, feeBps: number): number {
  return grossApy * (1 - feeBps / Number(BPS));
}
