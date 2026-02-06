import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { baseSepolia, base } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Everlasting Options',
  projectId: 'perpetual-options-protocol', // Replace with your WalletConnect project ID
  chains: [baseSepolia, base],
  ssr: true,
});
