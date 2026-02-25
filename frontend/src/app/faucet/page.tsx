'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseEther, formatEther, formatUnits } from 'viem';
import { CONTRACTS } from '@/config/contracts';

const WETH_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export default function Faucet() {
  const { address, isConnected } = useAccount();
  const [wrapAmount, setWrapAmount] = useState('0.01');

  // Get WETH balance
  const { data: wethBalance, refetch: refetchWeth } = useReadContract({
    address: CONTRACTS.weth,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Get USDC balance
  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: CONTRACTS.usdc,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Wrap ETH
  const { writeContract: wrapEth, data: wrapHash } = useWriteContract();
  const { isLoading: isWrapping, isSuccess: isWrapped } = useWaitForTransactionReceipt({
    hash: wrapHash,
  });

  const handleWrap = () => {
    if (!wrapAmount) return;
    wrapEth({
      address: CONTRACTS.weth,
      abi: WETH_ABI,
      functionName: 'deposit',
      value: parseEther(wrapAmount),
    });
  };

  const handleRefresh = () => {
    refetchWeth();
    refetchUsdc();
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
        <p className="text-gray-400">Please connect your wallet to use the faucet</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Get Test Tokens</h1>
        <p className="text-gray-400">
          Get test USDC for trading options and providing LP liquidity, or wrap ETH to WETH for gas.
        </p>
      </div>

      {/* Current Balances */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Your Balances</h2>
          <button
            onClick={handleRefresh}
            className="text-sm text-primary-400 hover:text-primary-300"
          >
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">USDC</p>
            <p className="text-xl font-bold text-white">
              {usdcBalance ? formatUnits(usdcBalance, 6) : '0'} USDC
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">WETH</p>
            <p className="text-xl font-bold text-white">
              {wethBalance ? formatEther(wethBalance) : '0'} WETH
            </p>
          </div>
        </div>
      </div>

      {/* Get USDC */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Get Test USDC</h2>
        <p className="text-sm text-gray-400 mb-4">
          USDC is used for everything in EverLast: paying option premiums, funding your positions, and providing LP liquidity.
        </p>

        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-gray-300 mb-3">To get test USDC on Base Sepolia:</p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-400">
            <li>
              Visit the{' '}
              <a
                href="https://faucet.circle.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-400 hover:text-primary-300 underline"
              >
                Circle USDC Faucet
              </a>
            </li>
            <li>Select &quot;Base Sepolia&quot; network</li>
            <li>Enter your wallet address</li>
            <li>Complete the captcha and claim USDC</li>
          </ol>
          <div className="mt-4 p-3 bg-gray-800 rounded text-xs font-mono text-gray-400 break-all">
            Your address: {address}
          </div>
        </div>
      </div>

      {/* Wrap ETH */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Wrap ETH to WETH</h2>
        <p className="text-sm text-gray-400 mb-4">
          WETH wrapping is available if needed for gas or other operations on Base.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="number"
            value={wrapAmount}
            onChange={(e) => setWrapAmount(e.target.value)}
            placeholder="0.01"
            step="0.001"
            min="0.001"
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={handleWrap}
            disabled={isWrapping || !wrapAmount}
            className="bg-primary-600 hover:bg-primary-500 disabled:bg-gray-600 text-white py-3 px-6 rounded-lg font-medium transition-colors"
          >
            {isWrapping ? 'Wrapping...' : 'Wrap ETH'}
          </button>
        </div>

        {isWrapped && (
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-3 text-green-400 text-sm">
            Successfully wrapped ETH to WETH! Click Refresh to see updated balance.
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-300">
        <strong>Tip:</strong> All option trading on EverLast is USDC-settled. You need USDC to buy options,
        deposit funding, and provide LP liquidity. Get test USDC from the Circle faucet above.
      </div>
    </div>
  );
}
