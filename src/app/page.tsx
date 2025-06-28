// src/app/page.tsx
"use client";

import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import {
  useAccount,
  useSignMessage,
  useWriteContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
} from "wagmi";
import { toast, Toaster } from "sonner";
import { GithubIcon, Trash, ShieldCheck, Award } from "lucide-react";
import { logger } from "@/lib/logger";
import type { PanelAnalysisItem } from "./types";

// Custom Hooks and Components
import { usePlacements } from "./hooks/usePlacements";
import { useChartSizing } from "./hooks/useChartSizing";
import { useDragAndDrop } from "./hooks/useDragAndDrop";
import { ActionToolbar } from "./components/ActionToolbar";
import { AlignmentChart } from "./components/AlignmentChart";
import { ConnectWalletButton } from "./components/wallet-connect-button";
import { AnalysisPanel } from "./components/analysis-panel";

// ShadCN UI
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

import { personaNftAbi } from "@/lib/nft-abi";

type SnapshotApiResponse = {
  exists: boolean;
};

// =================================================================
// === CHANGE #1: FIX THE TYPE DEFINITION ===
// =================================================================
type PersonaMintedLog = {
  args: {
    user?: `0x${string}`; // Changed from 'owner' to 'user'
    tokenId?: bigint;
  };
};

