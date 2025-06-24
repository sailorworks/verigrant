// src/app/api/persona/get-snapshot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ethers } from "ethers";
// The ABI is already updated in the utils file
import { personaRegistryEthersAbi } from "@/lib/persona-utils";

const { NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_PERSONA_REGISTRY_CONTRACT_ADDRESS } =
  process.env;

const requestSchema = z.object({
  address: z.string().startsWith("0x"),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parseResult = requestSchema.safeParse({
    address: searchParams.get("address"),
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid address provided" },
      { status: 400 }
    );
  }

  const { address } = parseResult.data;

  if (!NEXT_PUBLIC_RPC_URL || !NEXT_PUBLIC_PERSONA_REGISTRY_CONTRACT_ADDRESS) {
    console.error("Missing server environment variables for snapshot API");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  try {
    const provider = new ethers.JsonRpcProvider(NEXT_PUBLIC_RPC_URL);
    const contract = new ethers.Contract(
      NEXT_PUBLIC_PERSONA_REGISTRY_CONTRACT_ADDRESS,
      personaRegistryEthersAbi,
      provider
    );

    // --- UPDATED LOGIC ---
    // 1. Call the new function `getPersonaSnapshot`.
    const snapshotResult = await contract.getPersonaSnapshot(address);

    // 2. The result is an array-like object. We reconstruct the JSON object
    //    that the frontend expects, ensuring data types are correct.
    //    Ethers.js v6 returns named properties, making this easy.
    const snapshotObj = {
      lawfulChaotic: Number(snapshotResult.lawfulChaotic),
      goodEvil: Number(snapshotResult.goodEvil),
      reportHash: snapshotResult.reportHash,
      primaryTrait: snapshotResult.primaryTrait,
      timestamp: snapshotResult.timestamp.toString(), // Convert BigInt to string
      exists: snapshotResult.exists,
    };

    return NextResponse.json(snapshotObj);
  } catch (error) {
    console.error(`Error fetching snapshot for ${address}:`, error);
    // Add a check for a common error when the contract hasn't been deployed yet.
    if (
      error instanceof Error &&
      error.message.includes("contract not found")
    ) {
      return NextResponse.json(
        {
          error:
            "Contract not found at the specified address. Check your .env file and deployment.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch on-chain data" },
      { status: 500 }
    );
  }
}
