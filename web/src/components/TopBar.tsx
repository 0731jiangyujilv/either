import {Link} from "react-router-dom";
import {useAccount, useConnect, useSwitchChain} from "wagmi";
import type {Chain} from "wagmi/chains";

import {arcTestnet} from "@/lib/chains";
import {shortenAddress} from "@/lib/format";
import {Logo} from "./Logo";

type TopBarProps = {
  onOpenDrawer: () => void;
  /** Opens the account panel; when absent the address shows as plain text. */
  onOpenAccount?: () => void;
  /** The centred lockup links home unless we are already there. */
  brandAsLink?: boolean;
  /** Which chain this page writes on; each page declares its own. */
  chain?: Chain;
};

export function TopBar({onOpenDrawer, onOpenAccount, brandAsLink = false, chain = arcTestnet}: TopBarProps) {
  const {address, isConnected, chainId} = useAccount();
  const {connect, connectors, isPending} = useConnect();
  const {switchChain} = useSwitchChain();

  const injected = connectors[0];
  const wrongChain = isConnected && chainId !== chain.id;

  return (
    <header className="topbar">
      <div className="topbar__slot">
        <button
          type="button"
          className="drawer-trigger"
          onClick={onOpenDrawer}
          aria-label="open navigation"
        >
          //
        </button>
      </div>

      <div className="topbar__slot">
        {brandAsLink ? (
          <Link to="/" aria-label="either home">
            <Logo className="topbar__brand" />
          </Link>
        ) : (
          <Logo className="topbar__brand" />
        )}
      </div>

      <div className="topbar__slot topbar__slot--end">
        {!isConnected ? (
          <button
            type="button"
            className="topbar__action"
            onClick={() => injected && connect({connector: injected})}
            disabled={isPending || !injected}
            title={injected ? undefined : "no browser wallet detected"}
          >
            {isPending ? "connecting…" : "connect wallet"}
          </button>
        ) : wrongChain ? (
          <button
            type="button"
            className="topbar__action"
            onClick={() => switchChain({chainId: chain.id})}
          >
            switch to {chain.name}
          </button>
        ) : onOpenAccount ? (
          <button type="button" className="topbar__action mono" onClick={onOpenAccount}>
            {shortenAddress(address ?? "")}
          </button>
        ) : (
          <span className="topbar__action mono">{shortenAddress(address ?? "")}</span>
        )}
      </div>
    </header>
  );
}
