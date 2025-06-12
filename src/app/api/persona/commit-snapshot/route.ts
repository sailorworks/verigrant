import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { processPlacementsForContract } from "@/lib/persona-utils";

// The ABI (Application Binary Interface) for your contract
const personaRegistryAbi = [
  // You only need the functions you intend to call
  "function setPersonaSnapshot(address _userAddress, int8 _lawfulChaotic, int8 _goodEvil, bytes32 _reportHash, string calldata _primaryTrait)",
  "event PersonaSnapshotSet(address indexed userAddress, int8 lawfulChaotic, int8 goodEvil, bytes32 reportHash, string primaryTrait, uint256 timestamp)",
];

const commitRequestSchema = z.object({
  placements: z.array(z.any()), // Keep it simple, we'll hash it anyway
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

  // --- Step 2: Verify Signature & Execute Transaction ---
  const verifyParseResult = verifyRequestSchema.safeParse(body);
  if (verifyParseResult.success) {
    const { placements, address, signature, nonce } = verifyParseResult.data;

    try {
      const messageToSign = `Sign this message to commit your alignment chart snapshot to the blockchain. Nonce: ${nonce}`;

      // 1. Verify the signature
      const recoveredAddress = ethers.verifyMessage(messageToSign, signature);
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        logger.warn(
          { recoveredAddress, address },
          "Signature verification failed: address mismatch"
        );
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
      logger.info({ address }, "Signature verified successfully.");

      // 2. Process data for the contract
      const personaData = processPlacementsForContract(placements);

      // 3. Initialize contract and call the function
      const oracleWallet = getOracleWallet();
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_PERSONA_REGISTRY_CONTRACT_ADDRESS!,
        personaRegistryAbi,
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

      const receipt = await tx.wait(); // Wait for the transaction to be mined
      logger.info({ txHash: receipt.hash }, "Transaction successfully mined.");

      // TODO: Clean up nonce from Redis if you stored it there

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

  // --- Step 1: Prepare Message for Signing ---
  const prepareParseResult = commitRequestSchema.safeParse(body);
  if (prepareParseResult.success) {
    const { address } = prepareParseResult.data;
    try {
      const nonce = ethers.hexlify(ethers.randomBytes(16)); // Generate a secure, random nonce
      const messageToSign = `Sign this message to commit your alignment chart snapshot to the blockchain. Nonce: ${nonce}`;

      logger.info({ address, nonce }, "Preparing message for signing");

      // Optional: Cache the nonce or placements in Redis if you need to prevent replay attacks
      // on the same nonce or verify the payload hasn't been tampered with. For now, this is simple.

      return NextResponse.json({ messageToSign, nonce });
    } catch (error) {
      logger.error({ err: error, address }, "Error preparing signing message");
      return NextResponse.json(
        { error: "Failed to prepare signing data" },
        { status: 500 }
      );
    }
  }

  // If input is invalid
  return NextResponse.json(
    { error: "Invalid request payload" },
    { status: 400 }
  );
}
