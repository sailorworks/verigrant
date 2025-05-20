// src/app/components/analysis-panel.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  X,
  Sparkles,
  SquareDashedMousePointer,
} from "lucide-react";
import { Button } from "@/components/ui/button"; // Adjust path if your shadcn setup differs
import { Card } from "@/components/ui/card";
import type { AlignmentAnalysis } from "../actions/analyze-tweets"; // Adjust path
import { cn } from "@/lib/utils"; // Adjust path
import { ScrollArea } from "@/components/ui/scroll-area";
// import { Separator } from "@/components/ui/separator"; // Not used in the final version of panel

// This type should match what the panel expects to receive
export interface PanelAnalysisItem {
  id: string;
  username: string;
  imageSrc: string;
  analysis: AlignmentAnalysis; // The core AI analysis
  timestamp: Date;
}

export function AnalysisPanel({
  analyses,
  newAnalysisId,
  children,
}: {
  analyses: Array<PanelAnalysisItem>;
  newAnalysisId: string | null;
  children?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewAnalysis, setHasNewAnalysis] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null); // Ref for ScrollArea's viewport

  // Scroll to new item when panel is open and new item added
  useEffect(() => {
    if (isOpen && newAnalysisId && scrollViewportRef.current) {
      const newItemElement = document.getElementById(
        `analysis-item-${newAnalysisId}`
      );
      if (newItemElement) {
        newItemElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [isOpen, newAnalysisId, analyses]); // Re-run if analyses array changes (new item)

  // Handle new analysis notification dot
  useEffect(() => {
    if (newAnalysisId && !isOpen) {
      setHasNewAnalysis(true);
    }
  }, [newAnalysisId, isOpen]);

  // Reset notification dot when panel is opened
  useEffect(() => {
    if (isOpen) {
      setHasNewAnalysis(false);
    }
  }, [isOpen]);

  const getAlignmentName = (
    lawfulChaotic: number,
    goodEvil: number
  ): string => {
    const lcThreshold = 33;
    const geThreshold = 33;

    const lawfulAxis =
      lawfulChaotic <= -lcThreshold
        ? "Lawful"
        : lawfulChaotic >= lcThreshold
        ? "Chaotic"
        : "Neutral";
    const goodAxis =
      goodEvil <= -geThreshold
        ? "Good"
        : goodEvil >= geThreshold
        ? "Evil"
        : "Neutral";

    if (lawfulAxis === "Neutral" && goodAxis === "Neutral")
      return "True Neutral";
    if (lawfulAxis === "Neutral") return `${goodAxis} Neutral`; // e.g. Good Neutral
    if (goodAxis === "Neutral") return `${lawfulAxis} Neutral`; // e.g. Lawful Neutral

    return `${lawfulAxis} ${goodAxis}`;
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-row items-end gap-2">
      {" "}
      {/* scrollable removed, panel handles scroll */}
      {/* Button to toggle panel and any other children (like clear button) */}
      <div className="flex items-end gap-2">
        <motion.div
          className={cn("relative transition-all duration-200 group")}
          layout // Animate layout changes
        >
          <Button
            onClick={() => setIsOpen(!isOpen)}
            size="lg" // Make button a bit bigger
            className="h-14 min-w-14 rounded-full shadow-xl bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white flex items-center gap-2 px-4"
          >
            <MessageSquare className="!size-5" />
            <AnimatePresence>
              {!isOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="hidden sm:inline" // Hide text on very small screens
                >
                  Analysis Panel
                </motion.span>
              )}
            </AnimatePresence>
          </Button>

          {hasNewAnalysis &&
            !isOpen && ( // Only show dot if panel is closed
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
              >
                !
              </motion.div>
            )}
        </motion.div>
        {/* Children passed to the panel (e.g. clear button) */}
        {children}
      </div>
      {/* The Panel Itself */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: -50, height: 0 }}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0, x: -50, height: 0 }}
            transition={{
              duration: 0.3,
              type: "spring",
              stiffness: 200,
              damping: 25,
            }}
            className="ml-2" // Spacing if children are to its left
            style={{ order: -1 }} // Ensure panel appears to the left of the toggle button if in same flex row
          >
            <Card className="w-[calc(min(90vw,28rem))] md:w-[28rem] shadow-2xl overflow-hidden rounded-xl border-2 border-purple-500/50">
              <div className="relative flex items-center justify-between py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                <div className="flex items-center gap-2 z-10">
                  <Sparkles className="h-5 w-5" />
                  <h3 className="font-semibold text-base">
                    AI Alignment Analysis
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:bg-white/20 z-10"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="!size-5" />
                </Button>
              </div>
              <ScrollArea
                className="w-full min-h-[12rem] h-[calc(min(80vh-100px,50vh))] " // Adjusted height
              >
                <div ref={scrollViewportRef} className="p-4 space-y-4">
                  {" "}
                  {/* Viewport for scrolling */}
                  {analyses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                      <SquareDashedMousePointer className="h-10 w-10 mb-3 opacity-50" />
                      <p className="text-sm">No X users analyzed yet.</p>
                      <p className="text-xs mt-1">
                        Use the purple <Sparkles className="inline h-3 w-3" />{" "}
                        button to analyze a users vibe with AI.
                      </p>
                    </div>
                  ) : (
                    analyses.map((item) => (
                      <motion.div
                        layout // Animate layout changes for list items
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        key={item.id}
                        id={`analysis-item-${item.id}`}
                        className="flex gap-3 items-start p-3 rounded-lg bg-white dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/50 shadow-sm"
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          <div className="relative h-10 w-10 rounded-md overflow-hidden border-2 border-purple-300 dark:border-purple-700">
                            <Image
                              src={item.imageSrc || "/placeholder.svg"} // Add a placeholder svg in /public
                              alt={`@${item.username}`}
                              fill
                              sizes="40px"
                              className="object-cover"
                              unoptimized={item.imageSrc.includes(
                                "unavatar.io"
                              )} // Unavatar is already optimized
                            />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          {" "}
                          {/* min-w-0 for text ellipsis */}
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold text-sm truncate text-neutral-800 dark:text-neutral-100">
                              @{item.username}
                            </span>
                            <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                              {new Date(item.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="mt-1.5 text-xs bg-purple-50 dark:bg-purple-900/30 rounded-md p-2.5 border border-purple-200 dark:border-purple-500/20">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Sparkles className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
                              <span className="font-medium text-purple-700 dark:text-purple-300">
                                {getAlignmentName(
                                  item.analysis.lawfulChaotic,
                                  item.analysis.goodEvil
                                )}
                              </span>
                            </div>
                            <div className="space-y-0.5 text-neutral-600 dark:text-neutral-300 text-[0.7rem] leading-relaxed">
                              <span className="block">
                                <span className="font-medium">L/C:</span>{" "}
                                {item.analysis.lawfulChaotic}, 
                                <span className="font-medium">G/E:</span>{" "}
                                {item.analysis.goodEvil}
                              </span>
                              <p className="mt-1">
                                {item.analysis.explanation}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
