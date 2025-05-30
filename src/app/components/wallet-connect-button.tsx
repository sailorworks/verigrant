// src/app/components/connect-wallet-button.tsx
"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, AlertTriangle, Copy } from "lucide-react"; // Added Copy
import { toast } from "sonner"; // For copy feedback

export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const {
    connect,
    connectors,
    error: connectError,
    isPending: isConnecting,
  } = useConnect();
  const {
    disconnect,
    error: disconnectError,
    isPending: isDisconnecting,
  } = useDisconnect();

  const copyToClipboard = () => {
    if (address) {
      navigator.clipboard
        .writeText(address)
        .then(() => toast.success("Address copied to clipboard!"))
        .catch(() => toast.error("Failed to copy address."));
    }
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={copyToClipboard}
          title="Copy address"
          className="border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 px-3"
        >
          <Copy className="mr-2 h-3 w-3" />
          {address.slice(0, 6)}...{address.slice(-4)}
        </Button>
        <Button
          variant="outline"
          size="icon" // Make disconnect an icon button for compactness
          onClick={() => disconnect()}
          disabled={isDisconnecting}
          title="Disconnect"
          className="border-neutral-300 dark:border-neutral-600 hover:bg-red-500/10 dark:hover:bg-red-500/20 hover:border-red-500 dark:hover:border-red-500"
        >
          {isDisconnecting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></div>
          ) : (
            <LogOut className="h-4 w-4" />
          )}
        </Button>
        {disconnectError && (
          <p className="text-xs text-red-500 ml-2">
            <AlertTriangle className="inline mr-1 h-3 w-3" />
            {disconnectError.message}
          </p>
        )}
      </div>
    );
  }

  // Find MetaMask or the first injected connector
  const metaMaskConnector = connectors.find(
    (c) =>
      c.id === "injected" && (c.name === "MetaMask" || c.name === "Detected")
  );
  const availableConnector =
    metaMaskConnector || connectors.find((c) => c.id === "injected");

  return (
    <>
      {availableConnector ? (
        <Button
          onClick={() => connect({ connector: availableConnector })}
          disabled={isConnecting}
          // This will be our prominent "Connect Wallet" button
          className="bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md"
        >
          <LogIn className="mr-2 h-4 w-4" />
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => window.open("https://metamask.io/download/", "_blank")}
          className="border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700"
        >
          <AlertTriangle className="mr-2 h-4 w-4 text-orange-500" />
          Install Wallet
        </Button>
      )}

      {connectError && (
        // Displaying error near the button, or you can use a toast
        // For simplicity, if the button is fixed top-right, this error might be less visible.
        // Consider using toast for connectError as well.
        <div className="mt-2 text-xs text-red-500">
          <AlertTriangle className="inline mr-1 h-3 w-3" />
          Connect Error: {connectError.message}
        </div>
      )}
    </>
  );
}
