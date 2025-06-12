"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useTransition,
} from "react";
import NextImage from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { X, Sparkles, Lock, Dices, GithubIcon, Trash } from "lucide-react";
import { analyseUser, type AlignmentAnalysis } from "./actions/analyze-tweets";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AnalysisPanel,
  type PanelAnalysisItem,
} from "./components/analysis-panel";
import { toast, Toaster } from "sonner";
import { cn, getRandomPosition } from "@/lib/utils";
import { getBestAvatarUrl } from "@/lib/load-avatar";
import {
  initIndexedDB,
  cachePlacementsLocally,
  loadCachedPlacements,
  removeCachedPlacement,
  clearLocalCache,
} from "@/lib/indexed-db";
import { useDebounceFunction } from "@/hooks/use-debounce";
import { logger } from "@/lib/logger";
import {
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ConnectWalletButton } from "./components/wallet-connect-button";

// Import useAccount from wagmi
import { useAccount } from "wagmi";

// New imports for commit functionality
import { useSignMessage } from "wagmi";
import { ShieldCheck } from "lucide-react"; // Or any icon you like

interface Position {
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

export default function AlignmentChartPage() {
  const [images, setImages] = useState<Placement[]>([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const [imageSize, setImageSize] = useState(60);
  const [chartSize, setChartSize] = useState({ width: 500, height: 500 });
  const [isMobile, setIsMobile] = useState(false);
  const [newlyAnalyzedId, setNewlyAnalyzedId] = useState<string | null>(null);

  const [isAnalyzingServer, startServerAnalysisTransition] = useTransition();

  // Get wallet connection state
  const { address, isConnected } = useAccount(); // You already have this
  const { signMessageAsync } = useSignMessage();

  const [isCommitting, setIsCommitting] = useState(false);

  const debouncedSaveToLocalDB = useDebounceFunction(
    async (currentImages: Placement[]) => {
      if (isPageLoading) return;
      try {
        await cachePlacementsLocally(currentImages);
      } catch (error) {
        logger.error("Error debounced saving to IndexedDB:", error);
        toast.error("Error saving changes locally.");
      }
    },
    1000
  );

  useEffect(() => {
    async function loadInitialPlacements() {
      setIsPageLoading(true);
      try {
        await initIndexedDB();
        const cached = await loadCachedPlacements();
        if (cached.length > 0) {
          const loadedImages: Placement[] = cached.map((item) => ({
            ...item,
            analysis: item.analysis,
            isDragging: false,
            loading: false,
            timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
          }));
          setImages(loadedImages);
          if (loadedImages.length > 0) {
            toast.success(`Loaded ${loadedImages.length} saved placement(s).`);
          }
        }
      } catch (error) {
        logger.error("Failed to load users from IndexedDB:", error);
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

  useEffect(() => {
    const updateSizes = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);

      if (containerRef.current && chartRef.current) {
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        const reservedVerticalSpace = isCurrentlyMobile ? 250 : 220;
        const topPadding = isCurrentlyMobile ? 20 : 0;
        const availableHeight =
          viewportHeight - reservedVerticalSpace - topPadding;

        const horizontalPadding = isCurrentlyMobile
          ? 40
          : Math.max(20, viewportWidth * 0.05);
        const availableWidth = viewportWidth - horizontalPadding * 2;

        const size = Math.max(
          250,
          Math.min(availableWidth, availableHeight, 800)
        );

        setChartSize({ width: size, height: size });
        setImageSize(Math.max(40, Math.min(80, size / 8)));
      }
    };

    updateSizes();
    window.addEventListener("resize", updateSizes);
    return () => window.removeEventListener("resize", updateSizes);
  }, []);

  useEffect(() => {
    const preventDefaultTouchScroll = (e: TouchEvent) => {
      if (activeDragId) {
        e.preventDefault();
        return;
      }
      const targetElement = e.target as HTMLElement;
      if (
        targetElement &&
        (targetElement.closest(".allow-scroll") ||
          targetElement.closest("[data-radix-scroll-area-viewport]"))
      ) {
        return;
      }
      if (
        targetElement.tagName !== "INPUT" &&
        targetElement.tagName !== "TEXTAREA"
      ) {
        // e.preventDefault();
      }
    };

    if (isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    if (activeDragId) {
      document.addEventListener("touchmove", preventDefaultTouchScroll, {
        passive: false,
      });
    }

    return () => {
      if (isMobile) {
        document.body.style.overflow = "";
      }
      if (activeDragId) {
        document.removeEventListener("touchmove", preventDefaultTouchScroll);
      }
    };
  }, [isMobile, activeDragId]);

  const alignmentToPosition = (analysis: AlignmentAnalysis): Position => {
    const xPercent = ((analysis.lawfulChaotic + 100) / 200) * 100;
    const yPercent = ((analysis.goodEvil + 100) / 200) * 100;
    return { x: xPercent, y: yPercent };
  };

  const handleAddRandom = async () => {
    // Check if wallet is connected
    if (!isConnected) {
      toast.error(
        "Please connect your wallet first to add profiles to the chart."
      );
      return;
    }

    const username = usernameInput.trim();
    if (!username) {
      toast.error("Please enter a username.");
      return;
    }
    const cleanUsernameLower = username.toLowerCase().replace(/^@/, "");
    if (
      images.find((img) => img.username?.toLowerCase() === cleanUsernameLower)
    ) {
      toast.error(`@${cleanUsernameLower} is already on the chart.`);
      return;
    }

    setIsProcessing(true);
    const cleanUsername = username.replace(/^@/, "");
    const tempId = `img-rand-${Date.now()}`;

    setImages((prev) => [
      ...prev,
      {
        id: tempId,
        src: "/grid.svg",
        position: getRandomPosition(),
        isDragging: false,
        loading: true,
        username: cleanUsername,
        isAiPlaced: false,
        timestamp: new Date(),
      },
    ]);
    setUsernameInput("");

    try {
      const avatarUrl = await getBestAvatarUrl(cleanUsername);
      setImages((prev) =>
        prev.map((img) =>
          img.id === tempId ? { ...img, src: avatarUrl, loading: false } : img
        )
      );
    } catch (error) {
      logger.error("Error fetching avatar for random add:", error);
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
  };

  const handleAutoAnalyzeAndPlace = async () => {
    // Check if wallet is connected
    if (!isConnected) {
      toast.error(
        "Please connect your wallet first to analyze profiles with AI."
      );
      return;
    }

    const username = usernameInput.trim();
    if (!username) {
      toast.error("Please enter a username.");
      return;
    }
    const cleanUsernameLower = username.toLowerCase().replace(/^@/, "");
    if (
      images.find((img) => img.username?.toLowerCase() === cleanUsernameLower)
    ) {
      toast.error(`@${cleanUsernameLower} is already on the chart.`);
      return;
    }

    setIsProcessing(true);
    const cleanUsername = username.replace(/^@/, "");
    const tempId = `img-ai-${Date.now()}`;

    setImages((prev) => [
      ...prev,
      {
        id: tempId,
        src: "/grid.svg",
        position: getRandomPosition(),
        isDragging: false,
        loading: true,
        username: cleanUsername,
        isAiPlaced: true,
        timestamp: new Date(),
      },
    ]);
    setUsernameInput("");

    startServerAnalysisTransition(async () => {
      try {
        const analysisResult = await analyseUser(cleanUsername);

        if (analysisResult.isError || !analysisResult.explanation) {
          toast.error(
            analysisResult.explanation ||
              `Analysis failed for @${cleanUsername}.`
          );
          setImages((prev) => prev.filter((img) => img.id !== tempId));
          setIsProcessing(false);
          return;
        }

        const finalPosition = alignmentToPosition(analysisResult);
        const avatarUrl = await getBestAvatarUrl(cleanUsername);

        setImages((prev) =>
          prev.map((img) =>
            img.id === tempId
              ? {
                  ...img,
                  src: avatarUrl,
                  position: finalPosition,
                  loading: false,
                  analysis: {
                    explanation: analysisResult.explanation,
                    lawfulChaotic: analysisResult.lawfulChaotic,
                    goodEvil: analysisResult.goodEvil,
                  },
                  isAiPlaced: true,
                  timestamp: new Date(),
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
        logger.error("Error during AI analysis process:", error);
        toast.error(
          `An unexpected error occurred analyzing @${cleanUsername}.`
        );
        setImages((prev) => prev.filter((img) => img.id !== tempId));
      } finally {
        setIsProcessing(false);
      }
    });
  };

  const handleDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    id: string
  ) => {
    const image = images.find((img) => img.id === id);
    if (!image || image.loading || image.isAiPlaced) return;

    setActiveDragId(id);
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, isDragging: true } : img))
    );
  };

  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!activeDragId || !chartRef.current) return;

      const chartRect = chartRef.current.getBoundingClientRect();
      let x = ((clientX - chartRect.left) / chartRect.width) * 100;
      let y = ((clientY - chartRect.top) / chartRect.height) * 100;

      x = Math.max(0, Math.min(x, 100));
      y = Math.max(0, Math.min(y, 100));

      setImages((prevImages) =>
        prevImages.map((img) =>
          img.id === activeDragId ? { ...img, position: { x, y } } : img
        )
      );
    },
    [activeDragId]
  );

  const handleGlobalMouseMove = useCallback(
    (e: MouseEvent) => {
      if (activeDragId) handleDragMove(e.clientX, e.clientY);
    },
    [activeDragId, handleDragMove]
  );

  const handleGlobalTouchMove = useCallback(
    (e: TouchEvent) => {
      if (activeDragId && e.touches[0]) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [activeDragId, handleDragMove]
  );

  const handleDragEnd = useCallback(() => {
    if (!activeDragId) return;
    setImages((prev) =>
      prev.map((img) =>
        img.id === activeDragId ? { ...img, isDragging: false } : img
      )
    );
    setActiveDragId(null);
  }, [activeDragId]);

  useEffect(() => {
    if (activeDragId) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchmove", handleGlobalTouchMove, {
        passive: false,
      });
      window.addEventListener("touchend", handleDragEnd);
      window.addEventListener("touchcancel", handleDragEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleGlobalTouchMove);
      window.removeEventListener("touchend", handleDragEnd);
      window.removeEventListener("touchcancel", handleDragEnd);
    };
  }, [
    activeDragId,
    handleGlobalMouseMove,
    handleGlobalTouchMove,
    handleDragEnd,
  ]);

