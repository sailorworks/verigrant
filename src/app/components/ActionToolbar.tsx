// src/app/components/ActionToolbar.tsx
"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dices, Sparkles } from "lucide-react";

interface ActionToolbarProps {
  onAddPlacement: (username: string, isAiAnalysis: boolean) => void;
  isProcessing: boolean;
  isConnected: boolean;
}

export function ActionToolbar({
  onAddPlacement,
  isProcessing,
  isConnected,
}: ActionToolbarProps) {
  const [usernameInput, setUsernameInput] = React.useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isConnected) return; // Wallet check is handled by parent, but good to have
    onAddPlacement(usernameInput, true); // True for AI analysis
    setUsernameInput("");
  };

  const handleAddRandom = () => {
    if (!isConnected) return;
    onAddPlacement(usernameInput, false); // False for manual placement
    setUsernameInput("");
  };

  const isDisabled = !usernameInput.trim() || isProcessing || !isConnected;

  return (
    <form className="relative w-full max-w-md" onSubmit={handleSubmit}>
      <Input
        placeholder="Enter X username (e.g., elonmusk)"
        value={usernameInput}
        onChange={(e) => setUsernameInput(e.target.value)}
        className="h-12 rounded-full pl-5 pr-28 text-base shadow-sm focus-visible:ring-purple-500 dark:bg-neutral-800 dark:border-neutral-700"
        autoCapitalize="none"
        spellCheck="false"
        type="text"
        disabled={isProcessing || !isConnected}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex space-x-1.5">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={handleAddRandom}
                size="icon"
                className="h-9 w-9 rounded-full bg-neutral-600 hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white"
                disabled={isDisabled}
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
                type="submit"
                size="icon"
                className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                disabled={isDisabled}
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
  );
}
