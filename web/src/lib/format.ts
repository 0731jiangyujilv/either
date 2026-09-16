import {USDC_DECIMALS} from "./contracts";

const UNIT = 10n ** BigInt(USDC_DECIMALS);

/** `$286k` — compact usdc amount, matching the arena mock. */
export function formatCompactUsd(amount: bigint): string {
  const whole = amount / UNIT;

  if (whole >= 1_000_000_000n) return `$${trim(whole, 1_000_000_000n)}b`;
  if (whole >= 1_000_000n) return `$${trim(whole, 1_000_000n)}m`;
  if (whole >= 1_000n) return `$${trim(whole, 1_000n)}k`;
  if (amount === 0n) return "$0";
  if (whole === 0n) return `$${formatUsdc(amount, 2)}`;
  return `$${whole.toLocaleString("en-US")}`;
}

function trim(whole: bigint, divisor: bigint): string {
  const value = Number(whole) / Number(divisor);
  // one decimal below 100, none above, so the number stays short
  return value >= 100 ? String(Math.round(value)) : stripZero(value.toFixed(1));
}

function stripZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/** Exact usdc amount with thousands separators, e.g. `1,250.50`. */
export function formatUsdc(amount: bigint, maxDecimals = USDC_DECIMALS): string {
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / UNIT;
  const fraction = absolute % UNIT;

  let fractionText = fraction.toString().padStart(USDC_DECIMALS, "0").slice(0, maxDecimals);
  fractionText = fractionText.replace(/0+$/, "");

  const wholeText = whole.toLocaleString("en-US");
  const text = fractionText ? `${wholeText}.${fractionText}` : wholeText;
  return negative ? `-${text}` : text;
}

/** `6,482` */
export function formatCount(value: bigint | number): string {
  return BigInt(value).toLocaleString("en-US");
}

/**
 * `54%` / `46%` — integer percentages that always sum to 100 so the two
 * numbers under the bar never disagree with each other.
 */
export function splitPercent(a: bigint, b: bigint): {a: number; b: number} | null {
  const total = a + b;
  if (total === 0n) return null;

  // round side a, give the remainder to side b
  const scaled = Number((a * 10_000n) / total) / 100;
  const percentA = Math.round(scaled);
  return {a: percentA, b: 100 - percentA};
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** `sep 30 · 23:59 utc` */
export function formatEndTime(unixSeconds: bigint): string {
  const date = new Date(Number(unixSeconds) * 1000);
  const month = MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day} · ${hours}:${minutes} utc`;
}

/** `2026-09-30 23:59 utc` — used in the support record, where precision matters. */
export function formatTimestamp(unixSeconds: bigint): string {
  const date = new Date(Number(unixSeconds) * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} utc`
  );
}

/** `0x1234…abcd` */
export function shortenAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Parse a user-typed usdc amount into base units. Returns null when unusable. */
export function parseUsdc(input: string): bigint | null {
  const text = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;

  const [whole = "0", fraction = ""] = text.split(".");
  if (fraction.length > USDC_DECIMALS) return null;

  const padded = fraction.padEnd(USDC_DECIMALS, "0");
  return BigInt(whole || "0") * UNIT + BigInt(padded || "0");
}
