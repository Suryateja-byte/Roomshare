"use client";

import { useEffect, useRef } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OfflineClientProps {
  reloadPage?: () => void;
}

export default function OfflineClient({
  reloadPage = () => window.location.reload(),
}: OfflineClientProps = {}) {
  const hasRetriedRef = useRef(false);

  useEffect(() => {
    const retryWhenOnline = () => {
      if (hasRetriedRef.current) {
        return;
      }
      hasRetriedRef.current = true;
      reloadPage();
    };

    window.addEventListener("online", retryWhenOnline);
    return () => {
      window.removeEventListener("online", retryWhenOnline);
    };
  }, [reloadPage]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-surface-canvas p-8">
      {/* Offline icon */}
      <div className="mb-6 rounded-full bg-surface-container-high p-4">
        <WifiOff className="h-12 w-12 text-on-surface-variant" />
      </div>

      <h1 className="font-display mb-2 text-2xl font-bold text-on-surface">
        You&apos;re offline
      </h1>

      <p className="mb-8 max-w-md text-center text-on-surface-variant">
        It looks like you&apos;ve lost your internet connection. Some features
        may be unavailable until you&apos;re back online.
      </p>

      <div className="flex flex-col items-center gap-4">
        <Button
          onClick={reloadPage}
          size="lg"
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>

        <p className="text-sm text-on-surface-variant">
          We&apos;ll automatically reconnect when you&apos;re back online.
        </p>
      </div>
    </main>
  );
}
