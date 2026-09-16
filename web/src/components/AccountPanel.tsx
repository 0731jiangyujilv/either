import {useEffect} from "react";
import {useAccount, useDisconnect, useWaitForTransactionReceipt, useWriteContract} from "wagmi";

import {addressUrl, arcTestnet, txUrl} from "@/lib/chains";
import {usdcAbi, usdcAddress, type Side} from "@/lib/contracts";
import {readableError} from "@/lib/errors";
import {useRefreshOnchain, useUsdcBalance} from "@/lib/hooks";
import {formatTimestamp, formatUsdc, shortenAddress} from "@/lib/format";
import {useSupportRecord} from "@/lib/useSupportRecord";

type AccountPanelProps = {
  sideNames: [string, string];
  position: readonly [bigint, bigint];
  onClose: () => void;
  onWithdraw: (side: Side) => void;
};

/** The personal centre: address, usdc, faucet, positions and the support record. */
export function AccountPanel({sideNames, position, onClose, onWithdraw}: AccountPanelProps) {
  const {address} = useAccount();
  const {disconnect} = useDisconnect();
  const {data: balance} = useUsdcBalance();
  const {data: record, isPending: recordPending} = useSupportRecord();
  const refreshOnchain = useRefreshOnchain();

  const {writeContract, data: hash, isPending, error} = useWriteContract();
  const {isLoading: isConfirming, isSuccess} = useWaitForTransactionReceipt({hash});

  useEffect(() => {
    if (isSuccess) refreshOnchain();
  }, [isSuccess, refreshOnchain]);

  const explorerLink = address ? addressUrl(address) : null;
  const faucetBusy = isPending || isConfirming;
  const failure = readableError(error);

  function claimFaucet() {
    writeContract({address: usdcAddress, abi: usdcAbi, functionName: "faucet"});
  }

  return (
    <>
      <div className="panel__scrim" onClick={onClose} role="presentation" />
      <div className="panel" role="dialog" aria-modal="true" aria-label="account">
        <div className="panel__head">
          <h2 className="panel__title">account</h2>
          <button type="button" className="icon-close" onClick={onClose} aria-label="close account">
            ×
          </button>
        </div>

        <section className="panel__section">
          <div className="panel__row">
            <span className="label">address</span>
            {explorerLink ? (
              <a
                className="mono link-quiet"
                href={explorerLink}
                target="_blank"
                rel="noreferrer noopener"
              >
                {shortenAddress(address ?? "")}
              </a>
            ) : (
              <span className="mono">{shortenAddress(address ?? "")}</span>
            )}
          </div>
          <div className="panel__row">
            <span className="label">network</span>
            <span className="panel__value">{arcTestnet.name}</span>
          </div>
          <button
            type="button"
            className="bracket bracket--small"
            onClick={() => {
              disconnect();
              onClose();
            }}
          >
            disconnect
          </button>
        </section>

        <section className="panel__section">
          <div className="panel__row">
            <span className="label">usdc</span>
            <span className="panel__value">{formatUsdc(balance ?? 0n, 2)}</span>
          </div>
          <button
            type="button"
            className="bracket bracket--small"
            onClick={claimFaucet}
            disabled={faucetBusy}
          >
            {faucetBusy ? "claiming…" : "faucet"}
          </button>
          <p className={failure ? "status status--error" : "status"} role="status">
            {failure ?? (isSuccess ? "1,000 usdc added." : "")}
          </p>
        </section>

        <section className="panel__section">
          <span className="label">your backing</span>
          {position[0] === 0n && position[1] === 0n ? (
            <p className="panel__empty">nothing backed yet.</p>
          ) : (
            ([0, 1] as const).map((side) =>
              position[side] === 0n ? null : (
                <div key={side} style={{marginTop: "0.75rem"}}>
                  <div className="panel__row">
                    <span className="panel__value">{sideNames[side]}</span>
                    <span className="panel__value">{formatUsdc(position[side], 2)} usdc</span>
                  </div>
                  <button
                    type="button"
                    className="bracket bracket--small"
                    onClick={() => onWithdraw(side)}
                  >
                    withdraw
                  </button>
                </div>
              ),
            )
          )}
        </section>

        <section className="panel__section">
          <span className="label">support record</span>
          {recordPending ? (
            <p className="panel__empty">reading the chain…</p>
          ) : !record || record.length === 0 ? (
            <p className="panel__empty">no activity yet.</p>
          ) : (
            <ul className="record">
              {record.map((entry) => {
                const link = txUrl(entry.txHash);
                return (
                  <li className="record__item" key={`${entry.txHash}-${entry.logIndex}`}>
                    <span
                      className={
                        entry.kind === "back" ? "record__verb" : "record__verb record__verb--out"
                      }
                    >
                      {entry.kind === "back" ? "backed" : "withdrew"}
                    </span>
                    <span>{sideNames[entry.side]}</span>
                    <span>{formatUsdc(entry.amount, 2)} usdc</span>
                    <span className="record__time">
                      {entry.timestamp === null ? `block ${entry.blockNumber}` : formatTimestamp(entry.timestamp)}
                      {link ? (
                        <>
                          {" · "}
                          <a
                            className="link-quiet"
                            href={link}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            tx
                          </a>
                        </>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
