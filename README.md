<p align="center">
  <h1 align="center">🔮 EverLast Protocol ♾️</h1>
  <p align="center">
    <strong>Perpetual Options That Never Expire</strong>
  </p>
  <p align="center">
    Trade call and put options on Base with no expiration dates. Positions are NFTs with continuous funding.
  </p>
</p>

<p align="center">
  <a href="https://github.com/ANRGUSC/everlast-protocol/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  </a>
  <a href="https://soliditylang.org/">
    <img src="https://img.shields.io/badge/Solidity-0.8.20-363636?logo=solidity" alt="Solidity">
  </a>
  <a href="https://base.org/">
    <img src="https://img.shields.io/badge/Chain-Base-0052FF?logo=coinbase" alt="Base">
  </a>
  <a href="https://nextjs.org/">
    <img src="https://img.shields.io/badge/Frontend-Next.js-black?logo=next.js" alt="Next.js">
  </a>
  <a href="https://sepolia.basescan.org/address/0x92768885E13B791683Cee58532125c35E943840E">
    <img src="https://img.shields.io/badge/Status-Live%20on%20Testnet-green" alt="Testnet">
  </a>
</p>

---

## Highlights

- **No Expiration** - Options stay open indefinitely, no rolling required
- **NFT Positions** - Trade your options on any NFT marketplace
- **Continuous Funding** - Time value flows from long to short automatically
- **Fully Collateralized** - 100% backed, no counterparty risk
- **Exercise Anytime** - American-style, exercise when in-the-money
- **Built on Base** - Fast, cheap transactions on Ethereum L2

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/ANRGUSC/everlast-protocol.git
cd everlast-protocol

# Install dependencies
npm install

# Run tests
npx hardhat test

