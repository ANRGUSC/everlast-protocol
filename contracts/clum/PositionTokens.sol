// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ICLUMEngine.sol";

/// @title PositionTokens
/// @notice ERC-1155 semi-fungible position tokens for everlasting options.
///         Token ID encodes option type and strike:
///           tokenId = (uint256(optionType) << 128) | uint256(strike)
///         Balances represent position size (WAD-scaled).
/// @dev Funding state is tracked per (holder, tokenId) in the EvOptionManager,
///      not in this contract. On transfer, the EvOptionManager must accrue funding.
contract PositionTokens is ERC1155, Ownable {
    address public optionManager;

    error OnlyOptionManager();

    modifier onlyManager() {
        if (msg.sender != optionManager) revert OnlyOptionManager();
        _;
    }

    constructor() ERC1155("") Ownable(msg.sender) {}

    function setOptionManager(address _manager) external onlyOwner {
        require(_manager != address(0), "Invalid manager");
        optionManager = _manager;
    }

    // ─── Token ID Encoding ──────────────────────────────────────────────

    /// @notice Encode option type and strike into a token ID
    function encodeTokenId(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad
    ) external pure returns (uint256) {
        return _encodeTokenId(optionType, strikeWad);
    }

    /// @notice Decode token ID into option type and strike
    function decodeTokenId(uint256 tokenId)
        external
        pure
        returns (ICLUMEngine.OptionType optionType, uint256 strikeWad)
    {
        return _decodeTokenId(tokenId);
    }

    function _encodeTokenId(
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad
    ) internal pure returns (uint256) {
        return (uint256(optionType) << 128) | (strikeWad & type(uint128).max);
    }

    function _decodeTokenId(uint256 tokenId)
        internal
        pure
        returns (ICLUMEngine.OptionType optionType, uint256 strikeWad)
    {
        optionType = ICLUMEngine.OptionType(tokenId >> 128);
        strikeWad = tokenId & type(uint128).max;
    }

    // ─── Minting / Burning ──────────────────────────────────────────────

    function mint(
        address to,
        ICLUMEngine.OptionType optionType,
        uint256 strikeWad,
        uint256 sizeWad
    ) external onlyManager returns (uint256 tokenId) {
        tokenId = _encodeTokenId(optionType, strikeWad);
        _mint(to, tokenId, sizeWad, "");
    }

    function burn(
        address from,
        uint256 tokenId,
        uint256 sizeWad
    ) external onlyManager {
        _burn(from, tokenId, sizeWad);
    }

    // ─── Metadata ───────────────────────────────────────────────────────

    function uri(uint256 tokenId) public pure override returns (string memory) {
        (ICLUMEngine.OptionType optionType, uint256 strikeWad) = _decodeTokenId(tokenId);
        string memory typeStr = optionType == ICLUMEngine.OptionType.CALL ? "CALL" : "PUT";

        return string(
            abi.encodePacked(
                '{"name":"Everlasting ',
                typeStr,
                '","strike":',
                _uint2str(strikeWad / 1e18),
                '}'
            )
        );
    }

    function _uint2str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v;
        uint256 digits;
        while (tmp != 0) { digits++; tmp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(buf);
    }
}
