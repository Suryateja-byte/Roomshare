"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
  retryKey: number;
}

export class MapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: undefined, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // MED-2 FIX: Report map crashes to Sentry for production visibility.
    // Previously only console.error — map crashes (esp. WebGL context loss) were invisible.
    Sentry.captureException(error, {
      tags: { component: "Map", boundary: "map" },
      extra: { componentStack: errorInfo.componentStack },
    });
    console.error("[Map] Render error caught by boundary:", error.message, {
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      const isWebglIssue = /webgl|context/i.test(this.state.errorMessage ?? "");
      const fallbackMessage = isWebglIssue
        ? "Map context lost — try refreshing"
        : "Map unavailable — try refreshing";
      return (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-[300px] bg-surface-canvas rounded-lg border border-outline-variant/20">
          <p className="text-sm text-on-surface-variant mb-3">
            {fallbackMessage}
          </p>
          <button
            onClick={() =>
              this.setState((prev) => ({
                hasError: false,
                retryKey: prev.retryKey + 1,
              }))
            }
            className="px-4 py-2 text-sm font-medium rounded-md bg-surface-container-high hover:bg-surface-container-high text-on-surface-variant transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
          >
            Retry
          </button>
        </div>
      );
    }

    // Key forces full remount of children on retry, ensuring a fresh
    // WebGL context instead of resuming from corrupted state (#43)
    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
