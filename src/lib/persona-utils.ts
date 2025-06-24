// src/lib/persona-utils.ts
import { ethers } from "ethers";
import { type Placement } from "@/app/types";

// --- UPDATED ABI FOR VIEM/WAGMI (The full JSON format) ---
// We now define both functions our app needs.
export const personaRegistryViemAbi = [
  {
    type: "function",
    name: "getPersonaSnapshot", // <-- RENAMED function
    stateMutability: "view",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    // --- FLATTENED outputs to avoid struct decoding issues ---
    outputs: [
      { name: "lawfulChaotic", type: "int8", internalType: "int8" },
      { name: "goodEvil", type: "int8", internalType: "int8" },
      { name: "reportHash", type: "bytes32", internalType: "bytes32" },
      { name: "primaryTrait", type: "string", internalType: "string" },
      { name: "timestamp", type: "uint256", internalType: "uint256" },
      { name: "exists", type: "bool", internalType: "bool" },
    ],
  },
  {
    type: "function",
    name: "setPersonaSnapshot", // <-- ADDED the setter function
    stateMutability: "nonpayable", // Note: It's nonpayable, not view
    inputs: [
      { name: "_userAddress", type: "address", internalType: "address" },
      { name: "_lawfulChaotic", type: "int8", internalType: "int8" },
      { name: "_goodEvil", type: "int8", internalType: "int8" },
      { name: "_reportHash", type: "bytes32", internalType: "bytes32" },
      { name: "_primaryTrait", type: "string", internalType: "string" },
    ],
    outputs: [],
  },
] as const;

// --- UPDATED ABI FOR ETHERS.JS (Human-readable format) ---
// This now includes both functions our backend API routes will use.
export const personaRegistryEthersAbi = [
  "function getPersonaSnapshot(address user) view returns (int8 lawfulChaotic, int8 goodEvil, bytes32 reportHash, string memory primaryTrait, uint256 timestamp, bool exists)",
  "function setPersonaSnapshot(address _userAddress, int8 _lawfulChaotic, int8 _goodEvil, bytes32 _reportHash, string calldata _primaryTrait) external",
];

// --- No changes below this line ---

export interface PersonaData {
  lawfulChaotic: number; // -100 to 100
  goodEvil: number; // -100 to 100
  reportHash: string; // bytes32 hex string
  primaryTrait: string;
}

export function processPlacementsForContract(
  placements: Placement[]
): PersonaData {
  if (placements.length === 0) {
    return {
      lawfulChaotic: 0,
      goodEvil: 0,
      reportHash: ethers.ZeroHash,
      primaryTrait: "Neutral",
    };
  }

  const totalLawfulChaotic = placements.reduce(
    (sum, p) => sum + (p.position.x - 50) * 2,
    0
  );
  const totalGoodEvil = placements.reduce(
    (sum, p) => sum + (p.position.y - 50) * 2,
    0
  );
  const avgLawfulChaotic = Math.round(totalLawfulChaotic / placements.length);
  const avgGoodEvil = Math.round(totalGoodEvil / placements.length);
  const placementsJson = JSON.stringify(
    placements.map((p) => ({
      username: p.username,
      position: p.position,
      isAiPlaced: p.isAiPlaced,
    }))
  );
  const reportHash = ethers.keccak256(ethers.toUtf8Bytes(placementsJson));
  const getTrait = (lc: number, ge: number): string => {
    const lcThreshold = 33;
    const geThreshold = 33;
    const lawfulAxis =
      lc <= -lcThreshold ? "Lawful" : lc >= lcThreshold ? "Chaotic" : "Neutral";
    const goodAxis =
      ge <= -geThreshold ? "Good" : ge >= geThreshold ? "Evil" : "Neutral";
    if (lawfulAxis === "Neutral" && goodAxis === "Neutral")
      return "True Neutral";
    if (lawfulAxis === "Neutral") return `${goodAxis} Neutral`;
    if (goodAxis === "Neutral") return `${lawfulAxis} Neutral`;
    return `${lawfulAxis} ${goodAxis}`;
  };
  const primaryTrait = getTrait(avgLawfulChaotic, avgGoodEvil);

  return {
    lawfulChaotic: Math.max(-128, Math.min(127, avgLawfulChaotic)),
    goodEvil: Math.max(-128, Math.min(127, avgGoodEvil)),
    reportHash,
    primaryTrait,
  };
}
