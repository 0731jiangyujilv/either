import postgres from "postgres";

/**
 * One connection pool for the process. `numeric` columns come back as strings and are
 * converted to bigint at the query site, so nothing wide ever passes through a js number.
 */
export type Db = postgres.Sql;

export function createDb(url: string): Db {
  return postgres(url, {
    max: 10,
    // bigint columns as bigint, not string
    types: {bigint: postgres.BigInt},
    transform: {undefined: null},
  });
}

/** `numeric` arrives as text; this is the one place it becomes a bigint. */
export function num(value: string | bigint | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  return BigInt(value);
}
