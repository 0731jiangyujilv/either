import {serve} from "@hono/node-server";
import type {Address} from "viem";

import {EoaAccountProvider} from "./accounts/provider.js";
import {createApi} from "./api/index.js";
import {makeClients} from "./chain/client.js";
import {RoundLedger} from "./chain/round.js";
import {MorphoVault} from "./chain/vault.js";
import {loadConfig} from "./config.js";
import {createDb} from "./db/index.js";
import {SettlementJob} from "./jobs/settle.js";
import {SnapshotJob} from "./jobs/snapshots.js";
import {LocalKekProvider} from "./keys/envelope.js";
import type {Context} from "./services/context.js";
import {DepositIndexer, VaultDepositExecutor} from "./services/deposits.js";
import {WithdrawalService} from "./services/withdrawals.js";
import {loop} from "./util/json.js";

async function main() {
  const cfg = loadConfig();
  const sql = createDb(cfg.DATABASE_URL);
  const clients = makeClients(cfg);
  const round = new RoundLedger(clients, cfg.ROUND_V2_ADDRESS as Address);
  const vault = new MorphoVault(clients, cfg.MORPHO_VAULT_ADDRESS as Address, cfg.USDG_ADDRESS as Address);
  const accounts = new EoaAccountProvider(sql, LocalKekProvider.fromHex(cfg.KEK_HEX));
  const ctx: Context = {cfg, sql, clients, round, vault, accounts};

  // refuse to start against a vault that is not denominated in the round's usdg
  if (!(await vault.assetIsUsdg())) throw new Error("vault.asset() is not the configured usdg");
  const chainId = await clients.publicClient.getChainId();
  if (chainId !== cfg.RH_CHAIN_ID) throw new Error(`rpc is chain ${chainId}, expected ${cfg.RH_CHAIN_ID}`);

  const withdrawals = new WithdrawalService(ctx);
  const indexer = new DepositIndexer(ctx);
  const depositor = new VaultDepositExecutor(ctx);
  const settlement = new SettlementJob(ctx);
  const snapshots = new SnapshotJob(ctx);

  // one serial loop per concern; the recorder's nonce is only ever advanced from here.
  // the indexer is the only tick that always spends rpc (getBlockNumber + getLogs); the two
  // executors read the database first and touch the chain only when it hands them work, so a
  // wider interval there costs seconds of latency rather than throughput.
  const stops = [
    loop("indexer", 30_000, () => indexer.tick()),
    loop("vault-deposit", 30_000, () => depositor.tick()),
    loop("withdrawals", 30_000, () => withdrawals.tick()),
    loop("settle", 1200_000, () => settlement.tick()),
    loop("snapshots", 10 * 60_000, () => snapshots.tick()),
  ];

  const app = createApi(ctx, withdrawals);
  const server = serve({fetch: app.fetch, port: cfg.PORT}, (info) => {
    console.log(`either server on :${info.port} — round ${round.id} — recorder ${clients.recorder.account.address}`);
  });

  const shutdown = async () => {
    for (const stop of stops) stop();
    server.close();
    await sql.end({timeout: 5});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
