import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import {privateKeyToAccount, type PrivateKeyAccount} from "viem/accounts";

import type {Config} from "../config.js";

export function robinhoodChain(cfg: Pick<Config, "RH_CHAIN_ID" | "RH_RPC_URL">): Chain {
  return defineChain({
    id: cfg.RH_CHAIN_ID,
    name: "robinhood chain",
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [cfg.RH_RPC_URL]}},
    // deployed but not part of viem's registry; declaring it unlocks client.multicall
    contracts: {
      multicall3: {
        address: "0xcA11bde05977b3631167028862bE2a173976CA11",
        blockCreated: 0,
      },
    },
  });
}

/** A wallet client with its chain and account fixed, so writes need neither repeated. */
export type Signer = WalletClient<Transport, Chain, PrivateKeyAccount>;

/** A wallet client bound to one key. The same shape serves hot keys and custodial accounts. */
export function signerFor(chain: Chain, rpcUrl: string, privateKey: Hex): Signer {
  return createWalletClient({account: privateKeyToAccount(privateKey), chain, transport: http(rpcUrl)});
}

export type Clients = {
  chain: Chain;
  rpcUrl: string;
  publicClient: PublicClient;
  /** Writes to the round ledger. */
  recorder: Signer;
  /** Sends eth to custodial accounts. */
  gasFunder: Signer;
  /** A wallet client for an unsealed custodial key, alive only inside `withSigner`. */
  walletFor(account: PrivateKeyAccount): Signer;
};

export function makeClients(cfg: Config): Clients {
  const chain = robinhoodChain(cfg);
  const rpcUrl = cfg.RH_RPC_URL;
  return {
    chain,
    rpcUrl,
    publicClient: createPublicClient({chain, transport: http(rpcUrl)}),
    recorder: signerFor(chain, rpcUrl, cfg.RECORDER_PRIVATE_KEY as Hex),
    gasFunder: signerFor(chain, rpcUrl, cfg.GAS_FUNDER_PRIVATE_KEY as Hex),
    walletFor: (account) => createWalletClient({account, chain, transport: http(rpcUrl)}),
  };
}

/** Send a write and refuse to continue on a reverted receipt. */
export async function confirmed(publicClient: PublicClient, hash: Hex, what: string): Promise<Hex> {
  const receipt = await publicClient.waitForTransactionReceipt({hash});
  if (receipt.status !== "success") throw new Error(`${what} reverted in ${hash}`);
  return hash;
}
