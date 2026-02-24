// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ILPPool.sol";

/// @title LPPool
/// @notice ERC-4626 vault that backs the CLUM market maker with bounded-loss guarantees.
///         LPs deposit USDC; the pool's total assets set the maximum CLUM subsidy.
///         Revenue comes from option premiums and funding fees.
///         Losses are bounded by the initial subsidy C(0).
contract LPPool is ERC4626, Ownable, ReentrancyGuard, ILPPool {
    using SafeERC20 for IERC20;

    /// @notice The CLUM engine address (can draw subsidy / record loss)
    address public clumEngine;

    /// @notice The EvOptionManager address (deposits premiums & funding)
    address public optionManager;

    /// @notice Total premiums received from option trades
    uint256 public totalPremiums;

    /// @notice Total funding fees received
    uint256 public totalFunding;

    /// @notice Total losses recorded by the CLUM
    uint256 public totalLosses;

    /// @notice Capital reserved as subsidy for the CLUM (cannot be withdrawn)
    uint256 public reservedSubsidy;

    error OnlyAuthorized();
    error InsufficientAvailable();

    modifier onlyEngine() {
        if (msg.sender != clumEngine) revert OnlyAuthorized();
        _;
    }

    modifier onlyManager() {
        if (msg.sender != optionManager) revert OnlyAuthorized();
        _;
    }

    modifier onlyEngineOrManager() {
        if (msg.sender != clumEngine && msg.sender != optionManager) revert OnlyAuthorized();
        _;
    }

    constructor(
        IERC20 _usdc,
        string memory _name,
        string memory _symbol
    ) ERC4626(_usdc) ERC20(_name, _symbol) Ownable(msg.sender) {}

    // ─── Admin ──────────────────────────────────────────────────────────

    function setClumEngine(address _engine) external onlyOwner {
        require(_engine != address(0), "Invalid engine");
        clumEngine = _engine;
    }

    function setOptionManager(address _manager) external onlyOwner {
        require(_manager != address(0), "Invalid manager");
        optionManager = _manager;
    }

    /// @notice Reserve a portion of assets as subsidy for the CLUM engine.
    ///         Subsidy cannot be withdrawn by LPs (it backs the CLUM's bounded loss).
    function fundSubsidy(uint256 amount) external onlyOwner {
        require(amount <= _availableAssets(), "Exceeds available");
        reservedSubsidy += amount;
        emit SubsidyFunded(amount);
    }

    /// @notice Release subsidy back to the withdrawable pool (e.g., on shutdown)
    function releaseSubsidy(uint256 amount) external onlyOwner {
        require(amount <= reservedSubsidy, "Exceeds reserved");
        reservedSubsidy -= amount;
    }

    // ─── Revenue / Loss Accounting ──────────────────────────────────────

    /// @notice Receive premium from an option trade (called by EvOptionManager)
    function receivePremium(uint256 amount) external override onlyManager nonReentrant {
        if (amount == 0) return;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        totalPremiums += amount;
        emit PremiumReceived(amount);
    }

    /// @notice Distribute funding fees into the pool (called by EvOptionManager)
    function distributeFunding(uint256 amount) external override onlyManager nonReentrant {
        if (amount == 0) return;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        totalFunding += amount;
        emit FundingDistributed(amount);
    }

    /// @notice Record a loss and transfer funds to the caller to cover payouts
    function recordLoss(uint256 amount) external override onlyEngineOrManager nonReentrant {
        if (amount == 0) return;
        totalLosses += amount;
        if (reservedSubsidy >= amount) {
            reservedSubsidy -= amount;
        } else {
            reservedSubsidy = 0;
        }
        IERC20(asset()).safeTransfer(msg.sender, amount);
        emit LossRecorded(amount);
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getMaxSubsidy() external view override returns (uint256) {
        return reservedSubsidy;
    }

    function getTotalAssets() external view override returns (uint256) {
        return totalAssets();
    }

    // ─── ERC-4626 Overrides ─────────────────────────────────────────────

    /// @notice Override withdraw to prevent withdrawal of reserved subsidy
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        require(assets <= _availableAssets(), "Exceeds withdrawable");
        return super.withdraw(assets, receiver, owner);
    }

    /// @notice Override redeem to prevent redemption of reserved subsidy
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        uint256 assets = convertToAssets(shares);
        require(assets <= _availableAssets(), "Exceeds withdrawable");
        return super.redeem(shares, receiver, owner);
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _availableAssets() internal view returns (uint256) {
        uint256 total = totalAssets();
        return total > reservedSubsidy ? total - reservedSubsidy : 0;
    }
}
