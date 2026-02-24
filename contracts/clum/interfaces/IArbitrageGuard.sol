// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ICLUMEngine.sol";

/// @title IArbitrageGuard
/// @notice Interface for on-chain arbitrage prevention and off-chain price bound verification
interface IArbitrageGuard {
    event PriceBoundsUpdated(bytes32 merkleRoot);

    /// @notice Validate that a trade maintains no-arbitrage conditions
    function validateTrade(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad,
        uint256 priceWad,
        bool isBuy
    ) external view returns (bool);

    /// @notice Submit Merkle root for off-chain LP-derived price bounds
    function submitPriceBounds(bytes32 merkleRoot) external;

    /// @notice Verify a price bound against the Merkle root
    function verifyPriceBound(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad,
        uint256 bidBound,
        uint256 askBound,
        bytes32[] calldata proof
    ) external view returns (bool);

    /// @notice Record a trade price for future monotonicity checks
    function recordPrice(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad,
        uint256 priceWad
    ) external;

    /// @notice Check call-price convexity for three strikes
    function checkConvexity(
        uint256 strike1,
        uint256 price1,
        uint256 strike2,
        uint256 price2,
        uint256 strike3,
        uint256 price3
    ) external pure returns (bool);
}
