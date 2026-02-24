// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ICLUMEngine
/// @notice Interface for the Constant-Log-Utility Market Maker engine
interface ICLUMEngine {
    enum OptionType { CALL, PUT }

    event TradeExecuted(
        OptionType indexed optionType,
        uint256 strike,
        uint256 size,
        bool isBuy,
        uint256 cost
    );

    event CostUpdated(int256 oldCost, int256 newCost);

    /// @notice Quote the cost to buy an option from the CLUM
    function quoteBuy(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external view returns (uint256 costWad);

    /// @notice Quote the revenue from selling an option to the CLUM
    function quoteSell(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external view returns (uint256 revenueWad);

    /// @notice Execute a buy trade (only callable by EvOptionManager)
    function executeBuy(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external returns (uint256 costWad);

    /// @notice Execute a sell trade (only callable by EvOptionManager)
    function executeSell(
        OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external returns (uint256 revenueWad);

    /// @notice Verify and set cost from off-chain computation
    function verifyAndSetCost(int256 proposedCost, int256[] calldata newQuantities) external;

    /// @notice Get risk-neutral prices (implied probabilities) for each bucket
    function getRiskNeutralPrices() external view returns (uint256[] memory);

    /// @notice Get implied distribution: midpoints and probabilities
    function getImpliedDistribution()
        external
        view
        returns (uint256[] memory midpoints, uint256[] memory probabilities);

    /// @notice Get the quantity held by traders for a bucket
    function getQuantity(uint256 bucketIndex) external view returns (int256);

    /// @notice Get the cached cost function value C(q)
    function getCachedCost() external view returns (int256);

    /// @notice Get the constant utility level U
    function getUtilityLevel() external view returns (int256);

    /// @notice Get the number of outcome buckets
    function getNumBuckets() external view returns (uint256);
}
