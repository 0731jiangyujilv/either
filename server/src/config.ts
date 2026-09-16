import {readFileSync} from "node:fs";
import process from "node:process";

import {z} from "zod";

/**
 * Loads `.env` next to package.json without a dependency. Precedence stays with real env
 * vars so production deployments never depend on a file. Called before the first z.parse;
 * a malformed file throws with the offending line.
 */
function loadDotEnv() {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) throw new Error(`bad .env line: ${line}`);
      const key = trimmed.slice(0, eq).trim();
      if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const hexKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 0x-prefixed 32-byte hex key");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed address");

const schema = z.object({
  RH_CHAIN_ID: z.coerce.number().int().positive().default(4663),
  RH_RPC_URL: z.string().url().default("https://rpc.mainnet.chain.robinhood.com/"),
  USDG_ADDRESS: address.default("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
  MORPHO_VAULT_ADDRESS: address.default("0x37788ff0c1d4e45A7FE06BC7e71e0cc00121d0A8"),
  ROUND_V2_ADDRESS: address,
  DEPOSIT_ROUTER_ADDRESS: address,
  V1_DEPLOY_BLOCK: z.coerce.bigint().nonnegative().default(0n),

  RECORDER_PRIVATE_KEY: hexKey,
  GAS_FUNDER_PRIVATE_KEY: hexKey,

  FEE_RECIPIENT: address.default("0x1F6334dF3d6ef04d17d479529fe22472574F4433"),
  FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(1_000),

  KEY_PROVIDER: z.enum(["local"]).default("local"),
  KEK_HEX: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/, "KEK_HEX must be 32 bytes of hex"),

  DATABASE_URL: z.string().url(),

  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  SIWE_DOMAIN: z.string().default("localhost:3000"),

  CONFIRMATIONS: z.coerce.number().int().min(0).default(3),
  CUSTODIAL_GAS_TARGET_WEI: z.coerce.bigint().positive().default(200_000_000_000_000n),
});

export type Config = z.infer<typeof schema>;

/**
 * Parsed once at startup. A missing or malformed value fails loudly here rather than as
 * an undefined somewhere in the executor.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  loadDotEnv();
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`invalid configuration:\n${issues}`);
  }
  return parsed.data;
}
