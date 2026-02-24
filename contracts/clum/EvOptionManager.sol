// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IEvOptionManager.sol";
import "./interfaces/ICLUMEngine.sol";
import "./interfaces/IBucketRegistry.sol";
import "./interfaces/ILPPool.sol";
import "./interfaces/IFundingDeriver.sol";
import "./interfaces/IArbitrageGuard.sol";
import "./PositionTokens.sol";
import "./CLUMMath.sol";

/// @title EvOptionManager
/// @notice Core controller for the CLUM-based everlasting options protocol.
///         Replaces the peer-to-peer OptionManager with a pooled AMM model.
///
///         Trade flow:
///           1. Trader calls buyOption(type, strike, size, initialFunding)
///           2. ArbitrageGuard validates the trade
///           3. CLUMEngine computes and executes the trade (returns premium cost)
///           4. USDC premium is collected from the trader and sent to the LP pool
///           5. ERC-1155 position token is minted to the trader
///           6. Ongoing: funding accrues based on CLUM-derived rates
///
///         Selling flow:
///           1. Trader calls sellOption(tokenId, size)
///           2. CLUMEngine computes revenue for selling back
///           3. USDC revenue is paid from LP pool to trader
///           4. Position token is burned
contract EvOptionManager is IEvOptionManager, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using CLUMMath for uint256;

    uint256 private constant WAD = 1e18;
    uint256 private constant USDC_TO_WAD = 1e12; // 1e6 -> 1e18
    uint256 private constant WAD_TO_USDC = 1e12; // 1e18 -> 1e6

    ICLUMEngine public clumEngine;
    IBucketRegistry public bucketRegistry;
    ILPPool public lpPool;
    IFundingDeriver public fundingDeriver;
    IArbitrageGuard public arbitrageGuard;
    PositionTokens public positionTokens;
    IERC20 public usdc;

    /// @notice Next position ID (auto-incrementing)
    uint256 public nextPositionId;

    /// @notice Position data keyed by position ID
    mapping(uint256 => Position) private _positions;

    /// @notice Mapping from ERC-1155 token ID to list of position IDs
    mapping(uint256 => uint256[]) private _tokenPositions;

    /// @notice Mapping from owner address to their position IDs
    mapping(address => uint256[]) private _ownerPositions;

    /// @notice Whether the protocol is paused
    bool public paused;

    /// @notice Minimum funding balance to avoid liquidation (USDC, 1e6)
    uint256 public minFundingBalance;

    /// @notice Grace period before a position can be liquidated (seconds)
    uint256 public liquidationGracePeriod;

    error ProtocolPaused();
    error InvalidStrike();
    error InvalidSize();
    error PositionNotActive();
    error NotPositionOwner();
    error OptionNotInTheMoney();
    error NotLiquidatable();
    error InsufficientFunding();

    modifier whenNotPaused() {
        if (paused) revert ProtocolPaused();
        _;
    }

    constructor(
        address _clumEngine,
        address _bucketRegistry,
        address _lpPool,
        address _fundingDeriver,
        address _arbitrageGuard,
        address _positionTokens,
        address _usdc
    ) Ownable(msg.sender) {
        require(_clumEngine != address(0), "Invalid engine");
        require(_bucketRegistry != address(0), "Invalid registry");
        require(_lpPool != address(0), "Invalid pool");
        require(_fundingDeriver != address(0), "Invalid deriver");
        require(_arbitrageGuard != address(0), "Invalid guard");
        require(_positionTokens != address(0), "Invalid tokens");
        require(_usdc != address(0), "Invalid usdc");

        clumEngine = ICLUMEngine(_clumEngine);
        bucketRegistry = IBucketRegistry(_bucketRegistry);
        lpPool = ILPPool(_lpPool);
        fundingDeriver = IFundingDeriver(_fundingDeriver);
        arbitrageGuard = IArbitrageGuard(_arbitrageGuard);
        positionTokens = PositionTokens(_positionTokens);
        usdc = IERC20(_usdc);

        nextPositionId = 1;
        minFundingBalance = 1e6; // 1 USDC minimum
        liquidationGracePeriod = 3600; // 1 hour
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    function setMinFundingBalance(uint256 _min) external onlyOwner {
        minFundingBalance = _min;
    }

    function setLiquidationGracePeriod(uint256 _period) external onlyOwner {
        liquidationGracePeriod = _period;
    }

    // ─── Buy Option ─────────────────────────────────────────────────────

    /// @notice Buy an everlasting option from the CLUM
    /// @param optionType CALL or PUT
    /// @param strike Strike price in USDC (1e6)
    /// @param size Position size in WAD (1e18 = 1 unit)
    /// @param initialFunding Initial funding deposit in USDC (1e6)
    function buyOption(
        ICLUMEngine.OptionType optionType,
        uint256 strike,
        uint256 size,
        uint256 initialFunding
    ) external override whenNotPaused nonReentrant returns (uint256 positionId) {
        if (strike == 0) revert InvalidStrike();
        if (size == 0) revert InvalidSize();

        // Convert strike from USDC (1e6) to WAD (1e18)
        uint256 strikeWad = strike * USDC_TO_WAD;

        // Get premium from CLUM engine
        uint256 premiumWad = clumEngine.quoteBuy(optionType, strikeWad, size);

        // Validate trade with arbitrage guard
        arbitrageGuard.validateTrade(optionType, strikeWad, premiumWad, true);

        // Convert premium from WAD to USDC
        uint256 premiumUsdc = premiumWad / WAD_TO_USDC;
        if (premiumUsdc == 0) premiumUsdc = 1; // minimum 1 unit

        // Collect premium + initial funding from buyer
        uint256 totalCollect = premiumUsdc + initialFunding;
        usdc.safeTransferFrom(msg.sender, address(this), totalCollect);

        // Execute the trade on the CLUM engine
        clumEngine.executeBuy(optionType, strikeWad, size);

        // Send premium to LP pool
        usdc.approve(address(lpPool), premiumUsdc);
        lpPool.receivePremium(premiumUsdc);

        // Create position
        positionId = nextPositionId++;
        _positions[positionId] = Position({
            optionType: optionType,
            strike: strikeWad,
            size: size,
            owner: msg.sender,
            fundingBalance: initialFunding,
            lastFundingTime: block.timestamp,
            isActive: true
        });

        _ownerPositions[msg.sender].push(positionId);

        // Mint ERC-1155 position token
        uint256 tokenId = positionTokens.mint(msg.sender, optionType, strikeWad, size);
        _tokenPositions[tokenId].push(positionId);

        // Record price for arbitrage tracking
        arbitrageGuard.recordPrice(optionType, strikeWad, premiumWad);

        emit OptionBought(msg.sender, positionId, optionType, strikeWad, size, premiumUsdc);
    }

    // ─── Sell Option ────────────────────────────────────────────────────

    /// @notice Sell an option position back to the CLUM
    /// @param positionId The position ID
    /// @param size Amount to sell (WAD). Use position.size for full close.
    function sellOption(
        uint256 positionId,
        uint256 size
    ) external override whenNotPaused nonReentrant returns (uint256 revenue) {
        Position storage pos = _positions[positionId];
        if (!pos.isActive) revert PositionNotActive();
        if (msg.sender != pos.owner) revert NotPositionOwner();
        if (size == 0 || size > pos.size) revert InvalidSize();

        // Accrue pending funding first
        _accrueFunding(positionId);

        // Get revenue from CLUM
        uint256 revenueWad = clumEngine.quoteSell(pos.optionType, pos.strike, size);

        // Execute the sell
        clumEngine.executeSell(pos.optionType, pos.strike, size);

        // Convert revenue to USDC
        uint256 revenueUsdc = revenueWad / WAD_TO_USDC;

        // Pay the seller
        if (revenueUsdc > 0) {
            // LP pool funds the payout
            lpPool.recordLoss(revenueUsdc);
            usdc.safeTransfer(msg.sender, revenueUsdc);
        }

        // Update or close position
        if (size == pos.size) {
            _closePosition(positionId);
        } else {
            pos.size -= size;
            // Burn partial token
            uint256 tokenId = positionTokens.encodeTokenId(pos.optionType, pos.strike);
            positionTokens.burn(msg.sender, tokenId, size);
        }

        revenue = revenueUsdc;
        emit OptionSold(msg.sender, positionId, size, revenueUsdc);
    }

    // ─── Exercise ───────────────────────────────────────────────────────

    /// @notice Exercise an in-the-money option
    function exercise(uint256 positionId) external override whenNotPaused nonReentrant returns (uint256 payout) {
        Position storage pos = _positions[positionId];
        if (!pos.isActive) revert PositionNotActive();
        if (msg.sender != pos.owner) revert NotPositionOwner();

        // Accrue funding
        _accrueFunding(positionId);

        // Get intrinsic value
        uint256 intrinsicWad = fundingDeriver.getIntrinsicValue(pos.optionType, pos.strike);
        if (intrinsicWad == 0) revert OptionNotInTheMoney();

        // Payout = intrinsic * size / WAD (in WAD), then convert to USDC
        uint256 payoutWad = CLUMMath.mulWad(intrinsicWad, pos.size);
        uint256 payoutUsdc = payoutWad / WAD_TO_USDC;

        // Record the exercise as a loss on the LP pool
        if (payoutUsdc > 0) {
            lpPool.recordLoss(payoutUsdc);
            usdc.safeTransfer(msg.sender, payoutUsdc);
        }

        // Also sell the option back (reduce q in the CLUM)
        clumEngine.executeSell(pos.optionType, pos.strike, pos.size);

        // Return remaining funding
        if (pos.fundingBalance > 0) {
            usdc.safeTransfer(msg.sender, pos.fundingBalance);
            pos.fundingBalance = 0;
        }

        _closePosition(positionId);
        payout = payoutUsdc;

        emit OptionExercised(positionId, msg.sender, payoutUsdc);
    }

    // ─── Funding ────────────────────────────────────────────────────────

    /// @notice Deposit additional funding for a position
    function depositFunding(uint256 positionId, uint256 amount) external override whenNotPaused nonReentrant {
        if (amount == 0) revert InsufficientFunding();

        Position storage pos = _positions[positionId];
        if (!pos.isActive) revert PositionNotActive();
        if (msg.sender != pos.owner) revert NotPositionOwner();

        // Accrue first
        _accrueFunding(positionId);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        pos.fundingBalance += amount;

        emit FundingDeposited(positionId, amount);
    }

    /// @notice Accrue pending funding for a position (permissionless)
    function accrueFunding(uint256 positionId) external override {
        Position storage pos = _positions[positionId];
        if (!pos.isActive) revert PositionNotActive();
        _accrueFunding(positionId);
    }

    // ─── Liquidation ────────────────────────────────────────────────────

    /// @notice Liquidate a position whose funding has been depleted
    function liquidate(uint256 positionId) external override whenNotPaused nonReentrant {
        Position storage pos = _positions[positionId];
        if (!pos.isActive) revert PositionNotActive();

        // Accrue funding to check current state
        _accrueFunding(positionId);

        if (!_isLiquidatable(pos)) revert NotLiquidatable();

        // Sell the option back to the CLUM at market price
        if (pos.size > 0) {
            try clumEngine.executeSell(pos.optionType, pos.strike, pos.size) returns (uint256 revenueWad) {
                uint256 revenueUsdc = revenueWad / WAD_TO_USDC;
                if (revenueUsdc > 0) {
                    // Revenue goes to the LP pool as compensation
                    usdc.approve(address(lpPool), revenueUsdc);
                    lpPool.receivePremium(revenueUsdc);
                }
            } catch {
                // If sell fails, just close the position
            }
        }

        // Remaining funding balance goes to liquidator as reward
        uint256 reward = pos.fundingBalance;
        if (reward > 0) {
            pos.fundingBalance = 0;
            usdc.safeTransfer(msg.sender, reward);
        }

        _closePosition(positionId);

        emit PositionLiquidated(positionId, msg.sender);
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getPosition(uint256 positionId) external view override returns (Position memory) {
        return _positions[positionId];
    }

    function isLiquidatable(uint256 positionId) external view override returns (bool) {
        Position storage pos = _positions[positionId];
        if (!pos.isActive) return false;
        return _isLiquidatable(pos);
    }

    function getOwnerPositions(address owner) external view returns (uint256[] memory) {
        return _ownerPositions[owner];
    }

    /// @notice Get pending funding owed for a position
    function getPendingFunding(uint256 positionId) external view returns (uint256) {
        Position storage pos = _positions[positionId];
        if (!pos.isActive || pos.lastFundingTime >= block.timestamp) return 0;

        uint256 elapsed = block.timestamp - pos.lastFundingTime;
        uint256 fundingPerSec = fundingDeriver.getFundingPerSecond(
            pos.optionType, pos.strike, pos.size
        );
        // fundingPerSec is in WAD, convert to USDC
        return (fundingPerSec * elapsed) / WAD_TO_USDC;
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _accrueFunding(uint256 positionId) internal {
        Position storage pos = _positions[positionId];
        if (pos.lastFundingTime >= block.timestamp) return;

        uint256 elapsed = block.timestamp - pos.lastFundingTime;

        uint256 fundingPerSec = fundingDeriver.getFundingPerSecond(
            pos.optionType, pos.strike, pos.size
        );

        // fundingPerSec is in WAD, convert to USDC
        uint256 fundingOwedUsdc = (fundingPerSec * elapsed) / WAD_TO_USDC;

        if (fundingOwedUsdc == 0) {
            pos.lastFundingTime = block.timestamp;
            return;
        }

        if (fundingOwedUsdc >= pos.fundingBalance) {
            // Drain remaining funding
            fundingOwedUsdc = pos.fundingBalance;
            pos.fundingBalance = 0;
        } else {
            pos.fundingBalance -= fundingOwedUsdc;
        }

        pos.lastFundingTime = block.timestamp;

        // Send funding to LP pool
        if (fundingOwedUsdc > 0) {
            usdc.approve(address(lpPool), fundingOwedUsdc);
            lpPool.distributeFunding(fundingOwedUsdc);
        }

        emit FundingAccrued(positionId, fundingOwedUsdc, block.timestamp);
    }

    function _isLiquidatable(Position storage pos) internal view returns (bool) {
        if (!pos.isActive) return false;

        // Position is liquidatable if funding balance is below minimum
        if (pos.fundingBalance < minFundingBalance) {
            // Check if grace period has passed
            uint256 elapsed = block.timestamp - pos.lastFundingTime;
            return elapsed > liquidationGracePeriod;
        }

        // Also check if pending funding would drain the balance
        uint256 fundingPerSec = fundingDeriver.getFundingPerSecond(
            pos.optionType, pos.strike, pos.size
        );
        if (fundingPerSec == 0) return false;

        // Time until funding runs out (in USDC / per-second-WAD * WAD_TO_USDC)
        uint256 fundingBalanceWad = pos.fundingBalance * WAD_TO_USDC;
        uint256 timeRemaining = fundingBalanceWad / fundingPerSec;

        // Liquidatable if < 1 hour of funding remaining
        return timeRemaining < liquidationGracePeriod;
    }

    function _closePosition(uint256 positionId) internal {
        Position storage pos = _positions[positionId];
        pos.isActive = false;

        // Burn the ERC-1155 token
        uint256 tokenId = positionTokens.encodeTokenId(pos.optionType, pos.strike);
        if (positionTokens.balanceOf(pos.owner, tokenId) >= pos.size) {
            positionTokens.burn(pos.owner, tokenId, pos.size);
        }

        // Return remaining funding
        if (pos.fundingBalance > 0) {
            usdc.safeTransfer(pos.owner, pos.fundingBalance);
            pos.fundingBalance = 0;
        }
    }
}
