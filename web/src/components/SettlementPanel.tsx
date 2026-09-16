import {useState} from "react";
import {useAccount, useSignMessage} from "wagmi";

import {requestWithdrawal, type WithdrawKind} from "@/lib/api";
import {readableError} from "@/lib/errors";
import {formatUsdc} from "@/lib/format";
import {useApiPosition, useApiWithdrawals, useRefreshV1} from "@/lib/hooksV1";

type SettlementPanelProps = {
  side: 0 | 1;
  sideName: string;
  /** Winning side index, or 2 for a tie; only meaningful once settled. */
  winner: number;
  settled: boolean;
  onClose: () => void;
};

/**
 * Withdrawals run entirely on the backend: one signature asks for it, the
 * executor walks it through the vault. This panel is the asking half.
 */
export function SettlementPanel({side, sideName, winner, settled, onClose}: SettlementPanelProps) {
  const {address} = useAccount();
  const {signMessageAsync} = useSignMessage();
  const refreshV1 = useRefreshV1();
  const {data: position} = useApiPosition(address);
  const {data: withdrawals} = useApiWithdrawals(address);
  const [status, setStatus] = useState<{text: string; error: boolean}>({text: "", error: false});
  const [busy, setBusy] = useState(false);

  const onSide = position?.sides[side];
  const openOnSide = withdrawals?.filter(
    (row) => row.side === side && row.state !== "done" && row.state !== "failed",
  );
  const isWinner = settled && winner === side;
  const canRelease =
    isWinner &&
    position != null &&
    !position.launchReleased &&
    !position.launchSpent &&
    position.launchCommitment > 0n;

  async function ask(kind: WithdrawKind, label: string) {
    if (!address) return;
    setBusy(true);
    setStatus({text: "waiting for your signature…", error: false});
    try {
      await requestWithdrawal(address, side, kind, (message) => signMessageAsync({message}));
      refreshV1();
      setStatus({text: `${label} — the executor will move the funds shortly.`, error: false});
    } catch (error) {
      setStatus({text: readableError(error) ?? "the request failed", error: true});
    } finally {
      setBusy(false);
    }
  }

  const principal = onSide?.principal ?? 0n;
  const redeemable = onSide?.redeemable ?? 0n;

  return (
    <>
      <div className="panel__scrim" onClick={onClose} role="presentation" />
      <div className="panel" role="dialog" aria-modal="true" aria-label={`withdraw from ${sideName}`}>
        <div className="panel__head">
          <h2 className="panel__title">withdraw</h2>
          <button type="button" className="icon-close" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>

        <div className="panel__section">
          <div className="panel__row">
            <span className="label">{sideName} principal</span>
            <span className="panel__value">{formatUsdc(principal, 2)} usdg</span>
          </div>
          {settled ? (
            <div className="panel__row">
              <span className="label">redeemable now</span>
              <span className="panel__value">{formatUsdc(redeemable, 2)} usdg</span>
            </div>
          ) : null}
          {isWinner && position && position.launchCommitment > 0n ? (
            <div className="panel__row">
              <span className="label">launchpad share</span>
              <span className="panel__value">{formatUsdc(position.launchCommitment, 2)} usdg</span>
            </div>
          ) : null}
        </div>

        {openOnSide && openOnSide.length > 0 ? (
          <p className="status" role="status">
            a withdrawal is already in progress — {openOnSide[0].state.replace("_", " ")}.
          </p>
        ) : (
          <>
            <p className={status.error ? "status status--error" : "status"} role="status">
              {status.text}
            </p>

            {!settled ? (
              <button
                type="button"
                className="bracket"
                onClick={() => ask("pre_settlement", "withdrawal requested")}
                disabled={busy || principal === 0n}
              >
                withdraw all from {sideName}
              </button>
            ) : (
              <div className="panel__section">
                <button
                  type="button"
                  className="bracket"
                  onClick={() => ask("redemption", "redemption requested")}
                  disabled={busy || redeemable === 0n}
                >
                  redeem {formatUsdc(redeemable, 2)}
                </button>
                {canRelease ? (
                  <button
                    type="button"
                    className="bracket"
                    onClick={() => ask("launch_release", "launch share release requested")}
                    disabled={busy}
                  >
                    withdraw launchpad share
                  </button>
                ) : null}
                <p className="panel__custody-note">
                  redeeming asks the executor to sell vault shares and send usdg back to this
                  wallet. it can take a few blocks.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
