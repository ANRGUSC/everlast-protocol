const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CLUM Everlasting Options", function () {
  const WAD = ethers.parseEther("1");
  const USDC_DECIMALS = 6n;
  const ONE_USDC = 10n ** USDC_DECIMALS;

  // ETH price: $3000  (Chainlink 8 decimals)
  const ETH_PRICE_8 = 3000_0000_0000n;
  // ETH price in WAD
  const ETH_PRICE_WAD = ethers.parseEther("3000");
  // Bucket width: $50 in WAD
  const BUCKET_WIDTH = ethers.parseEther("50");
  // Number of regular buckets
  const NUM_REGULAR = 64n;
  // Rebalance threshold: 10%
  const REBALANCE_THRESHOLD = ethers.parseEther("0.1");
  // Oracle staleness: 1 hour
  const ORACLE_STALENESS = 3600n;
  // Subsidy: $10,000 in WAD
  const SUBSIDY_WAD = ethers.parseEther("10000");
  // Premium factor: 2x for daily funding
  const PREMIUM_FACTOR = ethers.parseEther("2");
  // Funding period: 1 day
  const FUNDING_PERIOD = 86400n;

  async function deployFullSystem() {
    const [owner, trader1, trader2, liquidator] = await ethers.getSigners();

    // Deploy mock price feed (decimals, description, version, initialPrice)
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const priceFeed = await MockPriceFeed.deploy(8, "ETH/USD", 1, ETH_PRICE_8);

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Deploy BucketRegistry
    const BucketRegistry = await ethers.getContractFactory("BucketRegistry");
    const bucketRegistry = await BucketRegistry.deploy(
      await priceFeed.getAddress(),
      ETH_PRICE_WAD,
      BUCKET_WIDTH,
      NUM_REGULAR,
      REBALANCE_THRESHOLD,
      ORACLE_STALENESS
    );

    // Deploy CLUMEngine
    const CLUMEngine = await ethers.getContractFactory("CLUMEngine");
    const clumEngine = await CLUMEngine.deploy(await bucketRegistry.getAddress());

    // Deploy LPPool
    const LPPool = await ethers.getContractFactory("LPPool");
    const lpPool = await LPPool.deploy(
      await usdc.getAddress(),
      "CLUM LP Shares",
      "clumLP"
    );

    // Deploy PositionTokens
    const PositionTokens = await ethers.getContractFactory("PositionTokens");
    const positionTokens = await PositionTokens.deploy();

    // Deploy FundingDeriver
    const FundingDeriver = await ethers.getContractFactory("FundingDeriver");
    const fundingDeriver = await FundingDeriver.deploy(
      await clumEngine.getAddress(),
      await bucketRegistry.getAddress(),
      PREMIUM_FACTOR,
      FUNDING_PERIOD
    );

    // Deploy ArbitrageGuard
    const ArbitrageGuard = await ethers.getContractFactory("ArbitrageGuard");
    const arbitrageGuard = await ArbitrageGuard.deploy(
      await clumEngine.getAddress(),
      ethers.parseEther("0.001") // tolerance
    );

    // Deploy EvOptionManager
    const EvOptionManager = await ethers.getContractFactory("EvOptionManager");
    const evManager = await EvOptionManager.deploy(
      await clumEngine.getAddress(),
      await bucketRegistry.getAddress(),
      await lpPool.getAddress(),
      await fundingDeriver.getAddress(),
      await arbitrageGuard.getAddress(),
      await positionTokens.getAddress(),
      await usdc.getAddress()
    );

    // Wire up permissions
    await clumEngine.setOptionManager(await evManager.getAddress());
    await lpPool.setClumEngine(await clumEngine.getAddress());
    await lpPool.setOptionManager(await evManager.getAddress());
    await positionTokens.setOptionManager(await evManager.getAddress());

    // Initialize CLUM with subsidy
    await clumEngine.initialize(SUBSIDY_WAD);

    // Fund the LP pool with USDC
    const lpFunding = 100_000n * ONE_USDC; // $100k USDC
    await usdc.mint(owner.address, lpFunding);
    await usdc.approve(await lpPool.getAddress(), lpFunding);
    await lpPool.deposit(lpFunding, owner.address);
    await lpPool.fundSubsidy(50_000n * ONE_USDC);

    // Give traders USDC
    const traderFunding = 50_000n * ONE_USDC;
    await usdc.mint(trader1.address, traderFunding);
    await usdc.mint(trader2.address, traderFunding);

    return {
      owner, trader1, trader2, liquidator,
      priceFeed, usdc, bucketRegistry, clumEngine,
      lpPool, positionTokens, fundingDeriver, arbitrageGuard, evManager
    };
  }

  // ─── BucketRegistry Tests ─────────────────────────────────────────────

  describe("BucketRegistry", function () {
    it("should create correct number of buckets", async function () {
      const { bucketRegistry } = await loadFixture(deployFullSystem);
      const n = await bucketRegistry.numBuckets();
      expect(n).to.equal(NUM_REGULAR + 2n);
    });

    it("should have correct center price", async function () {
      const { bucketRegistry } = await loadFixture(deployFullSystem);
      expect(await bucketRegistry.getCenterPrice()).to.equal(ETH_PRICE_WAD);
    });

    it("should return correct bucket midpoints", async function () {
      const { bucketRegistry } = await loadFixture(deployFullSystem);
      // Lower tail (index 0) midpoint = lowerEdge / 2
      const lowerEdge = ETH_PRICE_WAD - (NUM_REGULAR / 2n) * BUCKET_WIDTH;
      const lowerMid = await bucketRegistry.getBucketMidpoint(0);
      expect(lowerMid).to.equal(lowerEdge / 2n);

      // First regular bucket (index 1) midpoint = lowerEdge + width/2
      const firstRegMid = await bucketRegistry.getBucketMidpoint(1);
      expect(firstRegMid).to.equal(lowerEdge + BUCKET_WIDTH / 2n);
    });

    it("should map prices to correct bucket indices", async function () {
      const { bucketRegistry } = await loadFixture(deployFullSystem);
      // Price at center should map to a middle bucket
      const centerIdx = await bucketRegistry.getBucketIndex(ETH_PRICE_WAD);
      expect(centerIdx).to.be.gt(0);
      expect(centerIdx).to.be.lt(NUM_REGULAR + 1n);

      // Very low price should map to bucket 0
      const lowIdx = await bucketRegistry.getBucketIndex(ethers.parseEther("1"));
      expect(lowIdx).to.equal(0);

      // Very high price should map to last bucket
      const highIdx = await bucketRegistry.getBucketIndex(ethers.parseEther("100000"));
      expect(highIdx).to.equal(NUM_REGULAR + 1n);
    });

    it("should report when rebalance is needed", async function () {
      const { bucketRegistry, priceFeed } = await loadFixture(deployFullSystem);
      expect(await bucketRegistry.needsRebalance()).to.be.false;

      // Move price 15% -> should trigger rebalance
      const newPrice = ETH_PRICE_8 * 115n / 100n;
      await priceFeed.setPrice(newPrice);
      expect(await bucketRegistry.needsRebalance()).to.be.true;
    });
  });

  // ─── CLUMEngine Tests ─────────────────────────────────────────────────

  describe("CLUMEngine", function () {
    it("should initialize with correct utility level", async function () {
      const { clumEngine } = await loadFixture(deployFullSystem);
      expect(await clumEngine.initialized()).to.be.true;
      const U = await clumEngine.getUtilityLevel();
      // U = lnWad(10000e18) = ln(10000) * WAD ≈ 9.21e18
      expect(U).to.be.gt(ethers.parseEther("9"));
      expect(U).to.be.lt(ethers.parseEther("10"));
    });

    it("should initialize with correct cached cost", async function () {
      const { clumEngine } = await loadFixture(deployFullSystem);
      expect(await clumEngine.getCachedCost()).to.equal(SUBSIDY_WAD);
    });

    it("should quote non-zero cost for buying a call", async function () {
      const { clumEngine } = await loadFixture(deployFullSystem);
      const strikeWad = ethers.parseEther("3000");
      const sizeWad = ethers.parseEther("1");
      const cost = await clumEngine.quoteBuy(0, strikeWad, sizeWad); // 0 = CALL
      expect(cost).to.be.gt(0);
    });

    it("should quote higher cost for ATM vs deep OTM calls", async function () {
      const { clumEngine } = await loadFixture(deployFullSystem);
      const sizeWad = ethers.parseEther("1");

      const atmCost = await clumEngine.quoteBuy(0, ethers.parseEther("3000"), sizeWad);
      const otmCost = await clumEngine.quoteBuy(0, ethers.parseEther("4000"), sizeWad);

      expect(atmCost).to.be.gt(otmCost);
    });

    it("should return valid risk-neutral prices summing to ~1", async function () {
      const { clumEngine } = await loadFixture(deployFullSystem);
      const prices = await clumEngine.getRiskNeutralPrices();

      let sum = 0n;
      for (const p of prices) {
        sum += p;
      }
      // Should sum to WAD (1e18) within rounding
      expect(sum).to.be.gte(ethers.parseEther("0.99"));
      expect(sum).to.be.lte(ethers.parseEther("1.01"));
    });

    it("should return valid implied distribution", async function () {
      const { clumEngine } = await loadFixture(deployFullSystem);
      const [midpoints, probs] = await clumEngine.getImpliedDistribution();
      expect(midpoints.length).to.equal(probs.length);
      expect(midpoints.length).to.equal(NUM_REGULAR + 2n);
    });
  });

  // ─── LPPool Tests ─────────────────────────────────────────────────────

  describe("LPPool", function () {
    it("should accept deposits and mint shares", async function () {
      const { lpPool, usdc, trader1 } = await loadFixture(deployFullSystem);
      const amount = 1000n * ONE_USDC;
      await usdc.connect(trader1).approve(await lpPool.getAddress(), amount);
      await lpPool.connect(trader1).deposit(amount, trader1.address);
      const shares = await lpPool.balanceOf(trader1.address);
      expect(shares).to.be.gt(0);
    });

    it("should track subsidy correctly", async function () {
      const { lpPool } = await loadFixture(deployFullSystem);
      const subsidy = await lpPool.getMaxSubsidy();
      expect(subsidy).to.equal(50_000n * ONE_USDC);
    });

    it("should prevent withdrawal of reserved subsidy", async function () {
      const { lpPool, owner } = await loadFixture(deployFullSystem);
      const totalAssets = await lpPool.totalAssets();
      // Try to withdraw more than available (total - reserved)
      await expect(
        lpPool.withdraw(totalAssets, owner.address, owner.address)
      ).to.be.revertedWith("Exceeds withdrawable");
    });
  });

  // ─── FundingDeriver Tests ──────────────────────────────────────────────

  describe("FundingDeriver", function () {
    it("should compute non-zero mark price for ATM option", async function () {
      const { fundingDeriver } = await loadFixture(deployFullSystem);
      const mark = await fundingDeriver.getMarkPrice(0, ETH_PRICE_WAD); // CALL
      expect(mark).to.be.gt(0);
    });

    it("should compute intrinsic value correctly for ITM call", async function () {
      const { fundingDeriver } = await loadFixture(deployFullSystem);
      // ITM call: strike below spot
      const strike = ethers.parseEther("2800");
      const intrinsic = await fundingDeriver.getIntrinsicValue(0, strike);
      // Should be spot - strike = $200
      expect(intrinsic).to.equal(ethers.parseEther("200"));
    });

    it("should return zero intrinsic for OTM call", async function () {
      const { fundingDeriver } = await loadFixture(deployFullSystem);
      const strike = ethers.parseEther("3500");
      const intrinsic = await fundingDeriver.getIntrinsicValue(0, strike);
      expect(intrinsic).to.equal(0);
    });

    it("should compute non-zero funding rate for ATM option", async function () {
      const { fundingDeriver } = await loadFixture(deployFullSystem);
      const rate = await fundingDeriver.getFundingPerSecond(
        0, ETH_PRICE_WAD, ethers.parseEther("1")
      );
      expect(rate).to.be.gt(0);
    });

    it("mark price should exceed intrinsic value (time value > 0)", async function () {
      const { fundingDeriver } = await loadFixture(deployFullSystem);
      const strike = ethers.parseEther("2900");
      const mark = await fundingDeriver.getMarkPrice(0, strike);
      const intrinsic = await fundingDeriver.getIntrinsicValue(0, strike);
      expect(mark).to.be.gt(intrinsic);
    });
  });

  // ─── ArbitrageGuard Tests ──────────────────────────────────────────────

  describe("ArbitrageGuard", function () {
    it("should pass convexity check for valid prices", async function () {
      const { arbitrageGuard } = await loadFixture(deployFullSystem);
      const result = await arbitrageGuard.checkConvexity(
        ethers.parseEther("2900"), ethers.parseEther("200"),
        ethers.parseEther("3000"), ethers.parseEther("120"),
        ethers.parseEther("3100"), ethers.parseEther("60")
      );
      expect(result).to.be.true;
    });

    it("should fail convexity check for invalid prices", async function () {
      const { arbitrageGuard } = await loadFixture(deployFullSystem);
      const result = await arbitrageGuard.checkConvexity(
        ethers.parseEther("2900"), ethers.parseEther("100"),
        ethers.parseEther("3000"), ethers.parseEther("200"), // mid > endpoints = convex violation
        ethers.parseEther("3100"), ethers.parseEther("50")
      );
      expect(result).to.be.false;
    });

    it("should validate basic trade", async function () {
      const { arbitrageGuard } = await loadFixture(deployFullSystem);
      const result = await arbitrageGuard.validateTrade(
        0, ethers.parseEther("3000"), ethers.parseEther("100"), true
      );
      expect(result).to.be.true;
    });
  });

  // ─── EvOptionManager Integration Tests ─────────────────────────────────

  describe("EvOptionManager (full flow)", function () {
    it("should allow buying a call option", async function () {
      const { evManager, usdc, trader1, positionTokens } = await loadFixture(deployFullSystem);

      const strike = 3000n * ONE_USDC; // $3000 in USDC
      const size = ethers.parseEther("1");
      const initialFunding = 100n * ONE_USDC;

      // Approve generous amount
      await usdc.connect(trader1).approve(
        await evManager.getAddress(),
        10_000n * ONE_USDC
      );

      const tx = await evManager.connect(trader1).buyOption(0, strike, size, initialFunding);
      const receipt = await tx.wait();

      // Check position was created
      const pos = await evManager.getPosition(1);
      expect(pos.isActive).to.be.true;
      expect(pos.size).to.equal(size);
      expect(pos.owner).to.equal(trader1.address);
    });

    it("should allow depositing additional funding", async function () {
      const { evManager, usdc, trader1 } = await loadFixture(deployFullSystem);

      const strike = 3000n * ONE_USDC;
      const size = ethers.parseEther("1");
      const initialFunding = 100n * ONE_USDC;

      await usdc.connect(trader1).approve(
        await evManager.getAddress(),
        10_000n * ONE_USDC
      );
      await evManager.connect(trader1).buyOption(0, strike, size, initialFunding);

      // Deposit more funding
      const addFunding = 50n * ONE_USDC;
      await evManager.connect(trader1).depositFunding(1, addFunding);

      const pos = await evManager.getPosition(1);
      expect(pos.fundingBalance).to.be.gte(initialFunding + addFunding - ONE_USDC);
    });

    it("should accrue funding over time", async function () {
      const { evManager, usdc, trader1, priceFeed } = await loadFixture(deployFullSystem);

      const strike = 3000n * ONE_USDC;
      const size = ethers.parseEther("1");
      const initialFunding = 1000n * ONE_USDC;

      await usdc.connect(trader1).approve(
        await evManager.getAddress(),
        10_000n * ONE_USDC
      );
      await evManager.connect(trader1).buyOption(0, strike, size, initialFunding);

      // Advance time by 1 day
      await time.increase(86400);

      // Refresh oracle price so it's not stale
      await priceFeed.setPrice(ETH_PRICE_8);

      // Accrue funding
      await evManager.accrueFunding(1);

      const pos = await evManager.getPosition(1);
      // Funding balance should have decreased
      expect(pos.fundingBalance).to.be.lt(initialFunding);
    });

    it("should allow exercising an ITM call", async function () {
      const { evManager, usdc, trader1, priceFeed } = await loadFixture(deployFullSystem);

      const strike = 2800n * ONE_USDC; // ITM call
      const size = ethers.parseEther("1");
      const initialFunding = 100n * ONE_USDC;

      await usdc.connect(trader1).approve(
        await evManager.getAddress(),
        10_000n * ONE_USDC
      );
      await evManager.connect(trader1).buyOption(0, strike, size, initialFunding);

      const balBefore = await usdc.balanceOf(trader1.address);
      await evManager.connect(trader1).exercise(1);
      const balAfter = await usdc.balanceOf(trader1.address);

      // Should have received payout (intrinsic value + remaining funding)
      expect(balAfter).to.be.gt(balBefore);

      const pos = await evManager.getPosition(1);
      expect(pos.isActive).to.be.false;
    });

    it("should reject exercising OTM call", async function () {
      const { evManager, usdc, trader1 } = await loadFixture(deployFullSystem);

      const strike = 3500n * ONE_USDC; // OTM call
      const size = ethers.parseEther("1");
      const initialFunding = 100n * ONE_USDC;

      await usdc.connect(trader1).approve(
        await evManager.getAddress(),
        10_000n * ONE_USDC
      );
      await evManager.connect(trader1).buyOption(0, strike, size, initialFunding);

      await expect(
        evManager.connect(trader1).exercise(1)
      ).to.be.revertedWithCustomError(evManager, "OptionNotInTheMoney");
    });

    it("should allow selling option back to CLUM", async function () {
      const { evManager, usdc, trader1 } = await loadFixture(deployFullSystem);

      const strike = 3000n * ONE_USDC;
      const size = ethers.parseEther("1");
      const initialFunding = 100n * ONE_USDC;

      await usdc.connect(trader1).approve(
        await evManager.getAddress(),
        10_000n * ONE_USDC
      );
      await evManager.connect(trader1).buyOption(0, strike, size, initialFunding);

      const balBefore = await usdc.balanceOf(trader1.address);
      await evManager.connect(trader1).sellOption(1, size);
      const balAfter = await usdc.balanceOf(trader1.address);

      // Should have received some revenue
      expect(balAfter).to.be.gt(balBefore);
    });
  });

  // ─── Bounded Loss Invariant Tests ──────────────────────────────────────

  describe("Bounded loss invariant", function () {
    it("C(q) - max(q_i) should remain positive after trades", async function () {
      const { clumEngine, evManager, usdc, trader1 } = await loadFixture(deployFullSystem);

      await usdc.connect(trader1).approve(
        await evManager.getAddress(),
        50_000n * ONE_USDC
      );

      // Execute multiple trades
      const strikes = [2800n, 3000n, 3200n, 3500n];
      for (const s of strikes) {
        await evManager.connect(trader1).buyOption(
          0, s * ONE_USDC, ethers.parseEther("0.1"), 50n * ONE_USDC
        );
      }

      // Check invariant: C > max(q_i)
      const C = await clumEngine.getCachedCost();
      const n = await clumEngine.getNumBuckets();

      let maxQ = -(10n ** 40n); // very negative
      for (let i = 0; i < n; i++) {
        const q = await clumEngine.getQuantity(i);
        if (q > maxQ) maxQ = q;
      }

      expect(C).to.be.gt(maxQ);
    });
  });

  // ─── Gas Benchmark Tests ──────────────────────────────────────────────

  describe("Gas benchmarks", function () {
    it("should execute buyOption within reasonable gas", async function () {
      const { evManager, usdc, trader1 } = await loadFixture(deployFullSystem);

      await usdc.connect(trader1).approve(
        await evManager.getAddress(),
        50_000n * ONE_USDC
      );

      const tx = await evManager.connect(trader1).buyOption(
        0, 3000n * ONE_USDC, ethers.parseEther("1"), 100n * ONE_USDC
      );
      const receipt = await tx.wait();

      console.log(`    buyOption gas used: ${receipt.gasUsed.toString()}`);
      // Should be under 15M gas on L2
      expect(receipt.gasUsed).to.be.lt(15_000_000n);
    });

    it("should execute quoteBuy as view call efficiently", async function () {
      const { clumEngine } = await loadFixture(deployFullSystem);
      // This is a view call, so gas isn't paid but we can estimate
      const gas = await clumEngine.quoteBuy.estimateGas(
        0, ethers.parseEther("3000"), ethers.parseEther("1")
      );
      console.log(`    quoteBuy estimated gas: ${gas.toString()}`);
    });
  });
});
