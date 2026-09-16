import {useState} from "react";
import {useAccount} from "wagmi";

import {LoadingCurtain} from "@/components/LoadingCurtain";
import {Drawer} from "@/components/Drawer";
import {DepositPanel} from "@/components/DepositPanel";
import {ScoreBar} from "@/components/ScoreBar";
import {SettlementPanel} from "@/components/SettlementPanel";
import {TopBar} from "@/components/TopBar";
import {apiConfigured, type ApiRound} from "@/lib/api";
import {robinhoodMainnet, rhAddressUrl} from "@/lib/chains";
import {areV1ContractsConfigured, TIE} from "@/lib/contractsV1";
import {formatCompactUsd, formatCount, formatEndTime, formatUsdc, shortenAddress, splitPercent} from "@/lib/format";
import {useApiPosition, useApiRound, useRoundV1, useV1Position} from "@/lib/hooksV1";
import {useTitle} from "@/lib/useTitle";

/**
 * The v1 round on robinhood chain: the same arena, with a vault under it.
 * Onchain reads drive the score; the backend is the only source of yield figures.
 */
export function VaultPage() {
  useTitle();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [intent, setIntent] = useState<{mode: "back" | "withdraw"; side: 0 | 1} | null>(null);

  const {address, isConnected} = useAccount();
  const {data: chainRound, isPending: chainPending} = useRoundV1();
  const {data: chainPosition} = useV1Position();
  const {data: apiPosition} = useApiPosition(address);
  const {data: apiRound, isPending: apiPending} = useApiRound();

  // the backend answers with the same ledger tuple from a cache shared by every viewer,
  // so prefer it; the chain read stays as the fallback for when there is no backend
  const round = apiRound?.round ?? chainRound;
  const isPending = chainPending || (apiConfigured && apiPending);

  // one shape for both sources — the api returns the same position split by side
  const position = apiPosition
    ? {
        custodial: apiPosition.custodial,
        principalA: apiPosition.sides[0].principal,
        principalB: apiPosition.sides[1].principal,
        launchBps: apiPosition.launchBps ?? 0,
        launchBpsSet: apiPosition.launchBps !== null,
      }
    : (chainPosition ?? null);

  return (
    <>
      <LoadingCurtain />
      <div className="page">
        <TopBar
          onOpenDrawer={() => setDrawerOpen(true)}
          brandAsLink
          chain={robinhoodMainnet}
        />

        {!areV1ContractsConfigured ? (
          <div className="notice" role="status">
            <span>not configured yet —</span>
            <span className="mono">
              set NEXT_PUBLIC_ROUND_V2_ADDRESS and NEXT_PUBLIC_DEPOSIT_ROUTER_ADDRESS in .env.local
            </span>
          </div>
        ) : null}

        {!round ? (
          <main className="arena">
            <div className="arena__inner">
              <p className="arena__empty">
                {isPending ? "reading the round…" : "the round could not be read."
                  }
              </p>
            </div>
          </main>
        ) : (
          <main className="arena">
            <div className="arena__inner">
              <div className="arena__sides">
                <div className="arena__side-a">
                  <h1 className="arena__side-name">{round.sideAName}</h1>
                </div>
                <span className="arena__or">or</span>
                <div className="arena__side-b">
                  <h1 className="arena__side-name arena__side-name--b">{round.sideBName}</h1>
                </div>
              </div>

              <ScoreBar
                share={
                  round.totalBackedAll === 0n
                    ? null
                    : Number(round.sideABacked) / Number(round.totalBackedAll)
                }
                labelA={round.sideAName}
                labelB={round.sideBName}
              />

              <RoundStats round={round} />

              <p className="arena__clock">
                {round.settled
                  ? `settled · ${round.winner === TIE
                      ? "a tie"
                      : round.winner === 0
                        ? `${round.sideAName} won`
                        : `${round.sideBName} won`}`
                  : `ends ${formatEndTime(round.endTime)}`}
              </p>

              <RoundActions
                round={round}
                position={isConnected && position ? position : null}
                onBack={(side) => setIntent({mode: "back", side})}
                onWithdraw={(side) => setIntent({mode: "withdraw", side})}
              />

              {isConnected ? (
                <YieldSection
                  netApyLabel={
                    apiRound?.vault.netApy === null || apiRound?.vault.netApy === undefined
                      ? null
                      : `${(apiRound.vault.netApy * 100).toFixed(2)}%`
                  }
                  grossApyLabel={
                    apiRound?.vault.grossApy === null || apiRound?.vault.grossApy === undefined
                      ? null
                      : `${(apiRound.vault.grossApy * 100).toFixed(2)}%`
                  }
                  custodial={position?.custodial ?? null}
                  yieldSplit={apiPosition?.yield ?? null}
                  openWithdrawals={apiPosition?.openWithdrawals ?? 0}
                />
              ) : (
                <p className="arena__note">
                  <span>connect a wallet on robinhood chain to back a side.</span>
                  <span>backing buys usdg yield while the round runs.</span>
                </p>
              )}

              <p className="arena__note">
                <span>1 usdg = 1 vote.</span>
                <span>the loser side withdraws everything; the winner keeps its launchpad share.</span>
                <span>
                  demo custody — either holds the keys, funds sit in a morpho usdg vault, no
                  guarantees.
                </span>
              </p>
            </div>
          </main>
        )}

        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        {intent?.mode === "back" && round ? (
          <DepositPanel
            side={intent.side}
            sideName={intent.side === 0 ? round.sideAName : round.sideBName}
            launchBpsSet={position?.launchBpsSet ?? false}
            launchBps={position?.launchBps ?? 0}
            onClose={() => setIntent(null)}
          />
        ) : null}

        {intent?.mode === "withdraw" && round ? (
          <SettlementPanel
            side={intent.side}
            sideName={intent.side === 0 ? round.sideAName : round.sideBName}
            winner={round.winner}
            settled={round.settled}
            onClose={() => setIntent(null)}
          />
        ) : null}
      </div>
    </>
  );
}

