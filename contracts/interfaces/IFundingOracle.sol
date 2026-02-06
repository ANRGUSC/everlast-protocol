// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFundingOracle
 * @notice Interface for the Funding Oracle contract
 * @dev Provides pricing and funding rate calculations for perpetual options
 */
interface IFundingOracle {
    /// @notice Option type enum
    enum OptionType { CALL, PUT }

    /// @notice Get the current spot price of the underlying asset
    /// @param underlying The underlying asset address
    /// @return price The current price in USDC (scaled by 1e8)
    function getSpotPrice(address underlying) external view returns (uint256 price);

    /// @notice Get the mark price for an option
    /// @param optionType The type of option (CALL or PUT)
    /// @param underlying The underlying asset address
    /// @param strike The strike price (scaled by 1e6 for USDC)
    /// @return markPrice The mark price (scaled by 1e6)
    function getMarkPrice(
        OptionType optionType,
        address underlying,
        uint256 strike
    ) external view returns (uint256 markPrice);

    /// @notice Get the intrinsic value of an option
    /// @param optionType The type of option (CALL or PUT)
    /// @param underlying The underlying asset address
    /// @param strike The strike price (scaled by 1e6)
    /// @return intrinsic The intrinsic value (scaled by 1e6)
    function getIntrinsicValue(
        OptionType optionType,
        address underlying,
        uint256 strike
    ) external view returns (uint256 intrinsic);

    /// @notice Get the funding rate per second for a position
    /// @param optionType The type of option (CALL or PUT)
    /// @param underlying The underlying asset address
    /// @param strike The strike price (scaled by 1e6)
    /// @param size The position size (scaled by 1e18)
    /// @return fundingPerSecond The funding amount per second (scaled by 1e6)
    function getFundingPerSecond(
        OptionType optionType,
        address underlying,
        uint256 strike,
        uint256 size
    ) external view returns (uint256 fundingPerSecond);

    /// @notice Check if the oracle data is fresh
    /// @param underlying The underlying asset address
    /// @return isFresh True if the data is fresh
    function isOracleFresh(address underlying) external view returns (bool isFresh);
}
