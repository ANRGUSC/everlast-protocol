<p align="center">
  <h1 align="center">🔮 EverLast Protocol ♾️</h1>
  <p align="center">
    <strong>Everlasting Options That Never Expire</strong>
  </p>
  <p align="center">
    Trade call and put options on Base with no expiration dates. Positions are NFTs with continuous funding.
  </p>
</p>

<p align="center">
  <a href="https://everlast-protocol.vercel.app/">
    <img src="https://img.shields.io/badge/Live%20Demo-everlast--protocol.vercel.app-brightgreen" alt="Live Demo">
  </a>
  <a href="https://github.com/ANRGUSC/everlast-protocol/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  </a>
  <a href="https://soliditylang.org/">
    <img src="https://img.shields.io/badge/Solidity-0.8.20-363636?logo=solidity" alt="Solidity">
  </a>
  <a href="https://base.org/">
    <img src="https://img.shields.io/badge/Chain-Base-0052FF?logo=coinbase" alt="Base">
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

## Try It

👉 **[Launch App](https://everlast-protocol.vercel.app/)**

Connect your wallet to Base Sepolia and get test tokens:
- [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia) - Get test ETH
- [Circle USDC Faucet](https://faucet.circle.com/) - Get test USDC

---

## How It Works

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

---

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| OptionManager | [`0x92768885E13B791683Cee58532125c35E943840E`](https://sepolia.basescan.org/address/0x92768885E13B791683Cee58532125c35E943840E) |
| OptionNFT | [`0xC7831161CB20d1517aD7ad642a6F41727b6AFF55`](https://sepolia.basescan.org/address/0xC7831161CB20d1517aD7ad642a6F41727b6AFF55) |
| FundingOracle | [`0xC46D4e5Ca887a47118Ca5C777972251b39902D77`](https://sepolia.basescan.org/address/0xC46D4e5Ca887a47118Ca5C777972251b39902D77) |
| USDC Vault | [`0xc6703DEE49Bf14119e63c8fB3Fa0b60212442c7e`](https://sepolia.basescan.org/address/0xc6703DEE49Bf14119e63c8fB3Fa0b60212442c7e) |
| WETH Vault | [`0xf5c6f1843Bf910A00B615c038565B0c1dEaA90cA`](https://sepolia.basescan.org/address/0xf5c6f1843Bf910A00B615c038565B0c1dEaA90cA) |
| RiskParams | [`0xe24ecE1aD46657D23fcab41e0585FBA5c4E8E61C`](https://sepolia.basescan.org/address/0xe24ecE1aD46657D23fcab41e0585FBA5c4E8E61C) |

---

## For Developers

```bash
# Clone and install
git clone https://github.com/ANRGUSC/everlast-protocol.git
cd everlast-protocol && npm install

# Run tests
npx hardhat test

# Run frontend locally
cd frontend && npm install && npm run dev
```

### Tech Stack

- **Contracts:** Solidity 0.8.20, Hardhat, OpenZeppelin, Chainlink
- **Frontend:** Next.js 14, wagmi, viem, RainbowKit, Tailwind CSS

---

## Security

> ⚠️ **Warning:** This protocol is deployed on testnet only. It has not been audited. Do not use with real funds.

---

## License

MIT License - see [LICENSE](LICENSE) for details.
