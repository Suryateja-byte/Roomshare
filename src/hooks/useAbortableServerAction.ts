'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Options for useAbortableServerAction hook
 */
interface UseAbortableServerActionOptions<TParams, TResult> {
    /** The server action to execute */
    action: (params: TParams) => Promise<TResult>;
    /** Callback fired when action succeeds with fresh data */
    onSuccess?: (result: TResult) => void;
    /** Callback fired when action fails (only for current request) */
    onError?: (error: Error) => void;
}

/**
 * Return type for useAbortableServerAction hook
 */
interface UseAbortableServerActionReturn<TParams, TResult> {
    /** Execute the server action with given params */
    execute: (params: TParams) => Promise<void>;
    /** The latest successful result data */
    data: TResult | null;
    /** Whether a request is currently in flight */
    isLoading: boolean;
    /** The latest error (cleared on new request) */
    error: Error | null;
    /** Cancel any pending request (increments request ID) */
    cancel: () => void;
}

/**
 * Hook for executing server actions with request sequencing to prevent race conditions.
 *
 * Since Next.js server actions don't support AbortSignal, this hook uses a request ID
 * pattern to ignore stale responses. When a new request is made, any responses from
 * previous requests are discarded.
 *
 * @example
 * ```tsx
 * const { execute, isLoading, data, error, cancel } = useAbortableServerAction({
 *     action: getListingsInBounds,
 *     onSuccess: (listings) => setListings(listings),
 *     onError: (err) => console.error('Failed:', err),
 * });
 *
 * // In useEffect or event handler:
 * execute({ ne_lat: 37.8, ne_lng: -122.3, sw_lat: 37.7, sw_lng: -122.5 });
 *
 * // On unmount:
 * useEffect(() => () => cancel(), [cancel]);
 * ```
 */
export function useAbortableServerAction<TParams, TResult>({
    action,
    onSuccess,
    onError,
}: UseAbortableServerActionOptions<TParams, TResult>): UseAbortableServerActionReturn<TParams, TResult> {
    const [data, setData] = useState<TResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Request sequencing: track current request ID to ignore stale responses
    const requestIdRef = useRef(0);
    // Track mounted state to prevent state updates after unmount
    const mountedRef = useRef(true);

    // Set mounted flag on mount, clear on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const execute = useCallback(async (params: TParams) => {
        // Increment request ID - this invalidates any in-flight requests
        const currentRequestId = ++requestIdRef.current;
        setIsLoading(true);
        setError(null);

        try {
            const result = await action(params);

            // Ignore stale responses: check if this is still the current request
            // and component is still mounted
            if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
                return;
            }

            setData(result);
            setIsLoading(false);
            onSuccess?.(result);
        } catch (err) {
            // Ignore errors from stale requests
            if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
                return;
            }

            const error = err instanceof Error ? err : new Error('Unknown error');
            setError(error);
            setIsLoading(false);
            onError?.(error);
        }
    }, [action, onSuccess, onError]);

    const cancel = useCallback(() => {
        // Increment request ID to invalidate any in-flight requests
        requestIdRef.current++;
        setIsLoading(false);
    }, []);

    return {
        execute,
        data,
        isLoading,
        error,
        cancel,
    };
}
