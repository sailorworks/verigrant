// src/app/api/persona/metadata/[tokenId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ethers } from "ethers";
import { personaRegistryEthersAbi } from "@/lib/persona-utils";
import { personaNftAbi } from "@/lib/nft-abi";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { PersonaCertificate } from "@/components/persona-certificate";

// --- NEW: Import Node.js modules to read local files ---
import fs from "fs";
import path from "path";

// --- NEW: Read font files from your project's assets ---
const interRegularFont = fs.readFileSync(
  path.join(process.cwd(), "src/assets/fonts/Inter_18pt-Regular.ttf")
);
const interBoldFont = fs.readFileSync(
  path.join(process.cwd(), "src/assets/fonts/Inter_18pt-Bold.ttf")
);

type PersonaSnapshot = {
  lawfulChaotic: number;
  goodEvil: number;
  reportHash: string;
  primaryTrait: string;
  timestamp: bigint;
  exists: boolean;
};

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
  randomNumber: string
): Promise<Buffer> {
  const svg = await satori(
    PersonaCertificate({
      username: username,
      lawfulChaotic: snapshot.lawfulChaotic.toString(),
      goodEvil: snapshot.goodEvil.toString(),
      primaryTrait: snapshot.primaryTrait,
      timestamp: new Date(
        Number(snapshot.timestamp) * 1000
      ).toLocaleDateString(),
      randomNumber: randomNumber,
    }),
    {
      width: 600,
      height: 400,
      fonts: [
        // --- UPDATED: Use the local font data instead of fetching ---
        {
          name: "Inter",
          data: interRegularFont, // Use the pre-loaded font data
          weight: 400,
          style: "normal",
        },
        {
          name: "Inter",
          data: interBoldFont, // Use the pre-loaded font data
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

// --- The GET function is kept exactly as you had it ---
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const resolvedParams = await params;
  const validation = routeParamsSchema.safeParse(resolvedParams);

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

  const nftContract = new ethers.Contract(
    NEXT_PUBLIC_NFT_CONTRACT_ADDRESS,
    personaNftAbi,
    provider
  );

  const registryContract = new ethers.Contract(
    NEXT_PUBLIC_PERSONA_REGISTRY_CONTRACT_ADDRESS,
    personaRegistryEthersAbi,
    provider
  );

  try {
    const [ownerAddress, randomNumberResult] = await Promise.all([
      nftContract.ownerOf(tokenId),
      nftContract.tokenSeed(tokenId),
    ]);

    if (ownerAddress === ethers.ZeroAddress) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

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

    const randomNumberStr = randomNumberResult.toString();
    const imageBuffer = await getPersonaImage(
      snapshot,
      ownerShort,
      randomNumberStr
    );
    const imageUri = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    const metadata = {
      name: `Persona NFT #${tokenId}`,
      description: `A unique on-chain persona snapshot. This certificate represents a user's analyzed alignment.`,
      image: imageUri,
      attributes: [
        { trait_type: "Primary Trait", value: snapshot.primaryTrait },
        {
          trait_type: "Token Seed",
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
