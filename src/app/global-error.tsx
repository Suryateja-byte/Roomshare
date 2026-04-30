"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { errorBoundary: "global" },
    });
    if (process.env.NODE_ENV === "development") {
      console.error("Global error boundary caught:", error);
    }
  }, [error]);

  return (
    <html>
      <body className="bg-surface-canvas">
        <div className="min-h-svh flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-on-surface mb-2">
              Something went wrong
            </h2>
            <p className="text-on-surface-variant mb-6">
              A critical error has occurred. Please try again.
            </p>
            {error.digest && (
              <p className="text-xs text-on-surface-variant mb-4">
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={() => reset()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-full font-medium hover:brightness-110 transition-all active:scale-[0.97]"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
