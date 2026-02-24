// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IBucketRegistry.sol";
import "./CLUMMath.sol";

/// @title BucketRegistry
/// @notice Manages a discretized price space for the CLUM engine
/// @dev Divides the possible price range into N regular buckets plus 2 tail buckets.
///      Bucket 0 = lower tail [0, lowerEdge).
///      Buckets 1..N = regular uniform-width buckets.
///      Bucket N+1 = upper tail [upperEdge, inf).
contract BucketRegistry is IBucketRegistry, Ownable {
    using CLUMMath for uint256;

    AggregatorV3Interface public priceFeed;

    /// @notice Number of regular (non-tail) buckets
    uint256 public numRegular;

    /// @notice Center price of the bucket grid (WAD)
    uint256 public centerPrice;

    /// @notice Width of each regular bucket (WAD)
    uint256 public bucketWidth;

    /// @notice Lower edge of the regular bucket range (WAD)
    uint256 public lowerEdge;

    /// @notice Upper edge of the regular bucket range (WAD)
    uint256 public upperEdge;

    /// @notice Percentage move (WAD) from center that triggers rebalance
    uint256 public rebalanceThreshold;

    /// @notice Staleness threshold for oracle data (seconds)
    uint256 public oracleStaleness;

    uint256 private constant WAD = 1e18;
    uint256 private constant PRICE_FEED_SCALE = 1e10; // Chainlink 1e8 -> WAD 1e18

    error StalePrice();
    error InvalidPrice();
    error PriceFeedNotSet();
    error InvalidConfig();

    constructor(
        address _priceFeed,
        uint256 _centerPriceWad,
        uint256 _bucketWidthWad,
        uint256 _numRegular,
        uint256 _rebalanceThreshold,
        uint256 _oracleStaleness
    ) Ownable(msg.sender) {
        require(_priceFeed != address(0), "Invalid feed");
        require(_numRegular >= 4 && _numRegular % 2 == 0, "Need even >=4 buckets");
        require(_bucketWidthWad > 0, "Zero width");
        require(_centerPriceWad > (_numRegular / 2) * _bucketWidthWad, "Center too low");

        priceFeed = AggregatorV3Interface(_priceFeed);
        numRegular = _numRegular;
        centerPrice = _centerPriceWad;
        bucketWidth = _bucketWidthWad;
        rebalanceThreshold = _rebalanceThreshold;
        oracleStaleness = _oracleStaleness;

        _rebuildEdges();
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function numBuckets() external view override returns (uint256) {
        return numRegular + 2;
    }

    function getBucketMidpoint(uint256 index) external view override returns (uint256) {
        uint256 total = numRegular + 2;
        require(index < total, "OOB");

        if (index == 0) {
            return lowerEdge / 2;
        }
        if (index == total - 1) {
            return upperEdge + bucketWidth;
        }
        return lowerEdge + (index - 1) * bucketWidth + bucketWidth / 2;
    }

    function getBucketBounds(uint256 index)
        external
        view
        override
        returns (uint256 lower, uint256 upper)
    {
        uint256 total = numRegular + 2;
        require(index < total, "OOB");

        if (index == 0) {
            return (0, lowerEdge);
        }
        if (index == total - 1) {
            return (upperEdge, type(uint256).max);
        }
        lower = lowerEdge + (index - 1) * bucketWidth;
        upper = lower + bucketWidth;
    }

    function getBucketIndex(uint256 priceWad) external view override returns (uint256) {
        if (priceWad < lowerEdge) return 0;
        if (priceWad >= upperEdge) return numRegular + 1;

        uint256 offset = priceWad - lowerEdge;
        uint256 idx = offset / bucketWidth;
        if (idx >= numRegular) idx = numRegular - 1;
        return idx + 1; // +1 because bucket 0 is the lower tail
    }

    function getSpotPrice() public view override returns (uint256) {
        address feedAddr = address(priceFeed);
        if (feedAddr == address(0)) revert PriceFeedNotSet();

        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        if (block.timestamp - updatedAt > oracleStaleness) revert StalePrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (answer <= 0) revert InvalidPrice();

        return uint256(answer) * PRICE_FEED_SCALE;
    }

    function needsRebalance() external view override returns (bool) {
        try this.getSpotPrice() returns (uint256 spot) {
            uint256 diff = spot > centerPrice
                ? spot - centerPrice
                : centerPrice - spot;
            return diff * WAD / centerPrice > rebalanceThreshold;
        } catch {
            return false;
        }
    }

    function getCenterPrice() external view override returns (uint256) {
        return centerPrice;
    }

    function getBucketWidth() external view override returns (uint256) {
        return bucketWidth;
    }

    // ─── Mutations ──────────────────────────────────────────────────────

    /// @notice Re-center the bucket grid. Permissionless but only succeeds
    ///         if the current spot has moved past the rebalance threshold.
    function recenter(uint256 newCenterWad) external override {
        require(newCenterWad > (numRegular / 2) * bucketWidth, "Center too low");

        uint256 spot = getSpotPrice();
        uint256 diff = spot > centerPrice
            ? spot - centerPrice
            : centerPrice - spot;
        require(diff * WAD / centerPrice > rebalanceThreshold, "No rebalance needed");

        uint256 oldCenter = centerPrice;
        centerPrice = newCenterWad;
        _rebuildEdges();

        emit Recentered(oldCenter, newCenterWad);
    }

    /// @notice Owner can update oracle config
    function setOracleConfig(address _feed, uint256 _staleness) external onlyOwner {
        require(_feed != address(0), "Invalid feed");
        priceFeed = AggregatorV3Interface(_feed);
        oracleStaleness = _staleness;
    }

    /// @notice Owner can update rebalance threshold
    function setRebalanceThreshold(uint256 _threshold) external onlyOwner {
        rebalanceThreshold = _threshold;
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _rebuildEdges() internal {
        uint256 halfSpan = (numRegular / 2) * bucketWidth;
        lowerEdge = centerPrice - halfSpan;
        upperEdge = centerPrice + halfSpan;
    }
}
