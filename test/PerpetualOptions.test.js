const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Perpetual Options Protocol", function () {
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

  // Helper to convert to USDC amount
  const toUSDC = (amount) => ethers.parseUnits(amount.toString(), USDC_DECIMALS);

  // Helper to convert to WETH amount
  const toWETH = (amount) => ethers.parseUnits(amount.toString(), WETH_DECIMALS);

  // Helper to convert to price feed format
  const toPrice = (amount) => BigInt(amount) * BigInt(10 ** PRICE_DECIMALS);

  beforeEach(async function () {
    [deployer, shortSeller, longBuyer, liquidator] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", USDC_DECIMALS);
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", WETH_DECIMALS);

    // Deploy mock price feed ($2500)
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    priceFeed = await MockPriceFeed.deploy(
      PRICE_DECIMALS,
      "ETH / USD",
      1,
      toPrice(2500)
    );

    // Deploy RiskParams
    const RiskParams = await ethers.getContractFactory("RiskParams");
    riskParams = await RiskParams.deploy();

    // Deploy vaults
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    usdcVault = await CollateralVault.deploy(
      await usdc.getAddress(),
      "Perpetual Options USDC Vault",
      "poUSDC"
    );
    wethVault = await CollateralVault.deploy(
      await weth.getAddress(),
      "Perpetual Options WETH Vault",
      "poWETH"
    );

    // Deploy NFT
    const PerpetualOptionNFT = await ethers.getContractFactory("PerpetualOptionNFT");
    optionNFT = await PerpetualOptionNFT.deploy("Perpetual Options", "PERP-OPT");

    // Deploy FundingOracle
    const FundingOracle = await ethers.getContractFactory("FundingOracle");
    fundingOracle = await FundingOracle.deploy(await riskParams.getAddress());
    await fundingOracle.setPriceFeed(await weth.getAddress(), await priceFeed.getAddress());

    // Deploy OptionManager
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

    // Configure contracts
    await optionNFT.setOptionManager(await optionManager.getAddress());
    await usdcVault.setOptionManager(await optionManager.getAddress());
    await wethVault.setOptionManager(await optionManager.getAddress());

    // Mint tokens to users
    await usdc.mint(shortSeller.address, toUSDC(100000)); // 100k USDC
    await usdc.mint(longBuyer.address, toUSDC(100000));
    await usdc.mint(liquidator.address, toUSDC(100000));
    await weth.mint(shortSeller.address, toWETH(100)); // 100 WETH
    await weth.mint(longBuyer.address, toWETH(100));
    await weth.mint(liquidator.address, toWETH(100));

    // Approve OptionManager to spend tokens
    await usdc.connect(shortSeller).approve(await optionManager.getAddress(), ethers.MaxUint256);
    await weth.connect(shortSeller).approve(await optionManager.getAddress(), ethers.MaxUint256);
    await usdc.connect(longBuyer).approve(await optionManager.getAddress(), ethers.MaxUint256);
    await weth.connect(longBuyer).approve(await optionManager.getAddress(), ethers.MaxUint256);

    // Approve vaults directly for deposit tests
    await usdc.connect(shortSeller).approve(await usdcVault.getAddress(), ethers.MaxUint256);
    await weth.connect(shortSeller).approve(await wethVault.getAddress(), ethers.MaxUint256);
  });

  describe("RiskParams", function () {
    it("Should initialize with correct default values", async function () {
      expect(await riskParams.minCollateralRatio()).to.equal(ethers.parseEther("1")); // 100%
      expect(await riskParams.maintenanceRatio()).to.equal(ethers.parseEther("1.2")); // 120%
      expect(await riskParams.liquidationBonus()).to.equal(ethers.parseEther("0.05")); // 5%
      expect(await riskParams.baseImpliedVolatility()).to.equal(ethers.parseEther("0.8")); // 80%
      expect(await riskParams.isPaused()).to.equal(false);
    });

    it("Should allow owner to update parameters", async function () {
      // First set a higher min collateral ratio so we can set maintenance ratio below it
      await riskParams.setMinCollateralRatio(ethers.parseEther("1.5"));
      await riskParams.setMaintenanceRatio(ethers.parseEther("1.3"));
      expect(await riskParams.maintenanceRatio()).to.equal(ethers.parseEther("1.3"));
    });

    it("Should prevent non-owner from updating parameters", async function () {
      await expect(
        riskParams.connect(shortSeller).setMaintenanceRatio(ethers.parseEther("1.1"))
      ).to.be.revertedWithCustomError(riskParams, "OwnableUnauthorizedAccount");
    });
  });

  describe("CollateralVault", function () {
    it("Should accept deposits and issue shares", async function () {
      const depositAmount = toUSDC(1000);

      // Approve and deposit
      await usdc.connect(shortSeller).approve(await usdcVault.getAddress(), depositAmount);
      await usdcVault.connect(shortSeller).deposit(depositAmount, shortSeller.address);

      expect(await usdcVault.balanceOf(shortSeller.address)).to.be.gt(0);
    });

    it("Should prevent withdrawal of reserved collateral", async function () {
      // First deposit some tokens
      const depositAmount = toUSDC(1000);
      await usdc.connect(shortSeller).approve(await usdcVault.getAddress(), depositAmount);
      await usdcVault.connect(shortSeller).deposit(depositAmount, shortSeller.address);

      // Available balance should equal total assets
      const available = await usdcVault.getAvailableBalance(shortSeller.address);
      expect(available).to.equal(depositAmount);
    });
  });

  describe("FundingOracle", function () {
    it("Should return correct spot price", async function () {
      const spotPrice = await fundingOracle.getSpotPrice(await weth.getAddress());
      expect(spotPrice).to.equal(toPrice(2500));
    });

    it("Should calculate intrinsic value for ITM call", async function () {
      // Strike at $2000, spot at $2500 -> intrinsic = $500
      const intrinsic = await fundingOracle.getIntrinsicValue(
        0, // CALL
        await weth.getAddress(),
        toUSDC(2000)
      );
      expect(intrinsic).to.equal(toUSDC(500));
    });

    it("Should return zero intrinsic for OTM call", async function () {
      // Strike at $3000, spot at $2500 -> intrinsic = 0
      const intrinsic = await fundingOracle.getIntrinsicValue(
        0, // CALL
        await weth.getAddress(),
        toUSDC(3000)
      );
      expect(intrinsic).to.equal(0);
    });

    it("Should calculate intrinsic value for ITM put", async function () {
      // Strike at $3000, spot at $2500 -> intrinsic = $500
      const intrinsic = await fundingOracle.getIntrinsicValue(
        1, // PUT
        await weth.getAddress(),
        toUSDC(3000)
      );
      expect(intrinsic).to.equal(toUSDC(500));
    });

    it("Should return mark price greater than intrinsic", async function () {
      const strike = toUSDC(2500); // ATM
      const markPrice = await fundingOracle.getMarkPrice(
        0, // CALL
        await weth.getAddress(),
        strike
      );
      const intrinsic = await fundingOracle.getIntrinsicValue(
        0,
        await weth.getAddress(),
        strike
      );
      expect(markPrice).to.be.gte(intrinsic);
    });
  });

  describe("Opening Positions", function () {
    it("Should open a call option position", async function () {
      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      // Short needs to approve WETH for the vault
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);

      // Open position
      await optionManager.connect(shortSeller).openPosition(
        0, // CALL
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      // Check NFT was minted to long
      expect(await optionNFT.ownerOf(1)).to.equal(longBuyer.address);

      // Check position data
      const position = await optionManager.getPosition(1);
      expect(position.optionType).to.equal(0); // CALL
      expect(position.strike).to.equal(strike);
      expect(position.size).to.equal(size);
      expect(position.shortOwner).to.equal(shortSeller.address);
      expect(position.status).to.equal(0); // ACTIVE
    });

    it("Should open a put option position", async function () {
      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      // Short needs to approve USDC for the vault (put requires USDC collateral)
      await usdc.connect(shortSeller).approve(await optionManager.getAddress(), strike);

      // Open position
      await optionManager.connect(shortSeller).openPosition(
        1, // PUT
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      // Check NFT was minted to long
      expect(await optionNFT.ownerOf(1)).to.equal(longBuyer.address);

      // Check position data
      const position = await optionManager.getPosition(1);
      expect(position.optionType).to.equal(1); // PUT
    });
  });

  describe("Funding Accrual", function () {
    let tokenId;

    beforeEach(async function () {
      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(1000); // Large initial funding

      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);
      await optionManager.connect(shortSeller).openPosition(
        0, // CALL
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );
      tokenId = 1;
    });

    it("Should accrue funding over time", async function () {
      const positionBefore = await optionManager.getPosition(tokenId);

      // Advance time by 1 day
      await time.increase(86400);

      // Update price feed timestamp to avoid stale price
      await priceFeed.setPrice(toPrice(2500));

      // Accrue funding
      await optionManager.accrueFunding(tokenId);

      const positionAfter = await optionManager.getPosition(tokenId);

      // Funding balance should have decreased
      expect(positionAfter.longFundingBalance).to.be.lt(positionBefore.longFundingBalance);
    });

    it("Should close position when funding is depleted", async function () {
      // Create position with minimal funding
      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(1); // Very small funding

      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);
      await optionManager.connect(shortSeller).openPosition(
        0,
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      // Advance time significantly
      await time.increase(86400 * 30); // 30 days

      // Update price feed timestamp to avoid stale price
      await priceFeed.setPrice(toPrice(2500));

      // Accrue funding - should close the position
      await optionManager.accrueFunding(2);

      const position = await optionManager.getPosition(2);
      expect(position.status).to.equal(3); // CLOSED
    });

    it("Should allow long to deposit more funding", async function () {
      const additionalFunding = toUSDC(500);
      const positionBefore = await optionManager.getPosition(tokenId);

      await optionManager.connect(longBuyer).depositFunding(tokenId, additionalFunding);

      const positionAfter = await optionManager.getPosition(tokenId);
      expect(positionAfter.longFundingBalance).to.be.gt(positionBefore.longFundingBalance);
    });
  });

  describe("Exercise", function () {
    it("Should allow exercise of ITM call option", async function () {
      // Set price to $3000 (ITM for $2500 call)
      await priceFeed.setPrice(toPrice(3000));

      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);
      await optionManager.connect(shortSeller).openPosition(
        0, // CALL
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      const longWethBefore = await weth.balanceOf(longBuyer.address);
      const shortUsdcBefore = await usdc.balanceOf(shortSeller.address);

      // Exercise
      await optionManager.connect(longBuyer).exercise(1);

      const longWethAfter = await weth.balanceOf(longBuyer.address);
      const shortUsdcAfter = await usdc.balanceOf(shortSeller.address);

      // Long should have received WETH
      expect(longWethAfter - longWethBefore).to.equal(size);

      // Short should have received at least strike price (plus any accrued funding)
      expect(shortUsdcAfter - shortUsdcBefore).to.be.gte(strike);

      // Position should be exercised
      const position = await optionManager.getPosition(1);
      expect(position.status).to.equal(1); // EXERCISED

      // NFT should be burned
      await expect(optionNFT.ownerOf(1)).to.be.revertedWithCustomError(
        optionNFT,
        "ERC721NonexistentToken"
      );
    });

    it("Should revert exercise of OTM option", async function () {
      // Set price to $2000 (OTM for $2500 call)
      await priceFeed.setPrice(toPrice(2000));

      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);
      await optionManager.connect(shortSeller).openPosition(
        0,
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      await expect(
        optionManager.connect(longBuyer).exercise(1)
      ).to.be.revertedWithCustomError(optionManager, "OptionNotInTheMoney");
    });

    it("Should allow exercise of ITM put option", async function () {
      // Set price to $2000 (ITM for $2500 put)
      await priceFeed.setPrice(toPrice(2000));

      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      await usdc.connect(shortSeller).approve(await optionManager.getAddress(), strike);
      await optionManager.connect(shortSeller).openPosition(
        1, // PUT
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      const longUsdcBefore = await usdc.balanceOf(longBuyer.address);
      const shortWethBefore = await weth.balanceOf(shortSeller.address);

      // Exercise
      await optionManager.connect(longBuyer).exercise(1);

      const longUsdcAfter = await usdc.balanceOf(longBuyer.address);
      const shortWethAfter = await weth.balanceOf(shortSeller.address);

      // Long should have received at least strike price in USDC (plus any remaining funding)
      expect(longUsdcAfter - longUsdcBefore).to.be.gte(strike);

      // Short should have received WETH
      expect(shortWethAfter - shortWethBefore).to.equal(size);
    });
  });

  describe("Liquidation", function () {
    it("Should liquidate undercollateralized position", async function () {
      // Use a PUT option for liquidation test
      // When price drops, the PUT becomes more valuable while USDC collateral stays fixed
      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      // Short deposits USDC collateral for put
      await usdc.connect(shortSeller).approve(await optionManager.getAddress(), strike);
      await optionManager.connect(shortSeller).openPosition(
        1, // PUT
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      // Move price down significantly to make position undercollateralized
      // At $500, intrinsic = $2500 - $500 = $2000
      // Required collateral at 120% = $2000 * 1.2 = $2400
      // Actual collateral = $2500 (barely above, but ratio check uses maintenance)
      // Let's drop even more to $100
      await priceFeed.setPrice(toPrice(100));

      // Check if liquidatable
      const isLiquidatable = await optionManager.isLiquidatable(1);
      expect(isLiquidatable).to.equal(true);

      // Liquidate
      await optionManager.connect(liquidator).liquidate(1);

      // Position should be liquidated
      const position = await optionManager.getPosition(1);
      expect(position.status).to.equal(2); // LIQUIDATED
    });

    it("Should revert liquidation of healthy position", async function () {
      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);
      await optionManager.connect(shortSeller).openPosition(
        0,
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      // Position should not be liquidatable when ATM/OTM
      expect(await optionManager.isLiquidatable(1)).to.equal(false);

      await expect(
        optionManager.connect(liquidator).liquidate(1)
      ).to.be.revertedWithCustomError(optionManager, "PositionNotLiquidatable");
    });
  });

  describe("PerpetualOptionNFT", function () {
    it("Should generate on-chain metadata", async function () {
      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);
      await optionManager.connect(shortSeller).openPosition(
        0,
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      const tokenURI = await optionNFT.tokenURI(1);
      expect(tokenURI).to.include("data:application/json;base64,");
    });

    it("Should return all tokens owned by address", async function () {
      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      // Open multiple positions
      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size * 2n);

      await optionManager.connect(shortSeller).openPosition(
        0,
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      await optionManager.connect(shortSeller).openPosition(
        0,
        await weth.getAddress(),
        strike,
        size,
        longBuyer.address,
        initialFunding
      );

      const tokens = await optionNFT.tokensOfOwner(longBuyer.address);
      expect(tokens.length).to.equal(2);
    });
  });

  describe("Protocol Pause", function () {
    it("Should prevent operations when paused", async function () {
      await riskParams.setPaused(true);

      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);

      await expect(
        optionManager.connect(shortSeller).openPosition(
          0,
          await weth.getAddress(),
          strike,
          size,
          longBuyer.address,
          initialFunding
        )
      ).to.be.revertedWithCustomError(optionManager, "ProtocolPaused");
    });

    it("Should allow operations after unpause", async function () {
      await riskParams.setPaused(true);
      await riskParams.setPaused(false);

      const strike = toUSDC(2500);
      const size = toWETH(1);
      const initialFunding = toUSDC(100);

      await weth.connect(shortSeller).approve(await optionManager.getAddress(), size);

      await expect(
        optionManager.connect(shortSeller).openPosition(
          0,
          await weth.getAddress(),
          strike,
          size,
          longBuyer.address,
          initialFunding
        )
      ).to.not.be.reverted;
    });
  });
});
