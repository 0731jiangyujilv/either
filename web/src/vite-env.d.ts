/// <reference types="vite/client" />

/** The env names carried over from the Next build (see `.env.example`). */
interface ImportMetaEnv {
  readonly NEXT_PUBLIC_ARC_CHAIN_ID?: string;
  readonly NEXT_PUBLIC_ARC_RPC_URL?: string;
  readonly NEXT_PUBLIC_ARC_EXPLORER_URL?: string;
  readonly NEXT_PUBLIC_ARC_CURRENCY_NAME?: string;
  readonly NEXT_PUBLIC_ARC_CURRENCY_SYMBOL?: string;
  readonly NEXT_PUBLIC_ARC_CURRENCY_DECIMALS?: string;
  readonly NEXT_PUBLIC_ROUND_ADDRESS?: string;
  readonly NEXT_PUBLIC_USDC_ADDRESS?: string;
  readonly NEXT_PUBLIC_DEPLOY_BLOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
