'use client';

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { CONTRACTS, BUCKET_REGISTRY_ABI, EV_OPTION_MANAGER_ABI, LP_POOL_ABI, USDC_DECIMALS } from '@/config/contracts';

// ─── Intersection Observer hook ───────────────────────────────────────────────
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

// ─── Animated counter ─────────────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const { ref, visible } = useInView();

  useEffect(() => {
    if (!visible || value === 0) return;
    let start = 0;
    const duration = 1200;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [visible, value]);

  return <span ref={ref}>{prefix}{visible ? display.toLocaleString() : '---'}{suffix}</span>;
}

// ─── FAQ Accordion ────────────────────────────────────────────────────────────
const faqs = [
  {
    q: 'What are everlasting options?',
    a: 'Everlasting options are options contracts that never expire. Unlike traditional options with fixed expiration dates, these positions remain open indefinitely. The holder pays a continuous funding rate to keep the position active, replacing the time-value decay of conventional options.',
  },
  {
    q: 'How does the CLUM AMM work?',
    a: 'The CLUM (Concentrated Liquidity Utility Maximizer) is an automated market maker that prices options using a discretized probability distribution. When you buy or sell an option, the CLUM determines the fair premium based on risk-neutral pricing. There is no counterparty matching — the LP pool acts as the other side of every trade.',
  },
  {
    q: 'How does the funding mechanism work?',
    a: 'Option holders pay a continuous funding rate that streams per-second from their funding balance to the LP pool. This funding represents the time value of the option (mark price minus intrinsic value). You must maintain a sufficient funding balance to keep your position active.',
  },
  {
    q: 'How do I exercise an option?',
    a: 'You can exercise your option at any time when it is in-the-money. Navigate to My Positions, select the position, and click Exercise. Settlement is calculated based on the current spot price and happens instantly on-chain. No approval is needed — just call exercise.',
  },
  {
    q: 'What happens if my funding runs out?',
    a: 'If your funding balance drops below the minimum required amount and a grace period expires, your position becomes liquidatable. Anyone can then liquidate it. You can top up your funding balance at any time to prevent liquidation.',
  },
  {
    q: 'How does providing liquidity work?',
    a: 'LPs deposit USDC into the LP Pool (an ERC-4626 vault) and receive LP shares. The pool earns premiums when traders buy options and receives continuous funding payments. It loses money when traders exercise in-the-money options. Net returns = premiums + funding - losses.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-700/50 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-800/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium text-white">{q}</span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ml-4 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-4 text-gray-400 text-sm leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Features data ────────────────────────────────────────────────────────────
const features = [
  {
    title: 'No Expiration',
    desc: 'Options live forever with continuous funding. No more rolling positions or watching the clock.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'CLUM AMM',
    desc: 'Buy and sell options instantly from the automated market maker. No counterparty matching needed.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    title: 'LP Pool Yields',
    desc: 'Provide USDC liquidity and earn premiums + funding from option traders via the ERC-4626 vault.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Exercise Anytime',
    desc: 'American-style options. Exercise whenever your position is in-the-money, no waiting required.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    title: 'USDC Settled',
    desc: 'All settlements and funding in USDC. Clean, simple accounting with no asset delivery complexity.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: 'Built on Base',
    desc: 'Fast, cheap transactions on Ethereum L2. Sub-cent gas fees with full Ethereum security.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
];

// ─── Page component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const hasContracts = CONTRACTS.evOptionManager !== '0x0000000000000000000000000000000000000000';

  // Spot price from BucketRegistry (WAD)
  const { data: ethPrice } = useReadContract({
    address: CONTRACTS.bucketRegistry,
    abi: BUCKET_REGISTRY_ABI,
    functionName: 'getSpotPrice',
    query: { enabled: hasContracts },
  });

  // Total positions from nextPositionId
  const { data: nextPositionId } = useReadContract({
    address: CONTRACTS.evOptionManager,
    abi: EV_OPTION_MANAGER_ABI,
    functionName: 'nextPositionId',
    query: { enabled: hasContracts },
  });

  // LP Pool TVL
  const { data: totalAssets } = useReadContract({
    address: CONTRACTS.lpPool,
    abi: LP_POOL_ABI,
    functionName: 'totalAssets',
    query: { enabled: hasContracts },
  });

  const formatPrice = (price: bigint | undefined) => {
    if (!price) return '---';
    return `$${Number(formatUnits(price, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const ethPriceNum = ethPrice ? Math.round(Number(formatUnits(ethPrice, 18))) : 0;
  const totalPositions = nextPositionId ? Number(nextPositionId) - 1 : 0;
  const tvl = totalAssets
    ? Number(formatUnits(totalAssets, USDC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : '---';
  const dataAvailable = hasContracts && (ethPrice !== undefined || totalAssets !== undefined);

  // Section visibility
  const stats = useInView();
  const featSec = useInView();
  const howSec = useInView();
  const trustSec = useInView();
  const faqSec = useInView();
  const ctaSec = useInView();

  return (
    <div>
      {/* ─── Hero Section ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background orbs */}
        <div className="hero-glow w-96 h-96 bg-primary-500/30 -top-20 -left-20 absolute" />
        <div className="hero-glow w-80 h-80 bg-call/20 top-40 right-0 absolute" style={{ animationDelay: '3s' }} />
        <div className="hero-glow w-64 h-64 bg-put/20 bottom-0 left-1/3 absolute" style={{ animationDelay: '6s' }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 text-center">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight">
            Options That{' '}
            <span className="bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
              Never Expire
            </span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Trade everlasting calls and puts on Base. Buy options from the CLUM AMM,
            provide liquidity to earn yields, or exercise anytime.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/buy"
              className="px-8 py-3.5 bg-primary-500 hover:bg-primary-400 text-white font-semibold rounded-xl transition-colors text-lg"
            >
              Buy Option
            </Link>
            <Link
              href="/pool"
              className="px-8 py-3.5 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white font-semibold rounded-xl transition-colors text-lg"
            >
              Provide Liquidity
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Protocol Stats ────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4 mb-16 relative z-10">
        <div
          ref={stats.ref}
          className={`glass rounded-2xl p-6 md:p-8 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 animate-fade-in-up ${stats.visible ? 'is-visible' : ''}`}
        >
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">ETH Price</p>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {ethPrice ? formatPrice(ethPrice) : dataAvailable ? <AnimatedNumber value={ethPriceNum} prefix="$" /> : '$---'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Total Positions</p>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {dataAvailable ? <AnimatedNumber value={totalPositions} /> : '---'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">LP Pool TVL</p>
            <p className="text-2xl md:text-3xl font-bold text-white">
              ${tvl}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Network</p>
            <p className="text-2xl md:text-3xl font-bold text-primary-400">Base</p>
          </div>
        </div>
      </section>

      {/* ─── Features ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-24">
        <div
          ref={featSec.ref}
          className={`text-center mb-12 animate-fade-in-up ${featSec.visible ? 'is-visible' : ''}`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            A New Primitive for Options
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Everlasting options powered by the CLUM automated market maker and a pooled LP model.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`group bg-gray-800/50 border border-gray-700/50 hover:border-primary-500/30 rounded-2xl p-6 transition-all duration-300 animate-fade-in-up ${featSec.visible ? 'is-visible' : ''}`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400 mb-4 group-hover:bg-primary-500/20 transition-colors">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How It Works ──────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-24">
        <div
          ref={howSec.ref}
          className={`text-center mb-12 animate-fade-in-up ${howSec.visible ? 'is-visible' : ''}`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How It Works</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Three simple steps from buying to settlement.
          </p>
        </div>

        <div className={`relative animate-fade-in-up ${howSec.visible ? 'is-visible' : ''}`}>
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-10 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-0.5 bg-gradient-to-r from-call via-primary-500 to-put" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center relative">
              <div className="w-12 h-12 bg-call/20 rounded-full flex items-center justify-center text-call text-xl font-bold mx-auto mb-6 ring-4 ring-gray-900 relative z-10">
                1
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Buy Option</h3>
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs mx-auto">
                Choose your option type, strike, and size. The CLUM AMM quotes you a premium.
                Pay USDC for the premium plus initial funding.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center relative">
              <div className="w-12 h-12 bg-primary-500/20 rounded-full flex items-center justify-center text-primary-400 text-xl font-bold mx-auto mb-6 ring-4 ring-gray-900 relative z-10">
                2
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Continuous Funding</h3>
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs mx-auto">
                Your funding balance is consumed over time (mark - intrinsic value per second).
                Top up funding anytime to keep the position active.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center relative">
              <div className="w-12 h-12 bg-put/20 rounded-full flex items-center justify-center text-put text-xl font-bold mx-auto mb-6 ring-4 ring-gray-900 relative z-10">
                3
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Exercise or Sell</h3>
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs mx-auto">
                Exercise in-the-money options for USDC payout, or sell your position back
                to the CLUM AMM at any time. If funding runs out, the position can be liquidated.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust & Security ──────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-24">
        <div
          ref={trustSec.ref}
          className={`glass rounded-2xl p-8 md:p-12 animate-fade-in-up ${trustSec.visible ? 'is-visible' : ''}`}
        >
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-primary-500/10 flex items-center justify-center text-primary-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Secure by Design</h2>
              <ul className="space-y-3 mb-6">
                {[
                  'Pooled LP model — no individual counterparty risk',
                  'CLUM pricing — risk-neutral automated option pricing',
                  'Open source — all contracts are publicly verifiable',
                  'Verified on BaseScan — transparent and auditable',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-300 text-sm">
                    <svg className="w-5 h-5 text-call flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`https://sepolia.basescan.org/address/${CONTRACTS.evOptionManager}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 transition-colors"
                >
                  View on BaseScan
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                <a
                  href="https://github.com/ANRGUSC/everlast-protocol"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-300 bg-gray-700/50 hover:bg-gray-700 transition-colors"
                >
                  GitHub Repository
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mb-24">
        <div
          ref={faqSec.ref}
          className={`text-center mb-10 animate-fade-in-up ${faqSec.visible ? 'is-visible' : ''}`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Frequently Asked Questions</h2>
        </div>
        <div className={`space-y-3 animate-fade-in-up ${faqSec.visible ? 'is-visible' : ''}`}>
          {faqs.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* ─── Bottom CTA ────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-24">
        <div
          ref={ctaSec.ref}
          className={`text-center py-16 px-8 rounded-2xl bg-gradient-to-br from-primary-900/40 to-gray-800/40 border border-primary-500/20 animate-fade-in-up ${ctaSec.visible ? 'is-visible' : ''}`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Trade Options Without Expiration?
          </h2>
          <ul className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mb-8 text-gray-400 text-sm">
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-call" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              No expiration dates
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-call" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Instant AMM pricing
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-call" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Fully on-chain
            </li>
          </ul>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/buy"
              className="inline-flex px-10 py-4 bg-primary-500 hover:bg-primary-400 text-white font-semibold rounded-xl transition-colors text-lg"
            >
              Buy an Option
            </Link>
            <Link
              href="/pool"
              className="inline-flex px-10 py-4 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white font-semibold rounded-xl transition-colors text-lg"
            >
              Provide Liquidity
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Network Info ──────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="text-center text-gray-500 text-sm">
          <p>Currently deployed on Base Sepolia Testnet</p>
          <p className="mt-1">
            EvOptionManager: <code className="text-gray-400 text-xs">{CONTRACTS.evOptionManager}</code>
          </p>
        </div>
      </section>
    </div>
  );
}
