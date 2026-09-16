/**
 * A single-entry TTL memo, not a cache library. The server is one process by design
 * (the recorder nonce is only advanced from there), so a closure is all the
 * coordination there is: concurrent callers share one flight, and a failure leaves
 * the previous value in place so a blip never serves an error page.
 */
export function ttlCache<A extends unknown[], T>(
  ttlMs: number,
  fn: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  let value: T | undefined;
  let expiresAt = 0;
  let inflight: Promise<T> | undefined;

  return async (...args: A): Promise<T> => {
    if (value !== undefined && Date.now() < expiresAt) return value;
    if (inflight) return inflight;

    inflight = fn(...args)
      .then((fresh) => {
        value = fresh;
        expiresAt = Date.now() + ttlMs;
        return fresh;
      })
      .catch((error: unknown) => {
        if (value !== undefined) {
          // a blip serves the previous value for a short grace window, then retries
          expiresAt = Date.now() + Math.min(ttlMs, 1_000);
          return value;
        }
        throw error;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  };
}
