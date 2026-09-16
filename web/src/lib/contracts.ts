import type {Abi, Address} from "viem";

export const roundAddress = (import.meta.env.NEXT_PUBLIC_ROUND_ADDRESS ?? "") as Address;
export const usdcAddress = (import.meta.env.NEXT_PUBLIC_USDC_ADDRESS ?? "") as Address;

/** Block the round contract was deployed in, so event queries don't scan from genesis. */
export const deployBlock = (() => {
  const raw = (import.meta.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "").trim();
  if (!/^\d+$/.test(raw)) return 0n;
  return BigInt(raw);
})();

export const areContractsConfigured =
  /^0x[0-9a-fA-F]{40}$/.test(roundAddress) && /^0x[0-9a-fA-F]{40}$/.test(usdcAddress);

/** usdc decimals — fixed at 6 by MockUSDC. */
export const USDC_DECIMALS = 6;

export const SIDE_A = 0 as const;
export const SIDE_B = 1 as const;
export type Side = typeof SIDE_A | typeof SIDE_B;

export const roundAbi = [
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
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{name: "backer", type: "address"}],
    outputs: [
      {name: "sideA", type: "uint256"},
      {name: "sideB", type: "uint256"},
    ],
  },
  {
    type: "function",
    name: "back",
    stateMutability: "nonpayable",
    inputs: [
      {name: "side", type: "uint8"},
      {name: "amount", type: "uint256"},
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      {name: "side", type: "uint8"},
      {name: "amount", type: "uint256"},
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawAll",
    stateMutability: "nonpayable",
    inputs: [{name: "side", type: "uint8"}],
    outputs: [{name: "amount", type: "uint256"}],
  },
  {
    type: "event",
    name: "Backed",
    inputs: [
      {name: "backer", type: "address", indexed: true},
      {name: "side", type: "uint8", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
      {name: "sideTotal", type: "uint256", indexed: false},
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      {name: "backer", type: "address", indexed: true},
      {name: "side", type: "uint8", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
      {name: "sideTotal", type: "uint256", indexed: false},
    ],
  },
  {type: "error", name: "ZeroAmount", inputs: []},
  {type: "error", name: "InvalidSide", inputs: []},
  {type: "error", name: "RoundClosed", inputs: []},
  {type: "error", name: "InsufficientBacking", inputs: []},
  {type: "error", name: "TransferFailed", inputs: []},
] as const satisfies Abi;

export const usdcAbi = [
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
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "FAUCET_AMOUNT",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {type: "error", name: "InsufficientBalance", inputs: []},
  {type: "error", name: "InsufficientAllowance", inputs: []},
] as const satisfies Abi;
