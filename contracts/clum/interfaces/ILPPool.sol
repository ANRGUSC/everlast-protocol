// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ILPPool
/// @notice Interface for the LP pool that backs the CLUM market maker
interface ILPPool {
    event SubsidyFunded(uint256 amount);
    event PremiumReceived(uint256 amount);
    event FundingDistributed(uint256 amount);
    event LossRecorded(uint256 amount);

    /// @notice Current maximum subsidy (capital backing the CLUM)
    function getMaxSubsidy() external view returns (uint256);

    /// @notice Receive option premium from trade execution
    function receivePremium(uint256 amount) external;

    /// @notice Distribute funding fees to the pool
    function distributeFunding(uint256 amount) external;

    /// @notice Record a loss from the CLUM (reduces pool assets)
    function recordLoss(uint256 amount) external;

    /// @notice Get total assets available in the pool
    function getTotalAssets() external view returns (uint256);
}
