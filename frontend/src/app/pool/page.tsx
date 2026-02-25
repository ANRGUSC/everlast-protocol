'use client';

import { useState } from 'react';
import { useAccount, useConfig, useReadContract, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { parseUnits, formatUnits } from 'viem';
import {
  CONTRACTS,
  LP_POOL_ABI,
  ERC20_ABI,
  USDC_DECIMALS,
} from '@/config/contracts';

export default function Pool() {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const [depositAmount, setDepositAmount] = useState('');
  const [redeemShares, setRedeemShares] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasContracts = CONTRACTS.lpPool !== '0x0000000000000000000000000000000000000000';

  // ─── Pool Statistics ────────────────────────────────────────────────────────
  const { data: totalAssets } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'totalAssets',
    query: { enabled: hasContracts },
  });

  const { data: totalPremiums } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'totalPremiums',
    query: { enabled: hasContracts },
  });

  const { data: totalFunding } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'totalFunding',
    query: { enabled: hasContracts },
  });

  const { data: totalLosses } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'totalLosses',
    query: { enabled: hasContracts },
  });

  // ─── User LP Position ──────────────────────────────────────────────────────
  const { data: lpShares, refetch: refetchShares } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: hasContracts && !!address },
  });

  const { data: shareValue } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'convertToAssets',
    args: lpShares ? [lpShares] : undefined,
    query: { enabled: hasContracts && !!lpShares && lpShares > 0n },
  });

  // ─── Deposit Preview ──────────────────────────────────────────────────────
  const depositAmountParsed = depositAmount ? parseUnits(depositAmount, USDC_DECIMALS) : 0n;
  const { data: previewShares } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'convertToShares',
    args: [depositAmountParsed],
    query: { enabled: hasContracts && depositAmountParsed > 0n },
  });

  // ─── Redeem Preview ───────────────────────────────────────────────────────
  const redeemSharesParsed = redeemShares ? parseUnits(redeemShares, 18) : 0n;
  const { data: previewAssets } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'convertToAssets',
    args: [redeemSharesParsed],
    query: { enabled: hasContracts && redeemSharesParsed > 0n },
  });

  const { writeContractAsync } = useWriteContract();

  // Share price: 1 share (1e18) → how much USDC
  const { data: oneShareValue } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'convertToAssets',
    args: [BigInt(1e18)],
    query: { enabled: hasContracts },
  });

  const handleDeposit = async () => {
    if (!address || !depositAmount) return;
    setError(null);
    setIsProcessing(true);

    try {
      const amount = parseUnits(depositAmount, USDC_DECIMALS);

      setProcessingStatus('Approving USDC...');
      const approveHash = await writeContractAsync({
        address: CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.lpPool, amount],
      });
      setProcessingStatus('Waiting for approval...');
      await waitForTransactionReceipt(config, { hash: approveHash });

      setProcessingStatus('Depositing to LP Pool...');
      const depositHash = await writeContractAsync({
        address: CONTRACTS.lpPool,
        abi: LP_POOL_ABI,
        functionName: 'deposit',
        args: [amount, address],
      });
      setProcessingStatus('Waiting for confirmation...');
      await waitForTransactionReceipt(config, { hash: depositHash });

      setDepositAmount('');
      refetchShares();
    } catch (err: any) {
      console.error('Deposit failed:', err);
      setError(err.shortMessage || err.message || 'Deposit failed');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleRedeem = async () => {
    if (!address || !redeemShares) return;
    setError(null);
    setIsProcessing(true);

    try {
      const shares = parseUnits(redeemShares, 18);

      setProcessingStatus('Redeeming shares...');
      const redeemHash = await writeContractAsync({
        address: CONTRACTS.lpPool,
        abi: LP_POOL_ABI,
        functionName: 'redeem',
        args: [shares, address, address],
      });
      setProcessingStatus('Waiting for confirmation...');
      await waitForTransactionReceipt(config, { hash: redeemHash });

      setRedeemShares('');
      refetchShares();
    } catch (err: any) {
      console.error('Redeem failed:', err);
      setError(err.shortMessage || err.message || 'Redeem failed');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
        <p className="text-gray-400">Please connect your wallet to manage LP positions</p>
      </div>
    );
  }

  const formatUsdc = (val: bigint | undefined) =>
    val ? Number(formatUnits(val, USDC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">LP Pool</h1>
        <p className="text-gray-400">
          Provide liquidity to the CLUM AMM and earn premiums + funding from option traders.
        </p>
      </div>

      {/* Your LP Position */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Your LP Position</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">LP Shares</p>
            <p className="text-xl font-bold text-white">
              {lpShares ? Number(formatUnits(lpShares, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0'}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Value (USDC)</p>
            <p className="text-xl font-bold text-white">
              ${formatUsdc(shareValue)}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Share Price</p>
            <p className="text-xl font-bold text-white">
              ${oneShareValue ? Number(formatUnits(oneShareValue, USDC_DECIMALS)).toFixed(4) : '---'}
            </p>
          </div>
        </div>
      </div>

      {/* Pool Statistics */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Pool Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total Assets</p>
            <p className="text-lg font-bold text-white">${formatUsdc(totalAssets)}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total Premiums</p>
            <p className="text-lg font-bold text-call">${formatUsdc(totalPremiums)}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total Funding</p>
            <p className="text-lg font-bold text-call">${formatUsdc(totalFunding)}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total Losses</p>
            <p className="text-lg font-bold text-put">${formatUsdc(totalLosses)}</p>
          </div>
        </div>
      </div>

      {/* Deposit */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Deposit USDC</h2>
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="Amount in USDC"
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={handleDeposit}
            disabled={isProcessing || !depositAmount}
            className="bg-primary-600 hover:bg-primary-500 disabled:bg-gray-600 text-white py-3 px-6 rounded-lg font-medium transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Deposit'}
          </button>
        </div>
        {previewShares && depositAmountParsed > 0n && (
          <p className="text-sm text-gray-400">
            You will receive: <span className="text-white font-medium">
              {Number(formatUnits(previewShares, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
            </span>
          </p>
        )}
      </div>

      {/* Withdraw */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Redeem Shares</h2>
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            value={redeemShares}
            onChange={(e) => setRedeemShares(e.target.value)}
            placeholder="Shares to redeem"
            step="0.0001"
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={handleRedeem}
            disabled={isProcessing || !redeemShares}
            className="bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white py-3 px-6 rounded-lg font-medium transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Redeem'}
          </button>
        </div>
        {lpShares && lpShares > 0n && (
          <button
            onClick={() => setRedeemShares(formatUnits(lpShares, 18))}
            className="text-sm text-primary-400 hover:text-primary-300 mb-2"
          >
            Max: {Number(formatUnits(lpShares, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
          </button>
        )}
        {previewAssets && redeemSharesParsed > 0n && (
          <p className="text-sm text-gray-400">
            You will receive: <span className="text-white font-medium">
              ${formatUsdc(previewAssets)} USDC
            </span>
          </p>
        )}
      </div>

      {/* Processing / Error */}
      {isProcessing && processingStatus && (
        <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-3 text-sm text-primary-400 animate-pulse">
          {processingStatus}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-500 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Info */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-3">How LP Returns Work</h3>
        <ul className="space-y-2 text-sm text-gray-400">
          <li>
            <span className="text-call">+</span> <span className="text-white">Premiums:</span> Earned when traders buy options from the CLUM AMM.
          </li>
          <li>
            <span className="text-call">+</span> <span className="text-white">Funding:</span> Continuous funding payments from option holders.
          </li>
          <li>
            <span className="text-put">-</span> <span className="text-white">Losses:</span> Payouts when traders exercise in-the-money options.
          </li>
        </ul>
        <p className="text-xs text-gray-500 mt-4">
          LP shares are ERC-4626 vault tokens (18 decimals). The underlying asset is USDC (6 decimals).
        </p>
      </div>
    </div>
  );
}
