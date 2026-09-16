import {useAccount} from "wagmi";

import {AppShell, useShell} from "@/components/AppShell";
import {Arena} from "@/components/Arena";
import {LoadingCurtain} from "@/components/LoadingCurtain";
import {isChainConfigured} from "@/lib/chains";
import {areContractsConfigured} from "@/lib/contracts";
import {readableError} from "@/lib/errors";
import {usePosition, useRound, type RoundData} from "@/lib/hooks";
import {useTitle} from "@/lib/useTitle";

export function ArenaPage() {
  useTitle();

  return (
    <>
      <LoadingCurtain />
      <AppShell>
        {!areContractsConfigured || !isChainConfigured ? <SetupNotice /> : null}
        <ArenaSection />
      </AppShell>
    </>
  );
}

function ArenaSection() {
  const {isConnected} = useAccount();
  const {openAmount} = useShell();
  const {data: round, isPending, error} = useRound();
  const {data: position} = usePosition();

  const roundData = round as RoundData | undefined;

  if (!roundData) {
    return (
      <main className="arena">
        <div className="arena__inner">
          <p className="arena__empty">
            {!areContractsConfigured || !isChainConfigured
              ? "waiting on the round configuration."
              : isPending
                ? "reading the round…"
                : (readableError(error) ?? "the round could not be read.")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <Arena
      round={roundData}
      position={isConnected && position ? position : null}
      onBack={(side) => openAmount("back", side)}
      onWithdraw={(side) => openAmount("withdraw", side)}
    />
  );
}

/** Shown until the arc testnet parameters and contract addresses are filled in. */
function SetupNotice() {
  return (
    <div className="notice" role="status">
      <span>not configured yet —</span>
      <span className="mono">
        set NEXT_PUBLIC_ARC_CHAIN_ID, NEXT_PUBLIC_ARC_RPC_URL, NEXT_PUBLIC_ROUND_ADDRESS and
        NEXT_PUBLIC_USDC_ADDRESS in .env.local
      </span>
    </div>
  );
}
