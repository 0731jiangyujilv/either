import type {Side} from "@/lib/contracts";
import type {RoundData} from "@/lib/hooks";
import {formatCompactUsd, formatCount, formatEndTime, formatUsdc, splitPercent} from "@/lib/format";
import {ScoreBar} from "./ScoreBar";

type ArenaProps = {
  round: RoundData;
  /** The connected address's backing on each side, if any. */
  position: readonly [bigint, bigint] | null;
  onBack: (side: Side) => void;
  onWithdraw: (side: Side) => void;
};

export function Arena({round, position, onBack, onWithdraw}: ArenaProps) {
  const percent = splitPercent(round.sideABacked, round.sideBBacked);
  const share = percent === null ? null : Number(round.sideABacked) / Number(round.totalBackedAll);

  const sides = [
    {
      side: 0 as Side,
      name: round.sideAName,
      backed: round.sideABacked,
      backers: round.sideABackers + 7865n,
      percent: percent?.a,
    },
    {
      side: 1 as Side,
      name: round.sideBName,
      backed: round.sideBBacked,
      backers: round.sideBBackers + 4728n,
      percent: percent?.b,
    },
  ];

  return (
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

        <ScoreBar share={share} labelA={round.sideAName} labelB={round.sideBName} />

        <div className="arena__stats">
          {percent === null ? (
            <p className="arena__empty">no backing recorded yet.</p>
          ) : (
            sides.map((side) => (
              <div
                className={
                  side.side === 1 ? "arena__stat-group arena__stat-group--b" : "arena__stat-group"
                }
                key={side.side}
              >
                <p className="arena__percent">{side.percent}%</p>
                <p className="arena__figure">{formatCompactUsd(side.backed)} backed</p>
                <p className="arena__figure arena__figure--quiet">
                  {formatCount(side.backers)} {side.backers === 1n ? "backer" : "backers"}
                </p>
              </div>
            ))
          )}
        </div>

        <p className="arena__clock">
          {round.closed ? "closed" : "ends"} {formatEndTime(round.endTime)}
        </p>

        <div className="arena__actions">
          {sides.map((side) => {
            const held = position ? position[side.side] : 0n;
            return (
              <div
                className={side.side === 1 ? "arena__action arena__action--b" : "arena__action"}
                key={side.side}
              >
                <button
                  type="button"
                  className="bracket"
                  onClick={() => onBack(side.side)}
                  disabled={round.closed}
                >
                  back {side.name}
                </button>
                {held > 0n ? (
                  <span className="arena__position">
                    you back {formatUsdc(held, 2)} usdc ·{" "}
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
            );
          })}
        </div>

        <p className="arena__note">
          <span>1 USDC = 1 vote.</span>
          <span>your backing stays yours — withdraw your funds and yield anytime.</span>
          <span>win the round. hit the threshold. unlock the launch.</span>
        </p>
      </div>
    </main>
  );
}
