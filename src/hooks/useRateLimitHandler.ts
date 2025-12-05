'use client';

import { useState, useCallback } from 'react';

interface RateLimitResult {
    error?: string;
    retryAfter?: number;
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
        // Check if this is a rate limit error
        const isRateLimitError =
            result.error?.toLowerCase().includes('too many requests') ||
            result.error?.toLowerCase().includes('rate limit') ||
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
        reset
    };
}

export default useRateLimitHandler;
