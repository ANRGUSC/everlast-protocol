// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ICLUMEngine.sol";
import "./interfaces/IBucketRegistry.sol";
import "./CLUMMath.sol";

/// @title CLUMEngine
/// @notice Core Constant-Log-Utility Market Maker engine for everlasting options
/// @dev Maintains the quantity vector q, cached cost C, and utility level U.
///      Uses Newton's method to solve the implicit cost function:
///        sum_i  pi_i * ln(C - q_i) = U
///      where pi is the prior, q is shares held by traders per bucket,
///      C is total money collected, and U is the constant utility level.
contract CLUMEngine is ICLUMEngine, Ownable, ReentrancyGuard {
    using CLUMMath for int256;
    using CLUMMath for uint256;

    uint256 private constant WAD = 1e18;
    uint256 private constant MAX_BISECTION_ITER = 100;
    int256 private constant CONVERGENCE_TOL = 1e8; // ~1e-10 in WAD terms

    IBucketRegistry public bucketRegistry;

    /// @notice Address authorized to execute trades (the EvOptionManager)
    address public optionManager;

    /// @notice Number of buckets (cached from registry)
    uint256 private _numBuckets;

    /// @notice Trader quantity per bucket: q[i]. Positive = traders hold, negative = MM holds.
    mapping(uint256 => int256) public quantities;

    /// @notice Prior probability per bucket (WAD, sums to WAD)
    mapping(uint256 => uint256) public priors;

    /// @notice Cached cost function value C(q) in WAD
    int256 public cachedCost;

    /// @notice Constant utility level U in WAD
    int256 public utilityLevel;

    /// @notice Whether the engine has been initialized with a subsidy
    bool public initialized;

    error NotInitialized();
    error AlreadyInitialized();
    error OnlyOptionManager();
    error InsufficientLiquidity();
    error NewtonDidNotConverge();
    error InvalidVerification();

    modifier onlyManager() {
        if (msg.sender != optionManager) revert OnlyOptionManager();
        _;
    }

    modifier whenInitialized() {
        if (!initialized) revert NotInitialized();
        _;
    }

    constructor(address _bucketRegistry) Ownable(msg.sender) {
        require(_bucketRegistry != address(0), "Invalid registry");
        bucketRegistry = IBucketRegistry(_bucketRegistry);
        _numBuckets = bucketRegistry.numBuckets();
    }

    // ─── Initialization ─────────────────────────────────────────────────

    /// @notice Initialize the engine with a subsidy and uniform prior
    /// @param subsidyWad The initial subsidy in WAD (determines C(0) and U)
    function initialize(uint256 subsidyWad) external onlyOwner {
        if (initialized) revert AlreadyInitialized();
        require(subsidyWad > 0, "Zero subsidy");

        uint256 n = _numBuckets;

        uint256 priorPerBucket = WAD / n;
        uint256 remainder = WAD - priorPerBucket * n;
        for (uint256 i = 0; i < n; i++) {
            priors[i] = priorPerBucket + (i == 0 ? remainder : 0);
            quantities[i] = 0;
        }

        cachedCost = CLUMMath.toInt256(subsidyWad);
        // U = sum(pi_i * ln(C(0))) = ln(C(0)) since sum(pi) = 1 and all q_i = 0
        utilityLevel = CLUMMath.lnWad(cachedCost);
        initialized = true;
    }

    /// @notice Initialize the engine with a subsidy and log-normal prior
    /// @dev Computes bucket weights from the log-normal PDF evaluated at each
    ///      bucket midpoint, using the oracle spot price as the distribution center.
    ///      w_i = exp(-(ln(mid_i/spot))^2 / (2*sigma^2)) / mid_i
    ///      Weights are then normalized so priors sum to WAD.
    /// @param subsidyWad The initial subsidy in WAD (determines C(0) and U)
    /// @param sigmaWad  Log-normal sigma in WAD (e.g. 0.5e18 = 50% vol)
    function initializeWithLogNormalPrior(
        uint256 subsidyWad,
        uint256 sigmaWad
    ) external onlyOwner {
        if (initialized) revert AlreadyInitialized();
        require(subsidyWad > 0, "Zero subsidy");
        require(sigmaWad > 0, "Zero sigma");

        uint256 n = _numBuckets;
        uint256 spotWad = bucketRegistry.getSpotPrice();
        int256 lnSpot = CLUMMath.lnWad(CLUMMath.toInt256(spotWad));

        int256 twoSigmaSqWad = int256(2 * (sigmaWad * sigmaWad) / WAD);

        uint256[] memory weights = new uint256[](n);
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < n; i++) {
            uint256 mid = bucketRegistry.getBucketMidpoint(i);
            int256 lnMid = CLUMMath.lnWad(CLUMMath.toInt256(mid));
            int256 diff = lnMid - lnSpot;

            int256 diffSqWad = (diff * diff) / int256(WAD);
            int256 exponent = -(diffSqWad * int256(WAD)) / twoSigmaSqWad;

            uint256 expVal = CLUMMath.toUint256(CLUMMath.expWad(exponent));
            uint256 w = CLUMMath.divWad(expVal, mid);

            weights[i] = w;
            totalWeight += w;
        }

        require(totalWeight > 0, "Zero total weight");

        uint256 priorSum = 0;
        for (uint256 i = 0; i < n; i++) {
            priors[i] = (weights[i] * WAD) / totalWeight;
            quantities[i] = 0;
            priorSum += priors[i];
        }
        priors[0] += WAD - priorSum;

        cachedCost = CLUMMath.toInt256(subsidyWad);
        utilityLevel = CLUMMath.lnWad(cachedCost);
        initialized = true;
    }

    /// @notice Set the option manager address
    function setOptionManager(address _manager) external onlyOwner {
        require(_manager != address(0), "Invalid manager");
        optionManager = _manager;
    }

    // ─── Quote Functions ────────────────────────────────────────────────

    function quoteBuy(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external view override whenInitialized returns (uint256 costWad) {
        int256 newCost = _computeNewCost(optionType, strikeWad, sizeWad, true);
        require(newCost > cachedCost, "Non-positive cost");
        costWad = CLUMMath.toUint256(newCost - cachedCost);
    }

    function quoteSell(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external view override whenInitialized returns (uint256 revenueWad) {
        int256 newCost = _computeNewCost(optionType, strikeWad, sizeWad, false);
        require(cachedCost > newCost, "Non-positive revenue");
        revenueWad = CLUMMath.toUint256(cachedCost - newCost);
    }

    // ─── Execute Functions ──────────────────────────────────────────────

    function executeBuy(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external override onlyManager whenInitialized nonReentrant returns (uint256 costWad) {
        int256 oldCost = cachedCost;

        _applyKappa(optionType, strikeWad, sizeWad, true);

        int256 newCost = _solveCostFunction();
        require(newCost > oldCost, "Non-positive cost");

        cachedCost = newCost;
        costWad = CLUMMath.toUint256(newCost - oldCost);

        emit TradeExecuted(optionType, strikeWad, sizeWad, true, costWad);
        emit CostUpdated(oldCost, newCost);
    }

    function executeSell(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external override onlyManager whenInitialized nonReentrant returns (uint256 revenueWad) {
        int256 oldCost = cachedCost;

        _applyKappa(optionType, strikeWad, sizeWad, false);

        int256 newCost = _solveCostFunction();
        require(oldCost > newCost, "Non-positive revenue");

        cachedCost = newCost;
        revenueWad = CLUMMath.toUint256(oldCost - newCost);

        emit TradeExecuted(optionType, strikeWad, sizeWad, false, revenueWad);
        emit CostUpdated(oldCost, newCost);
    }

    // ─── Off-chain Verification ─────────────────────────────────────────

    /// @notice Verify an externally computed cost value and apply it
    /// @dev Verifies sum(pi_i * ln(C_proposed - q_i)) == U within tolerance
    function verifyAndSetCost(
        int256 proposedCost,
        int256[] calldata newQuantities
    ) external override onlyManager whenInitialized {
        uint256 n = _numBuckets;
        require(newQuantities.length == n, "Length mismatch");

        // Verify the proposed quantities match storage
        for (uint256 i = 0; i < n; i++) {
            require(newQuantities[i] == quantities[i], "Quantity mismatch");
        }

        // Verify the constant utility equation
        int256 sum = _evaluateUtility(proposedCost);
        int256 diff = sum - utilityLevel;
        if (diff < 0) diff = -diff;
        if (diff > CONVERGENCE_TOL) revert InvalidVerification();

        int256 oldCost = cachedCost;
        cachedCost = proposedCost;
        emit CostUpdated(oldCost, proposedCost);
    }

    // ─── View Functions ─────────────────────────────────────────────────

    function getRiskNeutralPrices()
        external
        view
        override
        whenInitialized
        returns (uint256[] memory prices)
    {
        uint256 n = _numBuckets;
        prices = new uint256[](n);
        int256 C = cachedCost;

        uint256 denominator = 0;
        uint256[] memory rawWeights = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            int256 diff = C - quantities[i];
            require(diff > 0, "Negative wealth");
            // p_i proportional to pi_i / (C - q_i)  [since u'(w) = 1/w for log utility]
            // Use WAD division: pi_i * WAD / diff
            uint256 w = (priors[i] * WAD) / CLUMMath.toUint256(diff);
            rawWeights[i] = w;
            denominator += w;
        }

        for (uint256 i = 0; i < n; i++) {
            prices[i] = (rawWeights[i] * WAD) / denominator;
        }
    }

    function getImpliedDistribution()
        external
        view
        override
        whenInitialized
        returns (uint256[] memory midpoints, uint256[] memory probabilities)
    {
        uint256 n = _numBuckets;
        midpoints = new uint256[](n);
        probabilities = this.getRiskNeutralPrices();

        for (uint256 i = 0; i < n; i++) {
            midpoints[i] = bucketRegistry.getBucketMidpoint(i);
        }
    }

    function getQuantity(uint256 bucketIndex)
        external
        view
        override
        returns (int256)
    {
        return quantities[bucketIndex];
    }

    function getCachedCost() external view override returns (int256) {
        return cachedCost;
    }

    function getUtilityLevel() external view override returns (int256) {
        return utilityLevel;
    }

    function getNumBuckets() external view override returns (uint256) {
        return _numBuckets;
    }

    // ─── Internal: Kappa Vector ─────────────────────────────────────────

    /// @notice Build and apply the kappa (payoff) vector for an option trade
    /// @dev For a call at strike K: kappa_i = max(midpoint_i - K, 0) * size / WAD
    ///      For a put  at strike K: kappa_i = max(K - midpoint_i, 0) * size / WAD
    function _applyKappa(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad,
        bool isBuy
    ) internal {
        uint256 n = _numBuckets;
        for (uint256 i = 0; i < n; i++) {
            uint256 mid = bucketRegistry.getBucketMidpoint(i);
            uint256 payoff;

            if (optionType == OptionType.CALL) {
                payoff = mid > strikeWad ? mid - strikeWad : 0;
            } else {
                payoff = strikeWad > mid ? strikeWad - mid : 0;
            }

            if (payoff == 0) continue;

            int256 kappa = CLUMMath.toInt256((payoff * sizeWad) / WAD);

            if (isBuy) {
                quantities[i] += kappa;
            } else {
                quantities[i] -= kappa;
            }
        }
    }

    // ─── Internal: Cost Function Solver ─────────────────────────────────

    /// @notice Compute the new cost without modifying state (for quotes)
    function _computeNewCost(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad,
        bool isBuy
    ) internal view returns (int256) {
        uint256 n = _numBuckets;
        int256[] memory tempQ = new int256[](n);

        for (uint256 i = 0; i < n; i++) {
            uint256 mid = bucketRegistry.getBucketMidpoint(i);
            uint256 payoff;

            if (optionType == OptionType.CALL) {
                payoff = mid > strikeWad ? mid - strikeWad : 0;
            } else {
                payoff = strikeWad > mid ? strikeWad - mid : 0;
            }

            int256 kappa = CLUMMath.toInt256((payoff * sizeWad) / WAD);
            tempQ[i] = isBuy ? quantities[i] + kappa : quantities[i] - kappa;
        }

        return _solveCostFunctionFor(tempQ);
    }

    /// @notice Solve sum(pi_i * ln(C - q_i)) = U for C using Newton's method
    function _solveCostFunction() internal view returns (int256) {
        uint256 n = _numBuckets;
        int256[] memory q = new int256[](n);
        for (uint256 i = 0; i < n; i++) {
            q[i] = quantities[i];
        }
        return _solveCostFunctionFor(q);
    }

    /// @notice Solve for C via bisection (robust for concave log-utility function)
    function _solveCostFunctionFor(int256[] memory q) internal view returns (int256) {
        uint256 n = _numBuckets;

        // Find max(q_i) to set lower bound for C
        int256 maxQ = type(int256).min;
        for (uint256 i = 0; i < n; i++) {
            if (q[i] > maxQ) maxQ = q[i];
        }

        // Binary search bounds: f is monotonically increasing in C
        // low: just above the singularity at max(q_i)
        int256 low = maxQ + 1;

        // high: find a point where f(high) >= U by doubling from cachedCost
        int256 high = CLUMMath.maxInt(cachedCost * 2, maxQ + int256(WAD * 10000));
        for (uint256 j = 0; j < 50; j++) {
            int256 fHigh = _evalF(high, q, n);
            if (fHigh >= utilityLevel) break;
            high = high * 2;
        }

        // Bisection: f is monotonically increasing, find C where f(C) = U
        for (uint256 iter = 0; iter < MAX_BISECTION_ITER; iter++) {
            if (high - low <= CONVERGENCE_TOL) {
                return (low + high) / 2;
            }

            int256 mid = low + (high - low) / 2;
            int256 fMid = _evalF(mid, q, n);

            if (fMid < utilityLevel) {
                low = mid;
            } else {
                high = mid;
            }
        }

        return (low + high) / 2;
    }

    /// @notice Evaluate f(C) = sum(pi_i * ln(C - q_i))
    function _evalF(int256 C, int256[] memory q, uint256 n) internal view returns (int256 f) {
        for (uint256 i = 0; i < n; i++) {
            int256 diff = C - q[i];
            require(diff > 0, "C <= q_i");
            int256 logVal = CLUMMath.lnWad(diff);
            f += (int256(priors[i]) * logVal) / int256(WAD);
        }
    }

    /// @notice Evaluate utility sum using cached cost (for verification)
    function _evaluateUtility(int256 C) internal view returns (int256 sum) {
        uint256 n = _numBuckets;
        for (uint256 i = 0; i < n; i++) {
            int256 diff = C - quantities[i];
            require(diff > 0, "C <= q_i");
            int256 logVal = CLUMMath.lnWad(diff);
            sum += (int256(priors[i]) * logVal) / int256(WAD);
        }
    }
}
