// src/app/components/AlignmentChart.tsx
"use client";

import React from "react";
import NextImage from "next/image";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Placement } from "@/app/types";

// ... (rest of the component code is the same)

interface AlignmentChartProps {
  chartRef: React.RefObject<HTMLDivElement | null>; // Fix is here
  placements: Placement[];
  chartSize: { width: number; height: number };
  imageSize: number;
  onDragStart: (e: React.MouseEvent | React.TouchEvent, id: string) => void;
  onRemove: (id: string) => void;
}

// ... (The rest of the component code remains exactly the same as before)
// The only change is the `chartRef` type in the interface above.
// For completeness, here is the full component code again.

const ALIGNMENT_LABELS = {
  Good: "Altruistic, compassionate, puts others first.",
  Evil: "Selfish, manipulative, or harmful. Motivated by greed, hatred, or power.",
  Lawful: "Follows rules, traditions, social norms. Values order, loyalty.",
  Chaotic:
    "Rebels against convention, values personal freedom, own moral compass.",
};

const getLabelClass = (label: keyof typeof ALIGNMENT_LABELS) => {
  switch (label) {
    case "Good":
      return "top-0 left-1/2 -translate-x-1/2 -translate-y-[calc(100%+12px)]";
    case "Evil":
      return "bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+12px)]";
    case "Lawful":
      return "top-1/2 left-0 -translate-x-[calc(100%+12px)] -translate-y-1/2";
    case "Chaotic":
      return "top-1/2 right-0 translate-x-[calc(100%+12px)] -translate-y-1/2";
  }
};

export function AlignmentChart({
  chartRef,
  placements,
  chartSize,
  imageSize,
  onDragStart,
  onRemove,
}: AlignmentChartProps) {
  return (
    <div className="relative mt-4">
      {Object.entries(ALIGNMENT_LABELS).map(([label, description]) => (
        <button
          key={label}
          onClick={() =>
            toast.info(`${label} Alignment`, { description, duration: 5000 })
          }
          className={cn(
            "absolute bg-white dark:bg-neutral-800 px-2.5 py-1 font-semibold md:text-sm text-xs border border-neutral-400 dark:border-neutral-600 rounded-full z-10 shadow",
            getLabelClass(label as keyof typeof ALIGNMENT_LABELS)
          )}
        >
          {label}
        </button>
      ))}

      <Card
        className="relative border-2 border-neutral-700 dark:border-neutral-400 overflow-hidden shadow-xl rounded-xl bg-neutral-50 dark:bg-neutral-800/30"
        ref={chartRef}
        style={{ width: chartSize.width, height: chartSize.height }}
      >
        {/* Grid and Axis Lines */}
        <div
          className="w-full h-full absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(128,128,128,0.1) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(128,128,128,0.1) 1px, transparent 1px)`,
            backgroundSize: "calc(100% / 10) calc(100% / 10)",
          }}
        />
        <div className="absolute top-1/2 left-0 w-full h-[2px] bg-neutral-600 dark:bg-neutral-500 opacity-40 -translate-y-[1px]" />
        <div className="absolute top-0 left-1/2 w-[2px] h-full bg-neutral-600 dark:bg-neutral-500 opacity-40 -translate-x-[1px]" />

        {/* Placements */}
        {placements.map((img) => (
          <motion.div
            key={img.id}
            id={img.id}
            className={cn(
              "absolute rounded-md overflow-hidden group shadow-md",
              img.isAiPlaced
                ? "cursor-default"
                : img.loading
                ? "cursor-wait"
                : "cursor-grab",
              img.isDragging &&
                "z-20 shadow-xl ring-2 ring-purple-500 dark:ring-purple-400",
              !img.isAiPlaced &&
                !img.loading &&
                "hover:ring-2 hover:ring-neutral-400 dark:hover:ring-neutral-500",
              img.isAiPlaced && "ring-1 ring-purple-500 dark:ring-purple-400"
            )}
            style={{
              left: `${img.position.x}%`,
              top: `${img.position.y}%`,
              width: `${imageSize}px`,
              height: `${imageSize}px`,
              transform: `translate(-50%, -50%) scale(${
                img.isDragging ? 1.05 : 1
              })`,
              transition: img.isDragging
                ? "none"
                : "transform 0.1s ease, box-shadow 0.1s ease",
              opacity: img.loading && !img.isAiPlaced ? 0.6 : 1,
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.3,
              type: "spring",
              stiffness: 150,
              damping: 20,
            }}
            onMouseDown={(e) => onDragStart(e, img.id)}
            onTouchStart={(e) => onDragStart(e, img.id)}
          >
            <NextImage
              src={img.src || "/grid.svg"}
              alt={`X avatar for ${img.username || "user"}`}
              width={128}
              height={128}
              className={cn(
                "object-cover w-full h-full bg-white dark:bg-neutral-700",
                img.loading && !img.isAiPlaced ? "animate-pulse opacity-50" : ""
              )}
              unoptimized={img.src.includes("unavatar.io")}
              priority={false}
            />

            {img.loading && img.isAiPlaced && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="h-1/3 w-1/3 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
              </div>
            )}

            {!img.loading && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-[-6px] right-[-6px] h-5 w-5 rounded-full p-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity scale-90 hover:scale-100 bg-red-500 hover:bg-red-600 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(img.id);
                }}
                aria-label="Remove item"
              >
                <X className="h-3 w-3" />
              </Button>
            )}

            <div
              className={cn(
                "absolute bottom-0 left-0 right-0 bg-black/75 text-white text-[0.6rem] px-1.5 py-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity overflow-hidden flex items-center gap-1 justify-center",
                (img.isAiPlaced || (img.loading && !img.isAiPlaced)) &&
                  "opacity-100"
              )}
            >
              {img.isAiPlaced && !img.loading && (
                <Lock className="h-2.5 w-2.5 flex-shrink-0 text-purple-300" />
              )}
              {img.username && (
                <span className="truncate">@{img.username}</span>
              )}
            </div>
          </motion.div>
        ))}
      </Card>
    </div>
  );
}
