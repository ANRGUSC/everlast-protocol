'use client';

import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import Link from 'next/link';
import { CONTRACTS, FUNDING_ORACLE_ABI, OPTION_NFT_ABI, OPTION_MANAGER_ABI } from '@/config/contracts';

export default function Dashboard() {
  const { address, isConnected } = useAccount();

  // Get ETH price
  const { data: ethPrice } = useReadContract({
    address: CONTRACTS.fundingOracle,
    abi: FUNDING_ORACLE_ABI,
    functionName: 'getSpotPrice',
    args: [CONTRACTS.weth],
  });

  // Get user's long positions (NFTs)
  const { data: longPositions } = useReadContract({
    address: CONTRACTS.optionNFT,
    abi: OPTION_NFT_ABI,
    functionName: 'tokensOfOwner',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Get user's short positions
  const { data: shortPositions } = useReadContract({
    address: CONTRACTS.optionManager,
    abi: OPTION_MANAGER_ABI,
    functionName: 'getShortPositions',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const formatPrice = (price: bigint | undefined) => {
    if (!price) return '---';
    return `$${Number(formatUnits(price, 8)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-white mb-4">
          Options That <span className="text-primary-500">Never Expire</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Trade perpetual calls and puts on Base. Your positions live as NFTs
          with continuous funding - hold forever or exercise anytime.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-1">ETH Price</div>
          <div className="text-2xl font-bold text-white">{formatPrice(ethPrice)}</div>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-1">Your Long Positions</div>
          <div className="text-2xl font-bold text-white">
            {isConnected ? (longPositions?.length ?? 0) : '---'}
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-1">Your Short Positions</div>
          <div className="text-2xl font-bold text-white">
            {isConnected ? (shortPositions?.length ?? 0) : '---'}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/open"
          className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 border border-primary-500 hover:from-primary-500 hover:to-primary-600 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Open Position</h3>
              <p className="text-primary-200">
                Create a new call or put option position as the short seller
              </p>
            </div>
            <div className="text-4xl group-hover:translate-x-2 transition-transform">
              &rarr;
            </div>
          </div>
        </Link>

        <Link
          href="/positions"
          className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">My Positions</h3>
              <p className="text-gray-400">
                View and manage your long and short option positions
              </p>
            </div>
            <div className="text-4xl text-gray-500 group-hover:translate-x-2 group-hover:text-white transition-all">
              &rarr;
            </div>
          </div>
        </Link>
      </div>

      {/* How It Works */}
      <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-6">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="w-12 h-12 bg-call/20 rounded-lg flex items-center justify-center text-call text-xl font-bold mb-4">
              1
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Open Position</h3>
            <p className="text-gray-400 text-sm">
              Short sellers deposit collateral (WETH for calls, USDC for puts) and specify
              the option parameters. An NFT is minted to the long buyer.
            </p>
          </div>
          <div>
            <div className="w-12 h-12 bg-primary-500/20 rounded-lg flex items-center justify-center text-primary-500 text-xl font-bold mb-4">
              2
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Continuous Funding</h3>
            <p className="text-gray-400 text-sm">
              Long holders pay funding (rent) continuously to shorts. This represents
              the time value of the option and keeps the position open.
            </p>
          </div>
          <div>
            <div className="w-12 h-12 bg-put/20 rounded-lg flex items-center justify-center text-put text-xl font-bold mb-4">
              3
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Exercise or Close</h3>
            <p className="text-gray-400 text-sm">
              Long holders can exercise in-the-money options anytime. If funding runs out,
              the position closes. Undercollateralized positions can be liquidated.
            </p>
          </div>
        </div>
      </div>

      {/* Network Info */}
      <div className="text-center text-gray-500 text-sm">
        <p>Currently deployed on Base Sepolia Testnet</p>
        <p className="mt-1">
          OptionManager: <code className="text-gray-400">{CONTRACTS.optionManager}</code>
        </p>
      </div>
    </div>
  );
}
