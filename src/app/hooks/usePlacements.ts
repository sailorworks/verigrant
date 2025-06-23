// src/app/hooks/usePlacements.ts
"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { useDebounceFunction } from "@/hooks/use-debounce";
import { logger } from "@/lib/logger";
import { analyseUser } from "@/app/actions/analyze-tweets";
import { getBestAvatarUrl } from "@/lib/load-avatar";
import { getRandomPosition } from "@/lib/utils";
import {
  initIndexedDB,
  cachePlacementsLocally,
  loadCachedPlacements,
  removeCachedPlacement,
  clearLocalCache,
} from "@/lib/indexed-db";
import type { Placement, AlignmentAnalysis } from "@/app/types";

// Helper function to convert alignment to a chart position
const alignmentToPosition = (analysis: AlignmentAnalysis) => {
  const xPercent = ((analysis.lawfulChaotic + 100) / 200) * 100;
  const yPercent = ((analysis.goodEvil + 100) / 200) * 100;
  return { x: xPercent, y: yPercent };
};

export function usePlacements() {
  const [images, setImages] = useState<Placement[]>([]);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newlyAnalyzedId, setNewlyAnalyzedId] = useState<string | null>(null);
  const [isAnalyzingServer, startServerAnalysisTransition] = useTransition();

  const debouncedSaveToLocalDB = useDebounceFunction(
    (currentImages: Placement[]) => {
      if (isPageLoading) return;
      cachePlacementsLocally(currentImages).catch((err) =>
        logger.error("Error debounced saving to IndexedDB:", err)
      );
    },
    1000
  );

  // Effect for loading from and saving to IndexedDB
  useEffect(() => {
    async function loadInitialPlacements() {
      setIsPageLoading(true);
      try {
        await initIndexedDB();
        const cached = await loadCachedPlacements();
        if (cached.length > 0) {
          setImages(
            cached.map((item) => ({
              ...item,
              isDragging: false,
              loading: false,
              timestamp: new Date(item.timestamp ?? Date.now()),
            }))
          );
          toast.success(`Loaded ${cached.length} saved placement(s).`);
        }
      } catch (error) {
        logger.error("Failed to load from IndexedDB:", error);
        toast.error("Could not load saved placements.");
      } finally {
        setIsPageLoading(false);
      }
    }
    loadInitialPlacements();
  }, []);

  useEffect(() => {
    if (!isPageLoading) {
      debouncedSaveToLocalDB(images);
    }
  }, [images, isPageLoading, debouncedSaveToLocalDB]);

  const isUsernameDuplicate = (username: string) =>
    images.some(
      (img) => img.username?.toLowerCase() === username.toLowerCase()
    );

  const addPlacement = async (username: string, isAiAnalysis: boolean) => {
    const cleanUsername = username.trim().replace(/^@/, "");
    if (!cleanUsername) {
      toast.error("Please enter a username.");
      return;
    }
    if (isUsernameDuplicate(cleanUsername)) {
      toast.error(`@${cleanUsername} is already on the chart.`);
      return;
    }

    setIsProcessing(true);
    const tempId = `img-${isAiAnalysis ? "ai" : "rand"}-${Date.now()}`;
    const newPlacement: Placement = {
      id: tempId,
      src: "/grid.svg", // Placeholder image
      position: getRandomPosition(),
      isDragging: false,
      loading: true,
      username: cleanUsername,
      isAiPlaced: isAiAnalysis,
      timestamp: new Date(),
    };

    setImages((prev) => [...prev, newPlacement]);

    if (isAiAnalysis) {
      // AI Analysis Flow
      startServerAnalysisTransition(async () => {
        try {
          const analysisResult = await analyseUser(cleanUsername);
          if (analysisResult.isError || !analysisResult.explanation) {
            throw new Error(analysisResult.explanation || "Analysis failed.");
          }

          const [avatarUrl] = await Promise.all([
            getBestAvatarUrl(cleanUsername),
          ]);

          setImages((prev) =>
            prev.map((img) =>
              img.id === tempId
                ? {
                    ...img,
                    src: avatarUrl,
                    position: alignmentToPosition(analysisResult),
                    loading: false,
                    analysis: analysisResult,
                  }
                : img
            )
          );

          setNewlyAnalyzedId(tempId);
          toast.success(
            `Analyzed @${cleanUsername}! ${
              analysisResult.cached ? "(from cache)" : ""
            }`
          );
          setTimeout(() => setNewlyAnalyzedId(null), 5000);
        } catch (error) {
          logger.error("Error during AI analysis:", error);
          toast.error(`Analysis failed for @${cleanUsername}.`);
          setImages((prev) => prev.filter((img) => img.id !== tempId));
        } finally {
          setIsProcessing(false);
        }
      });
    } else {
      // Manual Placement Flow
      try {
        const avatarUrl = await getBestAvatarUrl(cleanUsername);
        setImages((prev) =>
          prev.map((img) =>
            img.id === tempId ? { ...img, src: avatarUrl, loading: false } : img
          )
        );
      } catch (error) {
        logger.error("Error fetching avatar:", error);
        toast.error(`Could not load avatar for @${cleanUsername}.`);
        setImages((prev) =>
          prev.map((img) =>
            img.id === tempId
              ? { ...img, src: "/x-logo.svg", loading: false }
              : img
          )
        );
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const removePlacement = async (idToRemove: string) => {
    setImages((prev) => prev.filter((img) => img.id !== idToRemove));
    try {
      await removeCachedPlacement(idToRemove);
      toast.success("Placement removed.");
    } catch (error) {
      logger.error("Error removing from IndexedDB:", error);
      toast.error("Could not remove placement from local cache.");
    }
  };

  const clearAllPlacements = async () => {
    setImages([]);
    try {
      await clearLocalCache();
      toast.success("Chart cleared!");
    } catch (error) {
      logger.error("Error clearing local cache:", error);
      toast.error("Could not clear local cache.");
    }
  };

  return {
    images,
    setImages,
    isPageLoading,
    isProcessing: isProcessing || isAnalyzingServer,
    newlyAnalyzedId,
    addPlacement,
    removePlacement,
    clearAllPlacements,
  };
}
