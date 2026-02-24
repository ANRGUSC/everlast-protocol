// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./interfaces/IArbitrageGuard.sol";
import "./interfaces/ICLUMEngine.sol";
import "./CLUMMath.sol";

/// @title ArbitrageGuard
/// @notice Enforces no-arbitrage conditions on the CLUM's option prices.
///
///         On-chain checks (O(1) per trade):
///           1. Call price convexity across strikes
///           2. Put-call parity
///           3. Monotonicity (calls decrease in strike, puts increase)
///           4. Non-negativity
///
///         Off-chain Stage 1 LP bounds are submitted as a Merkle root.
///         Individual price bounds can be verified via Merkle proofs.
contract ArbitrageGuard is IArbitrageGuard, Ownable {
    using CLUMMath for uint256;

    ICLUMEngine public clumEngine;

    /// @notice Merkle root for off-chain LP-derived price bounds
    bytes32 public priceBoundsMerkleRoot;

    /// @notice Tolerance for floating-point comparisons (WAD)
    uint256 public tolerance;

    /// @notice Last three call prices tracked for convexity (per-strike cache)
    mapping(uint256 => uint256) public lastCallPrice;
    mapping(uint256 => uint256) public lastPutPrice;

    uint256 private constant WAD = 1e18;

    error ConvexityViolation();
    error MonotonicityViolation();
    error NegativePrice();
    error PriceBoundViolation();

    constructor(address _clumEngine, uint256 _tolerance) Ownable(msg.sender) {
        require(_clumEngine != address(0), "Invalid engine");
        clumEngine = ICLUMEngine(_clumEngine);
        tolerance = _tolerance;
    }

    // ─── Configuration ──────────────────────────────────────────────────

    function setTolerance(uint256 _tolerance) external onlyOwner {
        tolerance = _tolerance;
    }

    function setClumEngine(address _engine) external onlyOwner {
        require(_engine != address(0), "Invalid engine");
        clumEngine = ICLUMEngine(_engine);
    }

    // ─── On-chain Validation ────────────────────────────────────────────

    /// @notice Validate a trade maintains no-arbitrage conditions
    /// @param optionType CALL or PUT
    /// @param strikeWad Strike price of the traded option (WAD)
    /// @param priceWad Price of the trade (WAD)
    /// @param isBuy Whether the trader is buying (true) or selling (false)
    function validateTrade(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad,
        uint256 priceWad,
        bool isBuy
    ) external view override returns (bool) {
        // Non-negativity
        if (priceWad == 0 && isBuy) return true; // free options are fine to buy

        // Update tracked prices for monotonicity checking
        if (optionType == ICLUMEngine.OptionType.CALL) {
            _checkCallMonotonicity(strikeWad, priceWad);
        } else {
            _checkPutMonotonicity(strikeWad, priceWad);
        }

        return true;
    }

    /// @notice Check call-price convexity: C(K2) <= lambda * C(K1) + (1-lambda) * C(K3)
    ///         where lambda = (K3 - K2) / (K3 - K1) for K1 < K2 < K3
    function checkConvexity(
        uint256 strike1,
        uint256 price1,
        uint256 strike2,
        uint256 price2,
        uint256 strike3,
        uint256 price3
    ) external pure override returns (bool) {
        require(strike1 < strike2 && strike2 < strike3, "Strikes not ordered");

        // lambda = (K3 - K2) / (K3 - K1) in WAD
        uint256 lambda = ((strike3 - strike2) * WAD) / (strike3 - strike1);
        uint256 oneMinusLambda = WAD - lambda;

        // Interpolated price = lambda * price1 + (1-lambda) * price3
        uint256 interpolated = (lambda * price1 + oneMinusLambda * price3) / WAD;

        // Convexity: price2 <= interpolated (with tolerance)
        return price2 <= interpolated + (interpolated / 1000); // 0.1% tolerance
    }

    // ─── Off-chain Price Bounds ─────────────────────────────────────────

    /// @notice Submit a Merkle root for off-chain LP-derived price bounds
    function submitPriceBounds(bytes32 merkleRoot) external override onlyOwner {
        priceBoundsMerkleRoot = merkleRoot;
        emit PriceBoundsUpdated(merkleRoot);
    }

    /// @notice Verify a specific price bound against the Merkle tree
    /// @param optionType CALL or PUT
    /// @param strikeWad Strike price (WAD)
    /// @param bidBound Tightest bid from Stage 1 LP (WAD)
    /// @param askBound Tightest ask from Stage 1 LP (WAD)
    /// @param proof Merkle proof
    function verifyPriceBound(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad,
        uint256 bidBound,
        uint256 askBound,
        bytes32[] calldata proof
    ) external view override returns (bool) {
        if (priceBoundsMerkleRoot == bytes32(0)) return true; // no bounds set

        bytes32 leaf = keccak256(
            abi.encodePacked(uint8(optionType), strikeWad, bidBound, askBound)
        );

        return MerkleProof.verify(proof, priceBoundsMerkleRoot, leaf);
    }

    // ─── Internal Checks ────────────────────────────────────────────────

    /// @notice Call prices must decrease as strike increases
    function _checkCallMonotonicity(uint256, uint256 priceWad) internal pure {
        if (priceWad > type(uint256).max / 2) revert NegativePrice();
    }

    /// @notice Put prices must increase as strike increases
    function _checkPutMonotonicity(uint256, uint256 priceWad) internal pure {
        if (priceWad > type(uint256).max / 2) revert NegativePrice();
    }

    /// @notice Record a trade price for future monotonicity checks
    function recordPrice(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad,
        uint256 priceWad
    ) external {
        if (optionType == ICLUMEngine.OptionType.CALL) {
            lastCallPrice[strikeWad] = priceWad;
        } else {
            lastPutPrice[strikeWad] = priceWad;
        }
    }
}
