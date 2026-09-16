import type {Address, Hex} from "viem";

import {roundV2Abi} from "./abis.js";
import {confirmed, type Clients} from "./client.js";

export type RoundView = {
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
  settled: boolean;
  winner: number;
  settledAt: bigint;
  launchState: number;
  totalLaunchCommitted: bigint;
  backingThreshold: bigint;
  launchThreshold: bigint;
  launchWindowEnd: bigint;
  maxPerAccount: bigint;
  maxTotal: bigint;
  depositsPaused: boolean;
};

export type PositionView = {
  custodial: Address;
  principalA: bigint;
  principalB: bigint;
  redeemedA: bigint;
  redeemedB: bigint;
  redeemableA: bigint;
  redeemableB: bigint;
  launchBps: number;
  launchBpsSet: boolean;
  launchCommitment: bigint;
  launchReleased: boolean;
  launchSpent: boolean;
};

export const TIE = 2;
export const LaunchState = {Pending: 0, Failed: 1, Succeeded: 2} as const;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/** Typed access to `EitherRoundV2`. Writes go through the recorder key and wait for inclusion. */
export class RoundLedger {
  /** The round id used everywhere in the database: the contract address, lowercased. */
  readonly id: string;

  constructor(
    private readonly clients: Clients,
    readonly address: Address,
  ) {
    this.id = address.toLowerCase();
  }

  async readRound(): Promise<RoundView> {
    const r = await this.clients.publicClient.readContract({
      address: this.address,
      abi: roundV2Abi,
      functionName: "getRound",
    });
    return {...r, winner: Number(r.winner), launchState: Number(r.launchState)};
  }

  async readPosition(user: Address): Promise<PositionView> {
    const p = await this.clients.publicClient.readContract({
      address: this.address,
      abi: roundV2Abi,
      functionName: "getPosition",
      args: [user],
    });
    return {...p, launchBps: Number(p.launchBps)};
  }

  async custodialOf(user: Address): Promise<Address | null> {
    const custodial = await this.clients.publicClient.readContract({
      address: this.address,
      abi: roundV2Abi,
      functionName: "custodialOf",
      args: [user],
    });
    return custodial === ZERO_ADDRESS ? null : custodial;
  }

  registerAccount(user: Address, custodial: Address): Promise<Hex> {
    return this.write("registerAccount", () =>
      this.clients.recorder.writeContract({
        address: this.address,
        abi: roundV2Abi,
        functionName: "registerAccount",
        args: [user, custodial],
      }),
    );
  }

  recordWithdraw(user: Address, side: 0 | 1, amount: bigint): Promise<Hex> {
    return this.write("recordWithdraw", () =>
      this.clients.recorder.writeContract({
        address: this.address,
        abi: roundV2Abi,
        functionName: "recordWithdraw",
        args: [user, side, amount],
      }),
    );
  }

  recordRedeem(user: Address, side: 0 | 1, amount: bigint): Promise<Hex> {
    return this.write("recordRedeem", () =>
      this.clients.recorder.writeContract({
        address: this.address,
        abi: roundV2Abi,
        functionName: "recordRedeem",
        args: [user, side, amount],
      }),
    );
  }

  releaseLaunch(user: Address): Promise<Hex> {
    return this.write("releaseLaunch", () =>
      this.clients.recorder.writeContract({
        address: this.address,
        abi: roundV2Abi,
        functionName: "releaseLaunch",
        args: [user],
      }),
    );
  }

  settle(): Promise<Hex> {
    return this.write("settle", () =>
      this.clients.recorder.writeContract({address: this.address, abi: roundV2Abi, functionName: "settle"}),
    );
  }

  finalizeLaunch(): Promise<Hex> {
    return this.write("finalizeLaunch", () =>
      this.clients.recorder.writeContract({
        address: this.address,
        abi: roundV2Abi,
        functionName: "finalizeLaunch",
      }),
    );
  }

  private async write(what: string, send: () => Promise<Hex>): Promise<Hex> {
    const hash = await send();
    return confirmed(this.clients.publicClient, hash, `round.${what}`);
  }
}
