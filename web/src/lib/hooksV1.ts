import {useQuery, useQueryClient} from "@tanstack/react-query";
import {useCallback} from "react";
import {useAccount, useReadContract} from "wagmi";

import {
  areV1ContractsConfigured,
  depositRouterAddress,
  roundV2Abi,
  roundV2Address,
  usdgAbi,
  usdgAddress,
} from "./contractsV1";
import {
  apiConfigured,
  fetchPosition,
  fetchRound,
  fetchWithdrawals,
  type ApiWithdrawal,
} from "./api";

/**
 * The scoreboard is shared: `/api/round` answers every viewer from one cached read, so
 * its cost does not grow with the audience and it can poll to feel live.
 */
const POLL_MS = 6_000;

/**
 * Per-user reads cost one rpc call each, per viewer, for as long as the tab is open — so
 * they do not run on a timer. They refresh when the user acts (`useRefreshV1`) and then
 * stay hot only while something is genuinely in flight: a deposit on its way into the
 * vault (the indexer and the executor together need ~20s before shares appear), or a
 * withdrawal walking its state machine.
 */
const ACTIVE_POLL_MS = 3_000;
const ACTIVE_WINDOW_MS = 90_000;

/**
 * When the user last did something that the backend answers asynchronously. Module
 * scope rather than state: nothing renders from it — it only decides whether the next
 * `refetchInterval` callback asks for another round.
 */
let lastActionAt = 0;
const recentlyActed = () => Date.now() - lastActionAt < ACTIVE_WINDOW_MS;

const isOpen = (row: ApiWithdrawal) => row.state !== "done" && row.state !== "failed";

/** Mirror of the onchain tuple, with numbers widened where the abi reports uint8. */
export type RoundV1Data = Awaited<ReturnType<typeof useRoundV1>>["data"];

/**
 * The round straight from the chain. With a backend configured this is only the fallback
 * — `/api/round` carries the same tuple and is cached server-side — so it reads once and
 * then holds, leaving the live score to the shared endpoint.
 */
export function useRoundV1() {
  return useReadContract({
    address: roundV2Address,
    abi: roundV2Abi,
    functionName: "getRound",
    query: {
      enabled: areV1ContractsConfigured,
      refetchInterval: apiConfigured ? false : POLL_MS,
      select: (raw) => ({
        ...raw,
        winner: Number(raw.winner),
        launchState: Number(raw.launchState),
      }),
    },
  });
}

/**
 * The position straight from the chain. `/api/position` returns every field of this
 * struct alongside the yield figures, so with a backend this reads once as a fallback.
 */
export function useV1Position() {
  const {address} = useAccount();

  return useReadContract({
    address: roundV2Address,
    abi: roundV2Abi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    query: {
      enabled: areV1ContractsConfigured && Boolean(address),
      refetchInterval: apiConfigured ? false : POLL_MS,
      select: (raw) => ({...raw, launchBps: Number(raw.launchBps)}),
    },
  });
}

/** Only ever moved by the user's own transactions, and those all call `useRefreshV1`. */
export function useUsdgBalance() {
  const {address} = useAccount();

  return useReadContract({
    address: usdgAddress,
    abi: usdgAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
    },
  });
}

export function useUsdgAllowance() {
  const {address} = useAccount();

  return useReadContract({
    address: usdgAddress,
    abi: usdgAbi,
    functionName: "allowance",
    args: address ? [address, depositRouterAddress] : undefined,
    query: {
      enabled: areV1ContractsConfigured && Boolean(address),
    },
  });
}

/** Backend round: same ledger numbers plus the vault info the chain cannot show. */
export function useApiRound() {
  return useQuery({
    queryKey: ["v1", "apiRound"],
    queryFn: fetchRound,
    enabled: apiConfigured,
    refetchInterval: POLL_MS,
  });
}

/** The only source of yield figures — computed by the backend, never on the client. */
export function useApiPosition(address: string | undefined) {
  return useQuery({
    queryKey: ["v1", "apiPosition", address?.toLowerCase()],
    queryFn: () => fetchPosition(address!),
    enabled: apiConfigured && Boolean(address),
    refetchInterval: (query) =>
      (query.state.data?.openWithdrawals ?? 0) > 0 || recentlyActed() ? ACTIVE_POLL_MS : false,
  });
}

export function useApiWithdrawals(address: string | undefined) {
  return useQuery({
    queryKey: ["v1", "apiWithdrawals", address?.toLowerCase()],
    queryFn: () => fetchWithdrawals(address!),
    enabled: apiConfigured && Boolean(address),
    refetchInterval: (query) =>
      query.state.data?.some(isOpen) || recentlyActed() ? ACTIVE_POLL_MS : false,
  });
}

/**
 * Pull every v1 read again after a transaction or a backend write, and keep the per-user
 * reads polling for a while: a deposit reaches the vault, and a withdrawal finishes, some
 * seconds after the call that started it returns.
 *
 * Invalidates without a key filter, like v0's `useRefreshOnchain` — wagmi's reads are
 * keyed by wagmi, not under `["v1"]`, and a filtered invalidation silently skips them.
 */
export function useRefreshV1() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    lastActionAt = Date.now();
    void queryClient.invalidateQueries();
  }, [queryClient]);
}
