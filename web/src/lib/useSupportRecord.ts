import {useQuery} from "@tanstack/react-query";
import {parseAbiItem} from "viem";
import {useAccount, usePublicClient} from "wagmi";

import {areContractsConfigured, deployBlock, roundAddress, type Side} from "./contracts";

const BACKED_EVENT = parseAbiItem(
  "event Backed(address indexed backer, uint8 indexed side, uint256 amount, uint256 sideTotal)",
);
const WITHDRAWN_EVENT = parseAbiItem(
  "event Withdrawn(address indexed backer, uint8 indexed side, uint256 amount, uint256 sideTotal)",
);

export type SupportEntry = {
  kind: "back" | "withdraw";
  side: Side;
  amount: bigint;
  timestamp: bigint | null;
  txHash: string;
  blockNumber: bigint;
  logIndex: number;
};

/**
 * The connected address's support record, read from the round's own events.
 *
 * Newest first. Timestamps come from the blocks the events landed in, so a
 * block whose header cannot be fetched simply shows without a time.
 */
export function useSupportRecord() {
  const {address} = useAccount();
  const client = usePublicClient();

  return useQuery({
    queryKey: ["support-record", address, roundAddress],
    enabled: areContractsConfigured && Boolean(address) && Boolean(client),
    refetchInterval: 12_000,
    queryFn: async (): Promise<SupportEntry[]> => {
      if (!client || !address) return [];

      const [backed, withdrawn] = await Promise.all([
        client.getLogs({
          address: roundAddress,
          event: BACKED_EVENT,
          args: {backer: address},
          fromBlock: deployBlock,
          toBlock: "latest",
        }),
        client.getLogs({
          address: roundAddress,
          event: WITHDRAWN_EVENT,
          args: {backer: address},
          fromBlock: deployBlock,
          toBlock: "latest",
        }),
      ]);

      const entries: SupportEntry[] = [
        ...backed.map((log) => toEntry(log, "back")),
        ...withdrawn.map((log) => toEntry(log, "withdraw")),
      ];

      // one getBlock per distinct block, not per event
      const blockNumbers = [...new Set(entries.map((entry) => entry.blockNumber))];
      const timestamps = new Map<bigint, bigint>();
      await Promise.all(
        blockNumbers.map(async (blockNumber) => {
          try {
            const block = await client.getBlock({blockNumber});
            timestamps.set(blockNumber, block.timestamp);
          } catch {
            // leave this block without a timestamp
          }
        }),
      );

      for (const entry of entries) {
        entry.timestamp = timestamps.get(entry.blockNumber) ?? null;
      }

      return entries.sort(
        (a, b) =>
          Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex,
      );
    },
  });
}

type RawLog = {
  args: {side?: number; amount?: bigint};
  transactionHash: string | null;
  blockNumber: bigint | null;
  logIndex: number | null;
};

function toEntry(log: RawLog, kind: SupportEntry["kind"]): SupportEntry {
  return {
    kind,
    side: (log.args.side === 1 ? 1 : 0) as Side,
    amount: log.args.amount ?? 0n,
    timestamp: null,
    txHash: log.transactionHash ?? "",
    blockNumber: log.blockNumber ?? 0n,
    logIndex: log.logIndex ?? 0,
  };
}
