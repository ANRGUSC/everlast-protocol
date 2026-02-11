// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockPriceFeed
 * @notice Mock Chainlink price feed for testing purposes
 */
contract MockPriceFeed {
    uint8 private _decimals;
    string private _description;
    uint256 private _version;
    int256 private _price;
    uint256 private _updatedAt;
    uint80 private _roundId;
    uint80 private _answeredInRound;

    constructor(
        uint8 decimals_,
        string memory description_,
        uint256 version_,
        int256 initialPrice_
    ) {
        _decimals = decimals_;
        _description = description_;
        _version = version_;
        _price = initialPrice_;
        _updatedAt = block.timestamp;
        _roundId = 1;
        _answeredInRound = 1;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function version() external view returns (uint256) {
        return _version;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            _roundId,
            _price,
            _updatedAt,
            _updatedAt,
            _answeredInRound
        );
    }

    function getRoundData(uint80 roundId_)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            roundId_,
            _price,
            _updatedAt,
            _updatedAt,
            roundId_
        );
    }

    /**
     * @notice Update the price (for testing)
     * @param newPrice The new price to set
     */
    function setPrice(int256 newPrice) external {
        _price = newPrice;
        _updatedAt = block.timestamp;
        _roundId++;
        _answeredInRound = _roundId;
    }

    /**
     * @notice Set the answered-in round independently (for testing stale rounds)
     * @param answeredInRound_ The answered-in round to set
     */
    function setAnsweredInRound(uint80 answeredInRound_) external {
        _answeredInRound = answeredInRound_;
    }

    /**
     * @notice Update the timestamp (for testing staleness)
     * @param newTimestamp The new timestamp
     */
    function setUpdatedAt(uint256 newTimestamp) external {
        _updatedAt = newTimestamp;
    }

    /**
     * @notice Get the current price
     */
    function getPrice() external view returns (int256) {
        return _price;
    }
}
