"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Shared error boundary component for auth pages (login, signup, forgot-password, reset-password).
 * Keeps recovery UI lightweight on the auth hot path.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("Auth page error:", error);
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <AlertTriangle className="w-10 h-10 text-red-600" />
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">
        Something went wrong
      </h2>
      <p className="text-on-surface-variant mb-6 max-w-md">
        We had trouble loading this page. This is usually temporary — please try
        again in a moment.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={() => reset()} size="lg" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link href="/">
            <Home className="w-4 h-4" />
            Go to homepage
          </Link>
        </Button>
      </div>
    </div>
  );
}
