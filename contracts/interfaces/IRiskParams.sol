// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IRiskParams
 * @notice Interface for the Risk Parameters contract
 * @dev Defines configurable risk parameters for the perpetual options protocol
 */
interface IRiskParams {
    /// @notice Get the minimum collateralization ratio (scaled by 1e18)
    function minCollateralRatio() external view returns (uint256);

    /// @notice Get the maintenance collateralization ratio for liquidation (scaled by 1e18)
    function maintenanceRatio() external view returns (uint256);

    /// @notice Get the liquidation bonus/penalty percentage (scaled by 1e18)
    function liquidationBonus() external view returns (uint256);

    /// @notice Get the base implied volatility for pricing (scaled by 1e18)
    function baseImpliedVolatility() external view returns (uint256);

    /// @notice Get the maximum funding rate per second (scaled by 1e18)
    function maxFundingRatePerSecond() external view returns (uint256);

    /// @notice Get the oracle staleness threshold in seconds
    function oracleStalenessThreshold() external view returns (uint256);

    /// @notice Get the minimum position size
    function minPositionSize() external view returns (uint256);

    /// @notice Check if the protocol is paused
    function isPaused() external view returns (bool);
}
