// src/app/types.ts
import { type AlignmentAnalysis } from "./actions/analyze-tweets";

export type { AlignmentAnalysis };

export interface Position {
  x: number;
  y: number;
}

export interface Placement {
  id: string;
  src: string;
  position: Position;
  isDragging: boolean;
  loading?: boolean;
  username?: string;
  analysis?: AlignmentAnalysis;
  isAiPlaced?: boolean;
  timestamp: Date;
}

// This is the new type we are adding
export interface PanelAnalysisItem {
  id: string;
  username: string;
  imageSrc: string;
  analysis: AlignmentAnalysis;
  timestamp: Date;
}
