import type {Abi, Address} from "viem";

/**
 * v1 — the robinhood chain round. Addresses come from `DeployV1.s.sol`; usdg and the
 * morpho vault are fixed mainnet contracts and only overridable for fork testing.
 */
export const roundV2Address = (import.meta.env.NEXT_PUBLIC_ROUND_V2_ADDRESS ?? "") as Address;
export const depositRouterAddress = (import.meta.env.NEXT_PUBLIC_DEPOSIT_ROUTER_ADDRESS ??
  "") as Address;
export const usdgAddress = (import.meta.env.NEXT_PUBLIC_USDG_ADDRESS ??
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168") as Address;
export const morphoVaultAddress = (import.meta.env.NEXT_PUBLIC_MORPHO_VAULT_ADDRESS ??
  "0x37788ff0c1d4e45A7FE06BC7e71e0cc00121d0A8") as Address;

/** Block the v1 round was deployed in, so event queries don't scan from genesis. */
export const v1DeployBlock = (() => {
  const raw = (import.meta.env.NEXT_PUBLIC_V1_DEPLOY_BLOCK ?? "").trim();
  if (!/^\d+$/.test(raw)) return 0n;
  return BigInt(raw);
})();

/** Base url of the either backend that runs the custodial accounts. */
export const apiUrl = (import.meta.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

export const areV1ContractsConfigured =
  isAddress(roundV2Address) && isAddress(depositRouterAddress) && isAddress(usdgAddress);

/** usdg decimals — 6, same as usdc, so `format.ts` applies unchanged. */
export const USDG_DECIMALS = 6;

export const BPS_DENOMINATOR = 10_000;

/** `winner` value the round reports for a tie. */
export const TIE = 2;

export const LaunchState = {
  Pending: 0,
  Failed: 1,
  Succeeded: 2,
} as const;
export type LaunchState = (typeof LaunchState)[keyof typeof LaunchState];

export const roundV2Abi = [
  {
    type: "function",
    name: "getRound",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          {name: "sideAName", type: "string"},
          {name: "sideBName", type: "string"},
          {name: "endTime", type: "uint256"},
          {name: "sideABacked", type: "uint256"},
          {name: "sideBBacked", type: "uint256"},
          {name: "sideABackers", type: "uint256"},
          {name: "sideBBackers", type: "uint256"},
          {name: "totalBackedAll", type: "uint256"},
          {name: "uniqueBackers", type: "uint256"},
          {name: "closed", type: "bool"},
          {name: "settled", type: "bool"},
          {name: "winner", type: "uint8"},
          {name: "settledAt", type: "uint256"},
          {name: "launchState", type: "uint8"},
          {name: "totalLaunchCommitted", type: "uint256"},
          {name: "backingThreshold", type: "uint256"},
          {name: "launchThreshold", type: "uint256"},
          {name: "launchWindowEnd", type: "uint256"},
          {name: "maxPerAccount", type: "uint256"},
          {name: "maxTotal", type: "uint256"},
          {name: "depositsPaused", type: "bool"},
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{name: "user", type: "address"}],
    outputs: [
      {
        type: "tuple",
        components: [
          {name: "custodial", type: "address"},
          {name: "principalA", type: "uint256"},
          {name: "principalB", type: "uint256"},
          {name: "redeemedA", type: "uint256"},
          {name: "redeemedB", type: "uint256"},
          {name: "redeemableA", type: "uint256"},
          {name: "redeemableB", type: "uint256"},
          {name: "launchBps", type: "uint16"},
          {name: "launchBpsSet", type: "bool"},
          {name: "launchCommitment", type: "uint256"},
          {name: "launchReleased", type: "bool"},
          {name: "launchSpent", type: "bool"},
        ],
      },
    ],
  },
  {
    type: "function",
    name: "custodialOf",
    stateMutability: "view",
    inputs: [{name: "user", type: "address"}],
    outputs: [{type: "address"}],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeLaunch",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "AccountRegistered",
    inputs: [
      {name: "user", type: "address", indexed: true},
      {name: "custodial", type: "address", indexed: true},
    ],
  },
  {
    type: "event",
    name: "Backed",
    inputs: [
      {name: "user", type: "address", indexed: true},
      {name: "side", type: "uint8", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
      {name: "launchBps", type: "uint16", indexed: false},
      {name: "sideTotal", type: "uint256", indexed: false},
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      {name: "user", type: "address", indexed: true},
      {name: "side", type: "uint8", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
      {name: "sideTotal", type: "uint256", indexed: false},
    ],
  },
  {
    type: "event",
    name: "Redeemed",
    inputs: [
      {name: "user", type: "address", indexed: true},
      {name: "side", type: "uint8", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
    ],
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      {name: "winner", type: "uint8", indexed: false},
      {name: "sideABacked", type: "uint256", indexed: false},
      {name: "sideBBacked", type: "uint256", indexed: false},
      {name: "launchCommitted", type: "uint256", indexed: false},
    ],
  },
  {
    type: "event",
    name: "LaunchReleased",
    inputs: [
      {name: "user", type: "address", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
    ],
  },
  {type: "error", name: "ZeroAmount", inputs: []},
  {type: "error", name: "InvalidSide", inputs: []},
  {type: "error", name: "InvalidLaunchBps", inputs: []},
  {type: "error", name: "LaunchBpsLocked", inputs: []},
  {type: "error", name: "RoundClosed", inputs: []},
  {type: "error", name: "RoundOpen", inputs: []},
  {type: "error", name: "AlreadySettled", inputs: []},
  {type: "error", name: "NotSettled", inputs: []},
  {type: "error", name: "DepositsArePaused", inputs: []},
  {type: "error", name: "NoCustodialAccount", inputs: []},
  {type: "error", name: "AccountLimit", inputs: []},
  {type: "error", name: "TotalLimit", inputs: []},
  {type: "error", name: "LaunchLocked", inputs: []},
  {type: "error", name: "LaunchNotPending", inputs: []},
  {type: "error", name: "LaunchWindowOpen", inputs: []},
] as const satisfies Abi;

export const depositRouterAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      {name: "side", type: "uint8"},
      {name: "amount", type: "uint256"},
      {name: "launchBps", type: "uint16"},
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "depositWithPermit",
    stateMutability: "nonpayable",
    inputs: [
      {name: "side", type: "uint8"},
      {name: "amount", type: "uint256"},
      {name: "launchBps", type: "uint16"},
      {name: "deadline", type: "uint256"},
      {name: "v", type: "uint8"},
      {name: "r", type: "bytes32"},
      {name: "s", type: "bytes32"},
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      {name: "user", type: "address", indexed: true},
      {name: "custodial", type: "address", indexed: true},
      {name: "side", type: "uint8", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
      {name: "launchBps", type: "uint16", indexed: false},
    ],
  },
  {type: "error", name: "NoCustodialAccount", inputs: []},
  {type: "error", name: "TransferFailed", inputs: []},
] as const satisfies Abi;

/** The slice of erc20 the interface touches on usdg. */
export const usdgAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      {name: "owner", type: "address"},
      {name: "spender", type: "address"},
    ],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      {name: "spender", type: "address"},
      {name: "value", type: "uint256"},
    ],
    outputs: [{type: "bool"}],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint8"}],
  },
  // eip-2612, for `depositWithPermit`. `DOMAIN_SEPARATOR` is read rather than assumed:
  // it is the only way to know which eip-712 domain the token actually signs under.
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{name: "owner", type: "address"}],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "bytes32"}],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "string"}],
  },
] as const satisfies Abi;

/** The read side of erc-4626, enough to show the vault the backing sits in. */
export const erc4626Abi = [
  {type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{type: "address"}]},
  {type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{type: "string"}]},
  {type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{type: "string"}]},
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{name: "shares", type: "uint256"}],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "maxWithdraw",
    stateMutability: "view",
    inputs: [{name: "owner", type: "address"}],
    outputs: [{type: "uint256"}],
  },
] as const satisfies Abi;
