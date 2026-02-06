const hre = require("hardhat");

// Base Mainnet addresses
const BASE_MAINNET = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
  ETH_USD_FEED: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70"
};

// Base Sepolia addresses (testnet)
const BASE_SEPOLIA = {
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  WETH: "0x4200000000000000000000000000000000000006",
  ETH_USD_FEED: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1"
};

// Helper to wait for transaction confirmation
async function waitForTx(tx, name) {
  console.log(`  Waiting for ${name} confirmation...`);
  const receipt = await tx.wait(2); // Wait for 2 confirmations
  console.log(`  ${name} confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

// Helper to delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  let addresses;

  if (chainId === 8453n) {
    console.log("Deploying to Base Mainnet");
    addresses = BASE_MAINNET;
  } else if (chainId === 84532n) {
    console.log("Deploying to Base Sepolia");
    addresses = BASE_SEPOLIA;
  } else {
    console.log("Deploying to local/hardhat network - using mock addresses");
    addresses = await deployMockTokens();
  }

  // 1. Deploy RiskParams
  console.log("\n1. Deploying RiskParams...");
  const RiskParams = await hre.ethers.getContractFactory("RiskParams");
  const riskParams = await RiskParams.deploy();
  await riskParams.waitForDeployment();
  const riskParamsAddress = await riskParams.getAddress();
  console.log("RiskParams deployed to:", riskParamsAddress);
  await delay(3000);

  // 2. Deploy CollateralVaults
  console.log("\n2. Deploying CollateralVaults...");
  const CollateralVault = await hre.ethers.getContractFactory("CollateralVault");

  const usdcVault = await CollateralVault.deploy(
    addresses.USDC,
    "Perpetual Options USDC Vault",
    "poUSDC"
  );
  await usdcVault.waitForDeployment();
  const usdcVaultAddress = await usdcVault.getAddress();
  console.log("USDC Vault deployed to:", usdcVaultAddress);
  await delay(3000);

  const wethVault = await CollateralVault.deploy(
    addresses.WETH,
    "Perpetual Options WETH Vault",
    "poWETH"
  );
  await wethVault.waitForDeployment();
  const wethVaultAddress = await wethVault.getAddress();
  console.log("WETH Vault deployed to:", wethVaultAddress);
  await delay(3000);

  // 3. Deploy PerpetualOptionNFT
  console.log("\n3. Deploying PerpetualOptionNFT...");
  const PerpetualOptionNFT = await hre.ethers.getContractFactory("PerpetualOptionNFT");
  const optionNFT = await PerpetualOptionNFT.deploy(
    "Perpetual Options",
    "PERP-OPT"
  );
  await optionNFT.waitForDeployment();
  const optionNFTAddress = await optionNFT.getAddress();
  console.log("PerpetualOptionNFT deployed to:", optionNFTAddress);
  await delay(3000);

  // 4. Deploy FundingOracle
  console.log("\n4. Deploying FundingOracle...");
  const FundingOracle = await hre.ethers.getContractFactory("FundingOracle");
  const fundingOracle = await FundingOracle.deploy(riskParamsAddress);
  await fundingOracle.waitForDeployment();
  const fundingOracleAddress = await fundingOracle.getAddress();
  console.log("FundingOracle deployed to:", fundingOracleAddress);
  await delay(3000);

  // Set price feed for WETH
  console.log("Setting ETH/USD price feed...");
  const tx1 = await fundingOracle.setPriceFeed(addresses.WETH, addresses.ETH_USD_FEED);
  await waitForTx(tx1, "setPriceFeed");
  await delay(3000);

  // 5. Deploy OptionManager
  console.log("\n5. Deploying OptionManager...");
  const OptionManager = await hre.ethers.getContractFactory("OptionManager");
  const optionManager = await OptionManager.deploy(
    optionNFTAddress,
    usdcVaultAddress,
    wethVaultAddress,
    fundingOracleAddress,
    riskParamsAddress,
    addresses.USDC,
    addresses.WETH
  );
  await optionManager.waitForDeployment();
  const optionManagerAddress = await optionManager.getAddress();
  console.log("OptionManager deployed to:", optionManagerAddress);
  await delay(3000);

  // 6. Configure contracts
  console.log("\n6. Configuring contracts...");

  console.log("Setting OptionManager on NFT contract...");
  const tx2 = await optionNFT.setOptionManager(optionManagerAddress);
  await waitForTx(tx2, "setOptionManager (NFT)");
  await delay(3000);

  console.log("Setting OptionManager on USDC vault...");
  const tx3 = await usdcVault.setOptionManager(optionManagerAddress);
  await waitForTx(tx3, "setOptionManager (USDC Vault)");
  await delay(3000);

  console.log("Setting OptionManager on WETH vault...");
  const tx4 = await wethVault.setOptionManager(optionManagerAddress);
  await waitForTx(tx4, "setOptionManager (WETH Vault)");

  console.log("\n========== Deployment Complete ==========\n");
  console.log("Contract Addresses:");
  console.log("-------------------");
  console.log("RiskParams:        ", riskParamsAddress);
  console.log("USDC Vault:        ", usdcVaultAddress);
  console.log("WETH Vault:        ", wethVaultAddress);
  console.log("PerpetualOptionNFT:", optionNFTAddress);
  console.log("FundingOracle:     ", fundingOracleAddress);
  console.log("OptionManager:     ", optionManagerAddress);
  console.log("\nToken Addresses:");
  console.log("----------------");
  console.log("USDC:              ", addresses.USDC);
  console.log("WETH:              ", addresses.WETH);
  console.log("ETH/USD Feed:      ", addresses.ETH_USD_FEED);

  return {
    riskParams: riskParamsAddress,
    usdcVault: usdcVaultAddress,
    wethVault: wethVaultAddress,
    optionNFT: optionNFTAddress,
    fundingOracle: fundingOracleAddress,
    optionManager: optionManagerAddress,
    tokens: addresses
  };
}

async function deployMockTokens() {
  console.log("Deploying mock tokens for local testing...");

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");

  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("Mock USDC deployed to:", usdcAddress);

  const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log("Mock WETH deployed to:", wethAddress);

  const MockPriceFeed = await hre.ethers.getContractFactory("MockPriceFeed");
  const priceFeed = await MockPriceFeed.deploy(
    8,
    "ETH / USD",
    1,
    250000000000n
  );
  await priceFeed.waitForDeployment();
  const priceFeedAddress = await priceFeed.getAddress();
  console.log("Mock ETH/USD Price Feed deployed to:", priceFeedAddress);

  return {
    USDC: usdcAddress,
    WETH: wethAddress,
    ETH_USD_FEED: priceFeedAddress
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