const nftContractAddress = process.env
  .NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}`;

export default function AlignmentChartPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);

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

  const [isCommitting, setIsCommitting] = useState(false);
  const [isWaitingForSnapshot, setIsWaitingForSnapshot] = useState(false);
  const { signMessageAsync } = useSignMessage();

  const {
    data: requestNftHash,
    writeContract,
    isPending: isRequesting,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirmingRequest, isSuccess: isRequestConfirmed } =
    useWaitForTransactionReceipt({ hash: requestNftHash });

  const [isWaitingForFulfillment, setIsWaitingForFulfillment] = useState(false);
  const [snapshotData, setSnapshotData] = useState<SnapshotApiResponse | null>(
    null
  );

  const hasSnapshot = snapshotData?.exists ?? false;
  const canRequestMint = hasSnapshot;

  const fetchSnapshot = useCallback(async () => {
    if (!isConnected || !address) return;
    try {
      const response = await fetch(
        `/api/persona/get-snapshot?address=${address}`
      );
      if (!response.ok) throw new Error("Failed to fetch snapshot from API");
      const data: SnapshotApiResponse = await response.json();
      setSnapshotData(data);
    } catch (error) {
      console.error("Error fetching snapshot:", error);
    }
  }, [address, isConnected]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (hasSnapshot && isWaitingForSnapshot) {
      toast.success("On-chain snapshot confirmed!", {
        description: "You are now eligible to mint your Persona NFT.",
      });
      setIsWaitingForSnapshot(false);
    } else if (isWaitingForSnapshot) {
      const interval = setInterval(() => fetchSnapshot(), 4000);
      return () => clearInterval(interval);
    }
  }, [isWaitingForSnapshot, hasSnapshot, fetchSnapshot]);

  useEffect(() => {
    if (requestNftHash) {
      console.log("Tx hash received:", requestNftHash);
    }
  }, [requestNftHash]);

  useEffect(() => {
    if (isRequestConfirmed) {
      console.log("✅ Tx confirmed on-chain");
      console.log("Setting isWaitingForFulfillment = true");
      toast.success("NFT request sent successfully!", {
        description:
          "Waiting for the Chainlink Oracle to provide randomness and mint your NFT. This can take a minute.",
      });
      setIsWaitingForFulfillment(true);
    }
  }, [isRequestConfirmed]);

  // =================================================================
  // === CHANGE #2: FIX THE EVENT LISTENER LOGIC ===
  // =================================================================
  useWatchContractEvent({
    address: nftContractAddress,
    abi: personaNftAbi,
    eventName: "PersonaMinted",
    onLogs(logs) {
      console.log("PersonaMinted logs:", logs);
      const userLog = logs.find(
        (log: PersonaMintedLog) =>
          // Use 'log.args.user' to match the smart contract event
          log.args.user?.toLowerCase() === address?.toLowerCase()
      );
      if (userLog && userLog.args.tokenId !== undefined) {
        toast.success("Persona NFT Minted!", {
          description: `Token #${userLog.args.tokenId.toString()} is yours!`,
          action: {
            label: "View on OpenSea",
            onClick: () =>
              window.open(
                `https://testnets.opensea.io/asset/sepolia/${nftContractAddress}/${userLog.args.tokenId!.toString()}`,
                "_blank"
              ),
          },
        });
        setIsWaitingForFulfillment(false);
        reset();
      }
    },
    enabled: isWaitingForFulfillment,
  });

  const handleRequestNft = () => {
    if (!canRequestMint || !address) {
      toast.error("Not eligible to mint. A snapshot must be committed first.");
      return;
    }

    writeContract({
      address: nftContractAddress,
      abi: personaNftAbi,
      functionName: "requestMint",
    });
  };

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
      toast.loading("Verifying and submitting to the blockchain...", {
        id: commitToast,
      });
      const verifyResponse = await fetch("/api/persona/commit-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements: images, address, signature, nonce }),
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok)
        throw new Error(result.error || "Verification failed.");
      toast.success(
        `Transaction sent! Tx: ${result.transactionHash.slice(0, 10)}...`,
        {
          id: commitToast,
          description: "Now waiting for on-chain confirmation.",
        }
      );
      setIsWaitingForSnapshot(true);
    } catch (error: unknown) {
      logger.error("Commit snapshot failed:", error);
      let message = "An unknown error occurred.";
      if (error instanceof Error)
        message = error.message.includes("User rejected")
          ? "Signature request was cancelled."
          : error.message;
      toast.error(`Commit failed: ${message}`, { id: commitToast });
    } finally {
      setIsCommitting(false);
    }
  };

  // No changes to the rest of the file...
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

  const isActionDisabled =
    isProcessing ||
    isPageLoading ||
    isRequesting ||
    isConfirmingRequest ||
    isWaitingForFulfillment;

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
            Inspired by a tweet.
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
          {!hasSnapshot && (
            <Button
              onClick={handleCommitSnapshot}
              size="lg"
              className="h-14 rounded-full shadow-lg bg-green-600 hover:bg-green-700 text-white"
              disabled={
                images.length === 0 ||
                isCommitting ||
                isWaitingForSnapshot ||
                !isConnected ||
                isActionDisabled
              }
            >
              <ShieldCheck className="!size-5 mr-0 sm:mr-2" />
              <span className="hidden sm:inline">
                {isCommitting
                  ? "Committing..."
                  : isWaitingForSnapshot
                  ? "Verifying..."
                  : "Commit Snapshot"}
              </span>
            </Button>
          )}

          {canRequestMint && (
            <Button
              onClick={handleRequestNft}
              size="lg"
              className="h-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isActionDisabled}
            >
              <Award className="!size-5 mr-0 sm:mr-2" />
              <span className="hidden sm:inline">
                {isRequesting
                  ? "Requesting..."
                  : isConfirmingRequest
                  ? "Confirming..."
                  : isWaitingForFulfillment
                  ? "Awaiting Oracle..."
                  : "Mint Persona NFT"}
              </span>
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className="h-14 rounded-full shadow-lg"
                disabled={images.length === 0 || isActionDisabled}
              >
                <Trash className="!size-5 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Clear All</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {images.length} placement(s) from the
                  chart and local storage. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearAllPlacements}>
                  Yes, Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </AnalysisPanel>

        {isPageLoading && (
          <div className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-50">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-purple-500 border-r-transparent mb-3"></div>
            <p>Loading your alignments...</p>
          </div>
        )}
      </div>
    </>
  );
}
