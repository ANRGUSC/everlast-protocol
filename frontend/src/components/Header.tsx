'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/open', label: 'Open Position' },
  { href: '/positions', label: 'My Positions' },
  { href: '/liquidate', label: 'Liquidate' },
  { href: '/faucet', label: 'Faucet' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <span className="text-2xl font-bold text-white">Ever</span>
              <span className="text-2xl font-bold text-primary-500">Last</span>
            </Link>
            <nav className="hidden md:flex ml-10 space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center">
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}
