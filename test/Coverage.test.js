const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Full Coverage Tests", function () {
  let riskParams;
  let usdcVault;
  let wethVault;
  let optionNFT;
  let fundingOracle;
  let optionManager;
  let usdc;
  let weth;
  let priceFeed;
  let deployer;
  let shortSeller;
  let longBuyer;
  let liquidator;

  const USDC_DECIMALS = 6;
  const WETH_DECIMALS = 18;
  const PRICE_DECIMALS = 8;

  const toUSDC = (amount) => ethers.parseUnits(amount.toString(), USDC_DECIMALS);
  const toWETH = (amount) => ethers.parseUnits(amount.toString(), WETH_DECIMALS);
  const toPrice = (amount) => BigInt(amount) * BigInt(10 ** PRICE_DECIMALS);

  beforeEach(async function () {
    [deployer, shortSeller, longBuyer, liquidator] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", USDC_DECIMALS);
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", WETH_DECIMALS);

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    priceFeed = await MockPriceFeed.deploy(PRICE_DECIMALS, "ETH / USD", 1, toPrice(2500));

    const RiskParams = await ethers.getContractFactory("RiskParams");
    riskParams = await RiskParams.deploy();

    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    usdcVault = await CollateralVault.deploy(await usdc.getAddress(), "Perpetual Options USDC Vault", "poUSDC");
    wethVault = await CollateralVault.deploy(await weth.getAddress(), "Perpetual Options WETH Vault", "poWETH");

    const PerpetualOptionNFT = await ethers.getContractFactory("PerpetualOptionNFT");
    optionNFT = await PerpetualOptionNFT.deploy("Perpetual Options", "PERP-OPT");

    const FundingOracle = await ethers.getContractFactory("FundingOracle");
    fundingOracle = await FundingOracle.deploy(await riskParams.getAddress());
    await fundingOracle.setPriceFeed(await weth.getAddress(), await priceFeed.getAddress());

    const OptionManager = await ethers.getContractFactory("OptionManager");
    optionManager = await OptionManager.deploy(
      await optionNFT.getAddress(),
      await usdcVault.getAddress(),
      await wethVault.getAddress(),
      await fundingOracle.getAddress(),
      await riskParams.getAddress(),
      await usdc.getAddress(),
      await weth.getAddress()
    );

    await optionNFT.setOptionManager(await optionManager.getAddress());
    await usdcVault.setOptionManager(await optionManager.getAddress());
    await wethVault.setOptionManager(await optionManager.getAddress());

    await usdc.mint(shortSeller.address, toUSDC(100000));
    await usdc.mint(longBuyer.address, toUSDC(100000));
    await usdc.mint(liquidator.address, toUSDC(100000));
    await weth.mint(shortSeller.address, toWETH(100));
    await weth.mint(longBuyer.address, toWETH(100));
    await weth.mint(liquidator.address, toWETH(100));

    await usdc.connect(shortSeller).approve(await optionManager.getAddress(), ethers.MaxUint256);
    await weth.connect(shortSeller).approve(await optionManager.getAddress(), ethers.MaxUint256);
    await usdc.connect(longBuyer).approve(await optionManager.getAddress(), ethers.MaxUint256);
    await weth.connect(longBuyer).approve(await optionManager.getAddress(), ethers.MaxUint256);
    await usdc.connect(liquidator).approve(await optionManager.getAddress(), ethers.MaxUint256);
    await weth.connect(liquidator).approve(await optionManager.getAddress(), ethers.MaxUint256);

    await usdc.connect(shortSeller).approve(await usdcVault.getAddress(), ethers.MaxUint256);
    await weth.connect(shortSeller).approve(await wethVault.getAddress(), ethers.MaxUint256);
  });

  // ============================================================
  // RiskParams - All Setters and Validation
  // ============================================================
  describe("RiskParams - Full Coverage", function () {
    it("Should set liquidation bonus", async function () {
      await riskParams.setLiquidationBonus(ethers.parseEther("0.1"));
      expect(await riskParams.liquidationBonus()).to.equal(ethers.parseEther("0.1"));
    });

    it("Should revert liquidation bonus > 20%", async function () {
      await expect(riskParams.setLiquidationBonus(ethers.parseEther("0.21"))).to.be.revertedWith("Bonus must be <= 20%");
    });

    it("Should set base implied volatility", async function () {
      await riskParams.setBaseImpliedVolatility(ethers.parseEther("1.0"));
      expect(await riskParams.baseImpliedVolatility()).to.equal(ethers.parseEther("1.0"));
    });

    it("Should revert IV < 10%", async function () {
      await expect(riskParams.setBaseImpliedVolatility(ethers.parseEther("0.09"))).to.be.revertedWith("IV must be >= 10%");
    });

    it("Should revert IV > 500%", async function () {
      await expect(riskParams.setBaseImpliedVolatility(ethers.parseEther("5.1"))).to.be.revertedWith("IV must be <= 500%");
    });

    it("Should set max funding rate per second", async function () {
      await riskParams.setMaxFundingRatePerSecond(1000);
      expect(await riskParams.maxFundingRatePerSecond()).to.equal(1000);
    });

    it("Should set oracle staleness threshold", async function () {
      await riskParams.setOracleStalenessThreshold(7200);
      expect(await riskParams.oracleStalenessThreshold()).to.equal(7200);
    });

    it("Should revert threshold < 1 minute", async function () {
      await expect(riskParams.setOracleStalenessThreshold(59)).to.be.revertedWith("Threshold must be >= 1 minute");
    });

    it("Should revert threshold > 1 day", async function () {
      await expect(riskParams.setOracleStalenessThreshold(86401)).to.be.revertedWith("Threshold must be <= 1 day");
    });

    it("Should set min position size", async function () {
      await riskParams.setMinPositionSize(ethers.parseEther("0.1"));
      expect(await riskParams.minPositionSize()).to.equal(ethers.parseEther("0.1"));
    });

    it("Should revert min position size = 0", async function () {
      await expect(riskParams.setMinPositionSize(0)).to.be.revertedWith("Size must be > 0");
    });

    it("Should revert min collateral ratio < 100%", async function () {
      await expect(riskParams.setMinCollateralRatio(ethers.parseEther("0.99"))).to.be.revertedWith("Ratio must be >= 100%");
    });

    it("Should revert min collateral ratio > 200%", async function () {
      await expect(riskParams.setMinCollateralRatio(ethers.parseEther("2.01"))).to.be.revertedWith("Ratio must be <= 200%");
    });

    it("Should revert maintenance ratio < 100%", async function () {
      await expect(riskParams.setMaintenanceRatio(ethers.parseEther("0.99"))).to.be.revertedWith("Ratio must be >= 100%");
    });

    it("Should revert maintenance ratio > min collateral ratio", async function () {
      // Default minCollateralRatio is 1e18 (100%)
      await expect(riskParams.setMaintenanceRatio(ethers.parseEther("1.5"))).to.be.revertedWith("Must be <= min collateral ratio");
    });

    it("Should prevent non-owner from calling all setters", async function () {
      const s = shortSeller;
      await expect(riskParams.connect(s).setMinCollateralRatio(ethers.parseEther("1"))).to.be.revertedWithCustomError(riskParams, "OwnableUnauthorizedAccount");
      await expect(riskParams.connect(s).setLiquidationBonus(0)).to.be.revertedWithCustomError(riskParams, "OwnableUnauthorizedAccount");
      await expect(riskParams.connect(s).setBaseImpliedVolatility(ethers.parseEther("1"))).to.be.revertedWithCustomError(riskParams, "OwnableUnauthorizedAccount");
      await expect(riskParams.connect(s).setMaxFundingRatePerSecond(0)).to.be.revertedWithCustomError(riskParams, "OwnableUnauthorizedAccount");
      await expect(riskParams.connect(s).setOracleStalenessThreshold(60)).to.be.revertedWithCustomError(riskParams, "OwnableUnauthorizedAccount");
      await expect(riskParams.connect(s).setMinPositionSize(1)).to.be.revertedWithCustomError(riskParams, "OwnableUnauthorizedAccount");
      await expect(riskParams.connect(s).setPaused(true)).to.be.revertedWithCustomError(riskParams, "OwnableUnauthorizedAccount");
    });
  });

  // ============================================================
  // CollateralVault - Direct Tests
  // ============================================================
  describe("CollateralVault - Direct Tests", function () {
    let testVault;

    beforeEach(async function () {
      const CollateralVault = await ethers.getContractFactory("CollateralVault");
      testVault = await CollateralVault.deploy(await usdc.getAddress(), "Test USDC Vault", "tUSDC");
      // Set deployer as option manager for direct testing
      await testVault.setOptionManager(deployer.address);

      await usdc.mint(deployer.address, toUSDC(50000));
      await usdc.connect(deployer).approve(await testVault.getAddress(), ethers.MaxUint256);
      await usdc.mint(shortSeller.address, toUSDC(50000));
      await usdc.connect(shortSeller).approve(await testVault.getAddress(), ethers.MaxUint256);
    });

    it("Should revert setOptionManager with zero address", async function () {
      await expect(testVault.setOptionManager(ethers.ZeroAddress)).to.be.revertedWith("Invalid address");
    });

    it("Should revert setOptionManager from non-owner", async function () {
      await expect(testVault.connect(shortSeller).setOptionManager(deployer.address)).to.be.revertedWithCustomError(testVault, "OwnableUnauthorizedAccount");
    });

    it("Should reserve and query collateral", async function () {
      // Deposit to vault
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);

      // Reserve collateral
      await testVault.reserveCollateral(shortSeller.address, toUSDC(2000), 1);

      expect(await testVault.getReservedCollateral(1)).to.equal(toUSDC(2000));
      expect(await testVault.getTotalReservedFor(shortSeller.address)).to.equal(toUSDC(2000));

      const positions = await testVault.getOwnerPositions(shortSeller.address);
      expect(positions.length).to.equal(1);
      expect(positions[0]).to.equal(1);

      expect(await testVault.getPositionOwner(1)).to.equal(shortSeller.address);
    });

    it("Should revert reserveCollateral with zero amount", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await expect(testVault.reserveCollateral(shortSeller.address, 0, 1)).to.be.revertedWithCustomError(testVault, "ZeroAmount");
    });

    it("Should revert reserveCollateral with insufficient balance", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(1000), shortSeller.address);
      await expect(testVault.reserveCollateral(shortSeller.address, toUSDC(2000), 1)).to.be.revertedWithCustomError(testVault, "InsufficientAvailableBalance");
    });

    it("Should release collateral", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(2000), 1);

      await testVault.releaseCollateral(shortSeller.address, toUSDC(1000), 1);
      expect(await testVault.getReservedCollateral(1)).to.equal(toUSDC(1000));
      expect(await testVault.getTotalReservedFor(shortSeller.address)).to.equal(toUSDC(1000));
    });

    it("Should revert releaseCollateral with zero amount", async function () {
      await expect(testVault.releaseCollateral(shortSeller.address, 0, 1)).to.be.revertedWithCustomError(testVault, "ZeroAmount");
    });

    it("Should revert releaseCollateral with insufficient reserved", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(1000), 1);
      await expect(testVault.releaseCollateral(shortSeller.address, toUSDC(2000), 1)).to.be.revertedWithCustomError(testVault, "InsufficientReservedCollateral");
    });

    it("Should revert releaseCollateral with wrong owner", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(1000), 1);
      // longBuyer is not the owner of position 1
      await expect(testVault.releaseCollateral(longBuyer.address, toUSDC(500), 1)).to.be.revertedWithCustomError(testVault, "PositionNotFound");
    });

    it("Should withdrawCollateralTo", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(2000), 1);

      const balBefore = await usdc.balanceOf(longBuyer.address);
      await testVault.withdrawCollateralTo(1, longBuyer.address, toUSDC(1000));
      const balAfter = await usdc.balanceOf(longBuyer.address);
      expect(balAfter - balBefore).to.equal(toUSDC(1000));
    });

    it("Should revert withdrawCollateralTo with zero amount", async function () {
      await expect(testVault.withdrawCollateralTo(1, longBuyer.address, 0)).to.be.revertedWithCustomError(testVault, "ZeroAmount");
    });

    it("Should revert withdrawCollateralTo with insufficient reserved", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(1000), 1);
      await expect(testVault.withdrawCollateralTo(1, longBuyer.address, toUSDC(2000))).to.be.revertedWithCustomError(testVault, "InsufficientReservedCollateral");
    });

    it("Should revert when non-manager calls restricted functions", async function () {
      await expect(testVault.connect(shortSeller).reserveCollateral(shortSeller.address, toUSDC(100), 1)).to.be.revertedWithCustomError(testVault, "OnlyOptionManager");
      await expect(testVault.connect(shortSeller).releaseCollateral(shortSeller.address, toUSDC(100), 1)).to.be.revertedWithCustomError(testVault, "OnlyOptionManager");
      await expect(testVault.connect(shortSeller).withdrawCollateralTo(1, longBuyer.address, toUSDC(100))).to.be.revertedWithCustomError(testVault, "OnlyOptionManager");
      await expect(testVault.connect(shortSeller).clearPosition(1)).to.be.revertedWithCustomError(testVault, "OnlyOptionManager");
    });

    it("Should clear position data", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(2000), 1);
      // Release all collateral first
      await testVault.releaseCollateral(shortSeller.address, toUSDC(2000), 1);
      // Clear position
      await testVault.clearPosition(1);
      expect(await testVault.getPositionOwner(1)).to.equal(ethers.ZeroAddress);
      const positions = await testVault.getOwnerPositions(shortSeller.address);
      expect(positions.length).to.equal(0);
    });

    it("Should revert clearPosition if collateral not released", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(2000), 1);
      await expect(testVault.clearPosition(1)).to.be.revertedWith("Collateral not released");
    });

    it("Should prevent withdrawal of reserved collateral", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(3000), 1);
      // Available = 5000 - 3000 = 2000
      await expect(
        testVault.connect(shortSeller).withdraw(toUSDC(2500), shortSeller.address, shortSeller.address)
      ).to.be.revertedWith("Cannot withdraw reserved collateral");
    });

    it("Should allow withdrawal of unreserved collateral", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(3000), 1);
      // Available = 2000
      await expect(
        testVault.connect(shortSeller).withdraw(toUSDC(1000), shortSeller.address, shortSeller.address)
      ).to.not.be.reverted;
    });

    it("Should prevent redemption of reserved shares", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(3000), 1);
      // Try to redeem all shares
      const shares = await testVault.balanceOf(shortSeller.address);
      await expect(
        testVault.connect(shortSeller).redeem(shares, shortSeller.address, shortSeller.address)
      ).to.be.revertedWith("Cannot redeem reserved collateral");
    });

    it("Should allow redemption of unreserved shares", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(3000), 1);
      // Redeem a small amount
      const redeemShares = await testVault.convertToShares(toUSDC(1000));
      await expect(
        testVault.connect(shortSeller).redeem(redeemShares, shortSeller.address, shortSeller.address)
      ).to.not.be.reverted;
    });

    it("Should return 0 available balance when all reserved", async function () {
      await testVault.connect(shortSeller).deposit(toUSDC(5000), shortSeller.address);
      await testVault.reserveCollateral(shortSeller.address, toUSDC(5000), 1);
      expect(await testVault.getAvailableBalance(shortSeller.address)).to.equal(0);
    });
  });

  // ============================================================
  // FundingOracle - Extended Coverage
  // ============================================================
  describe("FundingOracle - Extended", function () {
    it("Should set risk params", async function () {
      const RiskParams = await ethers.getContractFactory("RiskParams");
      const newRiskParams = await RiskParams.deploy();
      await fundingOracle.setRiskParams(await newRiskParams.getAddress());
      expect(await fundingOracle.riskParams()).to.equal(await newRiskParams.getAddress());
    });

    it("Should revert setRiskParams with zero address", async function () {
      await expect(fundingOracle.setRiskParams(ethers.ZeroAddress)).to.be.revertedWith("Invalid address");
    });

    it("Should revert FundingOracle constructor with zero riskParams", async function () {
      const FO = await ethers.getContractFactory("FundingOracle");
      await expect(FO.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid risk params");
    });

    it("Should set custom IV", async function () {
      await fundingOracle.setCustomIV(await weth.getAddress(), ethers.parseEther("1.2"));
      expect(await fundingOracle.customIV(await weth.getAddress())).to.equal(ethers.parseEther("1.2"));
    });

    it("Should use custom IV when set", async function () {
      await fundingOracle.setCustomIV(await weth.getAddress(), ethers.parseEther("1.5"));
      expect(await fundingOracle.getImpliedVolatility(await weth.getAddress())).to.equal(ethers.parseEther("1.5"));
    });

    it("Should use base IV when no custom IV", async function () {
      expect(await fundingOracle.getImpliedVolatility(await weth.getAddress())).to.equal(ethers.parseEther("0.8"));
    });

    it("Should revert setCustomIV too low", async function () {
      await expect(fundingOracle.setCustomIV(await weth.getAddress(), ethers.parseEther("0.005"))).to.be.revertedWith("IV out of range");
    });

    it("Should revert setCustomIV too high", async function () {
      await expect(fundingOracle.setCustomIV(await weth.getAddress(), ethers.parseEther("10.1"))).to.be.revertedWith("IV out of range");
    });

    it("Should revert setPriceFeed with zero underlying", async function () {
      await expect(fundingOracle.setPriceFeed(ethers.ZeroAddress, await priceFeed.getAddress())).to.be.revertedWith("Invalid underlying");
    });

    it("Should revert setPriceFeed with zero price feed", async function () {
      await expect(fundingOracle.setPriceFeed(await weth.getAddress(), ethers.ZeroAddress)).to.be.revertedWith("Invalid price feed");
    });

    it("Should prevent non-owner from calling FundingOracle admin functions", async function () {
      const s = shortSeller;
      await expect(fundingOracle.connect(s).setRiskParams(deployer.address)).to.be.revertedWithCustomError(fundingOracle, "OwnableUnauthorizedAccount");
      await expect(fundingOracle.connect(s).setPriceFeed(deployer.address, deployer.address)).to.be.revertedWithCustomError(fundingOracle, "OwnableUnauthorizedAccount");
      await expect(fundingOracle.connect(s).setCustomIV(deployer.address, ethers.parseEther("1"))).to.be.revertedWithCustomError(fundingOracle, "OwnableUnauthorizedAccount");
    });

    it("Should revert getSpotPrice with no price feed", async function () {
      await expect(fundingOracle.getSpotPrice(deployer.address)).to.be.revertedWithCustomError(fundingOracle, "PriceFeedNotSet");
    });

    it("Should revert getSpotPrice with stale timestamp", async function () {
      // Advance time beyond staleness threshold (3600s)
      await time.increase(3601);
      await expect(fundingOracle.getSpotPrice(await weth.getAddress())).to.be.revertedWithCustomError(fundingOracle, "StalePrice");
    });

    it("Should revert getSpotPrice with stale round", async function () {
      // Set answeredInRound < roundId
      await priceFeed.setPrice(toPrice(2500)); // roundId becomes 2, answeredInRound = 2
      await priceFeed.setAnsweredInRound(1); // answeredInRound = 1 < roundId = 2
      await expect(fundingOracle.getSpotPrice(await weth.getAddress())).to.be.revertedWithCustomError(fundingOracle, "StalePrice");
    });

    it("Should revert getSpotPrice with zero price", async function () {
      await priceFeed.setPrice(0);
      await expect(fundingOracle.getSpotPrice(await weth.getAddress())).to.be.revertedWithCustomError(fundingOracle, "InvalidPrice");
    });

    it("Should revert getSpotPrice with negative price", async function () {
      await priceFeed.setPrice(-100);
      await expect(fundingOracle.getSpotPrice(await weth.getAddress())).to.be.revertedWithCustomError(fundingOracle, "InvalidPrice");
    });

    it("Should return zero intrinsic for OTM put", async function () {
      // Strike $2000 with spot $2500 → OTM put
      const intrinsic = await fundingOracle.getIntrinsicValue(1, await weth.getAddress(), toUSDC(2000));
      expect(intrinsic).to.equal(0);
    });

    it("Should calculate funding per second", async function () {
      const fps = await fundingOracle.getFundingPerSecond(0, await weth.getAddress(), toUSDC(2500), toWETH(1));
      expect(fps).to.be.gt(0);
    });

    it("Should cap funding rate", async function () {
      // Set very low max funding rate
      await riskParams.setMaxFundingRatePerSecond(1);
      const fps = await fundingOracle.getFundingPerSecond(0, await weth.getAddress(), toUSDC(2500), toWETH(1));
      // Should be capped
      expect(fps).to.be.lte(1);
    });

    it("Should report oracle as fresh", async function () {
      expect(await fundingOracle.isOracleFresh(await weth.getAddress())).to.equal(true);
    });

    it("Should report oracle as not fresh when no feed", async function () {
      expect(await fundingOracle.isOracleFresh(deployer.address)).to.equal(false);
    });

    it("Should report oracle as not fresh when stale", async function () {
      await time.increase(3601);
      expect(await fundingOracle.isOracleFresh(await weth.getAddress())).to.equal(false);
    });

    it("Should report oracle as not fresh when stale round", async function () {
      await priceFeed.setPrice(toPrice(2500));
      await priceFeed.setAnsweredInRound(1); // answeredInRound < roundId
      expect(await fundingOracle.isOracleFresh(await weth.getAddress())).to.equal(false);
    });

    it("Should report oracle as not fresh when invalid price", async function () {
      await priceFeed.setPrice(0);
      expect(await fundingOracle.isOracleFresh(await weth.getAddress())).to.equal(false);
    });

    it("Should report oracle as not fresh when feed reverts", async function () {
      // Set feed to a contract that doesn't implement latestRoundData
      await fundingOracle.setPriceFeed(deployer.address, await usdc.getAddress());
      expect(await fundingOracle.isOracleFresh(deployer.address)).to.equal(false);
    });

    it("Should return spot price in USDC decimals", async function () {
      const spotUSDC = await fundingOracle.getSpotPriceUSDC(await weth.getAddress());
      expect(spotUSDC).to.equal(toUSDC(2500));
    });

    it("Should handle deep ITM time value (deviation >= 2*SCALE)", async function () {
      // spot=$8000, strike=$2500 → moneyness=3.2 → deviation=2.2 >= 2.0
      await priceFeed.setPrice(toPrice(8000));
      const markPrice = await fundingOracle.getMarkPrice(0, await weth.getAddress(), toUSDC(2500));
      expect(markPrice).to.be.gt(0);
    });

    it("Should handle near-extreme moneyness (factor < SCALE/10)", async function () {
      // spot=$7100, strike=$2500 → moneyness=2.84 → deviation=1.84 → factor<0.1
      await priceFeed.setPrice(toPrice(7100));
      const markPrice = await fundingOracle.getMarkPrice(0, await weth.getAddress(), toUSDC(2500));
      expect(markPrice).to.be.gt(0);
    });
  });

  // ============================================================
  // OptionManager - Extended Coverage
  // ============================================================
  describe("OptionManager - Extended", function () {
    it("Should revert constructor with zero addresses", async function () {
      const OM = await ethers.getContractFactory("OptionManager");
      const valid = [
        await optionNFT.getAddress(),
        await usdcVault.getAddress(),
        await wethVault.getAddress(),
        await fundingOracle.getAddress(),
        await riskParams.getAddress(),
        await usdc.getAddress(),
        await weth.getAddress()
      ];
      const errors = [
        "Invalid NFT", "Invalid USDC vault", "Invalid WETH vault",
        "Invalid oracle", "Invalid risk params", "Invalid USDC", "Invalid WETH"
      ];

      for (let i = 0; i < valid.length; i++) {
        const args = [...valid];
        args[i] = ethers.ZeroAddress;
        await expect(OM.deploy(...args)).to.be.revertedWith(errors[i]);
      }
    });

    it("Should revert openPosition with zero strike", async function () {
      await expect(
        optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), 0, toWETH(1), longBuyer.address, toUSDC(100))
      ).to.be.revertedWithCustomError(optionManager, "InvalidStrike");
    });

    it("Should revert openPosition with size below minimum", async function () {
      await expect(
        optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH("0.001"), longBuyer.address, toUSDC(100))
      ).to.be.revertedWithCustomError(optionManager, "InvalidSize");
    });

    it("Should open position with zero initial funding", async function () {
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, 0);
      const position = await optionManager.getPosition(1);
      expect(position.longFundingBalance).to.equal(0);
    });

    it("Should revert exercise if not active", async function () {
      // Create and close a position via funding depletion
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(1));

      await time.increase(86400 * 30);
      await priceFeed.setPrice(toPrice(2500));
      await optionManager.accrueFunding(1);
      // Now position is CLOSED
      await expect(optionManager.connect(longBuyer).exercise(1)).to.be.revertedWithCustomError(optionManager, "PositionNotActive");
    });

    it("Should revert exercise if not long owner", async function () {
      await priceFeed.setPrice(toPrice(3000));
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
      // shortSeller is not the long owner
      await expect(optionManager.connect(shortSeller).exercise(1)).to.be.revertedWithCustomError(optionManager, "NotLongOwner");
    });

    it("Should revert depositFunding with zero amount", async function () {
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
      await expect(optionManager.connect(longBuyer).depositFunding(1, 0)).to.be.revertedWithCustomError(optionManager, "ZeroAmount");
    });

    it("Should revert depositFunding if not long owner", async function () {
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
      await expect(optionManager.connect(shortSeller).depositFunding(1, toUSDC(100))).to.be.revertedWithCustomError(optionManager, "NotLongOwner");
    });

    it("Should revert depositFunding if not active", async function () {
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(1));
      await time.increase(86400 * 30);
      await priceFeed.setPrice(toPrice(2500));
      await optionManager.accrueFunding(1);
      await expect(optionManager.connect(longBuyer).depositFunding(1, toUSDC(100))).to.be.revertedWithCustomError(optionManager, "PositionNotActive");
    });

    it("Should revert accrueFunding if not active", async function () {
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(1));
      await time.increase(86400 * 30);
      await priceFeed.setPrice(toPrice(2500));
      await optionManager.accrueFunding(1);
      // Position is now closed
      await expect(optionManager.accrueFunding(1)).to.be.revertedWithCustomError(optionManager, "PositionNotActive");
    });

    it("Should close position with zero funding balance", async function () {
      // Open position with 0 funding
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, 0);

      await time.increase(1);
      await priceFeed.setPrice(toPrice(2500));
      await optionManager.accrueFunding(1);
      const position = await optionManager.getPosition(1);
      expect(position.status).to.equal(3); // CLOSED
    });

    it("Should close put position when funding depleted", async function () {
      const strike = toUSDC(2500);
      const size = toWETH(1);
      await usdc.connect(shortSeller).approve(await optionManager.getAddress(), strike);
      await optionManager.connect(shortSeller).openPosition(1, await weth.getAddress(), strike, size, longBuyer.address, toUSDC(1));

      await time.increase(86400 * 30);
      await priceFeed.setPrice(toPrice(2500));
      await optionManager.accrueFunding(1);
      const position = await optionManager.getPosition(1);
      expect(position.status).to.equal(3); // CLOSED
    });

    describe("Release Collateral", function () {
      it("Should allow short to release collateral from OTM call", async function () {
        // Open call at $2500, spot at $2500 (ATM, intrinsic=0, so all collateral excess)
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        // OTM call: intrinsic = 0, minRequired = 0
        await optionManager.connect(shortSeller).releaseCollateral(1, toWETH("0.5"));
        const position = await optionManager.getPosition(1);
        expect(position.collateralAmount).to.equal(toWETH("0.5"));
      });

      it("Should allow short to release collateral from OTM put", async function () {
        // Open put at $2500, spot at $2500 (ATM, intrinsic=0)
        await usdc.connect(shortSeller).approve(await optionManager.getAddress(), toUSDC(2500));
        await optionManager.connect(shortSeller).openPosition(1, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        await optionManager.connect(shortSeller).releaseCollateral(1, toUSDC(1000));
        const position = await optionManager.getPosition(1);
        expect(position.collateralAmount).to.equal(toUSDC(1500));
      });

      it("Should revert releaseCollateral with zero amount", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        await expect(optionManager.connect(shortSeller).releaseCollateral(1, 0)).to.be.revertedWithCustomError(optionManager, "ZeroAmount");
      });

      it("Should revert releaseCollateral if not short owner", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        await expect(optionManager.connect(longBuyer).releaseCollateral(1, toWETH("0.1"))).to.be.revertedWithCustomError(optionManager, "NotShortOwner");
      });

      it("Should revert releaseCollateral with insufficient remaining", async function () {
        // Open ITM call: spot=$3000, strike=$2500
        await priceFeed.setPrice(toPrice(3000));
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        // Intrinsic = $500, minRequired is > 0, so can't release all
        await expect(optionManager.connect(shortSeller).releaseCollateral(1, toWETH(1))).to.be.revertedWithCustomError(optionManager, "InsufficientCollateral");
      });

      it("Should revert releaseCollateral if not active", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(1));
        await time.increase(86400 * 30);
        await priceFeed.setPrice(toPrice(2500));
        await optionManager.accrueFunding(1);
        await expect(optionManager.connect(shortSeller).releaseCollateral(1, toWETH("0.1"))).to.be.revertedWithCustomError(optionManager, "PositionNotActive");
      });
    });

    describe("Collateral Ratio", function () {
      it("Should return max uint for OTM position", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        // ATM/OTM: intrinsic = 0
        const ratio = await optionManager.getCollateralRatio(1);
        expect(ratio).to.equal(ethers.MaxUint256);
      });

      it("Should return correct ratio for ITM call", async function () {
        await priceFeed.setPrice(toPrice(3000));
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        const ratio = await optionManager.getCollateralRatio(1);
        expect(ratio).to.be.gt(0);
        expect(ratio).to.be.lt(ethers.MaxUint256);
      });

      it("Should return correct ratio for ITM put", async function () {
        await priceFeed.setPrice(toPrice(2000));
        await usdc.connect(shortSeller).approve(await optionManager.getAddress(), toUSDC(2500));
        await optionManager.connect(shortSeller).openPosition(1, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        const ratio = await optionManager.getCollateralRatio(1);
        expect(ratio).to.be.gt(0);
        expect(ratio).to.be.lt(ethers.MaxUint256);
      });
    });

    describe("Short Positions and Pending Funding", function () {
      it("Should return short positions", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(2));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        const shorts = await optionManager.getShortPositions(shortSeller.address);
        expect(shorts.length).to.equal(2);
      });

      it("Should return pending funding for active position", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        await time.increase(86400);
        await priceFeed.setPrice(toPrice(2500));
        const pending = await optionManager.getPendingFunding(1);
        expect(pending).to.be.gt(0);
      });

      it("Should return 0 pending funding for inactive position", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(1));
        await time.increase(86400 * 30);
        await priceFeed.setPrice(toPrice(2500));
        await optionManager.accrueFunding(1);
        const pending = await optionManager.getPendingFunding(1);
        expect(pending).to.equal(0);
      });

      it("Should return 0 pending funding when no time elapsed", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        // No time advance - same block
        const pending = await optionManager.getPendingFunding(1);
        expect(pending).to.equal(0);
      });
    });

    describe("Liquidation - Call Option", function () {
      it("Should liquidate undercollateralized call position", async function () {
        // Open call at strike=$2500
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));

        // Push price to $20000 (makes call deeply ITM, undercollateralized)
        await priceFeed.setPrice(toPrice(20000));

        expect(await optionManager.isLiquidatable(1)).to.equal(true);

        await optionManager.connect(liquidator).liquidate(1);
        const position = await optionManager.getPosition(1);
        expect(position.status).to.equal(2); // LIQUIDATED
      });
    });

    describe("Liquidation edge cases", function () {
      it("Should return false for isLiquidatable on inactive position", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(1));
        await time.increase(86400 * 30);
        await priceFeed.setPrice(toPrice(2500));
        await optionManager.accrueFunding(1);
        expect(await optionManager.isLiquidatable(1)).to.equal(false);
      });

      it("Should revert liquidate if not active", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(1));
        await time.increase(86400 * 30);
        await priceFeed.setPrice(toPrice(2500));
        await optionManager.accrueFunding(1);
        await expect(optionManager.connect(liquidator).liquidate(1)).to.be.revertedWithCustomError(optionManager, "PositionNotActive");
      });

      it("Should revert exercise when paused", async function () {
        await priceFeed.setPrice(toPrice(3000));
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        await riskParams.setPaused(true);
        await expect(optionManager.connect(longBuyer).exercise(1)).to.be.revertedWithCustomError(optionManager, "ProtocolPaused");
      });

      it("Should revert liquidate when paused", async function () {
        await usdc.connect(shortSeller).approve(await optionManager.getAddress(), toUSDC(2500));
        await optionManager.connect(shortSeller).openPosition(1, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        await priceFeed.setPrice(toPrice(100));
        await riskParams.setPaused(true);
        await expect(optionManager.connect(liquidator).liquidate(1)).to.be.revertedWithCustomError(optionManager, "ProtocolPaused");
      });

      it("Should revert depositFunding when paused", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        await riskParams.setPaused(true);
        await expect(optionManager.connect(longBuyer).depositFunding(1, toUSDC(100))).to.be.revertedWithCustomError(optionManager, "ProtocolPaused");
      });

      it("Should revert releaseCollateral when paused", async function () {
        await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
        await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
        await riskParams.setPaused(true);
        await expect(optionManager.connect(shortSeller).releaseCollateral(1, toWETH("0.1"))).to.be.revertedWithCustomError(optionManager, "ProtocolPaused");
      });

      it("Should liquidate put with partial payout to long", async function () {
        // Open put at $2500
        await usdc.connect(shortSeller).approve(await optionManager.getAddress(), toUSDC(2500));
        await optionManager.connect(shortSeller).openPosition(1, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));

        // Price drops to $100, making put deeply ITM (intrinsic = $2400)
        // Required maintenance = $2400 * 1.2 = $2880 > $2500 collateral
        await priceFeed.setPrice(toPrice(100));

        expect(await optionManager.isLiquidatable(1)).to.equal(true);
        await optionManager.connect(liquidator).liquidate(1);
        const position = await optionManager.getPosition(1);
        expect(position.status).to.equal(2); // LIQUIDATED
      });
    });
  });

  // ============================================================
  // PerpetualOptionNFT - Extended Coverage
  // ============================================================
  describe("PerpetualOptionNFT - Extended", function () {
    it("Should return correct nextTokenId", async function () {
      expect(await optionNFT.nextTokenId()).to.equal(1);
    });

    it("Should check token existence", async function () {
      expect(await optionNFT.exists(999)).to.equal(false);
      // Mint one
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));
      expect(await optionNFT.exists(1)).to.equal(true);
    });

    it("Should revert mint from non-manager", async function () {
      await expect(optionNFT.connect(shortSeller).mint(shortSeller.address, 1)).to.be.revertedWithCustomError(optionNFT, "OnlyOptionManager");
    });

    it("Should revert burn from non-manager", async function () {
      await expect(optionNFT.connect(shortSeller).burn(1)).to.be.revertedWithCustomError(optionNFT, "OnlyOptionManager");
    });

    it("Should revert incrementTokenId from non-manager", async function () {
      await expect(optionNFT.connect(shortSeller).incrementTokenId()).to.be.revertedWithCustomError(optionNFT, "OnlyOptionManager");
    });

    it("Should revert tokenURI for non-existent token", async function () {
      await expect(optionNFT.tokenURI(999)).to.be.revertedWithCustomError(optionNFT, "TokenDoesNotExist");
    });

    it("Should revert setOptionManager with zero address", async function () {
      await expect(optionNFT.setOptionManager(ethers.ZeroAddress)).to.be.revertedWith("Invalid address");
    });

    it("Should prevent non-owner from calling NFT admin functions", async function () {
      const s = shortSeller;
      await expect(optionNFT.connect(s).setOptionManager(deployer.address)).to.be.revertedWithCustomError(optionNFT, "OwnableUnauthorizedAccount");
      await expect(optionNFT.connect(s).setBaseURI("https://test.com/")).to.be.revertedWithCustomError(optionNFT, "OwnableUnauthorizedAccount");
    });

    it("Should set and use base URI", async function () {
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));

      await optionNFT.setBaseURI("https://example.com/token/");
      const uri = await optionNFT.tokenURI(1);
      expect(uri).to.equal("https://example.com/token/1");
    });

    it("Should handle getPosition failure gracefully in tokenURI", async function () {
      // Open position to mint NFT
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), toWETH(1));
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), toWETH(1), longBuyer.address, toUSDC(100));

      // Change optionManager to a contract that doesn't implement getPosition
      await optionNFT.setOptionManager(await usdc.getAddress());

      // tokenURI should still work with default values
      const uri = await optionNFT.tokenURI(1);
      expect(uri).to.include("data:application/json;base64,");
    });

    it("Should format fractional size in metadata", async function () {
      // Open position with fractional size (0.5 ETH)
      const size = ethers.parseUnits("0.5", 18);
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);
      await optionManager.connect(shortSeller).openPosition(0, await weth.getAddress(), toUSDC(2500), size, longBuyer.address, toUSDC(100));

      const uri = await optionNFT.tokenURI(1);
      expect(uri).to.include("data:application/json;base64,");
      // Decode and check it contains the decimal formatted size
      const json = Buffer.from(uri.split("base64,")[1], "base64").toString();
      expect(json).to.include("0.50");
    });

    it("Should support ERC721 and ERC721Enumerable interfaces", async function () {
      // ERC721: 0x80ac58cd
      expect(await optionNFT.supportsInterface("0x80ac58cd")).to.equal(true);
      // ERC721Enumerable: 0x780e9d63
      expect(await optionNFT.supportsInterface("0x780e9d63")).to.equal(true);
      // Random interface: should be false
      expect(await optionNFT.supportsInterface("0xffffffff")).to.equal(false);
    });
  });

  // ============================================================
  // PerpetualOptionNFT - Status and Type Branches via MockOptionManager
  // ============================================================
  describe("PerpetualOptionNFT - Status Branches", function () {
    let mockOM;
    let testNFT;

    beforeEach(async function () {
      const MockOptionManager = await ethers.getContractFactory("MockOptionManager");
      mockOM = await MockOptionManager.deploy();

      const PerpetualOptionNFT = await ethers.getContractFactory("PerpetualOptionNFT");
      testNFT = await PerpetualOptionNFT.deploy("Test Options", "T-OPT");
      await testNFT.setOptionManager(await mockOM.getAddress());

      // Mint a token via the mock option manager
      // We need the mock to be the option manager to call mint
      // So we use the deployer as a proxy - set deployer as manager, mint, then switch to mock
      await testNFT.setOptionManager(deployer.address);
      await testNFT.mint(longBuyer.address, 1);
      await testNFT.mint(longBuyer.address, 2);
      await testNFT.mint(longBuyer.address, 3);
      await testNFT.mint(longBuyer.address, 4);
      await testNFT.mint(longBuyer.address, 5);
      await testNFT.setOptionManager(await mockOM.getAddress());
    });

    it("Should display ACTIVE status", async function () {
      await mockOM.setPosition(0, toUSDC(2500), toWETH(1), 0); // ACTIVE
      const uri = await testNFT.tokenURI(1);
      const json = Buffer.from(uri.split("base64,")[1], "base64").toString();
      expect(json).to.include('"Active"');
    });

    it("Should display EXERCISED status", async function () {
      await mockOM.setPosition(0, toUSDC(2500), toWETH(1), 1); // EXERCISED
      const uri = await testNFT.tokenURI(2);
      const json = Buffer.from(uri.split("base64,")[1], "base64").toString();
      expect(json).to.include('"Exercised"');
    });

    it("Should display LIQUIDATED status", async function () {
      await mockOM.setPosition(0, toUSDC(2500), toWETH(1), 2); // LIQUIDATED
      const uri = await testNFT.tokenURI(3);
      const json = Buffer.from(uri.split("base64,")[1], "base64").toString();
      expect(json).to.include('"Liquidated"');
    });

    it("Should display CLOSED status", async function () {
      await mockOM.setPosition(0, toUSDC(2500), toWETH(1), 3); // CLOSED
      const uri = await testNFT.tokenURI(4);
      const json = Buffer.from(uri.split("base64,")[1], "base64").toString();
      expect(json).to.include('"Closed"');
    });

    it("Should display Put option type and red color", async function () {
      await mockOM.setPosition(1, toUSDC(2500), toWETH(1), 0); // PUT, ACTIVE
      const uri = await testNFT.tokenURI(5);
      const json = Buffer.from(uri.split("base64,")[1], "base64").toString();
      expect(json).to.include('"Put"');
      // Check SVG has red color
      const svgBase64 = json.match(/"image": "data:image\/svg\+xml;base64,([^"]+)"/)[1];
      const svg = Buffer.from(svgBase64, "base64").toString();
      expect(svg).to.include("#EF4444");
    });

    it("Should display Call option type and green color", async function () {
      await mockOM.setPosition(0, toUSDC(2500), toWETH(1), 0); // CALL, ACTIVE
      const uri = await testNFT.tokenURI(1);
      const json = Buffer.from(uri.split("base64,")[1], "base64").toString();
      expect(json).to.include('"Call"');
      const svgBase64 = json.match(/"image": "data:image\/svg\+xml;base64,([^"]+)"/)[1];
      const svg = Buffer.from(svgBase64, "base64").toString();
      expect(svg).to.include("#10B981");
    });

    it("Should display whole number size without decimals", async function () {
      await mockOM.setPosition(0, toUSDC(2500), toWETH(2), 0); // size=2 ETH
      const uri = await testNFT.tokenURI(1);
      const json = Buffer.from(uri.split("base64,")[1], "base64").toString();
      expect(json).to.include('"Size", "value": "2"');
    });
  });

  // ============================================================
  // Mock Contracts - Coverage
  // ============================================================
  describe("Mock Contracts", function () {
    it("MockERC20 - should burn tokens", async function () {
      await usdc.mint(deployer.address, toUSDC(1000));
      await usdc.burn(deployer.address, toUSDC(500));
      expect(await usdc.balanceOf(deployer.address)).to.equal(toUSDC(500));
    });

    it("MockERC20 - should return correct decimals", async function () {
      expect(await usdc.decimals()).to.equal(USDC_DECIMALS);
      expect(await weth.decimals()).to.equal(WETH_DECIMALS);
    });

    it("MockPriceFeed - should return decimals", async function () {
      expect(await priceFeed.decimals()).to.equal(PRICE_DECIMALS);
    });

    it("MockPriceFeed - should return description", async function () {
      expect(await priceFeed.description()).to.equal("ETH / USD");
    });

    it("MockPriceFeed - should return version", async function () {
      expect(await priceFeed.version()).to.equal(1);
    });

    it("MockPriceFeed - should return round data", async function () {
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await priceFeed.getRoundData(1);
      expect(roundId).to.equal(1);
      expect(answer).to.equal(toPrice(2500));
    });

    it("MockPriceFeed - should set updated at", async function () {
      await priceFeed.setUpdatedAt(12345);
      const [, , , updatedAt] = await priceFeed.latestRoundData();
      expect(updatedAt).to.equal(12345);
    });

    it("MockPriceFeed - should return current price", async function () {
      expect(await priceFeed.getPrice()).to.equal(toPrice(2500));
    });

    it("MockPriceFeed - should set answered in round", async function () {
      await priceFeed.setPrice(toPrice(3000)); // roundId=2, answeredInRound=2
      await priceFeed.setAnsweredInRound(1);
      const [roundId, , , , answeredInRound] = await priceFeed.latestRoundData();
      expect(roundId).to.equal(2);
      expect(answeredInRound).to.equal(1);
    });
  });
});
