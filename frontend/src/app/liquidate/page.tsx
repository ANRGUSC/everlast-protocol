'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits } from 'viem';
import {
  CONTRACTS,
  EV_OPTION_MANAGER_ABI,
  FUNDING_DERIVER_ABI,
  OptionType,
  USDC_DECIMALS,
} from '@/config/contracts';
import type { Position } from '@/config/contracts';

function LiquidatablePosition({ tokenId }: { tokenId: string }) {
  const tokenIdBigInt = BigInt(tokenId);

  const hasContracts = CONTRACTS.evOptionManager !== '0x0000000000000000000000000000000000000000';

  // Get position data
  const { data: position } = useReadContract({
    address: CONTRACTS.evOptionManager,
    abi: EV_OPTION_MANAGER_ABI,
    functionName: 'getPosition',
    args: [tokenIdBigInt],
    query: { enabled: hasContracts },
  }) as { data: Position | undefined };

  // Check if liquidatable
  const { data: isLiquidatable } = useReadContract({
    address: CONTRACTS.evOptionManager,
    abi: EV_OPTION_MANAGER_ABI,
    functionName: 'isLiquidatable',
    args: [tokenIdBigInt],
    query: { enabled: hasContracts },
  });

  // Get intrinsic value (no underlying param)
  const { data: intrinsicValue } = useReadContract({
    address: CONTRACTS.fundingDeriver,
    abi: FUNDING_DERIVER_ABI,
    functionName: 'getIntrinsicValue',
    args: position ? [position.optionType, position.strike] : undefined,
    query: { enabled: hasContracts && !!position },
  });

  // Get pending funding
  const { data: pendingFunding } = useReadContract({
    address: CONTRACTS.evOptionManager,
    abi: EV_OPTION_MANAGER_ABI,
    functionName: 'getPendingFunding',
    args: [tokenIdBigInt],
    query: { enabled: hasContracts },
  });

  // Liquidate
  const { writeContract: liquidate, data: liquidateHash } = useWriteContract();
  const { isLoading: isLiquidating, isSuccess: isLiquidated } = useWaitForTransactionReceipt({
    hash: liquidateHash,
  });

  if (!position || !position.isActive) {
    return null;
  }

  const isCall = position.optionType === OptionType.CALL;
  const strikeFormatted = Number(formatUnits(position.strike, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const sizeFormatted = formatUnits(position.size, 18);
  const fundingBalance = formatUnits(position.fundingBalance, USDC_DECIMALS);
  const intrinsic = intrinsicValue ? Number(formatUnits(intrinsicValue, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0';
  const pending = pendingFunding ? formatUnits(pendingFunding, USDC_DECIMALS) : '0';

  // Effective balance = fundingBalance - pendingFunding
  const effectiveBalance = position.fundingBalance - (pendingFunding || 0n);
  const effectiveBalanceFormatted = Number(formatUnits(effectiveBalance > 0n ? effectiveBalance : 0n, USDC_DECIMALS)).toLocaleString();

  const handleLiquidate = () => {
    liquidate({
      address: CONTRACTS.evOptionManager,
      abi: EV_OPTION_MANAGER_ABI,
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
            <p className="text-white font-medium">${strikeFormatted}</p>
          </div>
          <div>
            <span className="text-gray-400">Size</span>
            <p className="text-white font-medium">{sizeFormatted} ETH</p>
          </div>
          <div>
            <span className="text-gray-400">Funding Balance</span>
            <p className={`font-medium ${Number(fundingBalance) < 1 ? 'text-red-400' : 'text-white'}`}>
              ${Number(fundingBalance).toLocaleString()} USDC
            </p>
          </div>
          <div>
            <span className="text-gray-400">Effective Balance</span>
            <p className={`font-medium ${effectiveBalance <= 0n ? 'text-red-400' : 'text-yellow-400'}`}>
              ${effectiveBalanceFormatted} USDC
            </p>
          </div>
          <div>
            <span className="text-gray-400">Intrinsic Value</span>
            <p className="text-white font-medium">${intrinsic}</p>
          </div>
          <div>
            <span className="text-gray-400">Owner</span>
            <p className="text-gray-300 font-mono text-xs truncate">{position.owner}</p>
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
            Position is healthy (funding balance sufficient)
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

  const hasContracts = CONTRACTS.evOptionManager !== '0x0000000000000000000000000000000000000000';

  // Get next position ID to enumerate recent positions
  const { data: nextPositionId } = useReadContract({
    address: CONTRACTS.evOptionManager,
    abi: EV_OPTION_MANAGER_ABI,
    functionName: 'nextPositionId',
    query: { enabled: hasContracts },
  });

  // Generate recent position IDs to check
  const recentTokenIds = nextPositionId && nextPositionId > 1n
    ? Array.from(
        { length: Math.min(Number(nextPositionId) - 1, 10) },
        (_, i) => (Number(nextPositionId) - 1 - i).toString()
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
          Find and liquidate positions with depleted funding balances.
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
            placeholder="Enter Position ID"
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
            <span className="text-white">1.</span> Positions become liquidatable when their funding balance falls below the minimum required amount.
          </li>
          <li>
            <span className="text-white">2.</span> A grace period applies after the funding balance is depleted before liquidation is enabled.
          </li>
          <li>
            <span className="text-white">3.</span> Anyone can liquidate an eligible position. The position is closed and remaining funding is distributed.
          </li>
          <li>
            <span className="text-white">4.</span> Position holders can prevent liquidation by depositing more funding (USDC) at any time.
          </li>
        </ul>
      </div>
    </div>
  );
}
