import {useEffect, useMemo, useState} from "react";
import {maxUint256} from "viem";
import {useAccount, useSignMessage, useWaitForTransactionReceipt, useWriteContract} from "wagmi";

import {createAccount} from "@/lib/api";
import {robinhoodMainnet} from "@/lib/chains";
import {
  areV1ContractsConfigured,
  BPS_DENOMINATOR,
  depositRouterAbi,
  depositRouterAddress,
  usdgAbi,
  usdgAddress,
} from "@/lib/contractsV1";
import {readableError} from "@/lib/errors";
import {formatUsdc, parseUsdc} from "@/lib/format";
import {
  useApiPosition,
  useRefreshV1,
  useUsdgAllowance,
  useUsdgBalance,
} from "@/lib/hooksV1";

type DepositPanelProps = {
  side: 0 | 1;
  sideName: string;
  /** The position's locked launch bps, when this user already backed this round. */
  launchBpsSet: boolean;
  launchBps: number;
  onClose: () => void;
};

const SLIDER_STEP = 5;

export function DepositPanel({side, sideName, launchBpsSet, launchBps, onClose}: DepositPanelProps) {
  const {address, chainId} = useAccount();
  const [input, setInput] = useState("");
  const [launchPct, setLaunchPct] = useState(0);
  const [status, setStatus] = useState<{text: string; error: boolean}>({text: "", error: false});

  const {data: balance} = useUsdgBalance();
  const {data: allowance, refetch: refetchAllowance} = useUsdgAllowance();
  const {data: apiPosition} = useApiPosition(address);
  const refreshV1 = useRefreshV1();
  const {signMessageAsync} = useSignMessage();

  const {writeContract, data: hash, isPending, error: writeError, reset} = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
    error: receiptError,
  } = useWaitForTransactionReceipt({hash});

  const amount = useMemo(() => parseUsdc(input), [input]);
  const wrongChain = chainId !== undefined && chainId !== robinhoodMainnet.id;
  const needsAccount = !apiPosition?.registered;

  const needsApproval =
    !needsAccount && amount !== null && amount > 0n && (allowance ?? 0n) < amount;

  // which send the primary button has in flight
  const [sentCall, setSentCall] = useState<"approve" | "deposit" | null>(null);
  // the signed account creation, which is an api call rather than a transaction
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isSuccess || receipt === undefined) return;

    refreshV1();

    if (sentCall === "approve") {
      void refetchAllowance();
      setSentCall(null);
      reset();
      return;
    }

    const timer = window.setTimeout(onClose, 900);
    return () => window.clearTimeout(timer);
  }, [isSuccess, receipt, sentCall, refreshV1, refetchAllowance, reset, onClose]);

  const launchSplit = useMemo(() => {
    if (launchBpsSet) {
      const lockedPct = (launchBps * 100) / BPS_DENOMINATOR;
      return {
        locked: true,
        pct: lockedPct,
        launch: amount === null ? null : (amount * BigInt(launchBps)) / BigInt(BPS_DENOMINATOR),
      };
    }
    return {
      locked: false,
      pct: launchPct,
      launch: amount === null ? null : (amount * BigInt(launchPct)) / 100n,
    };
  }, [amount, launchBps, launchBpsSet, launchPct]);

  async function submitAccount() {
    if (!address) return;
    setCreating(true);
    setStatus({text: "waiting for your signature…", error: false});
    try {
      await createAccount(address, (message) => signMessageAsync({message}));
      refreshV1();
      setStatus({text: "custodial account ready.", error: false});
    } catch (error) {
      setStatus({text: readableError(error) ?? "account creation failed", error: true});
    } finally {
      setCreating(false);
    }
  }

  function submit() {
    if (amount === null || amount === 0n) return;

    if (needsApproval) {
      setSentCall("approve");
      writeContract({
        address: usdgAddress,
        abi: usdgAbi,
        functionName: "approve",
        args: [depositRouterAddress, maxUint256],
        chainId: robinhoodMainnet.id,
      });
      return;
    }

    setSentCall("deposit");
    // bps, not percent: the slider moves in 5% steps of 500 bps
    const bps = launchBpsSet ? launchBps : launchPct * 100;
    writeContract({
      address: depositRouterAddress,
      abi: depositRouterAbi,
      functionName: "deposit",
      args: [side, amount, bps],
      chainId: robinhoodMainnet.id,
    });
  }

  const overBalance = amount !== null && amount > (balance ?? 0n);
  const busy = isPending || isConfirming;
  const disabled =
    busy || creating || amount === null || amount === 0n || overBalance || wrongChain || !areV1ContractsConfigured;

  const buttonLabel = (() => {
    if (needsAccount) return creating ? "creating account…" : "create custodial account";
    if (busy && sentCall === "approve") return "approving usdg…";
    if (busy) return "backing…";
    if (needsApproval) return "approve usdg";
    return `back ${sideName}`;
  })();

  const derivedStatus = (() => {
    const failure = readableError(writeError ?? receiptError);
    if (failure) return {text: failure, error: true};
    if (status.text) return status;
    if (isSuccess && sentCall === "deposit") return {text: "backed.", error: false};
    if (isConfirming) return {text: "waiting for confirmation…", error: false};
    if (wrongChain) return {text: `switch to ${robinhoodMainnet.name} to continue`, error: true};
    if (overBalance) return {text: "more than your usdg balance", error: true};
    if (needsAccount) {
      return {
        text: "funds move to a custodial address either generates for you — sign once to create it",
        error: false,
      };
    }
    if (needsApproval) return {text: "one-time approval, then you can back", error: false};
    return {text: "", error: false};
  })();

  return (
    <>
      <div className="panel__scrim" onClick={onClose} role="presentation" />
      <div className="panel" role="dialog" aria-modal="true" aria-label={`back ${sideName}`}>
        <div className="panel__head">
          <h2 className="panel__title">back {sideName}</h2>
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
              aria-label="amount in usdg"
            />
            <span className="field__unit">usdg</span>
          </span>
        </label>

        <div className="field__meta">
          <span>balance {formatUsdc(balance ?? 0n, 2)}</span>
          <button
            type="button"
            className="field__max"
            onClick={() => setInput(formatUsdc(balance ?? 0n))}
          >
            max
          </button>
        </div>

        <div className="split">
          <div className="split__labels">
            <span className="label">launchpad allocation</span>
            <span className="split__value">{launchSplit.pct}%</span>
          </div>
          <input
            className="slider"
            type="range"
            min={0}
            max={100}
            step={SLIDER_STEP}
            value={launchSplit.pct}
            disabled={launchSplit.locked}
            onChange={(event) => setLaunchPct(Number(event.target.value))}
            aria-label="share of principal committed to the launchpad"
          />
          <p className="split__detail">
            {launchSplit.locked ? (
              <>locked for this round at {launchSplit.pct}%</>
            ) : launchSplit.launch === null ? (
              <>choose a share before entering an amount</>
            ) : (
              <>
                {formatUsdc(launchSplit.launch, 2)} to launchpad ·{" "}
                {formatUsdc(amount! - launchSplit.launch, 2)} refundable
              </>
            )}
          </p>
          <p className="split__warning">
            this share locks with your first deposit — it cannot be changed later.
          </p>
        </div>

        <p className={derivedStatus.error ? "status status--error" : "status"} role="status">
          {derivedStatus.text}
        </p>

        <button
          type="button"
          className="bracket"
          onClick={needsAccount ? submitAccount : submit}
          disabled={needsAccount ? creating : disabled}
        >
          {buttonLabel}
        </button>

        <p className="panel__custody-note">
          demo custody — either holds the key to your custodial address, moves funds into a
          morpho usdg vault, and returns them on withdrawal. no insurance, no guarantees.
        </p>
      </div>
    </>
  );
}
