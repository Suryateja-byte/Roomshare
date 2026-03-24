"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as Sentry from "@sentry/nextjs";

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // MED-2 FIX: Report page-level search errors to Sentry.
    // Previously only logged in dev — production errors were invisible.
    Sentry.captureException(error, {
      tags: { page: "search", boundary: "page" },
    });
    if (process.env.NODE_ENV === "development") {
      console.error("Search page error:", error);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-surface-canvas pt-[80px] sm:pt-[96px]">
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-primary" />
        </div>

        <h1 className="text-2xl font-display font-bold text-on-surface mb-3">
          Unable to load search results
        </h1>

        <p className="text-on-surface-variant mb-2">
          We&apos;re having trouble finding listings right now. This is usually
          temporary.
        </p>
        <p className="text-sm text-on-surface-variant mb-4">
          Try refreshing the page, or adjust your search filters and try again.
        </p>

        {error.digest && (
          <p className="mt-2 mb-8 text-sm text-on-surface-variant">
            Reference ID:{" "}
            <code className="bg-surface-container-high px-2 py-1 rounded-lg font-mono text-xs">
              {error.digest}
            </code>
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => reset()} size="lg" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Try again
          </Button>

          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link href="/">
              <Home className="w-4 h-4" />
              Go home
            </Link>
          </Button>
        </div>

        {/* Error details for debugging (hidden in production) */}
        {process.env.NODE_ENV === "development" && (
          <details className="mt-8 text-left bg-surface-container-high rounded-lg p-4">
            <summary className="text-sm font-medium text-on-surface cursor-pointer">
              Error details (dev only)
            </summary>
            <pre className="mt-2 text-xs text-primary overflow-auto">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
