// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IFundingOracle.sol";
import "./interfaces/IRiskParams.sol";

/**
 * @title FundingOracle
 * @notice Oracle module for computing mark prices and funding rates for perpetual options
 * @dev Uses Chainlink price feeds and Black-Scholes approximation for pricing
 */
contract FundingOracle is IFundingOracle, Ownable {
    /// @notice Risk parameters contract
    IRiskParams public riskParams;

    /// @notice Mapping of underlying asset to Chainlink price feed
    mapping(address => address) public priceFeeds;

    /// @notice Mapping of underlying asset to custom implied volatility (if set)
    mapping(address => uint256) public customIV;

    /// @notice USDC decimals (6)
    uint256 public constant USDC_DECIMALS = 6;

    /// @notice Price feed decimals (8 for Chainlink)
    uint256 public constant PRICE_DECIMALS = 8;

    /// @notice Scaling factor for calculations (1e18)
    uint256 public constant SCALE = 1e18;

    /// @notice Square root of 2*pi scaled by 1e18 (approximately 2.5066)
    uint256 private constant SQRT_2PI = 2506628274631000000;

    /// @notice Events
    event PriceFeedSet(address indexed underlying, address indexed priceFeed);
    event CustomIVSet(address indexed underlying, uint256 iv);
    event RiskParamsSet(address indexed riskParams);

    /// @notice Errors
    error PriceFeedNotSet();
    error StalePrice();
    error InvalidPrice();

    /**
     * @notice Initialize the oracle with risk parameters
     * @param _riskParams The risk parameters contract address
     */
    constructor(address _riskParams) Ownable(msg.sender) {
        require(_riskParams != address(0), "Invalid risk params");
        riskParams = IRiskParams(_riskParams);
    }

    /**
     * @notice Set the risk parameters contract
     * @param _riskParams The new risk parameters address
     */
    function setRiskParams(address _riskParams) external onlyOwner {
        require(_riskParams != address(0), "Invalid address");
        riskParams = IRiskParams(_riskParams);
        emit RiskParamsSet(_riskParams);
    }

    /**
     * @notice Set a Chainlink price feed for an underlying asset
     * @param underlying The underlying asset address
     * @param priceFeed The Chainlink aggregator address
     */
    function setPriceFeed(address underlying, address priceFeed) external onlyOwner {
        require(underlying != address(0), "Invalid underlying");
        require(priceFeed != address(0), "Invalid price feed");
        priceFeeds[underlying] = priceFeed;
        emit PriceFeedSet(underlying, priceFeed);
    }

    /**
     * @notice Set a custom implied volatility for an underlying asset
     * @param underlying The underlying asset address
     * @param iv The implied volatility (scaled by 1e18, e.g., 80% = 0.8e18)
     */
    function setCustomIV(address underlying, uint256 iv) external onlyOwner {
        require(iv >= 0.01e18 && iv <= 10e18, "IV out of range");
        customIV[underlying] = iv;
        emit CustomIVSet(underlying, iv);
    }

    /**
     * @notice Get the current spot price of the underlying asset
     * @param underlying The underlying asset address
     * @return price The current price in USD (scaled by 1e8)
     */
    function getSpotPrice(address underlying) public view override returns (uint256 price) {
        address feedAddress = priceFeeds[underlying];
        if (feedAddress == address(0)) revert PriceFeedNotSet();

        AggregatorV3Interface feed = AggregatorV3Interface(feedAddress);

        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = feed.latestRoundData();

        // Check for stale data
        if (updatedAt < block.timestamp - riskParams.oracleStalenessThreshold()) {
            revert StalePrice();
        }

        // Check for valid round
        if (answeredInRound < roundId) {
            revert StalePrice();
        }

        // Check for valid price
        if (answer <= 0) {
            revert InvalidPrice();
        }

        price = uint256(answer);
    }

    /**
     * @notice Get the implied volatility for an underlying
     * @param underlying The underlying asset address
     * @return iv The implied volatility (scaled by 1e18)
     */
    function getImpliedVolatility(address underlying) public view returns (uint256 iv) {
        iv = customIV[underlying];
        if (iv == 0) {
            iv = riskParams.baseImpliedVolatility();
        }
    }

    /**
     * @notice Get the mark price for an option
     * @dev Uses a simplified Black-Scholes approximation for perpetual options
     * @param optionType The type of option (CALL or PUT)
     * @param underlying The underlying asset address
     * @param strike The strike price (scaled by 1e6 for USDC)
     * @return markPrice The mark price (scaled by 1e6)
     */
    function getMarkPrice(
        OptionType optionType,
        address underlying,
        uint256 strike
    ) public view override returns (uint256 markPrice) {
        uint256 spotPrice8 = getSpotPrice(underlying);
        // Convert spot from 8 decimals to 6 decimals (USDC)
        uint256 spot = spotPrice8 / 100;

        uint256 intrinsic = _calculateIntrinsic(optionType, spot, strike);
        uint256 timeValue = _calculateTimeValue(underlying, spot, strike);

        // Mark price = intrinsic + time value
        markPrice = intrinsic + timeValue;
    }

    /**
     * @notice Get the intrinsic value of an option
     * @param optionType The type of option (CALL or PUT)
     * @param underlying The underlying asset address
     * @param strike The strike price (scaled by 1e6)
     * @return intrinsic The intrinsic value (scaled by 1e6)
     */
    function getIntrinsicValue(
        OptionType optionType,
        address underlying,
        uint256 strike
    ) public view override returns (uint256 intrinsic) {
        uint256 spotPrice8 = getSpotPrice(underlying);
        // Convert spot from 8 decimals to 6 decimals (USDC)
        uint256 spot = spotPrice8 / 100;

        intrinsic = _calculateIntrinsic(optionType, spot, strike);
    }

    /**
     * @notice Get the funding rate per second for a position
     * @dev Funding = (markPrice - intrinsicValue) * size per second
     * @param underlying The underlying asset address
     * @param strike The strike price (scaled by 1e6)
     * @param size The position size (scaled by 1e18)
     * @return fundingPerSecond The funding amount per second (scaled by 1e6)
     */
    function getFundingPerSecond(
        OptionType,
        address underlying,
        uint256 strike,
        uint256 size
    ) external view override returns (uint256 fundingPerSecond) {
        uint256 spotPrice8 = getSpotPrice(underlying);
        uint256 spot = spotPrice8 / 100; // Convert to 6 decimals

        uint256 timeValue = _calculateTimeValue(underlying, spot, strike);

        // Funding per second = time_value * size / (365 * 24 * 3600)
        // This gives the cost of holding the option per second
        // We use a 365-day year for the funding calculation
        uint256 secondsPerYear = 365 * 24 * 3600;

        // Calculate funding: (timeValue * size) / (secondsPerYear * 1e18)
        // timeValue is in 1e6, size is in 1e18
        // Result should be in 1e6
        fundingPerSecond = (timeValue * size) / (secondsPerYear * SCALE);

        // Cap the funding rate
        uint256 maxFunding = riskParams.maxFundingRatePerSecond() * size / SCALE;
        if (fundingPerSecond > maxFunding) {
            fundingPerSecond = maxFunding;
        }
    }

    /**
     * @notice Check if the oracle data is fresh
     * @param underlying The underlying asset address
     * @return isFresh True if the data is fresh
     */
    function isOracleFresh(address underlying) external view override returns (bool isFresh) {
        address feedAddress = priceFeeds[underlying];
        if (feedAddress == address(0)) return false;

        AggregatorV3Interface feed = AggregatorV3Interface(feedAddress);

        try feed.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80 answeredInRound
        ) {
            if (updatedAt < block.timestamp - riskParams.oracleStalenessThreshold()) {
                return false;
            }
            if (answeredInRound < roundId) {
                return false;
            }
            if (answer <= 0) {
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @notice Calculate intrinsic value
     * @param optionType CALL or PUT
     * @param spot Current spot price (1e6)
     * @param strike Strike price (1e6)
     */
    function _calculateIntrinsic(
        OptionType optionType,
        uint256 spot,
        uint256 strike
    ) internal pure returns (uint256) {
        if (optionType == OptionType.CALL) {
            return spot > strike ? spot - strike : 0;
        } else {
            return strike > spot ? strike - spot : 0;
        }
    }

    /**
     * @notice Calculate time value using simplified Black-Scholes approximation
     * @dev For perpetual options, we use an approximation based on IV and moneyness
     * @param underlying The underlying asset
     * @param spot Current spot price (1e6)
     * @param strike Strike price (1e6)
     */
    function _calculateTimeValue(
        address underlying,
        uint256 spot,
        uint256 strike
    ) internal view returns (uint256) {
        uint256 iv = getImpliedVolatility(underlying);

        // Simplified time value calculation for perpetual options
        // Time value ≈ spot * IV * 0.4 * sqrt(moneyness factor)
        // This is a rough approximation; in production, a proper BS implementation would be used

        // Calculate moneyness = spot / strike
        // Both are in 1e6, result in 1e18 for precision
        uint256 moneyness = (spot * SCALE) / strike;

        // Calculate deviation from ATM (how far from 1.0)
        uint256 deviation;
        if (moneyness > SCALE) {
            deviation = moneyness - SCALE;
        } else {
            deviation = SCALE - moneyness;
        }

        // Time value decreases as option goes further ITM or OTM
        // At ATM, time value is maximum
        // Factor = 1 - (deviation / 2), capped at 0.1
        uint256 factor;
        if (deviation >= 2 * SCALE) {
            factor = SCALE / 10; // 10% minimum factor
        } else {
            factor = SCALE - (deviation / 2);
            if (factor < SCALE / 10) {
                factor = SCALE / 10;
            }
        }

        // Time value ≈ spot * IV * 0.4 * factor
        // spot is 1e6, iv is 1e18, factor is 1e18
        // Result should be in 1e6
        uint256 timeValue = (spot * iv * 4 * factor) / (10 * SCALE * SCALE);

        return timeValue;
    }

    /**
     * @notice Helper to get the spot price in USDC decimals (1e6)
     * @param underlying The underlying asset address
     */
    function getSpotPriceUSDC(address underlying) external view returns (uint256) {
        uint256 spotPrice8 = getSpotPrice(underlying);
        return spotPrice8 / 100; // Convert from 8 to 6 decimals
    }
}
