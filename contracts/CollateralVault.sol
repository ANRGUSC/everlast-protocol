// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ICollateralVault.sol";

/**
 * @title CollateralVault
 * @notice ERC-4626 compliant vault for managing collateral deposits
 * @dev Supports collateral reservation for option positions
 */
contract CollateralVault is ERC4626, Ownable, ReentrancyGuard, ICollateralVault {
    using SafeERC20 for IERC20;

    /// @notice The Option Manager contract address
    address public optionManager;

    /// @notice Mapping of position ID to reserved collateral amount
    mapping(uint256 => uint256) private _reservedCollateral;

    /// @notice Mapping of owner to total reserved collateral
    mapping(address => uint256) private _totalReserved;

    /// @notice Mapping of owner to their position IDs
    mapping(address => uint256[]) private _ownerPositions;

    /// @notice Mapping of position ID to owner
    mapping(uint256 => address) private _positionOwner;

    /// @notice Events
    event CollateralReserved(address indexed owner, uint256 indexed positionId, uint256 amount);
    event CollateralReleased(address indexed owner, uint256 indexed positionId, uint256 amount);
    event CollateralWithdrawn(uint256 indexed positionId, address indexed to, uint256 amount);
    event OptionManagerSet(address indexed oldManager, address indexed newManager);

    /// @notice Errors
    error OnlyOptionManager();
    error InsufficientAvailableBalance();
    error InsufficientReservedCollateral();
    error PositionNotFound();
    error ZeroAmount();

    /**
     * @notice Modifier to restrict access to the Option Manager
     */
    modifier onlyOptionManager() {
        if (msg.sender != optionManager) revert OnlyOptionManager();
        _;
    }

    /**
     * @notice Initialize the vault with the underlying asset
     * @param asset_ The underlying ERC20 asset (USDC or WETH)
     * @param name_ The vault share token name
     * @param symbol_ The vault share token symbol
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_
    ) ERC4626(asset_) ERC20(name_, symbol_) Ownable(msg.sender) {}

    /**
     * @notice Set the Option Manager address
     * @param _optionManager The new Option Manager address
     */
    function setOptionManager(address _optionManager) external onlyOwner {
        require(_optionManager != address(0), "Invalid address");
        address oldManager = optionManager;
        optionManager = _optionManager;
        emit OptionManagerSet(oldManager, _optionManager);
    }

    /**
     * @notice Reserve collateral for a position
     * @param owner The owner of the collateral
     * @param amount The amount to reserve
     * @param positionId The position ID this collateral is reserved for
     */
    function reserveCollateral(
        address owner,
        uint256 amount,
        uint256 positionId
    ) external override onlyOptionManager nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 available = getAvailableBalance(owner);
        if (available < amount) revert InsufficientAvailableBalance();

        _reservedCollateral[positionId] = amount;
        _totalReserved[owner] += amount;
        _positionOwner[positionId] = owner;
        _ownerPositions[owner].push(positionId);

        emit CollateralReserved(owner, positionId, amount);
    }

    /**
     * @notice Release reserved collateral back to the owner
     * @param owner The owner of the collateral
     * @param amount The amount to release
     * @param positionId The position ID to release from
     */
    function releaseCollateral(
        address owner,
        uint256 amount,
        uint256 positionId
    ) external override onlyOptionManager nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 reserved = _reservedCollateral[positionId];
        if (reserved < amount) revert InsufficientReservedCollateral();
        if (_positionOwner[positionId] != owner) revert PositionNotFound();

        _reservedCollateral[positionId] -= amount;
        _totalReserved[owner] -= amount;

        emit CollateralReleased(owner, positionId, amount);
    }

    /**
     * @notice Withdraw collateral for exercise or liquidation
     * @param positionId The position ID
     * @param to The recipient address
     * @param amount The amount to withdraw
     */
    function withdrawCollateralTo(
        uint256 positionId,
        address to,
        uint256 amount
    ) external override onlyOptionManager nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 reserved = _reservedCollateral[positionId];
        if (reserved < amount) revert InsufficientReservedCollateral();

        address owner = _positionOwner[positionId];

        // Reduce reserved amounts
        _reservedCollateral[positionId] -= amount;
        _totalReserved[owner] -= amount;

        // Burn shares from owner proportional to amount withdrawn
        uint256 sharesToBurn = convertToShares(amount);
        _burn(owner, sharesToBurn);

        // Transfer underlying asset to recipient
        IERC20(asset()).safeTransfer(to, amount);

        emit CollateralWithdrawn(positionId, to, amount);
    }

    /**
     * @notice Get the reserved collateral for a position
     * @param positionId The position ID
     */
    function getReservedCollateral(uint256 positionId) external view override returns (uint256) {
        return _reservedCollateral[positionId];
    }

    /**
     * @notice Get the total reserved collateral for an owner
     * @param owner The owner address
     */
    function getTotalReservedFor(address owner) external view override returns (uint256) {
        return _totalReserved[owner];
    }

    /**
     * @notice Get available (unreserved) balance for an owner
     * @param owner The owner address
     */
    function getAvailableBalance(address owner) public view override returns (uint256) {
        uint256 totalAssets = convertToAssets(balanceOf(owner));
        uint256 reserved = _totalReserved[owner];
        return totalAssets > reserved ? totalAssets - reserved : 0;
    }

    /**
     * @notice Override withdraw to prevent withdrawal of reserved collateral
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override(ERC4626, IERC4626) returns (uint256) {
        uint256 available = getAvailableBalance(owner);
        require(assets <= available, "Cannot withdraw reserved collateral");
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @notice Override redeem to prevent redemption of reserved collateral
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override(ERC4626, IERC4626) returns (uint256) {
        uint256 assets = convertToAssets(shares);
        uint256 available = getAvailableBalance(owner);
        require(assets <= available, "Cannot redeem reserved collateral");
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @notice Get position IDs for an owner
     * @param owner The owner address
     */
    function getOwnerPositions(address owner) external view returns (uint256[] memory) {
        return _ownerPositions[owner];
    }

    /**
     * @notice Get the owner of a position's collateral
     * @param positionId The position ID
     */
    function getPositionOwner(uint256 positionId) external view returns (address) {
        return _positionOwner[positionId];
    }

    /**
     * @notice Clear position data after it's closed
     * @param positionId The position ID to clear
     */
    function clearPosition(uint256 positionId) external onlyOptionManager {
        address owner = _positionOwner[positionId];

        // Ensure all collateral is released first
        require(_reservedCollateral[positionId] == 0, "Collateral not released");

        // Clear mappings
        delete _positionOwner[positionId];

        // Remove from owner's position list
        uint256[] storage positions = _ownerPositions[owner];
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i] == positionId) {
                positions[i] = positions[positions.length - 1];
                positions.pop();
                break;
            }
        }
    }
}
