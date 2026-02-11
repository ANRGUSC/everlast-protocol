// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IOptionManager.sol";
import "../interfaces/IFundingOracle.sol";

/**
 * @title MockOptionManager
 * @notice Mock OptionManager that returns configurable position data for testing NFT metadata
 */
contract MockOptionManager {
    IOptionManager.Position private _position;

    function setPosition(
        IFundingOracle.OptionType optionType,
        uint256 strike,
        uint256 size,
        IOptionManager.PositionStatus status
    ) external {
        _position.optionType = optionType;
        _position.strike = strike;
        _position.size = size;
        _position.status = status;
    }

    function getPosition(uint256) external view returns (IOptionManager.Position memory) {
        return _position;
    }
}
