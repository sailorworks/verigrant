import { ethers } from "ethers";
import { type Placement } from "@/app/page"; // Assuming Placement type is exported from page.tsx

export interface PersonaData {
  lawfulChaotic: number; // -100 to 100
  goodEvil: number; // -100 to 100
  reportHash: string; // bytes32 hex string
  primaryTrait: string;
}

/**
 * Processes the raw placements from the frontend into the data structure needed for the smart contract.
 * @param placements - The array of user placements from the chart.
 * @returns The processed persona data.
 */
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

  // 1. Calculate average scores
  // The chart position is 0-100. We need to convert it to -100 to 100 for alignment.
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

  // 2. Generate the report hash
  // A secure hash of the entire placement data.
  const placementsJson = JSON.stringify(
    placements.map((p) => ({
      username: p.username,
      position: p.position,
      isAiPlaced: p.isAiPlaced,
    }))
  );
  const reportHash = ethers.keccak256(ethers.toUtf8Bytes(placementsJson));

  // 3. Determine the primary trait string
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
    lawfulChaotic: Math.max(-128, Math.min(127, avgLawfulChaotic)), // Clamp to int8 range
    goodEvil: Math.max(-128, Math.min(127, avgGoodEvil)), // Clamp to int8 range
    reportHash,
    primaryTrait,
  };
}
