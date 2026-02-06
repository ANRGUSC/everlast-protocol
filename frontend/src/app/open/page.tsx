'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACTS, OPTION_MANAGER_ABI, FUNDING_ORACLE_ABI, ERC20_ABI, OptionType } from '@/config/contracts';

export default function OpenPosition() {
  const { address, isConnected } = useAccount();
  const [optionType, setOptionType] = useState<OptionType>(OptionType.CALL);
  const [strike, setStrike] = useState('');
  const [size, setSize] = useState('0.01');
  const [longAddress, setLongAddress] = useState('');
  const [initialFunding, setInitialFunding] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'approve' | 'open'>('approve');

  // Get ETH price
  const { data: ethPrice } = useReadContract({
    address: CONTRACTS.fundingOracle,
    abi: FUNDING_ORACLE_ABI,
    functionName: 'getSpotPrice',
    args: [CONTRACTS.weth],
  });

  // Set default strike to current price
  useEffect(() => {
    if (ethPrice && !strike) {
      const priceInUsd = Number(formatUnits(ethPrice, 8));
      setStrike(Math.round(priceInUsd).toString());
    }
  }, [ethPrice, strike]);

  // Calculate required collateral
  const calculateCollateral = () => {
    if (!strike || !size) return '0';
    const sizeNum = parseFloat(size);
    const strikeNum = parseFloat(strike);

    if (optionType === OptionType.CALL) {
      // For calls: collateral is in WETH (size amount)
      return `${sizeNum} WETH`;
    } else {
      // For puts: collateral is in USDC (strike * size)
      return `${(strikeNum * sizeNum).toLocaleString()} USDC`;
    }
  };

  // Approve token
  const { writeContract: approve, data: approveHash } = useWriteContract();
  const { isLoading: isApproving, isSuccess: isApproved } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Open position
  const { writeContract: openPosition, data: openHash, error: openError, isPending: openPending } = useWriteContract();
  const { isLoading: isOpening, isSuccess: isOpened } = useWaitForTransactionReceipt({
    hash: openHash,
  });

  // Show write errors
  useEffect(() => {
    if (openError) {
      console.error('Open position error:', openError);
      setError(openError.message || 'Failed to open position');
    }
  }, [openError]);

  const handleApprove = () => {
    const token = optionType === OptionType.CALL ? CONTRACTS.weth : CONTRACTS.usdc;
    const amount = optionType === OptionType.CALL
      ? parseUnits(size || '0', 18)
      : parseUnits((parseFloat(strike || '0') * parseFloat(size || '0')).toString(), 6);

    approve({
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.optionManager, amount],
    });
  };

  const handleOpenPosition = () => {
    if (!longAddress || !strike || !size) return;
    setError(null);

    try {
      const strikeAmount = parseUnits(strike, 6); // USDC decimals
      const sizeAmount = parseUnits(size, 18); // WETH decimals
      const fundingAmount = parseUnits(initialFunding || '0', 6); // USDC decimals

      console.log('Opening position with:', {
        optionType,
        underlying: CONTRACTS.weth,
        strike: strikeAmount.toString(),
        size: sizeAmount.toString(),
        longAddress,
        fundingAmount: fundingAmount.toString(),
      });

      openPosition({
        address: CONTRACTS.optionManager,
        abi: OPTION_MANAGER_ABI,
        functionName: 'openPosition',
        args: [
          optionType,
          CONTRACTS.weth,
          strikeAmount,
          sizeAmount,
          longAddress as `0x${string}`,
          fundingAmount,
        ],
      }, {
        onError: (err) => {
          console.error('Transaction error:', err);
          setError(err.message || 'Transaction failed');
        },
      });
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Failed to open position');
    }
  };

  useEffect(() => {
    if (isApproved) {
      setStep('open');
    }
  }, [isApproved]);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
        <p className="text-gray-400">Please connect your wallet to open a position</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">Open Position</h1>

      {isOpened ? (
        <div className="bg-green-900/50 border border-green-500 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-bold text-white mb-2">Position Opened!</h2>
          <p className="text-gray-300 mb-4">
            Your option position has been created successfully.
          </p>
          <a
            href={`https://sepolia.basescan.org/tx/${openHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:text-primary-300"
          >
            View transaction &rarr;
          </a>
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
            {ethPrice && (
              <p className="text-sm text-gray-500 mt-1">
                Current ETH price: ${Number(formatUnits(ethPrice, 8)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
            <p className="text-sm text-gray-500 mt-1">
              Minimum: 0.01 ETH
            </p>
          </div>

          {/* Long Address */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Long Position Holder (receives NFT)
            </label>
            <input
              type="text"
              value={longAddress}
              onChange={(e) => setLongAddress(e.target.value)}
              placeholder="0x..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 font-mono text-sm"
            />
            <button
              onClick={() => setLongAddress(address || '')}
              className="text-sm text-primary-400 hover:text-primary-300 mt-1"
            >
              Use my address
            </button>
          </div>

          {/* Initial Funding */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Initial Funding from Long (USDC)
            </label>
            <input
              type="number"
              value={initialFunding}
              onChange={(e) => setInitialFunding(e.target.value)}
              placeholder="100"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              This covers the continuous funding payments
            </p>
          </div>

          {/* Summary */}
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
                <span className="text-gray-400">Required Collateral</span>
                <span className="text-white font-medium">{calculateCollateral()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">You are</span>
                <span className="text-white">Short Seller</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {step === 'approve' ? (
            <button
              onClick={handleApprove}
              disabled={isApproving || !strike || !size}
              className="w-full bg-primary-600 hover:bg-primary-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {isApproving ? 'Approving...' : `Approve ${optionType === OptionType.CALL ? 'WETH' : 'USDC'}`}
            </button>
          ) : (
            <button
              onClick={handleOpenPosition}
              disabled={isOpening || openPending || !longAddress || !strike || !size}
              className="w-full bg-primary-600 hover:bg-primary-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {openPending ? 'Confirm in Wallet...' : isOpening ? 'Opening Position...' : 'Open Position'}
            </button>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <p className="text-xs text-gray-500 mt-4 text-center">
            As the short seller, you deposit collateral and earn funding from the long holder.
          </p>
        </div>
      )}
    </div>
  );
}