type RoundTuple = NonNullable<ReturnType<typeof useRoundV1>["data"]> | ApiRound;

function RoundStats({round}: {round: RoundTuple}) {
  const percent = splitPercent(round.sideABacked, round.sideBBacked);
  const sides = [
    {name: round.sideAName, backed: round.sideABacked, backers: round.sideABackers, percent: percent?.a},
    {name: round.sideBName, backed: round.sideBBacked, backers: round.sideBBackers, percent: percent?.b},
  ];

  if (percent === null) {
    return (
      <div className="arena__stats">
        <p className="arena__empty">no backing recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="arena__stats">
      {sides.map((side, index) => (
        <div
          className={index === 1 ? "arena__stat-group arena__stat-group--b" : "arena__stat-group"}
          key={side.name}
        >
          <p className="arena__percent">{side.percent}%</p>
          <p className="arena__figure">{formatCompactUsd(side.backed)} backed</p>
          <p className="arena__figure arena__figure--quiet">
            {formatCount(side.backers)} {side.backers === 1n ? "backer" : "backers"}
          </p>
        </div>
      ))}
    </div>
  );
}

function RoundActions({
  round,
  position,
  onBack,
  onWithdraw,
}: {
  round: RoundTuple;
  position: {principalA: bigint; principalB: bigint} | null;
  onBack: (side: 0 | 1) => void;
  onWithdraw: (side: 0 | 1) => void;
}) {
  const sides = [
    {side: 0 as const, name: round.sideAName, held: position?.principalA ?? 0n},
    {side: 1 as const, name: round.sideBName, held: position?.principalB ?? 0n},
  ];
  const open = !round.closed && !round.settled && !round.depositsPaused;

  return (
    <div className="arena__actions">
      {sides.map((side) => (
        <div
          className={side.side === 1 ? "arena__action arena__action--b" : "arena__action"}
          key={side.name}
        >
          <button type="button" className="bracket" onClick={() => onBack(side.side)} disabled={!open}>
            back {side.name}
          </button>
          {side.held > 0n ? (
            <span className="arena__position">
              you back {formatUsdc(side.held, 2)} usdg ·{" "}
              <button
                type="button"
                className="field__max"
                onClick={() => onWithdraw(side.side)}
              >
                withdraw
              </button>
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Yield is shown exactly as the backend computes it: net of the 10% fee, anchored to
 * the custodial address. No link to morpho — those figures are gross and per-vault.
 */
function YieldSection(props: {
  netApyLabel: string | null;
  grossApyLabel: string | null;
  custodial: string | null;
  yieldSplit: {principal: bigint; grossYield: bigint; fee: bigint; netYield: bigint} | null;
  openWithdrawals: number;
}) {
  const {netApyLabel, grossApyLabel, custodial, yieldSplit, openWithdrawals} = props;

  if (!apiConfigured) {
    return (
      <section className="yield">
        <p className="label">vault</p>
        <p className="panel__empty">
          the backend is not configured — yield figures are unavailable.
        </p>
      </section>
    );
  }

  return (
    <section className="yield">
      <p className="label">usdg vault</p>
      <div className="yield__rows">
        <div className="yield__row">
          <span>current apy, after fee</span>
          <span className="yield__figure">{netApyLabel ?? "—"}</span>
        </div>
        {grossApyLabel && netApyLabel ? (
          <div className="yield__row yield__row--quiet">
            <span>vault apy before fee</span>
            <span>{grossApyLabel}</span>
          </div>
        ) : null}
        {yieldSplit ? (
          <>
            <div className="yield__row">
              <span>your principal</span>
              <span className="yield__figure">{formatUsdc(yieldSplit.principal, 2)} usdg</span>
            </div>
            <div className="yield__row">
              <span>gross yield</span>
              <span>{formatUsdc(yieldSplit.grossYield, 2)}</span>
            </div>
            <div className="yield__row">
              <span>platform fee, 10%</span>
              <span>−{formatUsdc(yieldSplit.fee, 2)}</span>
            </div>
            <div className="yield__row">
              <span>your net yield</span>
              <span className="yield__figure">{formatUsdc(yieldSplit.netYield, 2)} usdg</span>
            </div>
          </>
        ) : null}
        {custodial ? (
          <div className="yield__row yield__row--quiet">
            <span>your funds live at</span>
            <a
              className="mono link-quiet"
              href={rhAddressUrl(custodial)}
              target="_blank"
              rel="noreferrer noopener"
            >
              {shortenAddress(custodial)}
            </a>
          </div>
        ) : null}
        {openWithdrawals > 0 ? (
          <div className="yield__row yield__row--quiet">
            <span>withdrawals in progress</span>
            <span>{openWithdrawals}</span>
          </div>
        ) : null}
      </div>
      <p className="yield__note">
        yield follows the vault's actual performance and is shown after either's 10% fee.
      </p>
    </section>
  );
}
