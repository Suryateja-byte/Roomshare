"use client";

import { useEffect } from "react";
import { RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SavedSearchesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("Saved searches error:", error);
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <Search className="w-10 h-10 text-red-600" />
      </div>
      <h2 className="font-display text-2xl font-bold text-on-surface mb-2">
        Unable to load saved searches
      </h2>
      <p className="text-on-surface-variant mb-6 max-w-md">
        We encountered an error while loading your saved searches. Please try
        again.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 px-6 py-3 border border-outline-variant/20 text-on-surface rounded-xl font-medium hover:bg-surface-canvas transition-colors"
        >
          Start new search
        </Link>
      </div>
    </div>
  );
}
