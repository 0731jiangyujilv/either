import {useQueryClient} from "@tanstack/react-query";
import {useCallback} from "react";
import {useAccount, useReadContract} from "wagmi";

import {areContractsConfigured, roundAbi, roundAddress, usdcAbi, usdcAddress} from "./contracts";

/** Onchain figures drive the interface, so poll often enough to feel live. */
const POLL_MS = 6_000;

export type RoundData = {
  sideAName: string;
  sideBName: string;
  endTime: bigint;
  sideABacked: bigint;
  sideBBacked: bigint;
  sideABackers: bigint;
  sideBBackers: bigint;
  totalBackedAll: bigint;
  uniqueBackers: bigint;
  closed: boolean;
};

export function useRound() {
  return useReadContract({
    address: roundAddress,
    abi: roundAbi,
    functionName: "getRound",
    query: {
      enabled: areContractsConfigured,
      refetchInterval: POLL_MS,
    },
  });
}

export function usePosition() {
  const {address} = useAccount();

  return useReadContract({
    address: roundAddress,
    abi: roundAbi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    query: {
      enabled: areContractsConfigured && Boolean(address),
      refetchInterval: POLL_MS,
    },
  });
}

export function useUsdcBalance() {
  const {address} = useAccount();

  return useReadContract({
    address: usdcAddress,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: areContractsConfigured && Boolean(address),
      refetchInterval: POLL_MS,
    },
  });
}

export function useAllowance() {
  const {address} = useAccount();

  return useReadContract({
    address: usdcAddress,
    abi: usdcAbi,
    functionName: "allowance",
    args: address ? [address, roundAddress] : undefined,
    query: {
      enabled: areContractsConfigured && Boolean(address),
    },
  });
}

/**
 * Pull every onchain read again. Called after a transaction confirms, since a
 * single action can move the round totals, the caller's position, their usdc
 * balance and their allowance at once.
 */
export function useRefreshOnchain() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);
}

export type PositionTuple = readonly [bigint, bigint];
