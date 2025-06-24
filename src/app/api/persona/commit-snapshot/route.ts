// src/app/api/persona/commit-snapshot/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { processPlacementsForContract } from "@/lib/persona-utils";
// --- FIXED: Use the ethers-compatible ABI ---
import { personaRegistryEthersAbi } from "@/lib/persona-utils";

const commitRequestSchema = z.object({
  placements: z.array(z.any()),
  address: z.string().startsWith("0x"),
});

const verifyRequestSchema = commitRequestSchema.extend({
  signature: z.string().startsWith("0x"),
  nonce: z.string(),
});

function getOracleWallet() {
  if (!process.env.ORACLE_PRIVATE_KEY || !process.env.NEXT_PUBLIC_RPC_URL) {
    throw new Error("Oracle wallet or RPC URL not configured in .env");
  }
  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
  const wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, provider);
  return wallet;
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const verifyParseResult = verifyRequestSchema.safeParse(body);
  if (verifyParseResult.success) {
    const { placements, address, signature, nonce } = verifyParseResult.data;

    try {
      const messageToSign = `Sign this message to commit your alignment chart snapshot to the blockchain. Nonce: ${nonce}`;
      const recoveredAddress = ethers.verifyMessage(messageToSign, signature);
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        logger.warn(
          { recoveredAddress, address },
          "Signature verification failed"
        );
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
      logger.info({ address }, "Signature verified successfully.");

      const personaData = processPlacementsForContract(placements);
      const oracleWallet = getOracleWallet();
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_PERSONA_REGISTRY_CONTRACT_ADDRESS!,
        personaRegistryEthersAbi, // <-- Using the correct ABI
        oracleWallet
      );

      logger.info(
        { address, ...personaData },
        "Submitting transaction to PersonaRegistry contract..."
      );
      const tx = await contract.setPersonaSnapshot(
        address,
        personaData.lawfulChaotic,
        personaData.goodEvil,
        personaData.reportHash,
        personaData.primaryTrait
      );

      const receipt = await tx.wait();
      logger.info({ txHash: receipt.hash }, "Transaction successfully mined.");

      return NextResponse.json({
        success: true,
        message: "Snapshot committed on-chain.",
        transactionHash: receipt.hash,
      });
    } catch (error) {
      logger.error(
        { err: error, address },
        "Error during commit-snapshot verification/execution"
      );
      return NextResponse.json(
        { error: "Failed to commit snapshot" },
        { status: 500 }
      );
    }
  }

  const prepareParseResult = commitRequestSchema.safeParse(body);
  if (prepareParseResult.success) {
    const { address } = prepareParseResult.data;
    try {
      const nonce = ethers.hexlify(ethers.randomBytes(16));
      const messageToSign = `Sign this message to commit your alignment chart snapshot to the blockchain. Nonce: ${nonce}`;
      logger.info({ address, nonce }, "Preparing message for signing");
      return NextResponse.json({ messageToSign, nonce });
    } catch (error) {
      logger.error({ err: error, address }, "Error preparing signing message");
      return NextResponse.json(
        { error: "Failed to prepare signing data" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: "Invalid request payload" },
    { status: 400 }
  );
}
