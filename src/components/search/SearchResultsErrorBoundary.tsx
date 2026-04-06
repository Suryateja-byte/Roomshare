"use client";

import React, { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  // L-16 FIX: retryKey forces full child remount on retry, preventing crash loops
  // on persistent data-dependent errors (same pattern as MapErrorBoundary)
  retryKey: number;
}

/**
 * Outer error boundary for SearchResultsClient.
 * Catches render errors in the entire results panel (ListingCard crashes,
 * mapping errors, etc.) and shows a recovery UI.
 *
 * NOTE: Does NOT catch event handler or async errors — those are handled
 * by try/catch in handleLoadMore and effect cleanup patterns.
 */
export class SearchResultsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryKey: 0 };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      tags: { component: "SearchResultsClient", boundary: "outer" },
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-on-surface mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-on-surface-variant text-center max-w-sm mb-6">
            We had trouble loading search results. Please try again.
          </p>
          <button
            onClick={() =>
              this.setState((prev) => ({
                hasError: false,
                retryKey: prev.retryKey + 1,
              }))
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-on-surface text-white rounded-lg hover:bg-on-surface transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      );
    }

    // L-16 FIX: Key forces full child remount on retry, preventing crash loops
    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
