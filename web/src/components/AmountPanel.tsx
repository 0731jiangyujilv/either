import {useEffect, useMemo, useState} from "react";
import {maxUint256} from "viem";
import {useAccount, useWaitForTransactionReceipt, useWriteContract} from "wagmi";

import {arcTestnet} from "@/lib/chains";
import {roundAbi, roundAddress, usdcAbi, usdcAddress, type Side} from "@/lib/contracts";
import {readableError} from "@/lib/errors";
import {useAllowance, useRefreshOnchain, useUsdcBalance} from "@/lib/hooks";
import {formatUsdc, parseUsdc} from "@/lib/format";

export type AmountPanelIntent = {
  mode: "back" | "withdraw";
  side: Side;
  sideName: string;
};

type AmountPanelProps = AmountPanelIntent & {
  /** The caller's current backing on this side, used for the withdraw ceiling. */
  position: bigint;
  onClose: () => void;
};

export function AmountPanel({mode, side, sideName, position, onClose}: AmountPanelProps) {
  const {chainId} = useAccount();
  const [input, setInput] = useState("");

  const {data: balance} = useUsdcBalance();
  const {data: allowance, refetch: refetchAllowance} = useAllowance();
  const refreshOnchain = useRefreshOnchain();

  const {writeContract, data: hash, isPending, error: writeError, reset} = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
    error: receiptError,
  } = useWaitForTransactionReceipt({hash});

  // the faucet has its own write so a claim never collides with an approve or back in flight
  const {
    writeContract: writeFaucet,
    data: faucetHash,
    isPending: faucetPending,
    error: faucetError,
  } = useWriteContract();
  const {isLoading: faucetConfirming, isSuccess: faucetSuccess} = useWaitForTransactionReceipt({
    hash: faucetHash,
  });

  const amount = useMemo(() => parseUsdc(input), [input]);
  const ceiling = mode === "back" ? (balance ?? 0n) : position;
  const wrongChain = chainId !== undefined && chainId !== arcTestnet.id;

  // for backing, an allowance below the amount means an approve comes first
  const needsApproval =
    mode === "back" && amount !== null && amount > 0n && (allowance ?? 0n) < amount;

  // which contract call the primary button is currently sending
  const [sentCall, setSentCall] = useState<"approve" | "back" | "withdraw" | null>(null);

  useEffect(() => {
    if (!isSuccess || receipt === undefined) return;

    refreshOnchain();

    if (sentCall === "approve") {
      // approval landed — refresh the allowance so the button flips to `back`
      void refetchAllowance();
      setSentCall(null);
      reset();
      return;
    }

    // the backing or withdrawal itself succeeded; the panel's work is done
    const timer = window.setTimeout(onClose, 900);
    return () => window.clearTimeout(timer);
  }, [isSuccess, receipt, sentCall, refreshOnchain, refetchAllowance, reset, onClose]);

  useEffect(() => {
    if (faucetSuccess) refreshOnchain();
  }, [faucetSuccess, refreshOnchain]);

  const busy = isPending || isConfirming;
  const faucetBusy = faucetPending || faucetConfirming;
  const faucetFailure = readableError(faucetError);

  function submit() {
    if (amount === null || amount === 0n) return;

    if (needsApproval) {
      setSentCall("approve");
      writeContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: "approve",
        // approve the round once, so repeat backing is a single transaction
        args: [roundAddress, maxUint256],
      });
      return;
    }

    setSentCall(mode);
    writeContract({
      address: roundAddress,
      abi: roundAbi,
      functionName: mode === "back" ? "back" : "withdraw",
      args: [side, amount],
    });
  }

  const overCeiling = amount !== null && amount > ceiling;
  const disabled = busy || amount === null || amount === 0n || overCeiling || wrongChain;

  const buttonLabel = (() => {
    if (busy && sentCall === "approve") return "approving usdc…";
    if (busy) return mode === "back" ? "backing…" : "withdrawing…";
    if (needsApproval) return "approve usdc";
    return mode === "back" ? `back ${sideName}` : `withdraw from ${sideName}`;
  })();

  const status = (() => {
    const failure = readableError(writeError ?? receiptError);
    if (failure) return {text: failure, error: true};
    if (isSuccess && sentCall !== "approve") {
      return {text: mode === "back" ? "backed." : "withdrawn.", error: false};
    }
    if (isConfirming) return {text: "waiting for confirmation…", error: false};
    if (wrongChain) return {text: `switch to ${arcTestnet.name} to continue`, error: true};
    if (overCeiling) {
      return {
        text:
          mode === "back"
            ? "more than your usdc balance — use the faucet"
            : "more than your backing on this side",
        error: true,
      };
    }
    if (needsApproval) return {text: "one-time approval, then you can back", error: false};
    return {text: "", error: false};
  })();

  return (
    <>
      <div className="panel__scrim" onClick={onClose} role="presentation" />
      <div className="panel" role="dialog" aria-modal="true" aria-label={`${mode} ${sideName}`}>
        <div className="panel__head">
          <h2 className="panel__title">
            {mode === "back" ? "back" : "withdraw from"} {sideName}
          </h2>
          <button type="button" className="icon-close" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>

        <label className="field">
          <span className="label">amount</span>
          <span className="field__input-wrap">
            <input
              className="field__input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              aria-label="amount in usdc"
            />
            <span className="field__unit">usdc</span>
          </span>
        </label>

        <div className="field__meta">
          <span>
            {mode === "back" ? "balance" : "your backing"} {formatUsdc(ceiling, 2)}
          </span>
          <button type="button" className="field__max" onClick={() => setInput(formatUsdc(ceiling))}>
            max
          </button>
        </div>

        <p className={status.error ? "status status--error" : "status"} role="status">
          {status.text}
        </p>

        <button type="button" className="bracket" onClick={submit} disabled={disabled}>
          {buttonLabel}
        </button>

        {mode === "back" ? (
          <div className="panel__faucets">
            <button
              type="button"
              className="field__max"
              onClick={() =>
                writeFaucet({address: usdcAddress, abi: usdcAbi, functionName: "faucet"})
              }
              disabled={faucetBusy}
            >
              {faucetBusy ? "claiming usdc…" : "usdc faucet"}
            </button>
            <a
              className="field__max"
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noreferrer noopener"
            >
              arc usdc gas
            </a>
            {faucetFailure || faucetSuccess ? (
              <span
                className={
                  faucetFailure
                    ? "panel__faucets-status panel__faucets-status--error"
                    : "panel__faucets-status"
                }
                role="status"
              >
                {faucetFailure ?? "1,000 usdc added."}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
