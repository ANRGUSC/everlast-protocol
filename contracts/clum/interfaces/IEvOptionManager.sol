// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ICLUMEngine.sol";

/// @title IEvOptionManager
/// @notice Interface for the upgraded option manager using CLUM-based pricing
interface IEvOptionManager {
    struct Position {
        ICLUMEngine.OptionType optionType;
        uint256 strike;       // WAD
        uint256 size;         // WAD
        address owner;
        uint256 fundingBalance;   // USDC (1e6)
        uint256 lastFundingTime;
        bool isActive;
    }

    event OptionBought(
        address indexed buyer,
        uint256 indexed tokenId,
        ICLUMEngine.OptionType optionType,
        uint256 strike,
        uint256 size,
        uint256 premium
    );

    event OptionSold(
        address indexed seller,
        uint256 indexed tokenId,
        uint256 size,
        uint256 revenue
    );

    event OptionExercised(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 payout
    );

    event FundingAccrued(
        uint256 indexed tokenId,
        uint256 amount,
        uint256 timestamp
    );

    event PositionLiquidated(
        uint256 indexed tokenId,
        address indexed liquidator
    );

    event FundingDeposited(uint256 indexed tokenId, uint256 amount);

    /// @notice Buy an option from the CLUM
    function buyOption(
        ICLUMEngine.OptionType optionType,
        uint256 strike,
        uint256 size,
        uint256 initialFunding
    ) external returns (uint256 tokenId);

    /// @notice Sell an option back to the CLUM
    function sellOption(uint256 tokenId, uint256 size) external returns (uint256 revenue);

    /// @notice Exercise an in-the-money option
    function exercise(uint256 tokenId) external returns (uint256 payout);

    /// @notice Deposit additional funding for a position
    function depositFunding(uint256 tokenId, uint256 amount) external;

    /// @notice Accrue pending funding for a position
    function accrueFunding(uint256 tokenId) external;

    /// @notice Liquidate a position with depleted funding
    function liquidate(uint256 tokenId) external;

    /// @notice Get position data
    function getPosition(uint256 tokenId) external view returns (Position memory);

    /// @notice Check if a position can be liquidated
    function isLiquidatable(uint256 tokenId) external view returns (bool);
}
