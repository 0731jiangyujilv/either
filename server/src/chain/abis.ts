import type {Abi} from "viem";

/**
 * Hand-written abi slices — only what the backend calls. Kept in step with
 * `contracts/src/EitherRoundV2.sol` and `web/src/lib/contractsV1.ts` by hand.
 */

export const roundV2Abi = [
  // --- recorder writes ---
  {
    type: "function",
    name: "registerAccount",
    stateMutability: "nonpayable",
    inputs: [
      {name: "user", type: "address"},
      {name: "custodial", type: "address"},
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "recordWithdraw",
    stateMutability: "nonpayable",
    inputs: [
      {name: "user", type: "address"},
      {name: "side", type: "uint8"},
      {name: "amount", type: "uint256"},
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "recordRedeem",
    stateMutability: "nonpayable",
    inputs: [
      {name: "user", type: "address"},
      {name: "side", type: "uint8"},
      {name: "amount", type: "uint256"},
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "releaseLaunch",
    stateMutability: "nonpayable",
    inputs: [{name: "user", type: "address"}],
    outputs: [],
  },
  {
    type: "function",
    name: "recordLaunchSpent",
    stateMutability: "nonpayable",
    inputs: [{name: "user", type: "address"}],
    outputs: [],
  },
  // --- anyone ---
  {type: "function", name: "settle", stateMutability: "nonpayable", inputs: [], outputs: []},
  {type: "function", name: "finalizeLaunch", stateMutability: "nonpayable", inputs: [], outputs: []},
  // --- reads ---
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
  // --- events the indexer follows ---
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
    name: "Settled",
    inputs: [
      {name: "winner", type: "uint8", indexed: false},
      {name: "sideABacked", type: "uint256", indexed: false},
      {name: "sideBBacked", type: "uint256", indexed: false},
      {name: "launchCommitted", type: "uint256", indexed: false},
    ],
  },
  {type: "error", name: "AccountAlreadyRegistered", inputs: []},
  {type: "error", name: "CustodialInUse", inputs: []},
  {type: "error", name: "AlreadySettled", inputs: []},
  {type: "error", name: "NotSettled", inputs: []},
  {type: "error", name: "RoundOpen", inputs: []},
  {type: "error", name: "LaunchLocked", inputs: []},
  {type: "error", name: "LaunchNotPending", inputs: []},
  {type: "error", name: "LaunchWindowOpen", inputs: []},
  {type: "error", name: "AlreadyReleased", inputs: []},
  {type: "error", name: "NothingToRelease", inputs: []},
] as const satisfies Abi;

export const erc20Abi = [
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
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      {name: "to", type: "address"},
      {name: "value", type: "uint256"},
    ],
    outputs: [{type: "bool"}],
  },
  {type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{type: "uint8"}]},
] as const satisfies Abi;

/** The erc-4626 surface the executor uses on the morpho vault. */
export const erc4626Abi = [
  {type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{type: "address"}]},
  {type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
  {type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
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
    outputs: [{name: "assets", type: "uint256"}],
  },
  {
    type: "function",
    name: "previewDeposit",
    stateMutability: "view",
    inputs: [{name: "assets", type: "uint256"}],
    outputs: [{name: "shares", type: "uint256"}],
  },
  {
    type: "function",
    name: "previewRedeem",
    stateMutability: "view",
    inputs: [{name: "shares", type: "uint256"}],
    outputs: [{name: "assets", type: "uint256"}],
  },
  {
    type: "function",
    name: "maxDeposit",
    stateMutability: "view",
    inputs: [{name: "onBehalf", type: "address"}],
    outputs: [{name: "assets", type: "uint256"}],
  },
  {
    type: "function",
    name: "maxRedeem",
    stateMutability: "view",
    inputs: [{name: "onBehalf", type: "address"}],
    outputs: [{name: "shares", type: "uint256"}],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      {name: "assets", type: "uint256"},
      {name: "onBehalf", type: "address"},
    ],
    outputs: [{name: "shares", type: "uint256"}],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      {name: "shares", type: "uint256"},
      {name: "receiver", type: "address"},
      {name: "onBehalf", type: "address"},
    ],
    outputs: [{name: "assets", type: "uint256"}],
  },
] as const satisfies Abi;
