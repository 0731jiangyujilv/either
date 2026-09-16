import type {AccountProvider} from "../accounts/provider.js";
import type {Clients} from "../chain/client.js";
import type {RoundLedger} from "../chain/round.js";
import type {MorphoVault} from "../chain/vault.js";
import type {Config} from "../config.js";
import type {Db} from "../db/index.js";

/** Everything a service needs, assembled once in `index.ts`. */
export type Context = {
  cfg: Config;
  sql: Db;
  clients: Clients;
  round: RoundLedger;
  vault: MorphoVault;
  accounts: AccountProvider;
};
