'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits } from 'viem';
import {
  CONTRACTS,
  OPTION_MANAGER_ABI,
  OPTION_NFT_ABI,
  FUNDING_ORACLE_ABI,
  OptionType,
  PositionStatus
} from '@/config/contracts';

interface PositionData {
  optionType: number;
  underlying: string;
  strike: bigint;
  size: bigint;
  shortOwner: string;
  collateralAmount: bigint;
  lastFundingTime: bigint;
  longFundingBalance: bigint;
  status: number;
}

function LiquidatablePosition({ tokenId }: { tokenId: string }) {
  const tokenIdBigInt = BigInt(tokenId);

  // Get position data
  const { data: position } = useReadContract({
    address: CONTRACTS.optionManager,
    abi: OPTION_MANAGER_ABI,
    functionName: 'getPosition',
    args: [tokenIdBigInt],
  }) as { data: PositionData | undefined };

  // Check if liquidatable
  const { data: isLiquidatable } = useReadContract({
    address: CONTRACTS.optionManager,
    abi: OPTION_MANAGER_ABI,
    functionName: 'isLiquidatable',
    args: [tokenIdBigInt],
  });

  // Get intrinsic value
  const { data: intrinsicValue } = useReadContract({
    address: CONTRACTS.fundingOracle,
    abi: FUNDING_ORACLE_ABI,
    functionName: 'getIntrinsicValue',
    args: position ? [position.optionType, position.underlying as `0x${string}`, position.strike] : undefined,
    query: { enabled: !!position },
  });

  // Get collateral ratio
  const { data: collateralRatio } = useReadContract({
    address: CONTRACTS.optionManager,
    abi: OPTION_MANAGER_ABI,
    functionName: 'getCollateralRatio',
    args: [tokenIdBigInt],
  });

  // Liquidate function
  const { writeContract: liquidate, data: liquidateHash } = useWriteContract();
  const { isLoading: isLiquidating, isSuccess: isLiquidated } = useWaitForTransactionReceipt({
    hash: liquidateHash,
  });

  if (!position || position.status !== PositionStatus.ACTIVE) {
    return null;
  }

  const isCall = position.optionType === OptionType.CALL;
  const strikeFormatted = formatUnits(position.strike, 6);
  const sizeFormatted = formatUnits(position.size, 18);
  const collateral = isCall
    ? formatUnits(position.collateralAmount, 18) + ' WETH'
    : formatUnits(position.collateralAmount, 6) + ' USDC';
  const intrinsic = intrinsicValue ? formatUnits(intrinsicValue, 6) : '0';
  const ratioPercent = collateralRatio
    ? (Number(collateralRatio) / 1e16).toFixed(1)
    : '---';

  const handleLiquidate = () => {
    liquidate({
      address: CONTRACTS.optionManager,
      abi: OPTION_MANAGER_ABI,
      functionName: 'liquidate',
      args: [tokenIdBigInt],
    });
  };

  if (isLiquidated) {
    return (
      <div className="bg-green-900/20 border border-green-500 rounded-xl p-4">
        <p className="text-green-400">Position #{tokenId} liquidated successfully!</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className={`px-4 py-2 ${isCall ? 'bg-call/20' : 'bg-put/20'} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`font-bold ${isCall ? 'text-call' : 'text-put'}`}>
            {isCall ? 'CALL' : 'PUT'}
          </span>
          <span className="text-gray-300">#{tokenId}</span>
        </div>
        {isLiquidatable && (
          <span className="text-sm px-2 py-1 rounded bg-red-500/20 text-red-400">
            Liquidatable
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Strike</span>
            <p className="text-white font-medium">${Number(strikeFormatted).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-gray-400">Size</span>
            <p className="text-white font-medium">{sizeFormatted} ETH</p>
          </div>
          <div>
            <span className="text-gray-400">Collateral</span>
            <p className="text-white font-medium">{collateral}</p>
          </div>
          <div>
            <span className="text-gray-400">Collateral Ratio</span>
            <p className={`font-medium ${Number(ratioPercent) < 120 ? 'text-red-400' : 'text-green-400'}`}>
              {ratioPercent}%
            </p>
          </div>
          <div>
            <span className="text-gray-400">Intrinsic Value</span>
            <p className="text-white font-medium">${Number(intrinsic).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-gray-400">Short Owner</span>
            <p className="text-gray-300 font-mono text-xs truncate">{position.shortOwner}</p>
          </div>
        </div>

        {isLiquidatable && (
          <button
            onClick={handleLiquidate}
            disabled={isLiquidating}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
          >
            {isLiquidating ? 'Liquidating...' : 'Liquidate Position'}
          </button>
        )}

        {!isLiquidatable && (
          <div className="bg-gray-700 rounded-lg p-3 text-center text-sm text-gray-400">
            Position is healthy (above maintenance ratio)
          </div>
        )}
      </div>
    </div>
  );
}

export default function Liquidate() {
  const { isConnected } = useAccount();
  const [searchTokenId, setSearchTokenId] = useState('');
  const [searchedPositions, setSearchedPositions] = useState<string[]>([]);

  // Get total supply to show recent positions
  const { data: totalSupply } = useReadContract({
    address: CONTRACTS.optionNFT,
    abi: OPTION_NFT_ABI,
    functionName: 'totalSupply',
  });

  // Generate recent token IDs to check
  const recentTokenIds = totalSupply
    ? Array.from({ length: Math.min(Number(totalSupply), 10) }, (_, i) =>
        (Number(totalSupply) - i).toString()
      )
    : [];

  const handleSearch = () => {
    if (searchTokenId && !searchedPositions.includes(searchTokenId)) {
      setSearchedPositions([searchTokenId, ...searchedPositions]);
    }
    setSearchTokenId('');
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
        <p className="text-gray-400">Please connect your wallet to liquidate positions</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Liquidate Positions</h1>
        <p className="text-gray-400">
          Find and liquidate undercollateralized positions to earn a liquidation bonus.
        </p>
      </div>

      {/* Search */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Search Position</h2>
        <div className="flex gap-2">
          <input
            type="number"
            value={searchTokenId}
            onChange={(e) => setSearchTokenId(e.target.value)}
            placeholder="Enter Token ID"
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={handleSearch}
            className="bg-primary-600 hover:bg-primary-500 text-white py-2 px-6 rounded-lg font-medium transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      {/* Searched Positions */}
      {searchedPositions.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Searched Positions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {searchedPositions.map((tokenId) => (
              <LiquidatablePosition key={tokenId} tokenId={tokenId} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Positions */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Recent Positions</h2>
        {recentTokenIds.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentTokenIds.map((tokenId) => (
              <LiquidatablePosition key={tokenId} tokenId={tokenId} />
            ))}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
            <p className="text-gray-400">No positions found</p>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-3">How Liquidation Works</h3>
        <ul className="space-y-2 text-sm text-gray-400">
          <li>
            <span className="text-white">1.</span> Positions become liquidatable when their collateral ratio falls below the maintenance threshold (120%).
          </li>
          <li>
            <span className="text-white">2.</span> Anyone can liquidate an undercollateralized position.
          </li>
          <li>
            <span className="text-white">3.</span> The liquidator pays the long's intrinsic value and receives the short's collateral.
          </li>
          <li>
            <span className="text-white">4.</span> Liquidators earn a 5% bonus on the collateral for their service.
          </li>
        </ul>
      </div>
    </div>
  );
}
