"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report to Sentry with component stack
    Sentry.withScope((scope) => {
      scope.setExtra("componentStack", errorInfo.componentStack);
      scope.setTag("errorBoundary", "custom");
      Sentry.captureException(error);
    });

    // Also log locally for development
    if (process.env.NODE_ENV === "development") {
      console.error("Error caught by ErrorBoundary:", error, errorInfo);
    }

    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
  title?: string;
  description?: string;
}

export function ErrorFallback({
  error,
  onRetry,
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
}: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center"
    >
      <div className="mb-4 rounded-full bg-red-100 dark:bg-red-900/30 p-3">
        <AlertTriangle
          className="h-8 w-8 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
      </div>

      <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-white">
        {title}
      </h2>

      <p className="mb-6 max-w-md text-zinc-600 dark:text-zinc-400">
        {description}
      </p>

      {process.env.NODE_ENV === "development" && error && (
        <details className="mb-6 max-w-lg rounded-lg bg-zinc-100 dark:bg-zinc-800 p-4 text-left">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Error details (development only)
          </summary>
          <pre className="mt-2 overflow-auto text-xs text-red-600 dark:text-red-400">
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        </details>
      )}

      <div className="flex gap-3">
        {onRetry && (
          <Button onClick={onRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Reload page
        </Button>
      </div>
    </div>
  );
}
