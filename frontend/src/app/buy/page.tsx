'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConfig, useReadContract, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { parseUnits, formatUnits } from 'viem';
import {
  CONTRACTS,
  EV_OPTION_MANAGER_ABI,
  CLUM_ENGINE_ABI,
  BUCKET_REGISTRY_ABI,
  FUNDING_DERIVER_ABI,
  ERC20_ABI,
  OptionType,
  WAD,
  USDC_DECIMALS,
} from '@/config/contracts';

export default function BuyOption() {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const [optionType, setOptionType] = useState<OptionType>(OptionType.CALL);
  const [strike, setStrike] = useState('');
  const [size, setSize] = useState('0.01');
  const [initialFunding, setInitialFunding] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);

  const hasContracts = CONTRACTS.evOptionManager !== '0x0000000000000000000000000000000000000000';

  // Get ETH spot price from BucketRegistry (WAD)
  const { data: spotPrice } = useReadContract({
    address: CONTRACTS.bucketRegistry,
    abi: BUCKET_REGISTRY_ABI,
    functionName: 'getSpotPrice',
    query: { enabled: hasContracts },
  });

  // Set default strike from spot price
  useEffect(() => {
    if (spotPrice && !strike) {
      const priceInUsd = Number(formatUnits(spotPrice, 18));
      setStrike(Math.round(priceInUsd).toString());
    }
  }, [spotPrice, strike]);

  // Convert strike to WAD for CLUM queries
  const strikeWad = strike ? parseUnits(strike, 18) : 0n;
  const sizeWad = size ? parseUnits(size, 18) : 0n;

  // Live CLUM quote (premium in WAD)
  const { data: premiumWad } = useReadContract({
    address: CONTRACTS.clumEngine,
    abi: CLUM_ENGINE_ABI,
    functionName: 'quoteBuy',
    args: [optionType, strikeWad, sizeWad],
    query: { enabled: hasContracts && strikeWad > 0n && sizeWad > 0n },
  });

  // Mark price from FundingDeriver
  const { data: markPrice } = useReadContract({
    address: CONTRACTS.fundingDeriver,
    abi: FUNDING_DERIVER_ABI,
    functionName: 'getMarkPrice',
    args: [optionType, strikeWad],
    query: { enabled: hasContracts && strikeWad > 0n },
  });

  // Funding rate
  const { data: fundingPerSecond } = useReadContract({
    address: CONTRACTS.fundingDeriver,
    abi: FUNDING_DERIVER_ABI,
    functionName: 'getFundingPerSecond',
    args: [optionType, strikeWad, sizeWad],
    query: { enabled: hasContracts && strikeWad > 0n && sizeWad > 0n },
  });

  const { writeContractAsync } = useWriteContract();

  // Premium in USDC (WAD → divide by 1e12 to get USDC 1e6 equivalent for display)
  const premiumUsdc = premiumWad ? Number(formatUnits(premiumWad, 18)) : 0;
  const fundingNum = parseFloat(initialFunding || '0');
  const totalCost = premiumUsdc + fundingNum;

  // Funding rate per day for display (contract returns WAD-scaled value)
  const fundingPerDay = fundingPerSecond
    ? Number(formatUnits(fundingPerSecond, 18)) * 86400
    : 0;

  const handleBuy = async () => {
    if (!address || !strike || !size || !initialFunding || !hasContracts) return;
    setError(null);
    setIsProcessing(true);

    try {
      // buyOption takes strike in USDC 1e6
      const strikeUsdc = parseUnits(strike, USDC_DECIMALS);
      const fundingUsdc = parseUnits(initialFunding, USDC_DECIMALS);

      // Total USDC to approve = premium (converted from WAD to USDC) + initialFunding
      // premiumWad is in WAD (1e18), USDC is 1e6, so divide by 1e12
      const premiumUsdcRaw = premiumWad ? premiumWad / BigInt(1e12) : 0n;
      const totalApproval = premiumUsdcRaw + fundingUsdc + parseUnits('1', USDC_DECIMALS); // +1 USDC buffer for rounding

      // Step 1: Approve USDC
      setProcessingStatus('Approving USDC...');
      const approveHash = await writeContractAsync({
        address: CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.evOptionManager, totalApproval],
      });
      setProcessingStatus('Waiting for approval...');
      await waitForTransactionReceipt(config, { hash: approveHash });

      // Step 2: buyOption(type, strikeUsdc, sizeWad, fundingUsdc)
      setProcessingStatus('Buying option...');
      const buyHash = await writeContractAsync({
        address: CONTRACTS.evOptionManager,
        abi: EV_OPTION_MANAGER_ABI,
        functionName: 'buyOption',
        args: [optionType, strikeUsdc, sizeWad, fundingUsdc],
      });
      setProcessingStatus('Waiting for confirmation...');
      await waitForTransactionReceipt(config, { hash: buyHash });

      setTxHash(buyHash);
    } catch (err: any) {
      console.error('Buy failed:', err);
      setError(err.shortMessage || err.message || 'Transaction failed');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
        <p className="text-gray-400">Please connect your wallet to buy an option</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">Buy Option</h1>

      {txHash ? (
        <div className="bg-green-900/50 border border-green-500 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-bold text-white mb-2">Option Purchased!</h2>
          <p className="text-gray-300 mb-4">
            Your everlasting option has been created successfully.
          </p>
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:text-primary-300"
          >
            View transaction &rarr;
          </a>
          <div className="mt-4">
            <button
              onClick={() => setTxHash(null)}
              className="text-sm text-gray-400 hover:text-white"
            >
              Buy another option
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          {/* Option Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Option Type
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setOptionType(OptionType.CALL)}
                className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                  optionType === OptionType.CALL
                    ? 'bg-call text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                CALL
              </button>
              <button
                onClick={() => setOptionType(OptionType.PUT)}
                className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                  optionType === OptionType.PUT
                    ? 'bg-put text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                PUT
              </button>
            </div>
          </div>

          {/* Strike Price */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Strike Price (USDC)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
                placeholder="2500"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 pl-8 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
              />
            </div>
            {spotPrice && (
              <p className="text-sm text-gray-500 mt-1">
                Current ETH price: ${Number(formatUnits(spotPrice, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Size */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Size (ETH)
            </label>
            <input
              type="number"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="0.01"
              step="0.01"
              min="0.01"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>

          {/* Live Quote Panel */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6 space-y-2">
            <h3 className="text-sm font-medium text-gray-400 mb-3">CLUM Quote</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Premium</span>
              <span className="text-white font-medium">
                {premiumWad ? `$${premiumUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '---'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Mark Price</span>
              <span className="text-white font-medium">
                {markPrice ? `$${Number(formatUnits(markPrice, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '---'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Funding Rate</span>
              <span className="text-white font-medium">
                {fundingPerSecond ? `$${fundingPerDay.toFixed(4)}/day` : '---'}
              </span>
            </div>
          </div>

          {/* Initial Funding */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Initial Funding (USDC)
            </label>
            <input
              type="number"
              value={initialFunding}
              onChange={(e) => setInitialFunding(e.target.value)}
              placeholder="10"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Covers continuous funding payments. Top up anytime to keep your position active.
            </p>
          </div>

          {/* Total Cost Summary */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Option Type</span>
                <span className={optionType === OptionType.CALL ? 'text-call' : 'text-put'}>
                  {optionType === OptionType.CALL ? 'CALL' : 'PUT'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Premium</span>
                <span className="text-white">
                  ${premiumUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Initial Funding</span>
                <span className="text-white">${fundingNum.toLocaleString()} USDC</span>
              </div>
              <div className="border-t border-gray-700 pt-2 flex justify-between font-medium">
                <span className="text-gray-300">Total Cost</span>
                <span className="text-white">
                  ~${totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
                </span>
              </div>
            </div>
          </div>

          {/* Processing Status */}
          {isProcessing && processingStatus && (
            <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-3 mb-4 text-sm text-primary-400 animate-pulse">
              {processingStatus}
            </div>
          )}

          {/* Buy Button */}
          <button
            onClick={handleBuy}
            disabled={isProcessing || !strike || !size || !initialFunding || !hasContracts}
            className="w-full bg-primary-600 hover:bg-primary-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Approve & Buy Option'}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <p className="text-xs text-gray-500 mt-4 text-center">
            You pay USDC premium + initial funding. The CLUM AMM is your counterparty.
          </p>
        </div>
      )}
    </div>
  );
}
