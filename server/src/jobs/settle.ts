import {LaunchState} from "../chain/round.js";
import type {Context} from "../services/context.js";

/**
 * Calls `settle()` once the cutoff passes and `finalizeLaunch()` once the commitment
 * window closes. Both are permissionless and idempotent on the contract side, so a
 * race with anyone else just reverts harmlessly here.
 */
export class SettlementJob {
  constructor(private readonly ctx: Context) {}

  async tick(): Promise<void> {
    const state = await this.ctx.round.readRound();
    const now = BigInt(Math.floor(Date.now() / 1000));

    if (!state.settled) {
      if (now >= state.endTime) {
        const hash = await this.ctx.round.settle();
        console.log(`[settle] round settled in ${hash}`);
      }
      return;
    }

    if (state.launchState === LaunchState.Pending && now >= state.launchWindowEnd) {
      const hash = await this.ctx.round.finalizeLaunch();
      console.log(`[settle] launch finalized in ${hash}`);
    }
  }
}
