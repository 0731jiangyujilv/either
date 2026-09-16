import {describe, expect, it} from "vitest";

import {annualizedApy, netApy, pricePerShare, splitYield, winnerSplit} from "./math.js";

describe("splitYield", () => {
  it("takes the fee out of positive yield only", () => {
    const s = splitYield(100_000_000n, 110_000_000n, 1_000);
    expect(s.grossYield).toBe(10_000_000n);
    expect(s.fee).toBe(1_000_000n);
    expect(s.netYield).toBe(9_000_000n);
    expect(s.redeemable).toBe(109_000_000n);
    expect(s.underwater).toBe(false);
  });

  it("charges nothing when there is no yield", () => {
    const s = splitYield(100n, 100n, 1_000);
    expect(s.fee).toBe(0n);
    expect(s.redeemable).toBe(100n);
    expect(s.underwater).toBe(false);
  });

  it("passes a loss through with no fee", () => {
    const s = splitYield(100_000_000n, 95_000_000n, 1_000);
    expect(s.grossYield).toBe(0n);
    expect(s.fee).toBe(0n);
    expect(s.netYield).toBe(0n);
    expect(s.redeemable).toBe(95_000_000n);
    expect(s.underwater).toBe(true);
  });

  it("floors the fee so the user gets the rounding unit", () => {
    const s = splitYield(0n, 9n, 1_000); // 10% of 9 = 0.9 → 0
    expect(s.fee).toBe(0n);
    expect(s.netYield).toBe(9n);
  });

  it("fee plus net yield always equals gross yield", () => {
    for (let i = 0n; i < 2_000n; i++) {
      const principal = 1_000_000n + i * 7n;
      const current = principal + i * 13n;
      const s = splitYield(principal, current, 1_000);
      expect(s.fee + s.netYield).toBe(s.grossYield);
      expect(s.redeemable).toBe(principal + s.netYield);
      expect(s.redeemable + s.fee).toBe(current);
    }
  });

  it("rejects out-of-range inputs", () => {
    expect(() => splitYield(-1n, 0n, 0)).toThrow(RangeError);
    expect(() => splitYield(0n, 0n, 10_001)).toThrow(RangeError);
  });
});

describe("winnerSplit", () => {
  it("floors the launchpad share like the contract", () => {
    expect(winnerSplit(40_000_000n, 2_500)).toEqual({launchpad: 10_000_000n, free: 30_000_000n});
    expect(winnerSplit(1n, 9_999)).toEqual({launchpad: 0n, free: 1n});
    expect(winnerSplit(7n, 5_000)).toEqual({launchpad: 3n, free: 4n});
  });

  it("covers both ends of the slider", () => {
    expect(winnerSplit(5n, 0)).toEqual({launchpad: 0n, free: 5n});
    expect(winnerSplit(5n, 10_000)).toEqual({launchpad: 5n, free: 0n});
  });
});

describe("apy", () => {
  const day = 24 * 60 * 60 * 1000;

  it("returns 1e18 for an empty vault", () => {
    expect(pricePerShare(0n, 0n)).toBe(10n ** 18n);
  });

  it("annualises growth between two readings", () => {
    const at0 = new Date("2026-09-01T00:00:00Z");
    const apy = annualizedApy(
      {pricePerShare: 10n ** 18n, at: at0},
      {pricePerShare: 10n ** 18n + 10n ** 15n, at: new Date(at0.getTime() + 30 * day)},
    );
    // 0.1% over 30 days ≈ 1.22% a year
    expect(apy).toBeGreaterThan(0.012);
    expect(apy).toBeLessThan(0.0125);
  });

  it("refuses windows too short to mean anything", () => {
    const at0 = new Date();
    expect(
      annualizedApy({pricePerShare: 1n, at: at0}, {pricePerShare: 2n, at: new Date(at0.getTime() + 1000)}),
    ).toBeNull();
  });

  it("nets the fee out of the displayed rate", () => {
    expect(netApy(0.05, 1_000)).toBeCloseTo(0.045);
  });
});
