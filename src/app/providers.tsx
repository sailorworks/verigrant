// src/app/providers.tsx
"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";

const queryClient = new QueryClient();

// Get the dedicated RPC URL from your environment variables
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
if (!sepoliaRpcUrl) {
  throw new Error("Alchemy RPC URL for Sepolia is not defined in .env.local");
}

export const config = createConfig({
  chains: [sepolia, mainnet], // It's good practice to list your primary dev chain first
  connectors: [injected()],
  transports: {
    // Use your reliable, dedicated RPC URL for Sepolia
    [sepolia.id]: http(sepoliaRpcUrl),

    // You can keep mainnet on a default public RPC for now, or get a dedicated one too
    [mainnet.id]: http(),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
