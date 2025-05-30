// src/app/providers.tsx
"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains"; // Add any chains you need
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; // wagmi uses React Query
import { injected } from "wagmi/connectors"; // For MetaMask and other browser wallets

// 0. Setup queryClient
const queryClient = new QueryClient();

// 1. Get projectId from https://cloud.walletconnect.com
// This is optional if you only plan to use injected connectors like MetaMask
// but good practice if you might add WalletConnect later.
// const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
// if (!projectId) throw new Error("WalletConnect Project ID is not defined");

// 2. Create wagmiConfig
export const config = createConfig({
  chains: [mainnet, sepolia], // Add or remove chains as needed
  connectors: [
    injected(), // For MetaMask, Brave Wallet, etc.
    // walletConnect({ projectId }), // If you want WalletConnect
    // coinbaseWallet({ appName: 'My Wagmi App' }), // If you want Coinbase Wallet
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
  // ssr: true, // Enable SSR if you need to pre-render connected state (more advanced)
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
