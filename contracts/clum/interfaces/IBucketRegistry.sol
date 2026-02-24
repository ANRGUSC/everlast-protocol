// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IBucketRegistry
/// @notice Interface for the discretized price bucket registry
interface IBucketRegistry {
    event Recentered(uint256 oldCenter, uint256 newCenter);

    /// @notice Total number of buckets (regular + 2 tail buckets)
    function numBuckets() external view returns (uint256);

    /// @notice Get the representative midpoint price for a bucket (WAD)
    function getBucketMidpoint(uint256 index) external view returns (uint256);

    /// @notice Get bucket lower and upper bounds (WAD)
    function getBucketBounds(uint256 index) external view returns (uint256 lower, uint256 upper);

    /// @notice Get the bucket index for a given price (WAD)
    function getBucketIndex(uint256 priceWad) external view returns (uint256);

    /// @notice Get spot price from oracle in WAD
    function getSpotPrice() external view returns (uint256);

    /// @notice Check if the bucket grid should be re-centered
    function needsRebalance() external view returns (bool);

    /// @notice Get current center price of the grid (WAD)
    function getCenterPrice() external view returns (uint256);

    /// @notice Get the width of regular buckets (WAD)
    function getBucketWidth() external view returns (uint256);

    /// @notice Re-center the bucket grid around a new price
    function recenter(uint256 newCenterWad) external;
}