  const handleRemoveImage = async (idToRemove: string) => {
    setImages((prev) => prev.filter((img) => img.id !== idToRemove));
    try {
      await removeCachedPlacement(idToRemove);
      toast.success("Placement removed.");
    } catch (error) {
      logger.error("Error removing from IndexedDB:", error);
      toast.error("Could not remove placement from local cache.");
    }
  };

  const handleClearAll = async () => {
    setImages([]);
    try {
      await clearLocalCache();
      toast.success("Chart cleared!");
    } catch (error) {
      logger.error("Error clearing local cache:", error);
      toast.error("Could not clear local cache.");
    }
  };

  const panelAnalyses: PanelAnalysisItem[] = images
    .filter(
      (img) => img.isAiPlaced && img.analysis && !img.loading && img.username
    )
    .map((img) => ({
      id: img.id,
      username: img.username!,
      imageSrc: img.src,
      analysis: img.analysis!,
      timestamp: img.timestamp,
    }))
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const isInputDisabled = isProcessing || isAnalyzingServer || isPageLoading;

  const handleCommitSnapshot = async () => {
    if (!isConnected || !address || images.length === 0) {
      toast.error(
        "Please connect your wallet and add at least one placement to commit."
      );
      return;
    }
    setIsCommitting(true);
    const commitToast = toast.loading("Preparing snapshot for commit...");

    try {
      // Step 1: Prepare - Get the message to sign from the backend
      const prepareResponse = await fetch("/api/persona/commit-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements: images, address }),
      });
      const { messageToSign, nonce } = await prepareResponse.json();

      if (!prepareResponse.ok || !messageToSign) {
        throw new Error("Failed to prepare data from server.");
      }

      toast.loading("Please sign the message in your wallet...", {
        id: commitToast,
      });

      // Step 2: Sign - Ask the user to sign the message
      const signature = await signMessageAsync({ message: messageToSign });

      toast.loading("Verifying and submitting to the blockchain...", {
        id: commitToast,
      });

      // Step 3: Verify & Execute - Send signature back to the backend
      const verifyResponse = await fetch("/api/persona/commit-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements: images, address, signature, nonce }),
      });
      const result = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(result.error || "Verification failed on the server.");
      }

      toast.success(
        `Snapshot committed! Tx: ${result.transactionHash.slice(0, 10)}...`,
        {
          id: commitToast,
          duration: 8000,
        }
      );
    } catch (error: unknown) {
      logger.error("Commit snapshot failed:", error);
      // Handle user declining the signature
      if (
        error instanceof Error &&
        error.message.includes("User rejected the request")
      ) {
        toast.error("Signature request was cancelled.", { id: commitToast });
      } else {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        toast.error(`Commit failed: ${errorMessage}`, { id: commitToast });
      }
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <>
      <Toaster position="top-center" richColors />

      {/* Wallet Connect Button - Fixed Top Right */}
      <div
        style={{
          position: "fixed",
          top: "40px",
          right: "40px",
          zIndex: 500,
          padding: "8px",
          opacity: 1,
        }}
      >
        <ConnectWalletButton />
      </div>

      <div
        className="flex flex-col min-h-screen w-full overflow-x-hidden items-center pt-6 pb-28 md:pb-8 px-4 md:justify-center"
        ref={containerRef}
      >
        <div className="flex flex-col items-center gap-5 md:gap-6 w-full max-w-3xl mt-10 md:mt-12">
          <form
            className="relative w-full max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              handleAutoAnalyzeAndPlace(); // This will now check for wallet connection first
            }}
          >
            <Input
              placeholder="Enter X username (e.g., elonmusk)"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="h-12 rounded-full pl-5 pr-28 text-base shadow-sm focus-visible:ring-purple-500 dark:bg-neutral-800 dark:border-neutral-700"
              autoCapitalize="none"
              spellCheck="false"
              type="text"
              disabled={isInputDisabled}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex space-x-1.5">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={handleAddRandom} // This will now check for wallet connection first
                      size="icon"
                      className="h-9 w-9 rounded-full bg-neutral-600 hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white"
                      disabled={!usernameInput.trim() || isInputDisabled}
                      aria-label="Add randomly"
                    >
                      <Dices className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Place user randomly (manual)</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit" // Form submission calls handleAutoAnalyzeAndPlace
                      size="icon"
                      className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                      disabled={!usernameInput.trim() || isInputDisabled}
                      aria-label="Analyze with AI"
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Analyze with AI & place</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </form>

          <div className="relative mt-4">
            {["Good", "Evil", "Lawful", "Chaotic"].map((label) => (
              <button
                key={label}
                onClick={() =>
                  toast.info(`${label} Alignment`, {
                    description:
                      {
                        Good: "Altruistic, compassionate, puts others first.",
                        Evil: "Selfish, manipulative, or harmful. Motivated by greed, hatred, or power.",
                        Lawful:
                          "Follows rules, traditions, social norms. Values order, loyalty.",
                        Chaotic:
                          "Rebels against convention, values personal freedom, own moral compass.",
                      }[label] || "",
                    duration: 5000,
                  })
                }
                className={cn(
                  "absolute bg-white dark:bg-neutral-800 px-2.5 py-1 font-semibold md:text-sm text-xs border border-neutral-400 dark:border-neutral-600 rounded-full z-10 shadow",
                  label === "Good" &&
                    "top-0 left-1/2 -translate-x-1/2 -translate-y-[calc(100%+12px)]",
                  label === "Evil" &&
                    "bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+12px)]",
                  label === "Lawful" &&
                    "top-1/2 left-0 -translate-x-[calc(100%+12px)] -translate-y-1/2",
                  label === "Chaotic" &&
                    "top-1/2 right-0 translate-x-[calc(100%+12px)] -translate-y-1/2"
                )}
              >
                {label}
              </button>
            ))}
            <Card
              className="relative border-2 border-neutral-700 dark:border-neutral-400 overflow-hidden shadow-xl rounded-xl bg-neutral-50 dark:bg-neutral-800/30"
              ref={chartRef}
              style={{
                width: `${chartSize.width}px`,
                height: `${chartSize.height}px`,
              }}
            >
              <div
                className="w-full h-full absolute inset-0"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, rgba(128,128,128,0.1) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(128,128,128,0.1) 1px, transparent 1px)
                  `,
                  backgroundSize: "calc(100% / 10) calc(100% / 10)",
                }}
              />
              <div className="absolute top-1/2 left-0 w-full h-[2px] bg-neutral-600 dark:bg-neutral-500 opacity-40 -translate-y-[1px]" />
              <div className="absolute top-0 left-1/2 w-[2px] h-full bg-neutral-600 dark:bg-neutral-500 opacity-40 -translate-x-[1px]" />

              {images.map((img) => (
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
                    img.isAiPlaced &&
                      "ring-1 ring-purple-500 dark:ring-purple-400"
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
                  onMouseDown={(e) => handleDragStart(e, img.id)}
                  onTouchStart={(e) => handleDragStart(e, img.id)}
                >
                  <NextImage
                    src={img.src || "/grid.svg"}
                    alt={`X avatar for ${img.username || "user"}`}
                    width={128}
                    height={128}
                    className={cn(
                      "object-cover w-full h-full bg-white dark:bg-neutral-700",
                      img.loading && !img.isAiPlaced
                        ? "animate-pulse opacity-50"
                        : ""
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
                        handleRemoveImage(img.id);
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
            <a>
              <GithubIcon className="w-3 h-3" />
            </a>
          </span>
        </div>

        <AnalysisPanel analyses={panelAnalyses} newAnalysisId={newlyAnalyzedId}>
          {/* The AlertDialog for Clear All */}
          {/* ... */}

          {/* NEW COMMIT BUTTON */}
          <Button
            onClick={handleCommitSnapshot}
            size="lg"
            className="h-14 rounded-full shadow-lg bg-green-600 hover:bg-green-700 text-white"
            disabled={
              images.length === 0 ||
              isCommitting ||
              !isConnected ||
              isInputDisabled
            }
            aria-label="Commit snapshot to blockchain"
          >
            <ShieldCheck className="!size-5 mr-0 sm:mr-2" />
            <span className="hidden sm:inline">
              {isCommitting ? "Committing..." : "Commit Snapshot"}
            </span>
          </Button>

          {/* Existing Clear All AlertDialogTrigger */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className="h-14 rounded-full shadow-lg border-neutral-300 dark:border-neutral-600 hover:bg-red-500 hover:text-white dark:hover:bg-red-600 dark:text-neutral-100"
                disabled={images.length === 0 || isInputDisabled}
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
                  onClick={handleClearAll}
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
