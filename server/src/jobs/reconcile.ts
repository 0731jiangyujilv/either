import type {Address} from "viem";

import {EoaAccountProvider} from "../accounts/provider.js";
import {makeClients} from "../chain/client.js";
import {RoundLedger} from "../chain/round.js";
import {MorphoVault} from "../chain/vault.js";
import {loadConfig} from "../config.js";
import {createDb, num} from "../db/index.js";
import {LocalKekProvider} from "../keys/envelope.js";

/**
 * `npm run reconcile` — recompute what every custodial account should hold from the
 * offchain ledger and compare with the chain. Any difference is printed and the process
 * exits non-zero, so this can gate a deploy or run from cron.
 *
 * Checks, per account:
 *   Σ positions.shares            == vault.balanceOf(custodial)
 *   Σ positions.principal         == Σ round principal − redeemed
 *   usdg sitting in the account   == 0, unless a deposit or withdrawal is mid-flight
 */
async function main() {
  const cfg = loadConfig();
  const sql = createDb(cfg.DATABASE_URL);
  const clients = makeClients(cfg);
  const round = new RoundLedger(clients, cfg.ROUND_V2_ADDRESS as Address);
  const vault = new MorphoVault(clients, cfg.MORPHO_VAULT_ADDRESS as Address, cfg.USDG_ADDRESS as Address);
  const accounts = new EoaAccountProvider(sql, LocalKekProvider.fromHex(cfg.KEK_HEX));

  let problems = 0;
  try {
    const users = await sql<{user_wallet: string}[]>`
      select user_wallet from custodial_accounts where round_id = ${round.id}
    `;

    for (const {user_wallet} of users) {
      const user = user_wallet as Address;
      const account = await accounts.get(user, round.id);
      if (!account) continue;

      const rows = await sql<{side: number; principal: string; shares: string}[]>`
        select side, principal::text, shares::text from positions
        where user_wallet = ${user_wallet} and round_id = ${round.id}
      `;
      const ledgerShares = rows.reduce((sum, r) => sum + num(r.shares), 0n);
      const ledgerPrincipal = rows.reduce((sum, r) => sum + num(r.principal), 0n);

      const [onchain, vaultShares, idleUsdg, inFlight] = await Promise.all([
        round.readPosition(user),
        vault.sharesOf(account.address),
        vault.usdgBalance(account.address),
        sql`
          select 1 from withdrawals where user_wallet = ${user_wallet} and round_id = ${round.id}
            and state not in ('done', 'failed')
          union all
          select 1 from transactions where user_wallet = ${user_wallet} and round_id = ${round.id}
            and kind = 'vault_deposit' and status in ('pending', 'sent')
        `,
      ]);
      const chainPrincipal =
        onchain.principalA - onchain.redeemedA + (onchain.principalB - onchain.redeemedB);

      const report = (what: string, expected: bigint, actual: bigint) => {
        problems++;
        console.error(`${user} ${what}: ledger ${expected} vs chain ${actual} (Δ ${actual - expected})`);
      };
      if (ledgerShares !== vaultShares) report("shares", ledgerShares, vaultShares);
      if (ledgerPrincipal !== chainPrincipal) report("principal", ledgerPrincipal, chainPrincipal);
      if (idleUsdg !== 0n && inFlight.length === 0) report("idle usdg", 0n, idleUsdg);
    }

    console.log(problems === 0 ? `reconciled ${users.length} accounts, no differences` : `${problems} differences`);
  } finally {
    await sql.end();
  }
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
