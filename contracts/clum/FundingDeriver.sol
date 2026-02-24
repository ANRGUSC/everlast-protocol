// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IFundingDeriver.sol";
import "./interfaces/ICLUMEngine.sol";
import "./interfaces/IBucketRegistry.sol";
import "./CLUMMath.sol";

/// @title FundingDeriver
/// @notice Derives funding rates from the CLUM's implied probability distribution
///         instead of using a parametric Black-Scholes approximation.
///
///         For an everlasting option, the funding rate is (mark - payoff) / fundingPeriod.
///         The mark price is the expected payoff under the CLUM's risk-neutral distribution,
///         scaled by the everlasting premium factor (geometric series for rolling portfolio).
///
///         mark_call(K) = premiumFactor * sum_i( p_i * max(mid_i - K, 0) )
///         mark_put(K)  = premiumFactor * sum_i( p_i * max(K - mid_i, 0) )
///
///         where premiumFactor > 1 captures time value for the everlasting structure.
///         For once-daily funding: premiumFactor = 2 (since the equivalent portfolio
///         sums to 1 contract as a geometric series with ratio 1/2).
contract FundingDeriver is IFundingDeriver, Ownable {
    using CLUMMath for uint256;

    ICLUMEngine public clumEngine;
    IBucketRegistry public bucketRegistry;

    /// @notice Premium factor for the everlasting option structure (WAD).
    ///         With funding frequency f times per period, factor = (f+1)/f.
    ///         For once-daily: 2e18. For twice-daily: 1.5e18. For continuous: ~1.
    uint256 public premiumFactor;

    /// @notice Funding period in seconds (e.g., 86400 for daily funding)
    uint256 public fundingPeriod;

    /// @notice Maximum funding rate per second as fraction of mark (WAD)
    uint256 public maxFundingRatePerSecond;

    uint256 private constant WAD = 1e18;

    error InvalidConfig();

    constructor(
        address _clumEngine,
        address _bucketRegistry,
        uint256 _premiumFactor,
        uint256 _fundingPeriod
    ) Ownable(msg.sender) {
        require(_clumEngine != address(0) && _bucketRegistry != address(0), "Invalid address");
        require(_premiumFactor >= WAD, "Factor must be >= 1");
        require(_fundingPeriod > 0, "Zero period");

        clumEngine = ICLUMEngine(_clumEngine);
        bucketRegistry = IBucketRegistry(_bucketRegistry);
        premiumFactor = _premiumFactor;
        fundingPeriod = _fundingPeriod;
        maxFundingRatePerSecond = WAD / 1000; // 0.1% per second cap
    }

    // ─── Configuration ──────────────────────────────────────────────────

    function setPremiumFactor(uint256 _factor) external onlyOwner {
        require(_factor >= WAD, "Factor must be >= 1");
        premiumFactor = _factor;
    }

    function setFundingPeriod(uint256 _period) external onlyOwner {
        require(_period > 0, "Zero period");
        fundingPeriod = _period;
    }

    function setMaxFundingRate(uint256 _rate) external onlyOwner {
        maxFundingRatePerSecond = _rate;
    }

    // ─── Core Pricing ───────────────────────────────────────────────────

    /// @notice Get the CLUM-implied mark price for an option
    /// @param optionType CALL or PUT
    /// @param strikeWad Strike price in WAD
    /// @return markWad Mark price in WAD
    function getMarkPrice(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad
    ) public view override returns (uint256 markWad) {
        uint256[] memory probs = clumEngine.getRiskNeutralPrices();
        uint256 n = probs.length;

        uint256 expectedPayoff = 0;

        for (uint256 i = 0; i < n; i++) {
            uint256 mid = bucketRegistry.getBucketMidpoint(i);
            uint256 payoff;

            if (optionType == ICLUMEngine.OptionType.CALL) {
                payoff = mid > strikeWad ? mid - strikeWad : 0;
            } else {
                payoff = strikeWad > mid ? strikeWad - mid : 0;
            }

            if (payoff > 0) {
                expectedPayoff += CLUMMath.mulWad(probs[i], payoff);
            }
        }

        // Mark = expectedPayoff * premiumFactor
        markWad = CLUMMath.mulWad(expectedPayoff, premiumFactor);
    }

    /// @notice Get the intrinsic value (immediate payoff) of an option
    function getIntrinsicValue(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad
    ) public view override returns (uint256) {
        uint256 spotWad = bucketRegistry.getSpotPrice();

        if (optionType == ICLUMEngine.OptionType.CALL) {
            return spotWad > strikeWad ? spotWad - strikeWad : 0;
        } else {
            return strikeWad > spotWad ? strikeWad - spotWad : 0;
        }
    }

    /// @notice Get funding rate per second for a given option position
    /// @dev funding_per_second = (mark - payoff) * size / fundingPeriod / WAD
    function getFundingPerSecond(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external view override returns (uint256) {
        uint256 mark = getMarkPrice(optionType, strikeWad);
        uint256 intrinsic = getIntrinsicValue(optionType, strikeWad);

        // Time value = mark - intrinsic (always >= 0 by construction)
        uint256 timeValue = mark > intrinsic ? mark - intrinsic : 0;

        // Funding per second = timeValue * size / fundingPeriod / WAD
        uint256 fundingPerSec = (timeValue * sizeWad) / (fundingPeriod * WAD);

        // Cap the funding rate
        uint256 maxRate = CLUMMath.mulWad(maxFundingRatePerSecond, sizeWad);
        return fundingPerSec < maxRate ? fundingPerSec : maxRate;
    }
}
