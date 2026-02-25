'use client';

import { useState } from 'react';
import { useAccount, useConfig, useReadContract, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { formatUnits, parseUnits } from 'viem';
import {
  CONTRACTS,
  EV_OPTION_MANAGER_ABI,
  CLUM_ENGINE_ABI,
  FUNDING_DERIVER_ABI,
  ERC20_ABI,
  OptionType,
  USDC_DECIMALS,
} from '@/config/contracts';
import type { Position } from '@/config/contracts';

function PositionCard({
  positionId,
  onAction,
}: {
  positionId: bigint;
  onAction: () => void;
}) {
  const config = useConfig();
  const [showFundingModal, setShowFundingModal] = useState(false);
  const [fundingAmount, setFundingAmount] = useState('10');
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellSize, setSellSize] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasContracts = CONTRACTS.evOptionManager !== '0x0000000000000000000000000000000000000000';

  // Get position data
  const { data: position } = useReadContract({
    address: CONTRACTS.evOptionManager,
    abi: EV_OPTION_MANAGER_ABI,
    functionName: 'getPosition',
    args: [positionId],
    query: { enabled: hasContracts },
  }) as { data: Position | undefined };

  // Get pending funding
  const { data: pendingFunding } = useReadContract({
    address: CONTRACTS.evOptionManager,
    abi: EV_OPTION_MANAGER_ABI,
    functionName: 'getPendingFunding',
    args: [positionId],
    query: { enabled: hasContracts },
  });

  // Get intrinsic value (no underlying param in CLUM)
  const { data: intrinsicValue } = useReadContract({
    address: CONTRACTS.fundingDeriver,
    abi: FUNDING_DERIVER_ABI,
    functionName: 'getIntrinsicValue',
    args: position ? [position.optionType, position.strike] : undefined,
    query: { enabled: hasContracts && !!position },
  });

  // Get funding rate
  const { data: fundingPerSecond } = useReadContract({
    address: CONTRACTS.fundingDeriver,
    abi: FUNDING_DERIVER_ABI,
    functionName: 'getFundingPerSecond',
    args: position ? [position.optionType, position.strike, position.size] : undefined,
    query: { enabled: hasContracts && !!position },
  });

  // Sell quote from CLUM
  const sellSizeWad = sellSize ? parseUnits(sellSize, 18) : 0n;
  const { data: sellQuote } = useReadContract({
    address: CONTRACTS.clumEngine,
    abi: CLUM_ENGINE_ABI,
    functionName: 'quoteSell',
    args: position ? [position.optionType, position.strike, sellSizeWad] : undefined,
    query: { enabled: hasContracts && !!position && sellSizeWad > 0n },
  });

  // Check if liquidatable
  const { data: isLiquidatable } = useReadContract({
    address: CONTRACTS.evOptionManager,
    abi: EV_OPTION_MANAGER_ABI,
    functionName: 'isLiquidatable',
    args: [positionId],
    query: { enabled: hasContracts },
  });

  const { writeContractAsync } = useWriteContract();

  if (!position || !position.isActive) {
    return null;
  }

  const isCall = position.optionType === OptionType.CALL;
  const strikeFormatted = Number(formatUnits(position.strike, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const sizeFormatted = formatUnits(position.size, 18);
  const fundingBalance = formatUnits(position.fundingBalance, USDC_DECIMALS);
  const intrinsic = intrinsicValue ? Number(formatUnits(intrinsicValue, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0';
  const isITM = intrinsicValue && intrinsicValue > 0n;
  const fundingPerDay = fundingPerSecond
    ? Number(formatUnits(fundingPerSecond, USDC_DECIMALS)) * 86400
    : 0;

  const handleExercise = async () => {
    if (!hasContracts) return;
    try {
      setError(null);
      setIsProcessing(true);
      setProcessingStatus('Exercising option...');
      const hash = await writeContractAsync({
        address: CONTRACTS.evOptionManager,
        abi: EV_OPTION_MANAGER_ABI,
        functionName: 'exercise',
        args: [positionId],
      });
      setProcessingStatus('Waiting for confirmation...');
      await waitForTransactionReceipt(config, { hash });
      onAction();
    } catch (err: any) {
      console.error('Exercise failed:', err);
      setError(err.shortMessage || err.message || 'Exercise failed');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleDepositFunding = async () => {
    if (!hasContracts) return;
    try {
      setError(null);
      setIsProcessing(true);
      const amount = parseUnits(fundingAmount, USDC_DECIMALS);

      setProcessingStatus('Approving USDC...');
      const approveHash = await writeContractAsync({
        address: CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.evOptionManager, amount],
      });
      setProcessingStatus('Waiting for approval...');
      await waitForTransactionReceipt(config, { hash: approveHash });

      setProcessingStatus('Depositing funding...');
      const depositHash = await writeContractAsync({
        address: CONTRACTS.evOptionManager,
        abi: EV_OPTION_MANAGER_ABI,
        functionName: 'depositFunding',
        args: [positionId, amount],
      });
      setProcessingStatus('Waiting for confirmation...');
      await waitForTransactionReceipt(config, { hash: depositHash });

      setShowFundingModal(false);
      onAction();
    } catch (err: any) {
      console.error('Deposit funding failed:', err);
      setError(err.shortMessage || err.message || 'Deposit funding failed');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleSell = async () => {
    if (!hasContracts) return;
    try {
      setError(null);
      setIsProcessing(true);
      setProcessingStatus('Selling position to CLUM...');
      const hash = await writeContractAsync({
        address: CONTRACTS.evOptionManager,
        abi: EV_OPTION_MANAGER_ABI,
        functionName: 'sellOption',
        args: [positionId, sellSizeWad],
      });
      setProcessingStatus('Waiting for confirmation...');
      await waitForTransactionReceipt(config, { hash });
      setShowSellModal(false);
      onAction();
    } catch (err: any) {
      console.error('Sell failed:', err);
      setError(err.shortMessage || err.message || 'Sell failed');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className={`px-4 py-2 ${isCall ? 'bg-call/20' : 'bg-put/20'} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`font-bold ${isCall ? 'text-call' : 'text-put'}`}>
            {isCall ? 'CALL' : 'PUT'}
          </span>
          <span className="text-gray-300">#{positionId.toString()}</span>
        </div>
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
            <span className="text-gray-400">Intrinsic Value</span>
            <p className={`font-medium ${isITM ? 'text-call' : 'text-gray-400'}`}>
              ${intrinsic}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Funding Balance</span>
            <p className={`font-medium ${Number(fundingBalance) < 5 ? 'text-red-400' : 'text-white'}`}>
              ${Number(fundingBalance).toLocaleString()} USDC
            </p>
          </div>
          <div>
            <span className="text-gray-400">Funding Rate</span>
            <p className="text-white font-medium">
              {fundingPerDay > 0 ? `$${fundingPerDay.toFixed(4)}/day` : '---'}
            </p>
          </div>
        </div>

        {pendingFunding && pendingFunding > 0n && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-sm text-yellow-400">
            Pending funding: ${formatUnits(pendingFunding, USDC_DECIMALS)}
          </div>
        )}

        {isLiquidatable && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-sm text-red-400">
            Warning: Position is at risk of liquidation! Add funding now.
          </div>
        )}

        {isProcessing && processingStatus && (
          <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-2 text-sm text-primary-400 animate-pulse">
            {processingStatus}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {isITM && (
            <button
              onClick={handleExercise}
              disabled={isProcessing}
              className="flex-1 bg-call hover:bg-call/80 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
            >
              Exercise
            </button>
          )}
          <button
            onClick={() => {
              setSellSize(formatUnits(position.size, 18));
              setShowSellModal(true);
            }}
            disabled={isProcessing}
            className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
          >
            Sell Back
          </button>
          <button
            onClick={() => setShowFundingModal(true)}
            disabled={isProcessing}
            className="flex-1 bg-primary-600 hover:bg-primary-500 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
          >
            Add Funding
          </button>
        </div>
      </div>

      {/* Funding Modal */}
      {showFundingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Deposit Funding</h3>
            <p className="text-sm text-gray-400 mb-4">
              Current balance: ${Number(fundingBalance).toLocaleString()} USDC
            </p>
            <input
              type="number"
              value={fundingAmount}
              onChange={(e) => setFundingAmount(e.target.value)}
              placeholder="10"
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
                disabled={isProcessing}
                className="flex-1 bg-primary-600 hover:bg-primary-500 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg"
              >
                {isProcessing ? processingStatus || 'Processing...' : 'Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Modal */}
      {showSellModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Sell Position to CLUM</h3>
            <label className="block text-sm text-gray-400 mb-2">Size to sell (ETH)</label>
            <input
              type="number"
              value={sellSize}
              onChange={(e) => setSellSize(e.target.value)}
              placeholder="0.01"
              step="0.01"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white mb-3"
            />
            {sellQuote && (
              <p className="text-sm text-gray-300 mb-4">
                Estimated revenue: <span className="text-call font-medium">
                  ${Number(formatUnits(sellQuote, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
                </span>
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowSellModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSell}
                disabled={isProcessing || !sellSize}
                className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg"
              >
                {isProcessing ? processingStatus || 'Processing...' : 'Sell'}
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

  const hasContracts = CONTRACTS.evOptionManager !== '0x0000000000000000000000000000000000000000';

  // Get user's positions
  const { data: positionIds, refetch } = useReadContract({
    address: CONTRACTS.evOptionManager,
    abi: EV_OPTION_MANAGER_ABI,
    functionName: 'getOwnerPositions',
    args: address ? [address] : undefined,
    query: { enabled: hasContracts && !!address },
  });

  const handleRefresh = () => {
    refetch();
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

  const hasPositions = positionIds && positionIds.length > 0;

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

      {hasPositions ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {positionIds.map((id) => (
            <PositionCard
              key={id.toString()}
              positionId={id}
              onAction={handleRefresh}
            />
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
          <p className="text-gray-400">No positions found</p>
          <p className="text-sm text-gray-500 mt-1">
            Buy an option to get started
          </p>
        </div>
      )}
    </div>
  );
}
