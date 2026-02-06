// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IFundingOracle.sol";

/**
 * @title IOptionManager
 * @notice Interface for the Option Manager contract
 * @dev Core controller for option lifecycle management
 */
interface IOptionManager {
    /// @notice Position status enum
    enum PositionStatus { ACTIVE, EXERCISED, LIQUIDATED, CLOSED }

    /// @notice Position struct containing all option position data
    struct Position {
        IFundingOracle.OptionType optionType;
        address underlying;
        uint256 strike;
        uint256 size;
        address shortOwner;
        uint256 collateralAmount;
        uint256 lastFundingTime;
        uint256 longFundingBalance;
        PositionStatus status;
    }

    /// @notice Event emitted when a new position is opened
    event PositionOpened(
        uint256 indexed tokenId,
        address indexed longOwner,
        address indexed shortOwner,
        IFundingOracle.OptionType optionType,
        address underlying,
        uint256 strike,
        uint256 size,
        uint256 collateral
    );

    /// @notice Event emitted when a position is exercised
    event PositionExercised(
        uint256 indexed tokenId,
        address indexed longOwner,
        address indexed shortOwner,
        uint256 payoff
    );

    /// @notice Event emitted when a position is liquidated
    event PositionLiquidated(
        uint256 indexed tokenId,
        address indexed liquidator,
        uint256 longPayout,
        uint256 liquidatorReward
    );

    /// @notice Event emitted when funding is accrued
    event FundingAccrued(
        uint256 indexed tokenId,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Event emitted when a position is closed (rent depleted)
    event PositionClosed(uint256 indexed tokenId, string reason);

    /// @notice Event emitted when long tops up funding balance
    event FundingDeposited(uint256 indexed tokenId, uint256 amount);

    /// @notice Open a new option position
    /// @param optionType CALL or PUT
    /// @param underlying The underlying asset address
    /// @param strike The strike price
    /// @param size The position size
    /// @param longOwner The long position holder (NFT recipient)
    /// @param initialFunding Initial funding deposit by long
    /// @return tokenId The minted NFT token ID
    function openPosition(
        IFundingOracle.OptionType optionType,
        address underlying,
        uint256 strike,
        uint256 size,
        address longOwner,
        uint256 initialFunding
    ) external returns (uint256 tokenId);

    /// @notice Exercise an option
    /// @param tokenId The position token ID
    function exercise(uint256 tokenId) external;

    /// @notice Liquidate an undercollateralized position
    /// @param tokenId The position token ID
    function liquidate(uint256 tokenId) external;

    /// @notice Accrue funding for a position
    /// @param tokenId The position token ID
    function accrueFunding(uint256 tokenId) external;

    /// @notice Deposit additional funding for a long position
    /// @param tokenId The position token ID
    /// @param amount The amount to deposit
    function depositFunding(uint256 tokenId, uint256 amount) external;

    /// @notice Release excess collateral (for shorts)
    /// @param tokenId The position token ID
    /// @param amount The amount to release
    function releaseCollateral(uint256 tokenId, uint256 amount) external;

    /// @notice Get position data
    /// @param tokenId The position token ID
    function getPosition(uint256 tokenId) external view returns (Position memory);

    /// @notice Check if a position can be liquidated
    /// @param tokenId The position token ID
    function isLiquidatable(uint256 tokenId) external view returns (bool);

    /// @notice Get the current collateral ratio of a position
    /// @param tokenId The position token ID
    function getCollateralRatio(uint256 tokenId) external view returns (uint256);
}
