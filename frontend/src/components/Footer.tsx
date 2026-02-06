import Link from 'next/link';
import { CONTRACTS } from '@/config/contracts';

const tradingLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/open', label: 'Open Position' },
  { href: '/positions', label: 'My Positions' },
  { href: '/liquidate', label: 'Liquidate' },
];

const developerLinks = [
  { href: 'https://github.com/your-org/everlast-protocol', label: 'GitHub', external: true },
  { href: `https://sepolia.basescan.org/address/${CONTRACTS.optionManager}`, label: 'Contracts (BaseScan)', external: true },
];

const communityLinks = [
  { href: '#', label: 'Twitter', external: true },
  { href: '#', label: 'Discord', external: true },
];

export function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-gray-900/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Protocol */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center mb-3">
              <span className="text-xl font-bold text-white">Ever</span>
              <span className="text-xl font-bold text-primary-500">Last</span>
            </Link>
            <p className="text-sm text-gray-400 mb-4">
              Everlasting options that never expire. Trade perpetual calls and puts on Base.
            </p>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-500/10 text-primary-400 border border-primary-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
              Base Sepolia
            </span>
          </div>

          {/* Trading */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Trading</h4>
            <ul className="space-y-2.5">
              {tradingLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Developers */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Developers</h4>
            <ul className="space-y-2.5">
              {developerLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-400 hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    {link.label}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Community</h4>
            <ul className="space-y-2.5">
              {communityLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} EverLast Protocol. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              Built on Base
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Chainlink Oracles
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
