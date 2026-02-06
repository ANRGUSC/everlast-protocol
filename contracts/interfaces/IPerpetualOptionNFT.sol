// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC721.sol";

/**
 * @title IPerpetualOptionNFT
 * @notice Interface for the Perpetual Option NFT contract
 * @dev Extends ERC-721 for representing option positions as NFTs
 */
interface IPerpetualOptionNFT is IERC721 {
    /// @notice Mint a new option NFT
    /// @param to The recipient of the NFT (the long position holder)
    /// @param tokenId The token ID to mint
    function mint(address to, uint256 tokenId) external;

    /// @notice Burn an option NFT when position is closed
    /// @param tokenId The token ID to burn
    function burn(uint256 tokenId) external;

    /// @notice Get the next token ID
    function nextTokenId() external view returns (uint256);

    /// @notice Check if a token exists
    /// @param tokenId The token ID to check
    function exists(uint256 tokenId) external view returns (bool);
}
