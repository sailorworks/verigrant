// src/app/api/persona/metadata/[tokenId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ethers } from "ethers";
import { personaRegistryEthersAbi } from "@/lib/persona-utils";
// --- NEW: Import the NFT contract's ABI ---
import { personaNftAbi } from "@/lib/nft-abi";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
// --- UPDATED: Import the certificate component ---
import { PersonaCertificate } from "@/components/persona-certificate";

type PersonaSnapshot = {
  lawfulChaotic: number;
  goodEvil: number;
  reportHash: string;
  primaryTrait: string;
  timestamp: bigint;
  exists: boolean;
};

// --- REMOVED: The old, simple NFT ABI is replaced by the full one. ---

const {
  NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_PERSONA_REGISTRY_CONTRACT_ADDRESS,
  NEXT_PUBLIC_NFT_CONTRACT_ADDRESS,
} = process.env;

const routeParamsSchema = z.object({
  tokenId: z.coerce.number().int().min(0),
});

async function getPersonaImage(
  snapshot: PersonaSnapshot,
  username: string,
  // --- NEW: Add randomNumber as a parameter ---
  randomNumber: string
): Promise<Buffer> {
  const svg = await satori(
    // --- UPDATED: Pass the new prop to the component ---
    PersonaCertificate({
      username: username,
      lawfulChaotic: snapshot.lawfulChaotic.toString(),
      goodEvil: snapshot.goodEvil.toString(),
      primaryTrait: snapshot.primaryTrait,
      timestamp: new Date(
        Number(snapshot.timestamp) * 1000
      ).toLocaleDateString(),
      randomNumber: randomNumber, // Pass it here
    }),
    {
      width: 600,
      height: 400,
      fonts: [
        {
          name: "Inter",
          data: await fetch(
            "https://rsms.me/inter/font-files/Inter-Regular.woff"
          ).then((res) => res.arrayBuffer()),
          weight: 400,
          style: "normal",
        },
        {
          name: "Inter",
          data: await fetch(
            "https://rsms.me/inter/font-files/Inter-Bold.woff"
          ).then((res) => res.arrayBuffer()),
          weight: 700,
          style: "normal",
        },
      ],
    }
  );
  const resvg = new Resvg(svg);
  const pngData = resvg.render();
  return pngData.asPng();
}

export async function GET(
  req: NextRequest,
  { params }: { params: { tokenId: string } }
) {
  const validation = routeParamsSchema.safeParse(params);
  if (!validation.success) {
    return NextResponse.json({ error: "Invalid Token ID" }, { status: 400 });
  }
  const { tokenId } = validation.data;

  if (
    !NEXT_PUBLIC_RPC_URL ||
    !NEXT_PUBLIC_PERSONA_REGISTRY_CONTRACT_ADDRESS ||
    !NEXT_PUBLIC_NFT_CONTRACT_ADDRESS
  ) {
    console.error("Missing environment variables for metadata API");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  const provider = new ethers.JsonRpcProvider(NEXT_PUBLIC_RPC_URL);

  // --- UPDATED: Use the new full ABI for the NFT contract ---
  const nftContract = new ethers.Contract(
    NEXT_PUBLIC_NFT_CONTRACT_ADDRESS,
    personaNftAbi, // Use the full ABI
    provider
  );

  const registryContract = new ethers.Contract(
    NEXT_PUBLIC_PERSONA_REGISTRY_CONTRACT_ADDRESS,
    personaRegistryEthersAbi,
    provider
  );

  try {
    // --- Step 1: Get owner and random number from NFT Contract ---
    // These calls can run in parallel for efficiency
    const [ownerAddress, randomNumberResult] = await Promise.all([
      nftContract.ownerOf(tokenId),
      nftContract.tokenSeed(tokenId),
    ]);

    if (ownerAddress === ethers.ZeroAddress) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    // --- Step 2: Get persona data from Registry Contract ---
    const snapshotResult = await registryContract.getPersonaSnapshot(
      ownerAddress
    );

    const snapshot: PersonaSnapshot = {
      lawfulChaotic: Number(snapshotResult.lawfulChaotic),
      goodEvil: Number(snapshotResult.goodEvil),
      reportHash: snapshotResult.reportHash,
      primaryTrait: snapshotResult.primaryTrait,
      timestamp: snapshotResult.timestamp,
      exists: snapshotResult.exists,
    };

    if (!snapshot.exists) {
      return NextResponse.json(
        { error: "Snapshot data not found for owner" },
        { status: 404 }
      );
    }
    const ownerShort = `${ownerAddress.slice(0, 6)}...${ownerAddress.slice(
      -4
    )}`;

    // --- Step 3: Generate image with all the data ---
    const randomNumberStr = randomNumberResult.toString();
    const imageBuffer = await getPersonaImage(
      snapshot,
      ownerShort,
      randomNumberStr
    );
    const imageUri = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    // --- Step 4: Construct the final metadata JSON ---
    const metadata = {
      name: `Persona NFT #${tokenId}`,
      description: `A unique on-chain persona snapshot. This certificate represents a user's analyzed alignment.`,
      image: imageUri,
      attributes: [
        { trait_type: "Primary Trait", value: snapshot.primaryTrait },
        // --- NEW: Add the random number as a trait ---
        {
          trait_type: "Token Seed", // Or "VRF Number", "Lottery Number", etc.
          value: randomNumberStr,
          display_type: "number",
        },
        {
          trait_type: "Lawful vs. Chaotic",
          value: snapshot.lawfulChaotic,
          display_type: "number",
        },
        {
          trait_type: "Good vs. Evil",
          value: snapshot.goodEvil,
          display_type: "number",
        },
        {
          trait_type: "Commit Timestamp",
          value: Number(snapshot.timestamp),
          display_type: "date",
        },
      ],
    };
    return NextResponse.json(metadata);
  } catch (error) {
    console.error(`Error fetching metadata for token ${tokenId}:`, error);
    return NextResponse.json(
      { error: "Token not found or error fetching data" },
      { status: 404 }
    );
  }
}
