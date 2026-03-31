"use client";

import { useEffect } from "react";
import { RefreshCw, Bell } from "lucide-react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function NotificationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <Bell className="w-10 h-10 text-red-600" />
      </div>
      <h2 className="font-display text-2xl font-bold text-on-surface mb-2">
        Unable to load notifications
      </h2>
      <p className="text-on-surface-variant mb-6 max-w-md">
        We encountered an error while loading your notifications. Please try
        again.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 border border-outline-variant/20 text-on-surface rounded-xl font-medium hover:bg-surface-canvas transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
