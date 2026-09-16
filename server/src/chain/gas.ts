import type {Address, Hex} from "viem";

import {confirmed, type Clients} from "./client.js";

/**
 * Custodial accounts hold usdg but pay gas in eth. Before any of them signs, top it up
 * to `target` if it has dropped below half — and say so, because the funder itself
 * running dry is the one failure that stalls every withdrawal at once.
 */
export async function ensureGas(clients: Clients, target: bigint, custodial: Address): Promise<Hex | null> {
  const balance = await clients.publicClient.getBalance({address: custodial});
  if (balance >= target / 2n) return null;

  const funderBalance = await clients.publicClient.getBalance({address: clients.gasFunder.account.address});
  const topUp = target - balance;
  if (funderBalance < topUp * 2n) {
    console.warn(`[gas] funder ${clients.gasFunder.account.address} low: ${funderBalance} wei`);
  }
  if (funderBalance < topUp) throw new Error("gas funder cannot cover the top-up");

  const hash = await clients.gasFunder.sendTransaction({to: custodial, value: topUp});
  return confirmed(clients.publicClient, hash, "gas top-up");
}
