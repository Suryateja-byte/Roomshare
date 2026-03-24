"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflineClient() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-8"
    >
      {/* Offline icon */}
      <div className="mb-6 rounded-full bg-zinc-200 p-4">
        <WifiOff className="h-12 w-12 text-zinc-500" />
      </div>

      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        You&apos;re offline
      </h1>

      <p className="mb-8 max-w-md text-center text-zinc-600">
        It looks like you&apos;ve lost your internet connection. Some features
        may be unavailable until you&apos;re back online.
      </p>

      <div className="flex flex-col items-center gap-4">
        <Button
          onClick={() => window.location.reload()}
          size="lg"
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>

        <p className="text-sm text-zinc-500">
          We&apos;ll automatically reconnect when you&apos;re back online.
        </p>
      </div>
    </main>
  );
}
