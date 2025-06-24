// src/app/hooks/useEthersRead.ts
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { ethers, type InterfaceAbi } from "ethers";
import { type PublicClient } from "viem";

// Helper to convert a viem Public Client to an ethers.js Provider
function publicClientToEthersProvider(publicClient: PublicClient) {
  // FIXED: Add a guard clause for the chain
  if (!publicClient.chain) {
    throw new Error("Cannot create ethers provider: chain is undefined.");
  }

  const { chain, transport } = publicClient;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };

  if (!transport.url) {
    throw new Error("Cannot create ethers provider from transport with no URL");
  }
  return new ethers.JsonRpcProvider(transport.url, network);
}

interface UseEthersReadConfig {
  address: `0x${string}`;
  abi: InterfaceAbi; // <-- FIXED: Use ethers's native ABI type
  functionName: string;
}

export function useEthersRead({
  address: contractAddress,
  abi,
  functionName,
}: UseEthersReadConfig) {
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [data, setData] = useState<unknown | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const ethersProvider = useMemo(() => {
    if (!publicClient) return null;
    try {
      return publicClientToEthersProvider(publicClient);
    } catch (e) {
      console.error("Failed to create ethers provider:", e);
      return null;
    }
  }, [publicClient]);

  const fetchData = useCallback(async () => {
    if (!isConnected || !userAddress || !ethersProvider) {
      return;
    }

    console.log(`[useEthersRead] Fetching ${functionName}...`);
    setStatus("loading");
    setError(null);

    try {
      // FIXED: No conversion needed, ethers can directly use its own ABI type
      const contract = new ethers.Contract(
        contractAddress,
        abi,
        ethersProvider
      );

      const result = await contract[functionName](userAddress);
      setData(result);
      setStatus("success");
      console.log("[useEthersRead] Fetch successful:", result);
    } catch (err) {
      console.error("[useEthersRead] Fetch failed:", err);
      setError(err as Error);
      setStatus("error");
    }
  }, [
    isConnected,
    userAddress,
    ethersProvider,
    contractAddress,
    abi,
    functionName,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, status, error, refetch: fetchData };
}
