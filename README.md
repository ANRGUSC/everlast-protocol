# EverLast - Perpetual Options Protocol

A decentralized perpetual options protocol built on Base. Options that never expire, represented as NFTs with continuous funding flowing from long to short positions.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Deployed Contracts](#deployed-contracts)
- [Getting Started](#getting-started)
- [Smart Contracts](#smart-contracts)
- [Frontend](#frontend)
- [Testing](#testing)
- [Technical Details](#technical-details)
- [Security Considerations](#security-considerations)
- [License](#license)

---

## Overview

EverLast is a perpetual options protocol that enables users to trade call and put options without expiration dates. Unlike traditional options that expire worthless or require rolling, EverLast options remain active indefinitely through a continuous funding mechanism.

**Key Innovation:** Options positions are represented as ERC-721 NFTs, making them transferable and tradeable on secondary markets.

### The Problem with Traditional Options

- **Expiration Risk:** Traditional options expire, often worthless
- **Rolling Costs:** Maintaining exposure requires expensive rolling
- **Liquidity Fragmentation:** Multiple expiries fragment liquidity
- **Complexity:** Managing multiple expiration dates is complex

### The EverLast Solution

- **No Expiration:** Positions stay open as long as funding is maintained
- **Continuous Funding:** Long pays "rent" to short, representing time value
- **NFT Positions:** Tradeable, transferable option positions
- **Simplified UX:** One strike price, no expiry management

---

## Features

### Core Features

- **Perpetual Call Options:** Right to buy ETH at strike price, anytime
- **Perpetual Put Options:** Right to sell ETH at strike price, anytime
- **NFT-Based Positions:** Long positions are ERC-721 tokens
- **Continuous Funding:** Time value flows from long to short
- **American-Style Exercise:** Exercise anytime when in-the-money
- **Liquidation Mechanism:** Undercollateralized positions can be liquidated

### Technical Features

- **ERC-4626 Vaults:** Standardized collateral management
- **Chainlink Oracles:** Reliable price feeds for ETH/USD
- **Configurable Risk Parameters:** Adjustable collateral ratios, liquidation bonuses
- **On-Chain SVG NFTs:** Dynamic metadata with option details

---

## How It Works

### 1. Opening a Position

The **short seller** creates an option by:
1. Choosing option type (CALL or PUT)
2. Setting the strike price
3. Specifying the position size
4. Depositing collateral:
   - **CALL:** Deposit WETH (the underlying)
   - **PUT:** Deposit USDC (strike price coverage)
5. Specifying the long position holder

An NFT is minted to the long position holder, representing their right to exercise.

### 2. Continuous Funding

The **long holder** pays continuous funding to the short:
- Funding rate is based on option's intrinsic value + time value
- Calculated using Black-Scholes-inspired pricing
- Deducted from long's funding balance automatically
- If funding runs out, position closes

**Funding Rate Formula:**
```
fundingPerSecond = (intrinsicValue + timeValue) * size * fundingRateMultiplier / secondsPerYear
```

### 3. Exercise

The **long holder** can exercise when the option is in-the-money:

**CALL Exercise (ETH price > strike):**
- Long pays strike price in USDC
- Long receives ETH from collateral

**PUT Exercise (ETH price < strike):**
- Long delivers ETH
- Long receives strike price in USDC

### 4. Liquidation

If a position becomes undercollateralized:
- Anyone can liquidate it
- Liquidator pays the long's intrinsic value
- Liquidator receives the collateral at a discount (5% bonus)
- Position is closed

### 5. Position Lifecycle

```
+-------------+     +-------------+     +-------------+
|   ACTIVE    |---->|  EXERCISED  |     |  LIQUIDATED |
|             |     +-------------+     +-------------+
|  Funding    |            ^                   ^
|  accrues    |            |                   |
|             |     Long exercises      Position under-
+-------------+     when ITM            collateralized
       |
       | Funding depleted
       v
+-------------+
|   CLOSED    |
+-------------+
```

---

## Architecture

### Contract Architecture

```
+---------------------------------------------------------------+
|                        OptionManager                           |
|  (Core controller - manages position lifecycle)                |
+---------------------------------------------------------------+
        |              |              |              |
        v              v              v              v
+--------------+ +--------------+ +--------------+ +--------------+
| OptionNFT    | | USDCVault    | | WETHVault    | |FundingOracle |
| (ERC-721)    | | (ERC-4626)   | | (ERC-4626)   | | (Pricing)    |
+--------------+ +--------------+ +--------------+ +--------------+
                                                          |
                                                          v
                                                   +--------------+
                                                   |  RiskParams  |
                                                   |  (Config)    |
                                                   +--------------+
                                                          |
                                                          v
                                                   +--------------+
                                                   |  Chainlink   |
                                                   |  Price Feed  |
                                                   +--------------+
```

### Data Flow

1. **Open Position:** User -> OptionManager -> Vault (deposit) -> NFT (mint)
2. **Fund Position:** User -> OptionManager -> USDC transfer
3. **Exercise:** User -> OptionManager -> Vault (withdraw) -> Asset transfer
4. **Liquidate:** Liquidator -> OptionManager -> Vault (withdraw) -> Payouts

---

## Deployed Contracts

### Base Sepolia Testnet (Chain ID: 84532)

| Contract | Address |
|----------|---------|
| RiskParams | `0xe24ecE1aD46657D23fcab41e0585FBA5c4E8E61C` |
| USDC Vault | `0xc6703DEE49Bf14119e63c8fB3Fa0b60212442c7e` |
| WETH Vault | `0xf5c6f1843Bf910A00B615c038565B0c1dEaA90cA` |
| PerpetualOptionNFT | `0xC7831161CB20d1517aD7ad642a6F41727b6AFF55` |
| FundingOracle | `0xC46D4e5Ca887a47118Ca5C777972251b39902D77` |
| OptionManager | `0x92768885E13B791683Cee58532125c35E943840E` |

### External Contracts Used

| Contract | Address |
|----------|---------|
| USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| WETH (Base) | `0x4200000000000000000000000000000000000006` |
| Chainlink ETH/USD | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |

---

## Getting Started

### Prerequisites

- Node.js v18+
- npm or yarn
- Git
- MetaMask or Coinbase Wallet

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd eo_protocol_base

# Install smart contract dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
```

### Environment Setup

Create a `.env` file in the root directory:

```env
PRIVATE_KEY=your_private_key_here
```

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Deploy Contracts

```bash
npx hardhat run scripts/deploy.js --network baseSepolia
```

### Start Frontend

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Smart Contracts

### OptionManager.sol

The core controller managing the entire position lifecycle.

**Key Functions:**

| Function | Description |
|----------|-------------|
| `openPosition()` | Create a new option position |
| `exercise()` | Exercise an in-the-money option |
| `liquidate()` | Liquidate an undercollateralized position |
| `depositFunding()` | Add funding to a long position |
| `accrueFunding()` | Process pending funding payments |
| `releaseCollateral()` | Withdraw excess collateral (short) |

**Opening a Position:**

```solidity
// Approve OptionManager to spend your collateral
weth.approve(optionManagerAddress, collateralAmount);

// Open a call option position
optionManager.openPosition(
    IFundingOracle.OptionType.CALL,  // Option type
    wethAddress,                      // Underlying asset
    2500e6,                          // Strike price ($2500 in USDC decimals)
    1e18,                            // Size (1 ETH in wei)
    longBuyerAddress,                // Long position holder (receives NFT)
    100e6                            // Initial funding from long (USDC)
);
```

### PerpetualOptionNFT.sol

ERC-721 contract representing long option positions.

**Features:**
- On-chain SVG generation
- Dynamic metadata with option details
- Burnable on exercise/liquidation/close

### CollateralVault.sol

ERC-4626 compliant vault for collateral management.

**Features:**
- Deposit/withdraw collateral
- Reserve collateral for positions
- Release collateral on position close
- Track reserved vs available collateral

### FundingOracle.sol

Pricing and funding rate calculations.

**Key Functions:**

| Function | Description |
|----------|-------------|
| `getSpotPrice()` | Get current ETH price from Chainlink |
| `getIntrinsicValue()` | Calculate option's intrinsic value |
| `getMarkPrice()` | Calculate option's mark price (intrinsic + time value) |
| `getFundingPerSecond()` | Calculate funding rate |

### RiskParams.sol

Configurable protocol risk parameters.

**Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minCollateralRatio` | 100% (1e18) | Minimum collateral ratio required |
| `maintenanceRatio` | 120% (1.2e18) | Liquidation threshold |
| `liquidationBonus` | 5% (0.05e18) | Liquidator reward percentage |
| `baseImpliedVolatility` | 80% (0.8e18) | IV for time value pricing |
| `minPositionSize` | 0.01 ETH | Minimum position size allowed |
| `oracleStalenessThreshold` | 3600s | Maximum oracle price age |

---

## Frontend

### Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Overview, ETH price, position counts, quick actions |
| Open Position | `/open` | Create new call/put option positions |
| My Positions | `/positions` | View and manage your long and short positions |
| Liquidate | `/liquidate` | Find and liquidate undercollateralized positions |
| Faucet | `/faucet` | Wrap ETH to WETH for testing |

### Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Web3:** wagmi v2 + viem
- **Wallet:** RainbowKit
- **Chain:** Base Sepolia

### Using the Frontend

1. **Connect Wallet:** Click "Connect Wallet" and select Base Sepolia network
2. **Get Test Tokens:** Go to Faucet and wrap ETH to get WETH
3. **Open Position:** Go to Open Position, select CALL/PUT, set parameters
4. **Manage Positions:** View your positions, add funding, or exercise
5. **Liquidate:** Search for liquidatable positions and earn rewards

---

## Testing

### Run All Tests

```bash
npx hardhat test
```

### Test with Gas Reports

```bash
REPORT_GAS=true npx hardhat test
```

### Test Categories

1. **RiskParams Tests** - Parameter updates, access control, validation
2. **CollateralVault Tests** - Deposits, withdrawals, ERC-4626 compliance
3. **FundingOracle Tests** - Price fetching, intrinsic value, funding rates
4. **OptionManager Tests** - Position lifecycle, exercise, liquidation
5. **PerpetualOptionNFT Tests** - Minting, burning, metadata

### Sample Test Output

```
  RiskParams
    ✓ Should initialize with correct default values
    ✓ Should allow owner to update minCollateralRatio
    ✓ Should allow owner to update maintenanceRatio
    ...

  CollateralVault
    ✓ Should allow deposits
    ✓ Should track reserved collateral
    ...

  OptionManager
    ✓ Should open a call position
    ✓ Should open a put position
    ✓ Should exercise a call option
    ✓ Should liquidate undercollateralized position
    ...

  24 passing (5s)
```

---

## Technical Details

### Decimal Handling

| Asset | Decimals | Scale Factor |
|-------|----------|--------------|
| ETH/WETH | 18 | 1e18 |
| USDC | 6 | 1e6 |
| Percentages | 18 | 1e18 (100% = 1e18) |
| Chainlink ETH/USD | 8 | 1e8 |

### Funding Rate Calculation

```solidity
// Time value using simplified Black-Scholes approximation
timeValue = (baseIV * spotPrice) / 10;

// Intrinsic value
// CALL: max(0, spotPrice - strike)
// PUT:  max(0, strike - spotPrice)

// Funding per second
fundingPerSecond = (intrinsic + timeValue) * size / SECONDS_PER_YEAR;
```

### Collateral Requirements

**CALL Options:**
```
requiredCollateral = size * minCollateralRatio / 1e18
// Denominated in WETH
```

**PUT Options:**
```
requiredCollateral = strike * size * minCollateralRatio / 1e36
// Denominated in USDC
```

### Liquidation Threshold

A position becomes liquidatable when:
```
collateralValue < intrinsicValue * size * maintenanceRatio / 1e18
```

---

## Security Considerations

### Implemented Safeguards

- **ReentrancyGuard:** All state-changing functions protected against reentrancy
- **SafeERC20:** Safe token transfer wrappers to handle non-standard tokens
- **Access Control:** Owner-only administrative functions
- **Input Validation:** Zero address checks, range validation, size minimums
- **Oracle Staleness:** Price feed freshness verification
- **Pause Mechanism:** Emergency protocol pause capability

### Known Limitations

1. **Single Oracle Dependency:** Relies solely on Chainlink ETH/USD feed
2. **No Slippage Protection:** Exercise occurs at current oracle price
3. **Centralized Admin:** Owner can modify risk parameters
4. **Testnet Deployment:** Not audited for mainnet use

### Recommended Improvements for Production

- [ ] Multi-oracle price aggregation (Chainlink + Uniswap TWAP)
- [ ] Time-weighted average prices for manipulation resistance
- [ ] Decentralized governance (DAO) for parameter changes
- [ ] Professional security audit by reputable firm
- [ ] Formal verification of critical functions
- [ ] Bug bounty program
- [ ] Gradual mainnet rollout with caps

---

## Gas Optimization

The contracts employ several gas optimization techniques:

- **viaIR Compiler:** Enabled for optimized bytecode generation
- **Storage Packing:** Related variables packed in single slots
- **Minimal External Calls:** Batched operations where possible
- **View Function Optimization:** Efficient read patterns

---

## Project Structure

```
eo_protocol_base/
├── contracts/
│   ├── interfaces/
│   │   ├── IOptionManager.sol
│   │   ├── ICollateralVault.sol
│   │   ├── IPerpetualOptionNFT.sol
│   │   ├── IFundingOracle.sol
│   │   └── IRiskParams.sol
│   ├── mocks/
│   │   ├── MockERC20.sol
│   │   └── MockPriceFeed.sol
│   ├── OptionManager.sol
│   ├── CollateralVault.sol
│   ├── PerpetualOptionNFT.sol
│   ├── FundingOracle.sol
│   └── RiskParams.sol
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx (Dashboard)
│   │   │   ├── open/page.tsx
│   │   │   ├── positions/page.tsx
│   │   │   ├── liquidate/page.tsx
│   │   │   └── faucet/page.tsx
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   └── Providers.tsx
│   │   └── config/
│   │       ├── contracts.ts
│   │       └── wagmi.ts
│   └── package.json
├── scripts/
│   └── deploy.js
├── test/
│   └── OptionManager.test.js
├── hardhat.config.js
├── package.json
└── README.md
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npx hardhat test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [OpenZeppelin](https://openzeppelin.com/) - Secure smart contract libraries
- [Chainlink](https://chain.link/) - Reliable decentralized oracle network
- [Base](https://base.org/) - Ethereum L2 scaling solution
- [RainbowKit](https://rainbowkit.com/) - Wallet connection UI
- [wagmi](https://wagmi.sh/) - React hooks for Ethereum

---

## Support

For questions, issues, or feature requests:
- Open an issue on GitHub
- Contact the development team

---

**Disclaimer:** This protocol is deployed on testnet for demonstration and educational purposes. It has not undergone a professional security audit and should not be used with real funds without proper security review and risk assessment. Use at your own risk.
