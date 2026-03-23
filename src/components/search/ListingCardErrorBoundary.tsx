"use client";

import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  listingId: string;
}

interface State {
  hasError: boolean;
}

/**
 * Lightweight per-card error boundary.
 * Isolates individual ListingCard render failures so one bad listing
 * doesn't crash the entire search results grid.
 */
export class ListingCardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      tags: {
        component: "ListingCard",
        boundary: "per-card",
        listingId: this.props.listingId,
      },
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-6 flex flex-col items-center justify-center min-h-[200px]">
          <AlertCircle className="w-5 h-5 text-zinc-400 mb-2" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
            Unable to load this listing
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
