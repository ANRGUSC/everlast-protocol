// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IRiskParams.sol";

/**
 * @title RiskParams
 * @notice Stores and manages configurable risk parameters for the perpetual options protocol
 * @dev All percentages are scaled by 1e18 (e.g., 150% = 1.5e18)
 */
contract RiskParams is IRiskParams, Ownable {
    /// @notice Minimum collateralization ratio (e.g., 100% = 1e18)
    uint256 public override minCollateralRatio;

    /// @notice Maintenance ratio for liquidation trigger (e.g., 120% = 1.2e18)
    uint256 public override maintenanceRatio;

    /// @notice Liquidation bonus percentage (e.g., 5% = 0.05e18)
    uint256 public override liquidationBonus;

    /// @notice Base implied volatility for pricing (e.g., 80% = 0.8e18)
    uint256 public override baseImpliedVolatility;

    /// @notice Maximum funding rate per second to cap charges
    uint256 public override maxFundingRatePerSecond;

    /// @notice Oracle staleness threshold in seconds
    uint256 public override oracleStalenessThreshold;

    /// @notice Minimum position size in underlying units (scaled by 1e18)
    uint256 public override minPositionSize;

    /// @notice Protocol pause state
    bool public override isPaused;

    /// @notice Events
    event MinCollateralRatioUpdated(uint256 oldValue, uint256 newValue);
    event MaintenanceRatioUpdated(uint256 oldValue, uint256 newValue);
    event LiquidationBonusUpdated(uint256 oldValue, uint256 newValue);
    event BaseImpliedVolatilityUpdated(uint256 oldValue, uint256 newValue);
    event MaxFundingRateUpdated(uint256 oldValue, uint256 newValue);
    event OracleStalenessThresholdUpdated(uint256 oldValue, uint256 newValue);
    event MinPositionSizeUpdated(uint256 oldValue, uint256 newValue);
    event PauseStateChanged(bool isPaused);

    /**
     * @notice Initialize with default risk parameters
     */
    constructor() Ownable(msg.sender) {
        // 100% minimum collateralization (fully collateralized)
        minCollateralRatio = 1e18;

        // 120% maintenance ratio for liquidation
        maintenanceRatio = 1.2e18;

        // 5% liquidation bonus
        liquidationBonus = 0.05e18;

        // 80% base implied volatility
        baseImpliedVolatility = 0.8e18;

        // Max funding rate: ~0.1% per hour = ~2.78e-8 per second
        maxFundingRatePerSecond = 2.78e10; // scaled by 1e18

        // 1 hour staleness threshold
        oracleStalenessThreshold = 3600;

        // Minimum 0.01 ETH position
        minPositionSize = 0.01e18;

        isPaused = false;
    }

    /**
     * @notice Update the minimum collateralization ratio
     * @param _minCollateralRatio New minimum ratio (scaled by 1e18)
     */
    function setMinCollateralRatio(uint256 _minCollateralRatio) external onlyOwner {
        require(_minCollateralRatio >= 1e18, "Ratio must be >= 100%");
        require(_minCollateralRatio <= 2e18, "Ratio must be <= 200%");

        uint256 oldValue = minCollateralRatio;
        minCollateralRatio = _minCollateralRatio;
        emit MinCollateralRatioUpdated(oldValue, _minCollateralRatio);
    }

    /**
     * @notice Update the maintenance ratio
     * @param _maintenanceRatio New maintenance ratio (scaled by 1e18)
     */
    function setMaintenanceRatio(uint256 _maintenanceRatio) external onlyOwner {
        require(_maintenanceRatio >= 1e18, "Ratio must be >= 100%");
        require(_maintenanceRatio <= minCollateralRatio, "Must be <= min collateral ratio");

        uint256 oldValue = maintenanceRatio;
        maintenanceRatio = _maintenanceRatio;
        emit MaintenanceRatioUpdated(oldValue, _maintenanceRatio);
    }

    /**
     * @notice Update the liquidation bonus
     * @param _liquidationBonus New liquidation bonus (scaled by 1e18)
     */
    function setLiquidationBonus(uint256 _liquidationBonus) external onlyOwner {
        require(_liquidationBonus <= 0.2e18, "Bonus must be <= 20%");

        uint256 oldValue = liquidationBonus;
        liquidationBonus = _liquidationBonus;
        emit LiquidationBonusUpdated(oldValue, _liquidationBonus);
    }

    /**
     * @notice Update the base implied volatility
     * @param _baseImpliedVolatility New base IV (scaled by 1e18)
     */
    function setBaseImpliedVolatility(uint256 _baseImpliedVolatility) external onlyOwner {
        require(_baseImpliedVolatility >= 0.1e18, "IV must be >= 10%");
        require(_baseImpliedVolatility <= 5e18, "IV must be <= 500%");

        uint256 oldValue = baseImpliedVolatility;
        baseImpliedVolatility = _baseImpliedVolatility;
        emit BaseImpliedVolatilityUpdated(oldValue, _baseImpliedVolatility);
    }

    /**
     * @notice Update the maximum funding rate per second
     * @param _maxFundingRatePerSecond New max rate (scaled by 1e18)
     */
    function setMaxFundingRatePerSecond(uint256 _maxFundingRatePerSecond) external onlyOwner {
        uint256 oldValue = maxFundingRatePerSecond;
        maxFundingRatePerSecond = _maxFundingRatePerSecond;
        emit MaxFundingRateUpdated(oldValue, _maxFundingRatePerSecond);
    }

    /**
     * @notice Update the oracle staleness threshold
     * @param _oracleStalenessThreshold New threshold in seconds
     */
    function setOracleStalenessThreshold(uint256 _oracleStalenessThreshold) external onlyOwner {
        require(_oracleStalenessThreshold >= 60, "Threshold must be >= 1 minute");
        require(_oracleStalenessThreshold <= 86400, "Threshold must be <= 1 day");

        uint256 oldValue = oracleStalenessThreshold;
        oracleStalenessThreshold = _oracleStalenessThreshold;
        emit OracleStalenessThresholdUpdated(oldValue, _oracleStalenessThreshold);
    }

    /**
     * @notice Update the minimum position size
     * @param _minPositionSize New minimum size (scaled by 1e18)
     */
    function setMinPositionSize(uint256 _minPositionSize) external onlyOwner {
        require(_minPositionSize > 0, "Size must be > 0");

        uint256 oldValue = minPositionSize;
        minPositionSize = _minPositionSize;
        emit MinPositionSizeUpdated(oldValue, _minPositionSize);
    }

    /**
     * @notice Pause or unpause the protocol
     * @param _isPaused New pause state
     */
    function setPaused(bool _isPaused) external onlyOwner {
        isPaused = _isPaused;
        emit PauseStateChanged(_isPaused);
    }
}
