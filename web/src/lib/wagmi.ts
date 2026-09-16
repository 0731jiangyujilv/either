// `injected` is imported from "wagmi" rather than "wagmi/connectors": the latter is a
// barrel that also pulls in baseAccount/coinbaseWallet, whose @coinbase/cdp-sdk
// dynamic-imports the uninstalled optional @x402/* peers and breaks the build.
import {createConfig, http, injected} from "wagmi";

import {arcTestnet, robinhoodMainnet} from "./chains";

// arc testnet carries the v0 arena at `/`; robinhood chain carries the v1 round.
// Each page checks it is on its own chain before writing.
export const wagmiConfig = createConfig({
  chains: [arcTestnet, robinhoodMainnet],
  connectors: [injected({shimDisconnect: true})],
  // No `ssr`/`cookieStorage` here as there is no server to hydrate from: wagmi
  // defaults to localStorage, which is what a client-only build wants.
  transports: {
    [arcTestnet.id]: http(),
    [robinhoodMainnet.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
