"use client";

import { useEffect } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import * as Sentry from "@sentry/nextjs";

export default function AdminError({
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
        <ShieldAlert className="w-10 h-10 text-red-600" />
      </div>
      <h2 className="text-2xl font-bold text-zinc-900 mb-2">
        Admin panel error
      </h2>
      <p className="text-zinc-600 mb-6 max-w-md">
        We encountered an error while loading the admin panel. Please try again.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => reset()} size="lg" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