# Start frontend
cd frontend && npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your wallet to Base Sepolia.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Deployed Contracts](#deployed-contracts)
- [Installation](#installation)
- [Smart Contracts](#smart-contracts)
- [Frontend](#frontend)
- [Testing](#testing)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## How It Works

### The Problem

Traditional options expire, forcing traders to:
- Roll positions (expensive)
- Manage multiple expiries (complex)
- Accept fragmented liquidity

### The Solution

EverLast creates **perpetual options** that never expire:

```
┌─────────────────────────────────────────────────────────────┐
│  SHORT SELLER                         LONG HOLDER           │
│  ┌─────────────┐                     ┌─────────────┐        │
│  │ Deposits    │ ──── NFT ────────▶  │ Receives    │        │
│  │ Collateral  │                     │ Option NFT  │        │
│  └─────────────┘                     └─────────────┘        │
│        ▲                                    │               │
│        │         Continuous Funding         │               │
│        └────────────────────────────────────┘               │
│                   (rent payment)                            │
└─────────────────────────────────────────────────────────────┘
```

| Action | What Happens |
|--------|--------------|
| **Open** | Short deposits collateral, Long receives NFT |
| **Fund** | Long pays "rent" to keep position alive |
| **Exercise** | Long exercises ITM option, receives payout |
| **Liquidate** | Anyone can liquidate undercollateralized positions |

---

## Deployed Contracts

### Base Sepolia (Testnet)

| Contract | Address | Etherscan |
|----------|---------|-----------|
| OptionManager | `0x92768885E13B791683Cee58532125c35E943840E` | [View](https://sepolia.basescan.org/address/0x92768885E13B791683Cee58532125c35E943840E) |
| OptionNFT | `0xC7831161CB20d1517aD7ad642a6F41727b6AFF55` | [View](https://sepolia.basescan.org/address/0xC7831161CB20d1517aD7ad642a6F41727b6AFF55) |
| FundingOracle | `0xC46D4e5Ca887a47118Ca5C777972251b39902D77` | [View](https://sepolia.basescan.org/address/0xC46D4e5Ca887a47118Ca5C777972251b39902D77) |
| USDC Vault | `0xc6703DEE49Bf14119e63c8fB3Fa0b60212442c7e` | [View](https://sepolia.basescan.org/address/0xc6703DEE49Bf14119e63c8fB3Fa0b60212442c7e) |
| WETH Vault | `0xf5c6f1843Bf910A00B615c038565B0c1dEaA90cA` | [View](https://sepolia.basescan.org/address/0xf5c6f1843Bf910A00B615c038565B0c1dEaA90cA) |
| RiskParams | `0xe24ecE1aD46657D23fcab41e0585FBA5c4E8E61C` | [View](https://sepolia.basescan.org/address/0xe24ecE1aD46657D23fcab41e0585FBA5c4E8E61C) |

### External Dependencies

| Token | Address |
|-------|---------|
| USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| WETH | `0x4200000000000000000000000000000000000006` |
| Chainlink ETH/USD | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |

---

## Installation

### Prerequisites

- Node.js 18+
- Git
- MetaMask or Coinbase Wallet

### Setup

```bash
# Clone repository
git clone https://github.com/ANRGUSC/everlast-protocol.git
cd everlast-protocol

# Install contract dependencies
npm install

# Compile contracts
npx hardhat compile
```

---

## Smart Contracts

### Overview

| Contract | Purpose |
|----------|---------|
| `OptionManager.sol` | Core controller - opens, exercises, liquidates positions |
| `PerpetualOptionNFT.sol` | ERC-721 tokens representing long positions |
| `CollateralVault.sol` | ERC-4626 vaults holding WETH/USDC collateral |
| `FundingOracle.sol` | Chainlink integration + funding rate calculation |
| `RiskParams.sol` | Configurable protocol parameters |

### Usage Examples

**Open a CALL Position:**

```solidity
// 1. Approve collateral
weth.approve(optionManager, 1 ether);

// 2. Open position
optionManager.openPosition(
    OptionType.CALL,    // Call option
    weth,               // Underlying
    2500e6,             // Strike: $2500
    1e18,               // Size: 1 ETH
    buyerAddress,       // Long holder
    100e6               // Initial funding: $100
);
```

**Exercise an Option:**

```solidity
// Approve strike payment (for calls)
usdc.approve(optionManager, strikeAmount);

// Exercise
optionManager.exercise(tokenId);
```

**Liquidate:**

```solidity
// Check if liquidatable
if (optionManager.isLiquidatable(tokenId)) {
    optionManager.liquidate(tokenId);
    // Liquidator receives collateral at 5% discount
}
```

---

## Frontend

### Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 14 | React framework |
| wagmi v2 | Ethereum hooks |
| viem | Ethereum library |
| RainbowKit | Wallet connection |
| Tailwind CSS | Styling |

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Overview and stats |
| Open Position | `/open` | Create new options |
| My Positions | `/positions` | Manage your positions |
| Liquidate | `/liquidate` | Liquidate positions |
| Faucet | `/faucet` | Get test WETH |

### Run Locally

```bash
cd frontend
npm install
npm run dev
```

---

## Testing

```bash
# Run all tests
npx hardhat test

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run specific test file
npx hardhat test test/PerpetualOptions.test.js
```

### Test Coverage

- Position opening (CALL/PUT)
- Funding accrual and payments
- Exercise mechanics
- Liquidation scenarios
- Access control
- Edge cases

---

## Architecture

```
                    ┌──────────────────────┐
                    │    OptionManager     │
                    │   (Core Controller)  │
                    └──────────┬───────────┘
                               │
       ┌───────────┬───────────┼───────────┬───────────┐
       │           │           │           │           │
       ▼           ▼           ▼           ▼           ▼
┌───────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ OptionNFT │ │  USDC   │ │  WETH   │ │ Funding │ │  Risk   │
│ (ERC-721) │ │  Vault  │ │  Vault  │ │ Oracle  │ │ Params  │
└───────────┘ └─────────┘ └─────────┘ └────┬────┘ └─────────┘
                                           │
                                           ▼
                                    ┌───────────┐
                                    │ Chainlink │
                                    │ ETH/USD   │
                                    └───────────┘
```

### Data Flow

1. **Open:** User → OptionManager → Vault (deposit) → NFT (mint)
2. **Fund:** User → OptionManager → USDC transfer
3. **Exercise:** User → OptionManager → Vault (withdraw) → Payout
4. **Liquidate:** Liquidator → OptionManager → Vault → Rewards

---

## Configuration

### Risk Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minCollateralRatio` | 100% | Minimum collateral required |
| `maintenanceRatio` | 120% | Liquidation threshold |
| `liquidationBonus` | 5% | Liquidator reward |
| `minPositionSize` | 0.01 ETH | Minimum option size |
| `baseImpliedVolatility` | 80% | IV for pricing |

### Decimals

| Asset | Decimals |
|-------|----------|
| ETH/WETH | 18 |
| USDC | 6 |
| Chainlink Price | 8 |
| Percentages | 18 (1e18 = 100%) |

---

## Security

### Implemented

- ReentrancyGuard on all state changes
- SafeERC20 for token transfers
- Owner-only admin functions
- Oracle staleness checks
- Emergency pause mechanism

### Limitations

> **Warning:** This protocol is deployed on testnet only. It has not been audited. Do not use with real funds.

- Single oracle dependency (Chainlink)
- Centralized admin controls
- No slippage protection on exercise

---

## Contributing

Contributions are welcome!

```bash
# Fork the repo
# Create your branch
git checkout -b feature/amazing-feature

# Make changes and test
npx hardhat test

# Commit and push
git commit -m "Add amazing feature"
git push origin feature/amazing-feature

# Open a Pull Request
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Links

- [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia)
- [Circle USDC Faucet](https://faucet.circle.com/)
- [Base Documentation](https://docs.base.org/)
- [Chainlink Price Feeds](https://docs.chain.link/data-feeds/price-feeds)

---

<p align="center">
  Built with Solidity + Next.js on Base
</p>

