import {defineChain} from "viem";

/**
 * arc testnet.
 *
 * Every field is env-driven because the public parameters are not settled yet.
 * Fill these in `.env.local` (see `.env.example`) — the placeholders below only
 * exist so the app still builds and renders before the real values arrive.
 */
const CHAIN_ID = Number(import.meta.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? "0");
const RPC_URL = import.meta.env.NEXT_PUBLIC_ARC_RPC_URL ?? "";
const EXPLORER_URL = import.meta.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "";
const CURRENCY_SYMBOL = import.meta.env.NEXT_PUBLIC_ARC_CURRENCY_SYMBOL ?? "ETH";
const CURRENCY_NAME = import.meta.env.NEXT_PUBLIC_ARC_CURRENCY_NAME ?? "Ether";
const CURRENCY_DECIMALS = Number(import.meta.env.NEXT_PUBLIC_ARC_CURRENCY_DECIMALS ?? "18");

/** True once the chain has been configured with a real id and rpc url. */
export const isChainConfigured = CHAIN_ID > 0 && RPC_URL.length > 0;

export const arcTestnet = defineChain({
  id: CHAIN_ID > 0 ? CHAIN_ID : 31_337,
  name: "arc testnet",
  nativeCurrency: {
    name: CURRENCY_NAME,
    symbol: CURRENCY_SYMBOL,
    decimals: CURRENCY_DECIMALS,
  },
  rpcUrls: {
    default: {http: [RPC_URL || "http://127.0.0.1:8545"]},
  },
  blockExplorers: EXPLORER_URL
    ? {default: {name: "explorer", url: EXPLORER_URL}}
    : undefined,
  testnet: true,
});

/**
 * robinhood chain mainnet — where the v1 round lives.
 *
 * The public parameters are fixed, so the defaults are the real values and the env
 * overrides exist only for pointing a build at a local fork.
 */
const RH_CHAIN_ID = Number(import.meta.env.NEXT_PUBLIC_RH_CHAIN_ID ?? "4663");
const RH_RPC_URL =
  import.meta.env.NEXT_PUBLIC_RH_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com/";
const RH_EXPLORER_URL =
  import.meta.env.NEXT_PUBLIC_RH_EXPLORER_URL ?? "https://robinhoodchain.blockscout.com";

export const robinhoodMainnet = defineChain({
  id: RH_CHAIN_ID,
  name: "robinhood chain",
  nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
  rpcUrls: {
    default: {http: [RH_RPC_URL]},
  },
  blockExplorers: {default: {name: "blockscout", url: RH_EXPLORER_URL}},
  // deployed on the chain but absent from viem's registry; lets wagmi batch reads
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 0,
    },
  },
});

/** Link to a transaction on the configured explorer, or `null` if there isn't one. */
export function txUrl(hash: string): string | null {
  if (!EXPLORER_URL) return null;
  return `${EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}`;
}

/** Link to an address on the configured explorer, or `null` if there isn't one. */
export function addressUrl(address: string): string | null {
  if (!EXPLORER_URL) return null;
  return `${EXPLORER_URL.replace(/\/$/, "")}/address/${address}`;
}

/** Same links, on robinhood chain's blockscout. */
export function rhTxUrl(hash: string): string {
  return `${RH_EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}`;
}

export function rhAddressUrl(address: string): string {
  return `${RH_EXPLORER_URL.replace(/\/$/, "")}/address/${address}`;
}
