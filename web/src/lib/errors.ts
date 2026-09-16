import {BaseError, ContractFunctionRevertedError, UserRejectedRequestError} from "viem";

/** Contract errors, in the interface's voice. */
const REVERT_COPY: Record<string, string> = {
  ZeroAmount: "enter an amount above zero",
  InvalidSide: "that side does not exist in this round",
  RoundClosed: "this round has closed to new backing",
  InsufficientBacking: "you do not have that much backing on this side",
  InsufficientBalance: "not enough usdc — use the faucet",
  InsufficientAllowance: "approve usdc for the round first",
  TransferFailed: "the transfer failed",
  Reentrancy: "that call was rejected",
  // v1 (either round v2 / deposit router)
  InvalidLaunchBps: "the launchpad share must be between 0 and 100%",
  LaunchBpsLocked: "your launchpad share is locked for this round",
  DepositsArePaused: "deposits are paused right now",
  NoCustodialAccount: "create your custodial account first",
  AccountLimit: "this is more than the per-account cap for this round",
  TotalLimit: "this round has reached its total cap",
  AlreadySettled: "the round has already settled",
  NotSettled: "the round has not settled yet",
  LaunchLocked: "the launch share is locked",
  LaunchNotPending: "the launch window has closed",
};

/** Turn a wallet or contract error into one short lowercase line. */
export function readableError(error: unknown): string | null {
  if (!error) return null;

  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return "rejected in your wallet";
    }

    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && REVERT_COPY[name]) return REVERT_COPY[name];
      if (name) return name.toLowerCase();
      if (reverted.reason) return reverted.reason.toLowerCase();
    }

    return error.shortMessage.toLowerCase();
  }

  if (error instanceof Error) return error.message.toLowerCase();
  return "something went wrong";
}
