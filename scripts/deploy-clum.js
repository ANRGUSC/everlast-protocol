const hre = require("hardhat");

const BASE_SEPOLIA = {
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  WETH: "0x4200000000000000000000000000000000000006",
  ETH_USD_FEED: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
};

const WAD = BigInt(1e18);

const BUCKET_CONFIG = {
  centerPriceWad: 2500n * WAD,       // $2500 center
  bucketWidthWad: 100n * WAD,        // $100 per bucket
  numRegular: 20n,                   // 20 regular + 2 tails = 22 total
  rebalanceThreshold: WAD / 10n,     // 10% from center triggers rebalance
  oracleStaleness: 86400n,           // 24h staleness (lenient for testnet)
};

const CLUM_SUBSIDY = 100n * WAD;     // Initial CLUM subsidy
const PREMIUM_FACTOR = WAD;          // 1x minimum
const FUNDING_PERIOD = 86400n;       // daily funding
const ARB_TOLERANCE = WAD / 1000n;   // 0.001 WAD

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTx(tx, label) {
  console.log(`  ⏳ Waiting for ${label}...`);
  const receipt = await tx.wait(2);
  console.log(`  ✅ ${label} confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  if (chainId !== 84532n) {
    console.error("This script targets Base Sepolia (84532). Current chain:", chainId.toString());
    process.exit(1);
  }

  console.log("Deployer:", deployer.address);
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(bal), "ETH\n");

  const addresses = BASE_SEPOLIA;

  // 1. PositionTokens
  console.log("1/7  Deploying PositionTokens...");
  const PositionTokens = await hre.ethers.getContractFactory("PositionTokens");
  const positionTokens = await PositionTokens.deploy();
  await positionTokens.waitForDeployment();
  const positionTokensAddr = await positionTokens.getAddress();
  console.log("     PositionTokens:", positionTokensAddr);
  await delay(5000);

  // 2. BucketRegistry
  console.log("2/7  Deploying BucketRegistry...");
  const BucketRegistry = await hre.ethers.getContractFactory("BucketRegistry");
  const bucketRegistry = await BucketRegistry.deploy(
    addresses.ETH_USD_FEED,
    BUCKET_CONFIG.centerPriceWad,
    BUCKET_CONFIG.bucketWidthWad,
    BUCKET_CONFIG.numRegular,
    BUCKET_CONFIG.rebalanceThreshold,
    BUCKET_CONFIG.oracleStaleness
  );
  await bucketRegistry.waitForDeployment();
  const bucketRegistryAddr = await bucketRegistry.getAddress();
  console.log("     BucketRegistry:", bucketRegistryAddr);
  await delay(5000);

  // 3. CLUMEngine
  console.log("3/7  Deploying CLUMEngine...");
  const CLUMEngine = await hre.ethers.getContractFactory("CLUMEngine");
  const clumEngine = await CLUMEngine.deploy(bucketRegistryAddr);
  await clumEngine.waitForDeployment();
  const clumEngineAddr = await clumEngine.getAddress();
  console.log("     CLUMEngine:", clumEngineAddr);
  await delay(5000);

  // 4. LPPool
  console.log("4/7  Deploying LPPool...");
  const LPPool = await hre.ethers.getContractFactory("LPPool");
  const lpPool = await LPPool.deploy(
    addresses.USDC,
    "EverLast LP Shares",
    "evLP"
  );
  await lpPool.waitForDeployment();
  const lpPoolAddr = await lpPool.getAddress();
  console.log("     LPPool:", lpPoolAddr);
  await delay(5000);

  // 5. FundingDeriver
  console.log("5/7  Deploying FundingDeriver...");
  const FundingDeriver = await hre.ethers.getContractFactory("FundingDeriver");
  const fundingDeriver = await FundingDeriver.deploy(
    clumEngineAddr,
    bucketRegistryAddr,
    PREMIUM_FACTOR,
    FUNDING_PERIOD
  );
  await fundingDeriver.waitForDeployment();
  const fundingDeriverAddr = await fundingDeriver.getAddress();
  console.log("     FundingDeriver:", fundingDeriverAddr);
  await delay(5000);

  // 6. ArbitrageGuard
  console.log("6/7  Deploying ArbitrageGuard...");
  const ArbitrageGuard = await hre.ethers.getContractFactory("ArbitrageGuard");
  const arbitrageGuard = await ArbitrageGuard.deploy(clumEngineAddr, ARB_TOLERANCE);
  await arbitrageGuard.waitForDeployment();
  const arbitrageGuardAddr = await arbitrageGuard.getAddress();
  console.log("     ArbitrageGuard:", arbitrageGuardAddr);
  await delay(5000);

  // 7. EvOptionManager
  console.log("7/7  Deploying EvOptionManager...");
  const EvOptionManager = await hre.ethers.getContractFactory("EvOptionManager");
  const evOptionManager = await EvOptionManager.deploy(
    clumEngineAddr,
    bucketRegistryAddr,
    lpPoolAddr,
    fundingDeriverAddr,
    arbitrageGuardAddr,
    positionTokensAddr,
    addresses.USDC
  );
  await evOptionManager.waitForDeployment();
  const evOptionManagerAddr = await evOptionManager.getAddress();
  console.log("     EvOptionManager:", evOptionManagerAddr);
  await delay(5000);

  // ─── Post-deployment configuration ───────────────────────────────────
  console.log("\nConfiguring contracts...");

  console.log("  Setting OptionManager on PositionTokens...");
  await waitForTx(
    await positionTokens.setOptionManager(evOptionManagerAddr),
    "PositionTokens.setOptionManager"
  );
  await delay(3000);

  console.log("  Setting OptionManager on CLUMEngine...");
  await waitForTx(
    await clumEngine.setOptionManager(evOptionManagerAddr),
    "CLUMEngine.setOptionManager"
  );
  await delay(3000);

  console.log("  Setting CLUMEngine on LPPool...");
  await waitForTx(
    await lpPool.setClumEngine(clumEngineAddr),
    "LPPool.setClumEngine"
  );
  await delay(3000);

  console.log("  Setting OptionManager on LPPool...");
  await waitForTx(
    await lpPool.setOptionManager(evOptionManagerAddr),
    "LPPool.setOptionManager"
  );
  await delay(3000);

  console.log("  Initializing CLUMEngine with subsidy...");
  await waitForTx(
    await clumEngine.initialize(CLUM_SUBSIDY),
    "CLUMEngine.initialize"
  );

  // ─── Summary ─────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  CLUM DEPLOYMENT COMPLETE — Base Sepolia");
  console.log("=".repeat(60));
  console.log();
  console.log("  evOptionManager:", evOptionManagerAddr);
  console.log("  clumEngine:     ", clumEngineAddr);
  console.log("  bucketRegistry: ", bucketRegistryAddr);
  console.log("  lpPool:         ", lpPoolAddr);
  console.log("  fundingDeriver: ", fundingDeriverAddr);
  console.log("  positionTokens: ", positionTokensAddr);
  console.log("  arbitrageGuard: ", arbitrageGuardAddr);
  console.log();
  console.log("  USDC:           ", addresses.USDC);
  console.log("  WETH:           ", addresses.WETH);
  console.log("  ETH/USD Feed:   ", addresses.ETH_USD_FEED);
  console.log();
  console.log("Update frontend/src/config/contracts.ts with the addresses above.");
  console.log("=".repeat(60));

  return {
    evOptionManager: evOptionManagerAddr,
    clumEngine: clumEngineAddr,
    bucketRegistry: bucketRegistryAddr,
    lpPool: lpPoolAddr,
    fundingDeriver: fundingDeriverAddr,
    positionTokens: positionTokensAddr,
    arbitrageGuard: arbitrageGuardAddr,
  };
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
