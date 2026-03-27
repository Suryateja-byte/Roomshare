"use client";

import { useState, useCallback } from "react";

interface RateLimitResult {
  error?: string;
  retryAfter?: number;
  /** MED-7 FIX: Structured error code for reliable detection */
  code?: string;
}

interface UseRateLimitHandlerReturn {
  isRateLimited: boolean;
  retryAfter: number;
  handleError: (result: RateLimitResult) => boolean;
  reset: () => void;
}

/**
 * Hook to handle rate limit (429) errors with countdown state
 *
 * @example
 * const { isRateLimited, retryAfter, handleError, reset } = useRateLimitHandler();
 *
 * const handleSubmit = async () => {
 *   if (isRateLimited) return;
 *
 *   const result = await someAction();
 *   if (result.error && handleError(result)) {
 *     return; // Rate limited - UI will show countdown
 *   }
 * };
 *
 * // In JSX:
 * {isRateLimited && (
 *   <RateLimitCountdown retryAfterSeconds={retryAfter} onRetryReady={reset} />
 * )}
 */
export function useRateLimitHandler(): UseRateLimitHandlerReturn {
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  const handleError = useCallback((result: RateLimitResult): boolean => {
    // MED-7 FIX: Use structured code field instead of fragile string matching.
    // Falls back to retryAfter presence for backward compat with endpoints
    // that haven't adopted the code field yet.
    const isRateLimitError =
      result.code === "RATE_LIMITED" ||
      result.retryAfter !== undefined;

    if (isRateLimitError) {
      setIsRateLimited(true);
      setRetryAfter(result.retryAfter || 60); // Default to 60 seconds if not specified
      return true;
    }

    return false;
  }, []);

  const reset = useCallback(() => {
    setIsRateLimited(false);
    setRetryAfter(0);
  }, []);

  return {
    isRateLimited,
    retryAfter,
    handleError,
    reset,
  };
}

export default useRateLimitHandler;
