"use client";

import { useEffect } from "react";
import { RefreshCw, Bell } from "lucide-react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

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
      <h2 className="text-2xl font-bold text-zinc-900 mb-2">
        Unable to load notifications
      </h2>
      <p className="text-zinc-600 mb-6 max-w-md">
        We encountered an error while loading your notifications. Please try
        again.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 border border-zinc-300 text-zinc-900 rounded-xl font-medium hover:bg-zinc-100 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
