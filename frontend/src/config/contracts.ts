import { Address } from 'viem';

// ─── Constants ──────────────────────────────────────────────────────────────
export const WAD = BigInt(1e18);
export const USDC_DECIMALS = 6;
export const SHARE_DECIMALS = 6; // ERC-4626 shares inherit USDC decimals (decimalsOffset = 0)
export const USDC_TO_WAD = BigInt(1e12); // multiply USDC (1e6) by this to get WAD (1e18)

// ─── Contract Addresses (Base Sepolia) ──────────────────────────────────────
export const CONTRACTS = {
  evOptionManager: '0xFD0fFcb0f05ADDDb5209F4041FAC8035E6A422Bc' as Address,
  clumEngine:      '0x9f60e207F7eea86784AAAD9375154936cecf4792' as Address,
  bucketRegistry:  '0x8ed62D170B8F1dbDFAAEB04ff7d5fc3893573541' as Address,
  lpPool:          '0xF7430e5073Cd29FafbDe90cB2CB03ba308Ec8E19' as Address,
  fundingDeriver:  '0xF7c80F55645381a99683b6bC1dDaccB6ADBf1b3C' as Address,
  positionTokens:  '0xc125b6Ea79887e0150a6F3eA4B699683E495113B' as Address,
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
  weth: '0x4200000000000000000000000000000000000006' as Address,
};

// ─── Enums & Types ──────────────────────────────────────────────────────────
export enum OptionType {
  CALL = 0,
  PUT = 1,
}

export interface Position {
  optionType: number;
  strike: bigint;       // WAD (1e18)
  size: bigint;         // WAD (1e18)
  owner: string;
  fundingBalance: bigint; // USDC (1e6)
  lastFundingTime: bigint;
  isActive: boolean;
}

// ─── ABIs ───────────────────────────────────────────────────────────────────

export const EV_OPTION_MANAGER_ABI = [
  {
    inputs: [
      { internalType: "uint8", name: "optionType", type: "uint8" },
      { internalType: "uint256", name: "strike", type: "uint256" },
      { internalType: "uint256", name: "size", type: "uint256" },
      { internalType: "uint256", name: "initialFunding", type: "uint256" },
    ],
    name: "buyOption",
    outputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "uint256", name: "size", type: "uint256" },
    ],
    name: "sellOption",
    outputs: [{ internalType: "uint256", name: "revenue", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "exercise",
    outputs: [{ internalType: "uint256", name: "payout", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "depositFunding",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "accrueFunding",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "liquidate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "getPosition",
    outputs: [
      {
        components: [
          { internalType: "uint8", name: "optionType", type: "uint8" },
          { internalType: "uint256", name: "strike", type: "uint256" },
          { internalType: "uint256", name: "size", type: "uint256" },
          { internalType: "address", name: "owner", type: "address" },
          { internalType: "uint256", name: "fundingBalance", type: "uint256" },
          { internalType: "uint256", name: "lastFundingTime", type: "uint256" },
          { internalType: "bool", name: "isActive", type: "bool" },
        ],
        internalType: "struct IEvOptionManager.Position",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "isLiquidatable",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "getOwnerPositions",
    outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "positionId", type: "uint256" }],
    name: "getPendingFunding",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nextPositionId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const CLUM_ENGINE_ABI = [
  {
    inputs: [
      { internalType: "uint8", name: "optionType", type: "uint8" },
      { internalType: "uint256", name: "strikeWad", type: "uint256" },
      { internalType: "uint256", name: "sizeWad", type: "uint256" },
    ],
    name: "quoteBuy",
    outputs: [{ internalType: "uint256", name: "costWad", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint8", name: "optionType", type: "uint8" },
      { internalType: "uint256", name: "strikeWad", type: "uint256" },
      { internalType: "uint256", name: "sizeWad", type: "uint256" },
    ],
    name: "quoteSell",
    outputs: [{ internalType: "uint256", name: "revenueWad", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRiskNeutralPrices",
    outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getImpliedDistribution",
    outputs: [
      { internalType: "uint256[]", name: "midpoints", type: "uint256[]" },
      { internalType: "uint256[]", name: "probabilities", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCachedCost",
    outputs: [{ internalType: "int256", name: "", type: "int256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getNumBuckets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const BUCKET_REGISTRY_ABI = [
  {
    inputs: [],
    name: "getSpotPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "numBuckets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "getBucketMidpoint",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCenterPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "needsRebalance",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const LP_POOL_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "assets", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
    ],
    name: "deposit",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "assets", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
      { internalType: "address", name: "owner", type: "address" },
    ],
    name: "withdraw",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
      { internalType: "address", name: "owner", type: "address" },
    ],
    name: "redeem",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "totalAssets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getMaxSubsidy",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalPremiums",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalFunding",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalLosses",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "shares", type: "uint256" }],
    name: "convertToAssets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "assets", type: "uint256" }],
    name: "convertToShares",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const FUNDING_DERIVER_ABI = [
  {
    inputs: [
      { internalType: "uint8", name: "optionType", type: "uint8" },
      { internalType: "uint256", name: "strikeWad", type: "uint256" },
    ],
    name: "getMarkPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint8", name: "optionType", type: "uint8" },
      { internalType: "uint256", name: "strikeWad", type: "uint256" },
    ],
    name: "getIntrinsicValue",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint8", name: "optionType", type: "uint8" },
      { internalType: "uint256", name: "strikeWad", type: "uint256" },
      { internalType: "uint256", name: "sizeWad", type: "uint256" },
    ],
    name: "getFundingPerSecond",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const POSITION_TOKENS_ABI = [
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" },
    ],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint8", name: "optionType", type: "uint8" },
      { internalType: "uint256", name: "strikeWad", type: "uint256" },
    ],
    name: "encodeTokenId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
