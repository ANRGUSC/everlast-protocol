// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title ICollateralVault
 * @notice Interface for the Collateral Vault contract
 * @dev Extends ERC-4626 with additional functions for collateral management
 */
interface ICollateralVault is IERC4626 {
    /// @notice Reserve collateral for a position
    /// @param owner The owner of the collateral
    /// @param amount The amount to reserve
    /// @param positionId The position ID this collateral is reserved for
    function reserveCollateral(address owner, uint256 amount, uint256 positionId) external;

    /// @notice Release reserved collateral back to the owner
    /// @param owner The owner of the collateral
    /// @param amount The amount to release
    /// @param positionId The position ID to release from
    function releaseCollateral(address owner, uint256 amount, uint256 positionId) external;

    /// @notice Withdraw collateral for exercise or liquidation
    /// @param positionId The position ID
    /// @param to The recipient address
    /// @param amount The amount to withdraw
    function withdrawCollateralTo(uint256 positionId, address to, uint256 amount) external;

    /// @notice Get the reserved collateral for a position
    /// @param positionId The position ID
    function getReservedCollateral(uint256 positionId) external view returns (uint256);

    /// @notice Get the total reserved collateral for an owner
    /// @param owner The owner address
    function getTotalReservedFor(address owner) external view returns (uint256);

    /// @notice Get available (unreserved) balance for an owner
    /// @param owner The owner address
    function getAvailableBalance(address owner) external view returns (uint256);
}
