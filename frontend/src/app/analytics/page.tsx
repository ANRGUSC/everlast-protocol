'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import {
  CONTRACTS,
  CLUM_ENGINE_ABI,
  BUCKET_REGISTRY_ABI,
  FUNDING_DERIVER_ABI,
  OptionType,
  WAD,
} from '@/config/contracts';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';

// ─── Constants ───────────────────────────────────────────────────────────────
const CALL_COLOR = '#10B981';
const PUT_COLOR = '#EF4444';
const PRIMARY_COLOR = '#0ea5e9';
const GRID_COLOR = 'rgba(75, 85, 99, 0.3)';
const SIZE_WAD = WAD / 100n; // 0.01 ETH for quoting

// ─── Intersection Observer hook (matches home page) ──────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, prefix, suffix }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 shadow-xl">
      <p className="text-xs text-gray-400 mb-1.5">{prefix ?? 'Strike'}: ${Number(label).toLocaleString()}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value < 0.01 && entry.value > 0
            ? entry.value.toExponential(2)
            : entry.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : entry.value}
          {suffix ?? ''}
        </p>
      ))}
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div className="h-80 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading on-chain data...</p>
      </div>
    </div>
  );
}

// ─── Chart card wrapper ──────────────────────────────────────────────────────
function ChartCard({
  title,
  subtitle,
  children,
  delay = 0,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  delay?: number;
}) {
  const sec = useInView();
  return (
    <div
      ref={sec.ref}
      className={`bg-gray-800/50 border border-gray-700/50 rounded-2xl overflow-hidden transition-all duration-300 animate-fade-in-up ${sec.visible ? 'is-visible' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="px-6 pt-6 pb-2">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
      </div>
      <div className="px-2 pb-6">
        {children}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function Analytics() {
  const hasContracts = CONTRACTS.clumEngine !== '0x0000000000000000000000000000000000000000';
  const [optionView, setOptionView] = useState<'both' | 'call' | 'put'>('both');

  // ── Spot price ──
  const { data: spotPrice } = useReadContract({
    address: CONTRACTS.bucketRegistry,
    abi: BUCKET_REGISTRY_ABI,
    functionName: 'getSpotPrice',
    query: { enabled: hasContracts, refetchInterval: 30_000 },
  });

  const spotNum = spotPrice ? Number(formatUnits(spotPrice, 18)) : 0;

  // ── Implied distribution ──
  const { data: distribution } = useReadContract({
    address: CONTRACTS.clumEngine,
    abi: CLUM_ENGINE_ABI,
    functionName: 'getImpliedDistribution',
    query: { enabled: hasContracts, refetchInterval: 30_000 },
  });

  // Parse distribution into chart data
  const distData = useMemo(() => {
    if (!distribution) return [];
    const [midpoints, probabilities] = distribution as [bigint[], bigint[]];
    return midpoints.map((m, i) => ({
      price: Number(formatUnits(m, 18)),
      probability: Number(formatUnits(probabilities[i], 18)),
    }));
  }, [distribution]);

  // ── Strike range from distribution midpoints ──
  const strikes = useMemo(() => {
    if (!distData.length) return [];
    // Use the distribution midpoints as our strike sweep
    return distData.map(d => d.price);
  }, [distData]);

  const strikeWads = useMemo(() => {
    return strikes.map(s => {
      // Convert price to WAD (multiply by 1e18)
      const whole = Math.floor(s);
      const frac = s - whole;
      return BigInt(whole) * WAD + BigInt(Math.round(frac * 1e18));
    });
  }, [strikes]);

  // ── Multicall: quoteBuy for CALL + PUT across all strikes ──
  const callQuoteContracts = useMemo(() => {
    return strikeWads.map(sw => ({
      address: CONTRACTS.clumEngine as `0x${string}`,
      abi: CLUM_ENGINE_ABI,
      functionName: 'quoteBuy' as const,
      args: [OptionType.CALL, sw, SIZE_WAD] as const,
    }));
  }, [strikeWads]);

  const putQuoteContracts = useMemo(() => {
    return strikeWads.map(sw => ({
      address: CONTRACTS.clumEngine as `0x${string}`,
      abi: CLUM_ENGINE_ABI,
      functionName: 'quoteBuy' as const,
      args: [OptionType.PUT, sw, SIZE_WAD] as const,
    }));
  }, [strikeWads]);

  const { data: callQuotes } = useReadContracts({
    contracts: callQuoteContracts,
    query: { enabled: hasContracts && strikeWads.length > 0, refetchInterval: 30_000 },
  });

  const { data: putQuotes } = useReadContracts({
    contracts: putQuoteContracts,
    query: { enabled: hasContracts && strikeWads.length > 0, refetchInterval: 30_000 },
  });

  // ── Multicall: mark price for CALL + PUT ──
  const callMarkContracts = useMemo(() => {
    return strikeWads.map(sw => ({
      address: CONTRACTS.fundingDeriver as `0x${string}`,
      abi: FUNDING_DERIVER_ABI,
      functionName: 'getMarkPrice' as const,
      args: [OptionType.CALL, sw] as const,
    }));
  }, [strikeWads]);

  const putMarkContracts = useMemo(() => {
    return strikeWads.map(sw => ({
      address: CONTRACTS.fundingDeriver as `0x${string}`,
      abi: FUNDING_DERIVER_ABI,
      functionName: 'getMarkPrice' as const,
      args: [OptionType.PUT, sw] as const,
    }));
  }, [strikeWads]);

  const { data: callMarks } = useReadContracts({
    contracts: callMarkContracts,
    query: { enabled: hasContracts && strikeWads.length > 0, refetchInterval: 30_000 },
  });

  const { data: putMarks } = useReadContracts({
    contracts: putMarkContracts,
    query: { enabled: hasContracts && strikeWads.length > 0, refetchInterval: 30_000 },
  });

  // ── Multicall: intrinsic value for CALL + PUT ──
  const callIntrinsicContracts = useMemo(() => {
    return strikeWads.map(sw => ({
      address: CONTRACTS.fundingDeriver as `0x${string}`,
      abi: FUNDING_DERIVER_ABI,
      functionName: 'getIntrinsicValue' as const,
      args: [OptionType.CALL, sw] as const,
    }));
  }, [strikeWads]);

  const putIntrinsicContracts = useMemo(() => {
    return strikeWads.map(sw => ({
      address: CONTRACTS.fundingDeriver as `0x${string}`,
      abi: FUNDING_DERIVER_ABI,
      functionName: 'getIntrinsicValue' as const,
      args: [OptionType.PUT, sw] as const,
    }));
  }, [strikeWads]);

  const { data: callIntrinsics } = useReadContracts({
    contracts: callIntrinsicContracts,
    query: { enabled: hasContracts && strikeWads.length > 0, refetchInterval: 30_000 },
  });

  const { data: putIntrinsics } = useReadContracts({
    contracts: putIntrinsicContracts,
    query: { enabled: hasContracts && strikeWads.length > 0, refetchInterval: 30_000 },
  });

  // ── Multicall: funding rate for CALL + PUT ──
  const callFundingContracts = useMemo(() => {
    return strikeWads.map(sw => ({
      address: CONTRACTS.fundingDeriver as `0x${string}`,
      abi: FUNDING_DERIVER_ABI,
      functionName: 'getFundingPerSecond' as const,
      args: [OptionType.CALL, sw, SIZE_WAD] as const,
    }));
  }, [strikeWads]);

  const putFundingContracts = useMemo(() => {
    return strikeWads.map(sw => ({
      address: CONTRACTS.fundingDeriver as `0x${string}`,
      abi: FUNDING_DERIVER_ABI,
      functionName: 'getFundingPerSecond' as const,
      args: [OptionType.PUT, sw, SIZE_WAD] as const,
    }));
  }, [strikeWads]);

  const { data: callFundings } = useReadContracts({
    contracts: callFundingContracts,
    query: { enabled: hasContracts && strikeWads.length > 0, refetchInterval: 30_000 },
  });

  const { data: putFundings } = useReadContracts({
    contracts: putFundingContracts,
    query: { enabled: hasContracts && strikeWads.length > 0, refetchInterval: 30_000 },
  });

  // ── Build premium chart data ──
  const premiumData = useMemo(() => {
    if (!callQuotes || !putQuotes || !strikes.length) return [];
    return strikes.map((strike, i) => {
      const callResult = callQuotes[i];
      const putResult = putQuotes[i];
      const callPrem = callResult?.status === 'success' && callResult.result
        ? Number(formatUnits(callResult.result as bigint, 18))
        : null;
      const putPrem = putResult?.status === 'success' && putResult.result
        ? Number(formatUnits(putResult.result as bigint, 18))
        : null;
      return {
        strike: Math.round(strike),
        callPremium: callPrem,
        putPremium: putPrem,
      };
    }).filter(d => d.callPremium !== null || d.putPremium !== null);
  }, [callQuotes, putQuotes, strikes]);

  // ── Build mark price / intrinsic chart data ──
  const markData = useMemo(() => {
    if (!callMarks || !putMarks || !callIntrinsics || !putIntrinsics || !strikes.length) return [];
    return strikes.map((strike, i) => {
      const cm = callMarks[i];
      const pm = putMarks[i];
      const ci = callIntrinsics[i];
      const pi = putIntrinsics[i];
      return {
        strike: Math.round(strike),
        callMark: cm?.status === 'success' && cm.result ? Number(formatUnits(cm.result as bigint, 18)) : null,
        putMark: pm?.status === 'success' && pm.result ? Number(formatUnits(pm.result as bigint, 18)) : null,
        callIntrinsic: ci?.status === 'success' && ci.result ? Number(formatUnits(ci.result as bigint, 18)) : null,
        putIntrinsic: pi?.status === 'success' && pi.result ? Number(formatUnits(pi.result as bigint, 18)) : null,
      };
    }).filter(d => d.callMark !== null || d.putMark !== null);
  }, [callMarks, putMarks, callIntrinsics, putIntrinsics, strikes]);

  // ── Build funding rate chart data (per day) ──
  const fundingData = useMemo(() => {
    if (!callFundings || !putFundings || !strikes.length) return [];
    return strikes.map((strike, i) => {
      const cf = callFundings[i];
      const pf = putFundings[i];
      return {
        strike: Math.round(strike),
        callFunding: cf?.status === 'success' && cf.result
          ? Number(formatUnits(cf.result as bigint, 18)) * 86400
          : null,
        putFunding: pf?.status === 'success' && pf.result
          ? Number(formatUnits(pf.result as bigint, 18)) * 86400
          : null,
      };
    }).filter(d => d.callFunding !== null || d.putFunding !== null);
  }, [callFundings, putFundings, strikes]);

  // ── Header section ──
  const headerSec = useInView();
  const spotSec = useInView();

  // ── Determine loading states ──
  const distLoaded = distData.length > 0;
  const premiumLoaded = premiumData.length > 0;
  const markLoaded = markData.length > 0;
  const fundingLoaded = fundingData.length > 0;

  // Auto-refresh indicator
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  useEffect(() => {
    const interval = setInterval(() => setLastRefresh(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const formatTick = useCallback((v: number) => {
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    return `$${v}`;
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ── Page Header ── */}
      <div
        ref={headerSec.ref}
        className={`mb-8 animate-fade-in-up ${headerSec.visible ? 'is-visible' : ''}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white">Analytics</h1>
            <p className="text-gray-400 mt-2">
              Live option pricing curves powered by the CLUM AMM
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-call animate-pulse" />
              Live &middot; 30s refresh
            </div>
          </div>
        </div>
      </div>

      {/* ── Spot Price Bar ── */}
      <div
        ref={spotSec.ref}
        className={`glass rounded-xl p-4 mb-8 flex flex-wrap items-center justify-between gap-4 animate-fade-in-up ${spotSec.visible ? 'is-visible' : ''}`}
      >
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">ETH Spot Price</p>
            <p className="text-2xl font-bold text-white">
              {spotNum ? `$${spotNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '---'}
            </p>
          </div>
          <div className="w-px h-10 bg-gray-700 hidden sm:block" />
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">Buckets</p>
            <p className="text-2xl font-bold text-primary-400">{distData.length || '---'}</p>
          </div>
          <div className="w-px h-10 bg-gray-700 hidden sm:block" />
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">Quote Size</p>
            <p className="text-2xl font-bold text-gray-300">0.01 ETH</p>
          </div>
        </div>

        {/* Option type filter */}
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {(['both', 'call', 'put'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setOptionView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                optionView === v
                  ? v === 'call' ? 'bg-call/20 text-call'
                    : v === 'put' ? 'bg-put/20 text-put'
                    : 'bg-primary-500/20 text-primary-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {v === 'both' ? 'Both' : v === 'call' ? 'Calls' : 'Puts'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Charts Grid ── */}
      <div className="space-y-6">
        {/* Row 1: Distribution */}
        <ChartCard
          title="Implied Probability Distribution"
          subtitle="Risk-neutral probability distribution across price buckets from the CLUM engine"
          delay={0}
        >
          {!distLoaded ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={distData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="distGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PRIMARY_COLOR} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={PRIMARY_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis
                  dataKey="price"
                  tickFormatter={formatTick}
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                  tickLine={{ stroke: '#4B5563' }}
                />
                <YAxis
                  tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                  tickLine={{ stroke: '#4B5563' }}
                  width={55}
                />
                <Tooltip content={<DistTooltip />} />
                {spotNum > 0 && (
                  <ReferenceLine
                    x={distData.reduce((prev, curr) =>
                      Math.abs(curr.price - spotNum) < Math.abs(prev.price - spotNum) ? curr : prev
                    ).price}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: 'Spot', fill: '#F59E0B', fontSize: 11, position: 'top' }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="probability"
                  stroke={PRIMARY_COLOR}
                  strokeWidth={2}
                  fill="url(#distGradient)"
                  name="Probability"
                  dot={false}
                  activeDot={{ r: 4, fill: PRIMARY_COLOR, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Row 2: Premium Curve + Mark Price (side by side on desktop) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Premium Curve (Vol Smile) */}
          <ChartCard
            title="Premium Curve"
            subtitle="Option premium across strikes (0.01 ETH)"
            delay={80}
          >
            {!premiumLoaded ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={premiumData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis
                    dataKey="strike"
                    tickFormatter={formatTick}
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#4B5563' }}
                    tickLine={{ stroke: '#4B5563' }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#4B5563' }}
                    tickLine={{ stroke: '#4B5563' }}
                    width={60}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }}
                    iconType="line"
                  />
                  {spotNum > 0 && (
                    <ReferenceLine
                      x={premiumData.reduce((prev, curr) =>
                        Math.abs(curr.strike - spotNum) < Math.abs(prev.strike - spotNum) ? curr : prev
                      ).strike}
                      stroke="#F59E0B"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                  )}
                  {(optionView === 'both' || optionView === 'call') && (
                    <Line
                      type="monotone"
                      dataKey="callPremium"
                      stroke={CALL_COLOR}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: CALL_COLOR, stroke: '#fff', strokeWidth: 2 }}
                      name="Call Premium"
                      connectNulls
                    />
                  )}
                  {(optionView === 'both' || optionView === 'put') && (
                    <Line
                      type="monotone"
                      dataKey="putPremium"
                      stroke={PUT_COLOR}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: PUT_COLOR, stroke: '#fff', strokeWidth: 2 }}
                      name="Put Premium"
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Mark Price vs Intrinsic */}
          <ChartCard
            title="Mark Price vs Intrinsic Value"
            subtitle="Time value = Mark - Intrinsic (funding component)"
            delay={160}
          >
            {!markLoaded ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={markData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis
                    dataKey="strike"
                    tickFormatter={formatTick}
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#4B5563' }}
                    tickLine={{ stroke: '#4B5563' }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${v.toFixed(1)}`}
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#4B5563' }}
                    tickLine={{ stroke: '#4B5563' }}
                    width={55}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }}
                    iconType="line"
                  />
                  {spotNum > 0 && (
                    <ReferenceLine
                      x={markData.reduce((prev, curr) =>
                        Math.abs(curr.strike - spotNum) < Math.abs(prev.strike - spotNum) ? curr : prev
                      ).strike}
                      stroke="#F59E0B"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                  )}
                  {(optionView === 'both' || optionView === 'call') && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="callMark"
                        stroke={CALL_COLOR}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: CALL_COLOR, stroke: '#fff', strokeWidth: 2 }}
                        name="Call Mark"
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="callIntrinsic"
                        stroke={CALL_COLOR}
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                        dot={false}
                        activeDot={{ r: 3, fill: CALL_COLOR }}
                        name="Call Intrinsic"
                        connectNulls
                      />
                    </>
                  )}
                  {(optionView === 'both' || optionView === 'put') && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="putMark"
                        stroke={PUT_COLOR}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: PUT_COLOR, stroke: '#fff', strokeWidth: 2 }}
                        name="Put Mark"
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="putIntrinsic"
                        stroke={PUT_COLOR}
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                        dot={false}
                        activeDot={{ r: 3, fill: PUT_COLOR }}
                        name="Put Intrinsic"
                        connectNulls
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Row 3: Funding Rate Curve */}
        <ChartCard
          title="Funding Rate Curve"
          subtitle="Daily funding cost per 0.01 ETH position across strikes"
          delay={240}
        >
          {!fundingLoaded ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={fundingData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="callFundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CALL_COLOR} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={CALL_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="putFundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PUT_COLOR} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={PUT_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis
                  dataKey="strike"
                  tickFormatter={formatTick}
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                  tickLine={{ stroke: '#4B5563' }}
                />
                <YAxis
                  tickFormatter={(v: number) => `$${v.toFixed(4)}`}
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#4B5563' }}
                  tickLine={{ stroke: '#4B5563' }}
                  width={70}
                />
                <Tooltip content={<ChartTooltip suffix="/day" />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }}
                  iconType="line"
                />
                {spotNum > 0 && (
                  <ReferenceLine
                    x={fundingData.reduce((prev, curr) =>
                      Math.abs(curr.strike - spotNum) < Math.abs(prev.strike - spotNum) ? curr : prev
                    ).strike}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: 'Spot', fill: '#F59E0B', fontSize: 11, position: 'top' }}
                  />
                )}
                {(optionView === 'both' || optionView === 'call') && (
                  <Area
                    type="monotone"
                    dataKey="callFunding"
                    stroke={CALL_COLOR}
                    strokeWidth={2}
                    fill="url(#callFundGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: CALL_COLOR, stroke: '#fff', strokeWidth: 2 }}
                    name="Call Funding"
                    connectNulls
                  />
                )}
                {(optionView === 'both' || optionView === 'put') && (
                  <Area
                    type="monotone"
                    dataKey="putFunding"
                    stroke={PUT_COLOR}
                    strokeWidth={2}
                    fill="url(#putFundGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: PUT_COLOR, stroke: '#fff', strokeWidth: 2 }}
                    name="Put Funding"
                    connectNulls
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Legend / Info ── */}
      <div className="mt-8 text-center text-xs text-gray-500">
        <p>
          Data sourced live from CLUM Engine, Funding Deriver, and Bucket Registry on Base Sepolia.
          Yellow dashed line indicates current ETH spot price.
        </p>
      </div>
    </div>
  );
}

// ─── Distribution tooltip ────────────────────────────────────────────────────
function DistTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 shadow-xl">
      <p className="text-xs text-gray-400 mb-1.5">
        Price: ${Number(label).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
      <p className="text-sm font-medium text-primary-400">
        Probability: {(payload[0].value * 100).toFixed(2)}%
      </p>
    </div>
  );
}
