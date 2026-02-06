import { Address } from 'viem';

// Base Sepolia deployed contract addresses
export const CONTRACTS = {
  riskParams: '0xe24ecE1aD46657D23fcab41e0585FBA5c4E8E61C' as Address,
  usdcVault: '0xc6703DEE49Bf14119e63c8fB3Fa0b60212442c7e' as Address,
  wethVault: '0xf5c6f1843Bf910A00B615c038565B0c1dEaA90cA' as Address,
  optionNFT: '0xC7831161CB20d1517aD7ad642a6F41727b6AFF55' as Address,
  fundingOracle: '0xC46D4e5Ca887a47118Ca5C777972251b39902D77' as Address,
  optionManager: '0x92768885E13B791683Cee58532125c35E943840E' as Address,
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
  weth: '0x4200000000000000000000000000000000000006' as Address,
};

// Option types
export enum OptionType {
  CALL = 0,
  PUT = 1,
}

// Position status
export enum PositionStatus {
  ACTIVE = 0,
  EXERCISED = 1,
  LIQUIDATED = 2,
  CLOSED = 3,
}

// ABIs
export const OPTION_MANAGER_ABI = [
  {
    "inputs": [
      { "internalType": "enum IFundingOracle.OptionType", "name": "optionType", "type": "uint8" },
      { "internalType": "address", "name": "underlying", "type": "address" },
      { "internalType": "uint256", "name": "strike", "type": "uint256" },
      { "internalType": "uint256", "name": "size", "type": "uint256" },
      { "internalType": "address", "name": "longOwner", "type": "address" },
      { "internalType": "uint256", "name": "initialFunding", "type": "uint256" }
    ],
    "name": "openPosition",
    "outputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "exercise",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "liquidate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "accrueFunding",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "depositFunding",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "releaseCollateral",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "getPosition",
    "outputs": [
      {
        "components": [
          { "internalType": "enum IFundingOracle.OptionType", "name": "optionType", "type": "uint8" },
          { "internalType": "address", "name": "underlying", "type": "address" },
          { "internalType": "uint256", "name": "strike", "type": "uint256" },
          { "internalType": "uint256", "name": "size", "type": "uint256" },
          { "internalType": "address", "name": "shortOwner", "type": "address" },
          { "internalType": "uint256", "name": "collateralAmount", "type": "uint256" },
          { "internalType": "uint256", "name": "lastFundingTime", "type": "uint256" },
          { "internalType": "uint256", "name": "longFundingBalance", "type": "uint256" },
          { "internalType": "enum IOptionManager.PositionStatus", "name": "status", "type": "uint8" }
        ],
        "internalType": "struct IOptionManager.Position",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "isLiquidatable",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "getCollateralRatio",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "getShortPositions",
    "outputs": [{ "internalType": "uint256[]", "name": "", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "getPendingFunding",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "longOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "shortOwner", "type": "address" },
      { "indexed": false, "internalType": "enum IFundingOracle.OptionType", "name": "optionType", "type": "uint8" },
      { "indexed": false, "internalType": "address", "name": "underlying", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "strike", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "size", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "collateral", "type": "uint256" }
    ],
    "name": "PositionOpened",
    "type": "event"
  }
] as const;

export const OPTION_NFT_ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ownerOf",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "tokensOfOwner",
    "outputs": [{ "internalType": "uint256[]", "name": "", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "tokenURI",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const FUNDING_ORACLE_ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "underlying", "type": "address" }],
    "name": "getSpotPrice",
    "outputs": [{ "internalType": "uint256", "name": "price", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "enum IFundingOracle.OptionType", "name": "optionType", "type": "uint8" },
      { "internalType": "address", "name": "underlying", "type": "address" },
      { "internalType": "uint256", "name": "strike", "type": "uint256" }
    ],
    "name": "getMarkPrice",
    "outputs": [{ "internalType": "uint256", "name": "markPrice", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "enum IFundingOracle.OptionType", "name": "optionType", "type": "uint8" },
      { "internalType": "address", "name": "underlying", "type": "address" },
      { "internalType": "uint256", "name": "strike", "type": "uint256" }
    ],
    "name": "getIntrinsicValue",
    "outputs": [{ "internalType": "uint256", "name": "intrinsic", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const ERC20_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
