import {describe, expect, it, vi} from "vitest";

import {ttlCache} from "./cache.js";

// fake timers keep the ttl math from depending on real sleeps
vi.useFakeTimers();

describe("ttlCache", () => {
  it("calls the underlying function once per ttl window", async () => {
    const fn = vi.fn(async (n: number) => n * 2);
    const cached = ttlCache(5_000, fn);

    expect(await cached(1)).toBe(2);
    expect(await cached(1)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6_000);
    expect(await cached(1)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight call between concurrent callers", async () => {
    let resolve!: (v: number) => void;
    const fn = vi.fn(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    const cached = ttlCache(5_000, fn);

    const first = cached();
    const second = cached();
    resolve(7);
    expect(await first).toBe(7);
    expect(await second).toBe(7);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous value when a refresh fails", async () => {
    let shouldFail = false;
    const fn = vi.fn(async () => {
      if (shouldFail) throw new Error("rpc down");
      return "ok";
    });
    const cached = ttlCache(5_000, fn);

    expect(await cached()).toBe("ok");
    shouldFail = true;
    vi.advanceTimersByTime(6_000);
    // the refresh throws, so callers see the stale value rather than nothing
    await expect(cached()).resolves.toBe("ok");
  });
});
