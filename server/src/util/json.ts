/** `JSON.stringify` that writes bigint as a decimal string, the api's wire format for amounts. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

/** Convert a value tree for a Hono `c.json()` call, which cannot see bigint. */
export function jsonable<T>(value: T): unknown {
  return JSON.parse(toJson(value));
}

/** Serial async loop: run `fn`, wait `everyMs`, repeat. Errors are logged, never fatal. */
export function loop(name: string, everyMs: number, fn: () => Promise<void>): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    if (stopped) return;
    try {
      await fn();
    } catch (error) {
      console.error(`[${name}]`, error instanceof Error ? error.message : error);
    }
    if (!stopped) timer = setTimeout(run, everyMs);
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
