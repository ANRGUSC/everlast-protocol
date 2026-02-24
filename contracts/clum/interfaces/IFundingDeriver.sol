// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ICLUMEngine.sol";

/// @title IFundingDeriver
/// @notice Interface for deriving funding rates from CLUM implied distribution
interface IFundingDeriver {
    /// @notice Get the CLUM-implied mark price for an option (WAD)
    function getMarkPrice(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad
    ) external view returns (uint256);

    /// @notice Get the intrinsic value (payoff) of an option (WAD)
    function getIntrinsicValue(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad
    ) external view returns (uint256);

    /// @notice Get the funding rate per second for a position (WAD)
    function getFundingPerSecond(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external view returns (uint256);
}
