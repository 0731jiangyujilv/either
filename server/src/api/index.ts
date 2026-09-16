import {Hono} from "hono";
import {cors} from "hono/cors";
import {getAddress, type Address} from "viem";
import {z} from "zod";

import {AuthError, issueNonce, verifySigned, type SignedRequest} from "../auth/signed.js";
import {ensureGas} from "../chain/gas.js";
import {vaultInfo} from "../jobs/snapshots.js";
import type {Context} from "../services/context.js";
import {positionSummary} from "../services/positions.js";
import {WithdrawalError, WithdrawalService} from "../services/withdrawals.js";
import {ttlCache} from "../util/cache.js";
import {jsonable} from "../util/json.js";

const signed = z.object({
  address: z.string(),
  message: z.string(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

const withdrawBody = signed.extend({
  side: z.union([z.literal(0), z.literal(1)]),
  kind: z.enum(["pre_settlement", "redemption", "launch_release"]),
});

/**
 * What the web app talks to. Reads are open — everything in them is onchain or derived
 * from it. Writes need a fresh signature from the wallet they act for.
 */
export function createApi(ctx: Context, withdrawals: WithdrawalService) {
  const app = new Hono();

  // every visitor polls /api/round every few seconds; the ledger itself changes at
  // most per block, so one shared read per 5s serves the whole audience. the jobs and
  // the withdrawal paths keep reading fresh — this is display traffic only.
  const readRoundShared = ttlCache(5_000, () => ctx.round.readRound());

  app.use("/api/*", cors({origin: ctx.cfg.CORS_ORIGIN, allowMethods: ["GET", "POST"]}));

  app.onError((error, c) => {
    if (error instanceof AuthError) return c.json({error: error.message}, 401);
    if (error instanceof WithdrawalError) return c.json({error: error.message}, 409);
    if (error instanceof z.ZodError) return c.json({error: "invalid request", issues: error.issues}, 400);
    console.error("[api]", error);
    return c.json({error: "internal error"}, 500);
  });

  app.get("/api/health", (c) => c.json({ok: true, round: ctx.round.id}));

  app.get("/api/round", async (c) => {
    const [round, vault] = await Promise.all([readRoundShared(), vaultInfo(ctx)]);
    return c.json(jsonable({round, vault, feeRecipient: ctx.cfg.FEE_RECIPIENT}));
  });

  app.get("/api/nonce", async (c) => c.json(await issueNonce(ctx.sql)));

  app.get("/api/position/:address", async (c) => {
    const user = parseAddress(c.req.param("address"));
    return c.json(jsonable(await positionSummary(ctx, user)));
  });

  app.get("/api/withdrawals/:address", async (c) => {
    const user = parseAddress(c.req.param("address"));
    return c.json(jsonable(await withdrawals.list(user)));
  });

  /**
   * Create — or return — the caller's custodial account and bind it on the round. The
   * eth top-up runs in the background so the response is not held up by a block.
   */
  app.post("/api/account", async (c) => {
    const body = signed.parse(await c.req.json()) satisfies SignedRequest;
    const user = await verifySigned(ctx.sql, {domain: ctx.cfg.SIWE_DOMAIN, action: "create account"}, body);

    let account = await ctx.accounts.getOrCreate(user, ctx.round.id);
    if (!account.registeredTx) {
      const onchain = await ctx.round.custodialOf(user);
      if (onchain && onchain.toLowerCase() !== account.address) {
        throw new Error("round already binds this user to a different custodial address");
      }
      const tx = onchain ? ("0x" as `0x${string}`) : await ctx.round.registerAccount(user, account.address);
      await ctx.accounts.markRegistered(account, tx);
      account = {...account, registeredTx: tx};
    }

    void ensureGas(ctx.clients, ctx.cfg.CUSTODIAL_GAS_TARGET_WEI, account.address).catch((error) =>
      console.error("[gas]", error instanceof Error ? error.message : error),
    );

    return c.json(jsonable(account));
  });

  app.post("/api/withdraw", async (c) => {
    const body = withdrawBody.parse(await c.req.json());
    const action = body.kind === "launch_release" ? "release launch" : "withdraw";
    const user = await verifySigned(ctx.sql, {domain: ctx.cfg.SIWE_DOMAIN, action}, body);
    return c.json(jsonable(await withdrawals.request(user, body.side, body.kind)), 201);
  });

  return app;
}

function parseAddress(raw: string): Address {
  try {
    return getAddress(raw);
  } catch {
    throw new z.ZodError([{code: "custom", path: ["address"], message: "malformed address"}]);
  }
}
