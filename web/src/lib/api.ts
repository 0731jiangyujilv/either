import {apiUrl} from "./contractsV1";

/**
 * Typed client for the either backend. Amounts travel as decimal strings — the
 * server's wire format for bigint — and become bigint here, so nothing numeric
 * ever rides through `number`.
 */

export type ApiRound = {
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

export type ApiVaultInfo = {
  address: string;
  totalAssets: bigint;
  grossApy: number | null;
  netApy: number | null;
  feeBps: number;
  sampledOver: {from: string; to: string} | null;
};

export type ApiYieldSplit = {
  principal: bigint;
  currentAssets: bigint;
  grossYield: bigint;
  fee: bigint;
  netYield: bigint;
};

export type ApiSidePosition = {
  principal: bigint;
  redeemed: bigint;
  redeemable: bigint;
  shares: bigint;
};

export type ApiPosition = {
  user: string;
  custodial: string | null;
  registered: boolean;
  sides: [ApiSidePosition, ApiSidePosition];
  launchBps: number | null;
  launchCommitment: bigint;
  launchReleased: boolean;
  launchSpent: boolean;
  vault: {shares: bigint; assets: bigint};
  yield: ApiYieldSplit;
  feeBps: number;
  openWithdrawals: number;
};

export type ApiAccount = {
  address: string;
  userWallet: string;
  roundId: string;
  registeredTx: string | null;
};

export type ApiWithdrawal = {
  id: number;
  side: number;
  kind: "pre_settlement" | "redemption" | "launch_release";
  principal: bigint;
  shares: bigint;
  gross_assets: bigint | null;
  fee: bigint | null;
  net_payout: bigint | null;
  state: string;
  error: string | null;
  created_at: string;
};

export type ApiNonce = {nonce: string; expiresAt: string};

export type WithdrawKind = "pre_settlement" | "redemption" | "launch_release";

/** Where the sign-in message is bound; the vault page lives under the same origin. */
const SIWE_DOMAIN = typeof window === "undefined" ? "localhost:3000" : window.location.host;

export const apiConfigured = apiUrl.length > 0;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {"content-type": "application/json", ...(init?.headers ?? {})},
  });
  const body = (await response.json().catch(() => null)) as (T & {error?: string}) | null;
  if (!response.ok) {
    throw new Error(body?.error ?? `request failed (${response.status})`);
  }
  return body as T;
}

function big(value: string | number | null | undefined): bigint {
  return value === null || value === undefined ? 0n : BigInt(value);
}

type Raw = Record<string, unknown>;

function reviveSide(raw: Raw): ApiSidePosition {
  return {
    principal: big(raw.principal as string),
    redeemed: big(raw.redeemed as string),
    redeemable: big(raw.redeemable as string),
    shares: big(raw.shares as string),
  };
}

/** Rebuild the bigint fields the server flattened to strings. */
function revivePosition(raw: Raw): ApiPosition {
  const sides = raw.sides as Raw[];
  return {
    ...(raw as unknown as ApiPosition),
    sides: [reviveSide(sides[0]), reviveSide(sides[1])],
    launchCommitment: big(raw.launchCommitment as string),
    vault: {
      shares: big((raw.vault as Raw).shares as string),
      assets: big((raw.vault as Raw).assets as string),
    },
    yield: reviveYield(raw.yield as Raw),
  };
}

function reviveYield(raw: Raw): ApiYieldSplit {
  return {
    principal: big(raw.principal as string),
    currentAssets: big(raw.currentAssets as string),
    grossYield: big(raw.grossYield as string),
    fee: big(raw.fee as string),
    netYield: big(raw.netYield as string),
  };
}

function reviveRound(raw: Raw): ApiRound {
  const round = raw.round as Raw;
  return {
    ...(round as unknown as ApiRound),
    endTime: big(round.endTime as string),
    sideABacked: big(round.sideABacked as string),
    sideBBacked: big(round.sideBBacked as string),
    sideABackers: big(round.sideABackers as string),
    sideBBackers: big(round.sideBBackers as string),
    totalBackedAll: big(round.totalBackedAll as string),
    uniqueBackers: big(round.uniqueBackers as string),
    settledAt: big(round.settledAt as string),
    totalLaunchCommitted: big(round.totalLaunchCommitted as string),
    backingThreshold: big(round.backingThreshold as string),
    launchThreshold: big(round.launchThreshold as string),
    launchWindowEnd: big(round.launchWindowEnd as string),
    maxPerAccount: big(round.maxPerAccount as string),
    maxTotal: big(round.maxTotal as string),
  };
}

function reviveVault(raw: Raw): ApiVaultInfo {
  const vault = raw.vault as Raw;
  return {
    ...(vault as unknown as ApiVaultInfo),
    totalAssets: big(vault.totalAssets as string),
  };
}

export async function fetchRound(): Promise<{round: ApiRound; vault: ApiVaultInfo; feeRecipient: string}> {
  const raw = (await call("/api/round")) as Raw;
  return {
    feeRecipient: raw.feeRecipient as string,
    round: reviveRound(raw),
    vault: reviveVault(raw),
  };
}

export async function fetchPosition(address: string): Promise<ApiPosition> {
  return revivePosition((await call(`/api/position/${address}`)) as Raw);
}

export async function fetchWithdrawals(address: string): Promise<ApiWithdrawal[]> {
  const rows = (await call<Raw[]>(`/api/withdrawals/${address}`)) ?? [];
  return rows.map((row) => ({
    ...(row as unknown as ApiWithdrawal),
    principal: big(row.principal as string),
    shares: big(row.shares as string),
    gross_assets: row.gross_assets === null ? null : big(row.gross_assets as string),
    fee: row.fee === null ? null : big(row.fee as string),
    net_payout: row.net_payout === null ? null : big(row.net_payout as string),
  }));
}

export function fetchNonce(): Promise<ApiNonce> {
  return call("/api/nonce");
}

/**
 * The exact message `auth/signed.ts` verifies: fixed preamble, address, then the
 * bound fields. One line each — a field's value must never itself contain a line.
 */
export function buildSignInMessage(input: {
  address: string;
  action: "create account" | "withdraw" | "release launch";
  nonce: string;
}): string {
  return [
    `either wants you to sign in with your wallet`,
    input.address,
    ``,
    `domain: ${SIWE_DOMAIN}`,
    `action: ${input.action}`,
    `nonce: ${input.nonce}`,
    `issued at: ${new Date().toISOString()}`,
  ].join("\n");
}

/** Every write to the backend is a fresh signature; there are no sessions. */
export async function signedCall<T>(
  address: string,
  action: "create account" | "withdraw" | "release launch",
  signMessage: (message: string) => Promise<`0x${string}`>,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const {nonce} = await fetchNonce();
  const message = buildSignInMessage({address, action, nonce});
  const signature = await signMessage(message);
  return call<T>("/api" + (action === "create account" ? "/account" : "/withdraw"), {
    method: "POST",
    body: JSON.stringify({address, message, signature, ...payload}),
  });
}

export function createAccount(
  address: string,
  signMessage: (message: string) => Promise<`0x${string}`>,
): Promise<ApiAccount> {
  return signedCall(address, "create account", signMessage);
}

export function requestWithdrawal(
  address: string,
  side: 0 | 1,
  kind: WithdrawKind,
  signMessage: (message: string) => Promise<`0x${string}`>,
): Promise<ApiWithdrawal> {
  return signedCall(address, kind === "launch_release" ? "release launch" : "withdraw", signMessage, {
    side,
    kind,
  });
}
