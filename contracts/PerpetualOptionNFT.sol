// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "./interfaces/IPerpetualOptionNFT.sol";
import "./interfaces/IOptionManager.sol";
import "./interfaces/IFundingOracle.sol";

/**
 * @title PerpetualOptionNFT
 * @notice ERC-721 contract representing perpetual option positions as NFTs
 * @dev Each NFT corresponds to a unique option position (call or put)
 */
contract PerpetualOptionNFT is ERC721Enumerable, Ownable, IPerpetualOptionNFT {
    using Strings for uint256;

    /// @notice The Option Manager contract address
    address public optionManager;

    /// @notice Counter for token IDs
    uint256 private _nextTokenId;

    /// @notice Base URI for external metadata (optional)
    string private _baseTokenURI;

    /// @notice Events
    event OptionManagerSet(address indexed oldManager, address indexed newManager);
    event BaseURISet(string newBaseURI);

    /// @notice Errors
    error OnlyOptionManager();
    error TokenDoesNotExist();

    /**
     * @notice Modifier to restrict minting/burning to Option Manager
     */
    modifier onlyOptionManager() {
        if (msg.sender != optionManager) revert OnlyOptionManager();
        _;
    }

    /**
     * @notice Initialize the NFT contract
     * @param name_ The NFT collection name
     * @param symbol_ The NFT collection symbol
     */
    constructor(
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        _nextTokenId = 1; // Start from 1
    }

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
     * @notice Set the base URI for metadata
     * @param baseURI_ The new base URI
     */
    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURISet(baseURI_);
    }

    /**
     * @notice Mint a new option NFT
     * @param to The recipient of the NFT (the long position holder)
     * @param tokenId The token ID to mint
     */
    function mint(address to, uint256 tokenId) external override onlyOptionManager {
        _safeMint(to, tokenId);
    }

    /**
     * @notice Burn an option NFT when position is closed
     * @param tokenId The token ID to burn
     */
    function burn(uint256 tokenId) external override onlyOptionManager {
        _burn(tokenId);
    }

    /**
     * @notice Get the next token ID
     */
    function nextTokenId() external view override returns (uint256) {
        return _nextTokenId;
    }

    /**
     * @notice Increment and return the next token ID
     * @dev Only callable by Option Manager
     */
    function incrementTokenId() external onlyOptionManager returns (uint256) {
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;
        return tokenId;
    }

    /**
     * @notice Check if a token exists
     * @param tokenId The token ID to check
     */
    function exists(uint256 tokenId) external view override returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /**
     * @notice Generate on-chain metadata for the NFT
     * @param tokenId The token ID
     * @return The token URI with encoded metadata
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();

        // If external base URI is set, use it
        if (bytes(_baseTokenURI).length > 0) {
            return string(abi.encodePacked(_baseTokenURI, tokenId.toString()));
        }

        // Generate on-chain metadata
        return _generateOnChainMetadata(tokenId);
    }

    /**
     * @notice Generate on-chain JSON metadata
     * @param tokenId The token ID
     */
    function _generateOnChainMetadata(uint256 tokenId) internal view returns (string memory) {
        // Get position data from Option Manager if set
        string memory optionType = "Unknown";
        string memory strike = "Unknown";
        string memory size = "Unknown";
        string memory status = "Unknown";

        if (optionManager != address(0)) {
            try IOptionManager(optionManager).getPosition(tokenId) returns (
                IOptionManager.Position memory position
            ) {
                optionType = position.optionType == IFundingOracle.OptionType.CALL ? "Call" : "Put";
                strike = _formatPrice(position.strike);
                size = _formatAmount(position.size);
                status = _statusToString(position.status);
            } catch {
                // Keep defaults if call fails
            }
        }

        string memory json = string(
            abi.encodePacked(
                '{"name": "Perpetual Option #',
                tokenId.toString(),
                '", "description": "A perpetual option position with no expiry.", "attributes": [',
                '{"trait_type": "Option Type", "value": "',
                optionType,
                '"},',
                '{"trait_type": "Strike Price", "value": "',
                strike,
                '"},',
                '{"trait_type": "Size", "value": "',
                size,
                '"},',
                '{"trait_type": "Status", "value": "',
                status,
                '"}',
                '], "image": "',
                _generateSVGImage(tokenId, optionType, strike),
                '"}'
            )
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            )
        );
    }

    /**
     * @notice Generate an SVG image for the NFT
     */
    function _generateSVGImage(
        uint256 tokenId,
        string memory optionType,
        string memory strike
    ) internal pure returns (string memory) {
        string memory color = keccak256(bytes(optionType)) == keccak256(bytes("Call"))
            ? "#10B981"  // Green for calls
            : "#EF4444"; // Red for puts

        string memory svg = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
                '<rect width="400" height="400" fill="#1a1a2e"/>',
                '<text x="200" y="80" text-anchor="middle" fill="white" font-size="24" font-family="Arial">Perpetual Option</text>',
                '<text x="200" y="160" text-anchor="middle" fill="',
                color,
                '" font-size="48" font-weight="bold" font-family="Arial">',
                optionType,
                '</text>',
                '<text x="200" y="220" text-anchor="middle" fill="#888" font-size="16" font-family="Arial">Strike: ',
                strike,
                '</text>',
                '<text x="200" y="320" text-anchor="middle" fill="#666" font-size="14" font-family="Arial">#',
                tokenId.toString(),
                '</text>',
                '</svg>'
            )
        );

        return string(
            abi.encodePacked(
                "data:image/svg+xml;base64,",
                Base64.encode(bytes(svg))
            )
        );
    }

    /**
     * @notice Format price for display (assuming 6 decimals USDC)
     */
    function _formatPrice(uint256 price) internal pure returns (string memory) {
        uint256 wholePart = price / 1e6;
        return string(abi.encodePacked("$", wholePart.toString()));
    }

    /**
     * @notice Format amount for display (assuming 18 decimals)
     */
    function _formatAmount(uint256 amount) internal pure returns (string memory) {
        uint256 wholePart = amount / 1e18;
        uint256 decimalPart = (amount % 1e18) / 1e16; // 2 decimal places
        if (decimalPart > 0) {
            return string(abi.encodePacked(wholePart.toString(), ".", decimalPart.toString()));
        }
        return wholePart.toString();
    }

    /**
     * @notice Convert status enum to string
     */
    function _statusToString(IOptionManager.PositionStatus status) internal pure returns (string memory) {
        if (status == IOptionManager.PositionStatus.ACTIVE) return "Active";
        if (status == IOptionManager.PositionStatus.EXERCISED) return "Exercised";
        if (status == IOptionManager.PositionStatus.LIQUIDATED) return "Liquidated";
        if (status == IOptionManager.PositionStatus.CLOSED) return "Closed";
        return "Unknown";
    }

    /**
     * @notice Get all token IDs owned by an address
     * @param owner The owner address
     */
    function tokensOfOwner(address owner) external view returns (uint256[] memory) {
        uint256 tokenCount = balanceOf(owner);
        uint256[] memory tokens = new uint256[](tokenCount);

        for (uint256 i = 0; i < tokenCount; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
        }

        return tokens;
    }

    /**
     * @notice Override supportsInterface for ERC721Enumerable
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721Enumerable, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
