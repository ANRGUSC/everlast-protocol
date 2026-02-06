// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IOptionManager.sol";
import "./interfaces/ICollateralVault.sol";
import "./interfaces/IPerpetualOptionNFT.sol";
import "./interfaces/IFundingOracle.sol";
import "./interfaces/IRiskParams.sol";
import "./PerpetualOptionNFT.sol";

/**
 * @title OptionManager
 * @notice Core controller for perpetual option position lifecycle
 * @dev Manages opening, funding, exercise, and liquidation of option positions
 */
contract OptionManager is IOptionManager, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @notice The perpetual option NFT contract
    PerpetualOptionNFT public optionNFT;

    /// @notice The USDC collateral vault (for puts)
    ICollateralVault public usdcVault;

    /// @notice The WETH collateral vault (for calls)
    ICollateralVault public wethVault;

    /// @notice The funding oracle
    IFundingOracle public fundingOracle;

    /// @notice The risk parameters
    IRiskParams public riskParams;

    /// @notice USDC token address
    IERC20 public usdc;

    /// @notice WETH token address
    IERC20 public weth;

    /// @notice Mapping of token ID to position data
    mapping(uint256 => Position) private _positions;

    /// @notice Mapping of owner to their short position IDs
    mapping(address => uint256[]) private _shortPositions;

    /// @notice Scaling factor for calculations
    uint256 private constant SCALE = 1e18;

    /// @notice USDC decimals
    uint256 private constant USDC_DECIMALS = 6;

    /// @notice Errors
    error ProtocolPaused();
    error InvalidPosition();
    error PositionNotActive();
    error NotLongOwner();
    error NotShortOwner();
    error InsufficientCollateral();
    error InsufficientFunding();
    error PositionNotLiquidatable();
    error OptionNotInTheMoney();
    error ZeroAmount();
    error InvalidStrike();
    error InvalidSize();

    /**
     * @notice Modifier to check protocol is not paused
     */
    modifier whenNotPaused() {
        if (riskParams.isPaused()) revert ProtocolPaused();
        _;
    }

    /**
     * @notice Initialize the Option Manager
     * @param _optionNFT The perpetual option NFT contract
     * @param _usdcVault The USDC collateral vault
     * @param _wethVault The WETH collateral vault
     * @param _fundingOracle The funding oracle
     * @param _riskParams The risk parameters
     * @param _usdc The USDC token address
     * @param _weth The WETH token address
     */
    constructor(
        address _optionNFT,
        address _usdcVault,
        address _wethVault,
        address _fundingOracle,
        address _riskParams,
        address _usdc,
        address _weth
    ) Ownable(msg.sender) {
        require(_optionNFT != address(0), "Invalid NFT");
        require(_usdcVault != address(0), "Invalid USDC vault");
        require(_wethVault != address(0), "Invalid WETH vault");
        require(_fundingOracle != address(0), "Invalid oracle");
        require(_riskParams != address(0), "Invalid risk params");
        require(_usdc != address(0), "Invalid USDC");
        require(_weth != address(0), "Invalid WETH");

        optionNFT = PerpetualOptionNFT(_optionNFT);
        usdcVault = ICollateralVault(_usdcVault);
        wethVault = ICollateralVault(_wethVault);
        fundingOracle = IFundingOracle(_fundingOracle);
        riskParams = IRiskParams(_riskParams);
        usdc = IERC20(_usdc);
        weth = IERC20(_weth);
    }

    /**
     * @notice Open a new option position
     * @param optionType CALL or PUT
     * @param underlying The underlying asset address (should be WETH for this implementation)
     * @param strike The strike price (scaled by 1e6 for USDC)
     * @param size The position size (scaled by 1e18)
     * @param longOwner The long position holder (NFT recipient)
     * @param initialFunding Initial funding deposit by long (scaled by 1e6 for USDC)
     * @return tokenId The minted NFT token ID
     */
    function openPosition(
        IFundingOracle.OptionType optionType,
        address underlying,
        uint256 strike,
        uint256 size,
        address longOwner,
        uint256 initialFunding
    ) external override whenNotPaused nonReentrant returns (uint256 tokenId) {
        // Validate inputs
        if (strike == 0) revert InvalidStrike();
        if (size < riskParams.minPositionSize()) revert InvalidSize();

        // Calculate required collateral
        uint256 requiredCollateral = _calculateRequiredCollateral(optionType, strike, size);

        // Get next token ID
        tokenId = optionNFT.incrementTokenId();

        // Create position
        Position storage position = _positions[tokenId];
        position.optionType = optionType;
        position.underlying = underlying;
        position.strike = strike;
        position.size = size;
        position.shortOwner = msg.sender;
        position.collateralAmount = requiredCollateral;
        position.lastFundingTime = block.timestamp;
        position.longFundingBalance = initialFunding;
        position.status = PositionStatus.ACTIVE;

        // Track short position
        _shortPositions[msg.sender].push(tokenId);

        // Handle collateral based on option type
        if (optionType == IFundingOracle.OptionType.CALL) {
            // For calls, short deposits WETH
            // Transfer WETH from short to this contract
            weth.safeTransferFrom(msg.sender, address(this), requiredCollateral);
            // Approve vault to spend WETH
            weth.approve(address(wethVault), requiredCollateral);
            // Deposit to vault on behalf of short
            wethVault.deposit(requiredCollateral, msg.sender);
            // Reserve the collateral for this position
            wethVault.reserveCollateral(msg.sender, requiredCollateral, tokenId);
        } else {
            // For puts, short deposits USDC
            // Collateral = strike * size / 1e18
            uint256 usdcCollateral = (strike * size) / SCALE;
            position.collateralAmount = usdcCollateral;

            // Transfer USDC from short to this contract
            usdc.safeTransferFrom(msg.sender, address(this), usdcCollateral);
            // Approve vault to spend USDC
            usdc.approve(address(usdcVault), usdcCollateral);
            usdcVault.deposit(usdcCollateral, msg.sender);
            usdcVault.reserveCollateral(msg.sender, usdcCollateral, tokenId);
        }

        // Collect initial funding from long
        if (initialFunding > 0) {
            usdc.safeTransferFrom(longOwner, address(this), initialFunding);
        }

        // Mint NFT to long
        optionNFT.mint(longOwner, tokenId);

        emit PositionOpened(
            tokenId,
            longOwner,
            msg.sender,
            optionType,
            underlying,
            strike,
            size,
            position.collateralAmount
        );
    }

    /**
     * @notice Calculate required collateral for a position
     * @param optionType CALL or PUT
     * @param strike The strike price (1e6)
     * @param size The position size (1e18)
     */
    function _calculateRequiredCollateral(
        IFundingOracle.OptionType optionType,
        uint256 strike,
        uint256 size
    ) internal view returns (uint256) {
        uint256 minRatio = riskParams.minCollateralRatio();

        if (optionType == IFundingOracle.OptionType.CALL) {
            // For calls, collateral is in WETH
            // Required = size * minRatio
            return (size * minRatio) / SCALE;
        } else {
            // For puts, collateral is in USDC
            // Required = strike * size * minRatio / 1e18
            return (strike * size * minRatio) / (SCALE * SCALE);
        }
    }

    /**
     * @notice Exercise an option
     * @param tokenId The position token ID
     */
    function exercise(uint256 tokenId) external override whenNotPaused nonReentrant {
        Position storage position = _positions[tokenId];

        if (position.status != PositionStatus.ACTIVE) revert PositionNotActive();

        address longOwner = optionNFT.ownerOf(tokenId);
        if (msg.sender != longOwner) revert NotLongOwner();

        // Accrue any pending funding first
        _accrueFunding(tokenId);

        // Check if option is in the money
        uint256 intrinsic = fundingOracle.getIntrinsicValue(
            position.optionType,
            position.underlying,
            position.strike
        );

        if (intrinsic == 0) revert OptionNotInTheMoney();

        address shortOwner = position.shortOwner;

        if (position.optionType == IFundingOracle.OptionType.CALL) {
            // Call exercise: Long pays strike, receives underlying
            uint256 strikeCost = (position.strike * position.size) / SCALE;

            // Long pays strike price in USDC
            usdc.safeTransferFrom(longOwner, shortOwner, strikeCost);

            // Transfer WETH from vault to long
            wethVault.withdrawCollateralTo(tokenId, longOwner, position.size);
        } else {
            // Put exercise: Long delivers underlying, receives strike
            // Long sends WETH to short
            weth.safeTransferFrom(longOwner, shortOwner, position.size);

            // Transfer USDC from vault to long
            uint256 strikeAmount = (position.strike * position.size) / SCALE;
            usdcVault.withdrawCollateralTo(tokenId, longOwner, strikeAmount);
        }

        // Return any remaining funding balance to long
        if (position.longFundingBalance > 0) {
            usdc.safeTransfer(longOwner, position.longFundingBalance);
            position.longFundingBalance = 0;
        }

        // Update position status
        position.status = PositionStatus.EXERCISED;

        // Burn the NFT
        optionNFT.burn(tokenId);

        emit PositionExercised(tokenId, longOwner, shortOwner, intrinsic * position.size / SCALE);
    }

    /**
     * @notice Liquidate an undercollateralized position
     * @param tokenId The position token ID
     */
    function liquidate(uint256 tokenId) external override whenNotPaused nonReentrant {
        Position storage position = _positions[tokenId];

        if (position.status != PositionStatus.ACTIVE) revert PositionNotActive();
        if (!_isLiquidatable(position)) revert PositionNotLiquidatable();

        // Accrue funding first
        _accrueFunding(tokenId);

        address longOwner = optionNFT.ownerOf(tokenId);
        address liquidator = msg.sender;

        // Calculate intrinsic value (what long is owed)
        uint256 intrinsic = fundingOracle.getIntrinsicValue(
            position.optionType,
            position.underlying,
            position.strike
        );

        uint256 longPayout = (intrinsic * position.size) / SCALE;
        uint256 liquidatorReward;

        if (position.optionType == IFundingOracle.OptionType.CALL) {
            // Liquidator receives WETH collateral at discount
            uint256 collateralValue = position.collateralAmount;
            uint256 bonus = (collateralValue * riskParams.liquidationBonus()) / SCALE;
            liquidatorReward = collateralValue - longPayout;

            // Pay long their intrinsic value (in USDC from liquidator)
            if (longPayout > 0) {
                // Convert WETH intrinsic to USDC value
                uint256 spotPrice = fundingOracle.getSpotPrice(position.underlying) / 100; // to 1e6
                uint256 usdcPayout = (longPayout * spotPrice) / SCALE;
                usdc.safeTransferFrom(liquidator, longOwner, usdcPayout);
            }

            // Transfer WETH collateral to liquidator
            wethVault.withdrawCollateralTo(tokenId, liquidator, position.collateralAmount);
        } else {
            // For puts, pay from USDC collateral
            uint256 bonus = (longPayout * riskParams.liquidationBonus()) / SCALE;

            // Pay long their intrinsic value
            if (longPayout > 0 && longPayout <= position.collateralAmount) {
                usdcVault.withdrawCollateralTo(tokenId, longOwner, longPayout);
            }

            // Remaining goes to liquidator as reward
            liquidatorReward = position.collateralAmount - longPayout;
            if (liquidatorReward > 0) {
                usdcVault.withdrawCollateralTo(tokenId, liquidator, liquidatorReward);
            }
        }

        // Return any remaining funding balance to long
        if (position.longFundingBalance > 0) {
            usdc.safeTransfer(longOwner, position.longFundingBalance);
            position.longFundingBalance = 0;
        }

        // Update position status
        position.status = PositionStatus.LIQUIDATED;

        // Burn the NFT
        optionNFT.burn(tokenId);

        emit PositionLiquidated(tokenId, liquidator, longPayout, liquidatorReward);
    }

    /**
     * @notice Accrue funding for a position
     * @param tokenId The position token ID
     */
    function accrueFunding(uint256 tokenId) external override {
        Position storage position = _positions[tokenId];
        if (position.status != PositionStatus.ACTIVE) revert PositionNotActive();

        _accrueFunding(tokenId);
    }

    /**
     * @notice Internal funding accrual logic
     */
    function _accrueFunding(uint256 tokenId) internal {
        Position storage position = _positions[tokenId];

        if (position.lastFundingTime >= block.timestamp) return;

        uint256 timeElapsed = block.timestamp - position.lastFundingTime;

        // Get funding rate per second
        uint256 fundingPerSecond = fundingOracle.getFundingPerSecond(
            position.optionType,
            position.underlying,
            position.strike,
            position.size
        );

        uint256 fundingOwed = fundingPerSecond * timeElapsed;

        // Check if long can pay
        if (fundingOwed >= position.longFundingBalance) {
            // Long cannot pay - close position due to insufficient funding
            fundingOwed = position.longFundingBalance;
            position.longFundingBalance = 0;

            // Transfer funding to short
            if (fundingOwed > 0) {
                usdc.safeTransfer(position.shortOwner, fundingOwed);
            }

            // Release collateral back to short
            if (position.optionType == IFundingOracle.OptionType.CALL) {
                wethVault.releaseCollateral(position.shortOwner, position.collateralAmount, tokenId);
            } else {
                usdcVault.releaseCollateral(position.shortOwner, position.collateralAmount, tokenId);
            }

            // Close position
            position.status = PositionStatus.CLOSED;
            optionNFT.burn(tokenId);

            emit PositionClosed(tokenId, "Insufficient funding");
            return;
        }

        // Deduct from long's balance
        position.longFundingBalance -= fundingOwed;
        position.lastFundingTime = block.timestamp;

        // Transfer funding to short
        if (fundingOwed > 0) {
            usdc.safeTransfer(position.shortOwner, fundingOwed);
        }

        emit FundingAccrued(tokenId, fundingOwed, block.timestamp);
    }

    /**
     * @notice Deposit additional funding for a long position
     * @param tokenId The position token ID
     * @param amount The amount to deposit (in USDC, scaled by 1e6)
     */
    function depositFunding(uint256 tokenId, uint256 amount) external override whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Position storage position = _positions[tokenId];
        if (position.status != PositionStatus.ACTIVE) revert PositionNotActive();

        // Only long owner can deposit
        address longOwner = optionNFT.ownerOf(tokenId);
        if (msg.sender != longOwner) revert NotLongOwner();

        // Accrue any pending funding first
        _accrueFunding(tokenId);

        // Transfer USDC from long
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Add to funding balance
        position.longFundingBalance += amount;

        emit FundingDeposited(tokenId, amount);
    }

    /**
     * @notice Release excess collateral (for shorts)
     * @param tokenId The position token ID
     * @param amount The amount to release
     */
    function releaseCollateral(uint256 tokenId, uint256 amount) external override whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Position storage position = _positions[tokenId];
        if (position.status != PositionStatus.ACTIVE) revert PositionNotActive();
        if (msg.sender != position.shortOwner) revert NotShortOwner();

        // Accrue funding first
        _accrueFunding(tokenId);

        // Calculate minimum required collateral
        uint256 intrinsic = fundingOracle.getIntrinsicValue(
            position.optionType,
            position.underlying,
            position.strike
        );

        uint256 intrinsicCollateral = (intrinsic * position.size) / SCALE;
        uint256 minRequired = (intrinsicCollateral * riskParams.minCollateralRatio()) / SCALE;

        // Ensure remaining collateral is sufficient
        if (position.collateralAmount - amount < minRequired) {
            revert InsufficientCollateral();
        }

        // Release collateral
        if (position.optionType == IFundingOracle.OptionType.CALL) {
            wethVault.releaseCollateral(position.shortOwner, amount, tokenId);
        } else {
            usdcVault.releaseCollateral(position.shortOwner, amount, tokenId);
        }

        position.collateralAmount -= amount;
    }

    /**
     * @notice Get position data
     * @param tokenId The position token ID
     */
    function getPosition(uint256 tokenId) external view override returns (Position memory) {
        return _positions[tokenId];
    }

    /**
     * @notice Check if a position can be liquidated
     * @param tokenId The position token ID
     */
    function isLiquidatable(uint256 tokenId) external view override returns (bool) {
        Position storage position = _positions[tokenId];
        if (position.status != PositionStatus.ACTIVE) return false;
        return _isLiquidatable(position);
    }

    /**
     * @notice Internal liquidation check
     */
    function _isLiquidatable(Position storage position) internal view returns (bool) {
        uint256 intrinsic = fundingOracle.getIntrinsicValue(
            position.optionType,
            position.underlying,
            position.strike
        );

        if (intrinsic == 0) return false;

        uint256 intrinsicCollateral = (intrinsic * position.size) / SCALE;
        uint256 maintenanceRequired = (intrinsicCollateral * riskParams.maintenanceRatio()) / SCALE;

        // For calls, collateral is in WETH, need to convert intrinsic
        if (position.optionType == IFundingOracle.OptionType.CALL) {
            // Intrinsic in USDC per unit, collateral in WETH
            // Convert collateral value to USDC
            uint256 spotPrice = fundingOracle.getSpotPrice(position.underlying) / 100;
            uint256 collateralValue = (position.collateralAmount * spotPrice) / SCALE;
            return collateralValue < maintenanceRequired;
        } else {
            // Both in USDC
            return position.collateralAmount < maintenanceRequired;
        }
    }

    /**
     * @notice Get the current collateral ratio of a position
     * @param tokenId The position token ID
     */
    function getCollateralRatio(uint256 tokenId) external view override returns (uint256) {
        Position storage position = _positions[tokenId];

        uint256 intrinsic = fundingOracle.getIntrinsicValue(
            position.optionType,
            position.underlying,
            position.strike
        );

        if (intrinsic == 0) return type(uint256).max; // Infinite ratio when OTM

        uint256 intrinsicCollateral = (intrinsic * position.size) / SCALE;

        if (position.optionType == IFundingOracle.OptionType.CALL) {
            uint256 spotPrice = fundingOracle.getSpotPrice(position.underlying) / 100;
            uint256 collateralValue = (position.collateralAmount * spotPrice) / SCALE;
            return (collateralValue * SCALE) / intrinsicCollateral;
        } else {
            return (position.collateralAmount * SCALE) / intrinsicCollateral;
        }
    }

    /**
     * @notice Get short positions for an address
     * @param owner The owner address
     */
    function getShortPositions(address owner) external view returns (uint256[] memory) {
        return _shortPositions[owner];
    }

    /**
     * @notice Get pending funding for a position
     * @param tokenId The position token ID
     */
    function getPendingFunding(uint256 tokenId) external view returns (uint256) {
        Position storage position = _positions[tokenId];

        if (position.status != PositionStatus.ACTIVE) return 0;
        if (position.lastFundingTime >= block.timestamp) return 0;

        uint256 timeElapsed = block.timestamp - position.lastFundingTime;

        uint256 fundingPerSecond = fundingOracle.getFundingPerSecond(
            position.optionType,
            position.underlying,
            position.strike,
            position.size
        );

        return fundingPerSecond * timeElapsed;
    }
}
