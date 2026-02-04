"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class MapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[Map] Render error caught by boundary:", error.message, {
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-[300px] bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
            Map unavailable — try refreshing
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 text-sm font-medium rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
