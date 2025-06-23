// src/app/page.tsx
"use client";

import React, { useState, useRef, useMemo } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { toast, Toaster } from "sonner";
import { GithubIcon, Trash, ShieldCheck } from "lucide-react";
import { logger } from "@/lib/logger";
import type { PanelAnalysisItem } from "./types";

// Our new custom hooks
import { usePlacements } from "./hooks/usePlacements";
import { useChartSizing } from "./hooks/useChartSizing";
import { useDragAndDrop } from "./hooks/useDragAndDrop";

// Our new UI components
import { ActionToolbar } from "./components/ActionToolbar";
import { AlignmentChart } from "./components/AlignmentChart";
import { ConnectWalletButton } from "./components/wallet-connect-button";
import { AnalysisPanel } from "./components/analysis-panel";

// ShadCN UI components
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export default function AlignmentChartPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);

  // State and Logic from Custom Hooks
  const { address, isConnected } = useAccount();
  const {
    images,
    setImages,
    isPageLoading,
    isProcessing,
    newlyAnalyzedId,
    addPlacement,
    removePlacement,
    clearAllPlacements,
  } = usePlacements();
  const { chartSize, imageSize, isMobile } = useChartSizing(containerRef);
  const { handleDragStart } = useDragAndDrop({
    chartRef,
    images,
    setImages,
    isMobile,
  });

  // Commit to Blockchain Logic
  const [isCommitting, setIsCommitting] = useState(false);
  const { signMessageAsync } = useSignMessage();

  const handleCommitSnapshot = async () => {
    if (!isConnected || !address || images.length === 0) {
      toast.error("Connect wallet and add placements to commit.");
      return;
    }
    setIsCommitting(true);
    const commitToast = toast.loading("Preparing snapshot for commit...");

    try {
      const prepareResponse = await fetch("/api/persona/commit-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements: images, address }),
      });
      const { messageToSign, nonce } = await prepareResponse.json();
      if (!prepareResponse.ok || !messageToSign)
        throw new Error("Failed to prepare snapshot.");

      toast.loading("Please sign the message in your wallet...", {
        id: commitToast,
      });
      const signature = await signMessageAsync({ message: messageToSign });

      toast.loading("Verifying and submitting...", { id: commitToast });
      const verifyResponse = await fetch("/api/persona/commit-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements: images, address, signature, nonce }),
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok)
        throw new Error(result.error || "Verification failed.");

      toast.success(
        `Snapshot committed! Tx: ${result.transactionHash.slice(0, 10)}...`,
        { id: commitToast, duration: 8000 }
      );
    } catch (error: unknown) {
      // Using `unknown` is safer than `any`
      logger.error("Commit snapshot failed:", error);
      let message = "An unknown error occurred.";
      if (error instanceof Error) {
        message = error.message.includes("User rejected")
          ? "Signature request was cancelled."
          : error.message;
      }
      toast.error(`Commit failed: ${message}`, { id: commitToast });
    } finally {
      setIsCommitting(false);
    }
  };

  const handleAddPlacement = (username: string, isAi: boolean) => {
    if (!isConnected) {
      toast.error("Please connect your wallet first to add profiles.");
      return;
    }
    addPlacement(username, isAi);
  };

  const panelAnalyses: PanelAnalysisItem[] = useMemo(
    () =>
      images
        .filter(
          (img) =>
            img.isAiPlaced && img.analysis && !img.loading && img.username
        )
        .map((img) => ({
          id: img.id,
          username: img.username!,
          imageSrc: img.src,
          analysis: img.analysis!,
          timestamp: img.timestamp,
        }))
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    [images]
  );

  const isActionDisabled = isProcessing || isPageLoading;

  return (
    <>
      <Toaster position="top-center" richColors />
      <div className="fixed top-10 right-10 z-50">
        <ConnectWalletButton />
      </div>

      <div
        className="flex flex-col min-h-screen w-full overflow-x-hidden items-center pt-6 pb-28 md:pb-8 px-4 md:justify-center"
        ref={containerRef}
      >
        <div className="flex flex-col items-center gap-5 md:gap-6 w-full max-w-3xl mt-10 md:mt-12">
          <ActionToolbar
            onAddPlacement={handleAddPlacement}
            isProcessing={isProcessing}
            isConnected={isConnected}
          />

          <AlignmentChart
            chartRef={chartRef}
            placements={images}
            chartSize={chartSize}
            imageSize={imageSize}
            onDragStart={handleDragStart}
            onRemove={removePlacement}
          />

          <span className="text-center text-xs text-neutral-500 dark:text-neutral-400 max-w-md mt-2">
            Inspired by{" "}
            <a
              href="https://x.com/rauchg/status/1899895262023467035"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-purple-500"
            >
              rauchg
            </a>
            .
            <a
              href="https://github.com/your-repo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block ml-2 align-middle"
            >
              <GithubIcon className="w-3 h-3" />
            </a>
          </span>
        </div>

        <AnalysisPanel analyses={panelAnalyses} newAnalysisId={newlyAnalyzedId}>
          <Button
            onClick={handleCommitSnapshot}
            size="lg"
            className="h-14 rounded-full shadow-lg bg-green-600 hover:bg-green-700 text-white"
            disabled={
              images.length === 0 ||
              isCommitting ||
              !isConnected ||
              isActionDisabled
            }
            aria-label="Commit snapshot to blockchain"
          >
            <ShieldCheck className="!size-5 mr-0 sm:mr-2" />
            <span className="hidden sm:inline">
              {isCommitting ? "Committing..." : "Commit Snapshot"}
            </span>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className="h-14 rounded-full shadow-lg border-neutral-300 dark:border-neutral-600 hover:bg-red-500 hover:text-white dark:hover:bg-red-600 dark:text-neutral-100"
                disabled={images.length === 0 || isActionDisabled}
                aria-label="Clear all placements"
              >
                <Trash className="!size-5 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Clear All</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="dark:bg-neutral-800 dark:border-neutral-700">
              <AlertDialogHeader>
                <AlertDialogTitle className="dark:text-neutral-50">
                  Are you sure?
                </AlertDialogTitle>
                <AlertDialogDescription className="dark:text-neutral-300">
                  This will remove all {images.length} placement(s) from the
                  chart and local storage. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="dark:bg-neutral-700 dark:border-neutral-600 dark:hover:bg-neutral-600 dark:text-neutral-50">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={clearAllPlacements}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Yes, Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </AnalysisPanel>

        {isPageLoading && (
          <div className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-50">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-purple-500 dark:border-purple-400 border-r-transparent mb-3"></div>
            <p className="text-neutral-700 dark:text-neutral-200">
              Loading your alignments...
            </p>
          </div>
        )}
      </div>
    </>
  );
}
