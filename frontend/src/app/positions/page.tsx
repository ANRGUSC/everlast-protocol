'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import {
  CONTRACTS,
  OPTION_MANAGER_ABI,
  OPTION_NFT_ABI,
  FUNDING_ORACLE_ABI,
  ERC20_ABI,
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

function PositionCard({
  tokenId,
  isLong,
  onAction
}: {
  tokenId: bigint;
  isLong: boolean;
  onAction: () => void;
}) {
  const { address } = useAccount();
  const [showFundingModal, setShowFundingModal] = useState(false);
  const [fundingAmount, setFundingAmount] = useState('100');
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseAmount, setReleaseAmount] = useState('');

  // Get position data
  const { data: position } = useReadContract({
    address: CONTRACTS.optionManager,
    abi: OPTION_MANAGER_ABI,
    functionName: 'getPosition',
    args: [tokenId],
  }) as { data: PositionData | undefined };

  // Get pending funding
  const { data: pendingFunding } = useReadContract({
    address: CONTRACTS.optionManager,
    abi: OPTION_MANAGER_ABI,
    functionName: 'getPendingFunding',
    args: [tokenId],
  });

  // Get intrinsic value
  const { data: intrinsicValue } = useReadContract({
    address: CONTRACTS.fundingOracle,
    abi: FUNDING_ORACLE_ABI,
    functionName: 'getIntrinsicValue',
    args: position ? [position.optionType, position.underlying as `0x${string}`, position.strike] : undefined,
    query: { enabled: !!position },
  });

  // Check if liquidatable
  const { data: isLiquidatable } = useReadContract({
    address: CONTRACTS.optionManager,
    abi: OPTION_MANAGER_ABI,
    functionName: 'isLiquidatable',
    args: [tokenId],
  });

  // Write functions
  const { writeContract: exercise, data: exerciseHash } = useWriteContract();
  const { isLoading: isExercising } = useWaitForTransactionReceipt({ hash: exerciseHash });

  const { writeContract: depositFunding, data: depositHash } = useWriteContract();
  const { isLoading: isDepositing } = useWaitForTransactionReceipt({ hash: depositHash });

  const { writeContract: approve, data: approveHash } = useWriteContract();
  const { isLoading: isApproving } = useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: accrueFunding, data: accrueHash } = useWriteContract();
  const { isLoading: isAccruing } = useWaitForTransactionReceipt({ hash: accrueHash });

  const { writeContract: releaseCollateral, data: releaseHash } = useWriteContract();
  const { isLoading: isReleasing } = useWaitForTransactionReceipt({ hash: releaseHash });

  if (!position || position.status !== PositionStatus.ACTIVE) {
    return null;
  }

  const isCall = position.optionType === OptionType.CALL;
  const strikeFormatted = formatUnits(position.strike, 6);
  const sizeFormatted = formatUnits(position.size, 18);
  const fundingBalance = formatUnits(position.longFundingBalance, 6);
  const collateral = isCall
    ? formatUnits(position.collateralAmount, 18) + ' WETH'
    : formatUnits(position.collateralAmount, 6) + ' USDC';
  const intrinsic = intrinsicValue ? formatUnits(intrinsicValue, 6) : '0';
  const isITM = intrinsicValue && intrinsicValue > 0n;

  const handleExercise = async () => {
    // For calls: need to approve USDC for strike payment
    // For puts: need to approve WETH for delivery
    if (isCall) {
      const strikePayment = (position.strike * position.size) / BigInt(1e18);
      approve({
        address: CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.optionManager, strikePayment],
      });
    } else {
      approve({
        address: CONTRACTS.weth,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.optionManager, position.size],
      });
    }

    // Then exercise
    setTimeout(() => {
      exercise({
        address: CONTRACTS.optionManager,
        abi: OPTION_MANAGER_ABI,
        functionName: 'exercise',
        args: [tokenId],
      });
    }, 2000);
  };

  const handleDepositFunding = () => {
    const amount = parseUnits(fundingAmount, 6);

    // First approve USDC
    approve({
      address: CONTRACTS.usdc,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.optionManager, amount],
    });

    // Then deposit
    setTimeout(() => {
      depositFunding({
        address: CONTRACTS.optionManager,
        abi: OPTION_MANAGER_ABI,
        functionName: 'depositFunding',
        args: [tokenId, amount],
      });
      setShowFundingModal(false);
    }, 2000);
  };

  const handleAccrueFunding = () => {
    accrueFunding({
      address: CONTRACTS.optionManager,
      abi: OPTION_MANAGER_ABI,
      functionName: 'accrueFunding',
      args: [tokenId],
    });
  };

  const handleReleaseCollateral = () => {
    const decimals = isCall ? 18 : 6;
    const amount = parseUnits(releaseAmount, decimals);

    releaseCollateral({
      address: CONTRACTS.optionManager,
      abi: OPTION_MANAGER_ABI,
      functionName: 'releaseCollateral',
      args: [tokenId, amount],
    });
    setShowReleaseModal(false);
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className={`px-4 py-2 ${isCall ? 'bg-call/20' : 'bg-put/20'} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`font-bold ${isCall ? 'text-call' : 'text-put'}`}>
            {isCall ? 'CALL' : 'PUT'}
          </span>
          <span className="text-gray-300">#{tokenId.toString()}</span>
        </div>
        <span className={`text-sm px-2 py-1 rounded ${isLong ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
          {isLong ? 'LONG' : 'SHORT'}
        </span>
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
            <span className="text-gray-400">Intrinsic Value</span>
            <p className={`font-medium ${isITM ? 'text-call' : 'text-gray-400'}`}>
              ${Number(intrinsic).toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-gray-400">{isLong ? 'Funding Balance' : 'Collateral'}</span>
            <p className="text-white font-medium">
              {isLong ? `$${Number(fundingBalance).toLocaleString()}` : collateral}
            </p>
          </div>
          {!isLong && (
            <div>
              <span className="text-gray-400">Long Funding Left</span>
              <p className={`font-medium ${Number(fundingBalance) < 10 ? 'text-red-400' : 'text-white'}`}>
                ${Number(fundingBalance).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {pendingFunding && pendingFunding > 0n && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-sm text-yellow-400">
            Pending funding: ${formatUnits(pendingFunding, 6)}
          </div>
        )}

        {isLiquidatable && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-sm text-red-400">
            Warning: Position is liquidatable!
          </div>
        )}

        {/* Long Actions */}
        {isLong && (
          <div className="flex gap-2 pt-2">
            {isITM && (
              <button
                onClick={handleExercise}
                disabled={isExercising || isApproving}
                className="flex-1 bg-call hover:bg-call/80 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
              >
                {isExercising || isApproving ? 'Processing...' : 'Exercise'}
              </button>
            )}
            <button
              onClick={() => setShowFundingModal(true)}
              className="flex-1 bg-primary-600 hover:bg-primary-500 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
            >
              Add Funding
            </button>
          </div>
        )}

        {/* Short Actions */}
        {!isLong && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAccrueFunding}
              disabled={isAccruing || !pendingFunding || pendingFunding === 0n}
              className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:text-gray-400 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
            >
              {isAccruing ? 'Processing...' : 'Collect Funding'}
            </button>
            <button
              onClick={() => setShowReleaseModal(true)}
              className="flex-1 bg-orange-600 hover:bg-orange-500 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
            >
              Release Collateral
            </button>
          </div>
        )}
      </div>

      {/* Funding Modal */}
      {showFundingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">Deposit Funding</h3>
            <input
              type="number"
              value={fundingAmount}
              onChange={(e) => setFundingAmount(e.target.value)}
              placeholder="100"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowFundingModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDepositFunding}
                disabled={isDepositing || isApproving}
                className="flex-1 bg-primary-600 hover:bg-primary-500 text-white py-2 px-4 rounded-lg"
              >
                {isDepositing || isApproving ? 'Processing...' : 'Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Collateral Modal */}
      {showReleaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">Release Collateral</h3>
            <p className="text-gray-400 text-sm mb-4">
              Current collateral: {collateral}. You can only release excess collateral above the minimum required.
            </p>
            <input
              type="number"
              value={releaseAmount}
              onChange={(e) => setReleaseAmount(e.target.value)}
              placeholder={isCall ? 'Amount in WETH' : 'Amount in USDC'}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowReleaseModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleReleaseCollateral}
                disabled={isReleasing || !releaseAmount}
                className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg"
              >
                {isReleasing ? 'Processing...' : 'Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Positions() {
  const { address, isConnected } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);

  // Get user's long positions (NFTs)
  const { data: longPositions, refetch: refetchLong } = useReadContract({
    address: CONTRACTS.optionNFT,
    abi: OPTION_NFT_ABI,
    functionName: 'tokensOfOwner',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Get user's short positions
  const { data: shortPositions, refetch: refetchShort } = useReadContract({
    address: CONTRACTS.optionManager,
    abi: OPTION_MANAGER_ABI,
    functionName: 'getShortPositions',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const handleRefresh = () => {
    refetchLong();
    refetchShort();
    setRefreshKey(k => k + 1);
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
        <p className="text-gray-400">Please connect your wallet to view your positions</p>
      </div>
    );
  }

  const hasLongPositions = longPositions && longPositions.length > 0;
  const hasShortPositions = shortPositions && shortPositions.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">My Positions</h1>
        <button
          onClick={handleRefresh}
          className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Long Positions */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
          Long Positions (Options You Hold)
        </h2>
        {hasLongPositions ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {longPositions.map((tokenId) => (
              <PositionCard
                key={tokenId.toString()}
                tokenId={tokenId}
                isLong={true}
                onAction={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
            <p className="text-gray-400">No long positions found</p>
            <p className="text-sm text-gray-500 mt-1">
              You don't hold any option NFTs
            </p>
          </div>
        )}
      </div>

      {/* Short Positions */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
          Short Positions (Options You Sold)
        </h2>
        {hasShortPositions ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shortPositions.map((tokenId) => (
              <PositionCard
                key={tokenId.toString()}
                tokenId={tokenId}
                isLong={false}
                onAction={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
            <p className="text-gray-400">No short positions found</p>
            <p className="text-sm text-gray-500 mt-1">
              You haven't created any option positions
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
