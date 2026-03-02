import { useState, useEffect, useRef, useCallback } from 'react';

export interface NavigationGuardState {
    showDialog: boolean;
    message: string;
    onStay: () => void;
    onLeave: () => void;
}

// Module-level reference to the real pushState (StrictMode-safe — H4)
const nativePushState = typeof window !== 'undefined' ? window.history.pushState.bind(window.history) : null;

// Ref counter: how many guard instances are active (StrictMode double-mount safety)
let activeGuardCount = 0;

// Pending navigation target (set by intercepted pushState, consumed by onLeave)
let pendingNavUrl: string | null = null;

/**
 * Protects against accidental navigation when the user has unsaved work.
 * Returns dialog state for rendering an AlertDialog (no window.confirm).
 *
 * Covers:
 * 1. beforeunload — tab close, URL bar, refresh
 * 2. history.pushState monkey-patch — Next.js Link, router.push
 * 3. popstate — browser back/forward (sentinel entry approach)
 */
export function useNavigationGuard(shouldBlock: boolean, message: string): NavigationGuardState {
    const [showDialog, setShowDialog] = useState(false);
    const shouldBlockRef = useRef(shouldBlock);
    const messageRef = useRef(message);
    const sentinelPushedRef = useRef(false);

    // Keep refs in sync
    shouldBlockRef.current = shouldBlock;
    messageRef.current = message;

    const onStay = useCallback(() => {
        setShowDialog(false);
        pendingNavUrl = null;
        // Re-push sentinel if it was consumed by popstate
        if (shouldBlockRef.current && !sentinelPushedRef.current && nativePushState) {
            nativePushState({ __navGuardSentinel: true }, '', window.location.href);
            sentinelPushedRef.current = true;
        }
    }, []);

    const onLeave = useCallback(() => {
        setShowDialog(false);
        // Temporarily disable blocking so the real navigation goes through
        shouldBlockRef.current = false;

        const target = pendingNavUrl;
        pendingNavUrl = null;

        if (target) {
            // pushState interception case — re-push with blocking disabled
            if (nativePushState) {
                nativePushState(null, '', target);
                // Dispatch popstate so Next.js picks up the route change
                window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
            }
        } else {
            // popstate case (back/forward) — go back past the sentinel
            window.history.go(-1);
        }
    }, []);

    useEffect(() => {
        if (!shouldBlock) {
            // Remove sentinel if we no longer need to block
            if (sentinelPushedRef.current) {
                sentinelPushedRef.current = false;
            }
            return;
        }

        activeGuardCount++;

        // 1. beforeunload — browser tab close, URL bar navigation, refresh
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!shouldBlockRef.current) return;
            e.preventDefault();
            e.returnValue = messageRef.current;
        };

        // 2. Monkey-patch pushState (only if we're the first active guard)
        if (activeGuardCount === 1 && nativePushState) {
            window.history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
                if (url && shouldBlockRef.current) {
                    const target = new URL(url as string, window.location.origin);
                    if (target.pathname !== window.location.pathname) {
                        pendingNavUrl = target.href;
                        // Don't navigate — show dialog instead
                        setShowDialog(true);
                        return;
                    }
                }
                return nativePushState(data, unused, url);
            };
        }

        // 3. Push sentinel entry for popstate interception
        if (nativePushState && !sentinelPushedRef.current) {
            nativePushState({ __navGuardSentinel: true }, '', window.location.href);
            sentinelPushedRef.current = true;
        }

        const handlePopState = (_e: PopStateEvent) => {
            if (!shouldBlockRef.current) return;

            // User hit back — sentinel was consumed, show dialog
            sentinelPushedRef.current = false;
            pendingNavUrl = null; // popstate = back/forward, not pushState
            setShowDialog(true);

            // Push sentinel again to stay on this page while dialog is shown
            if (nativePushState) {
                nativePushState({ __navGuardSentinel: true }, '', window.location.href);
                sentinelPushedRef.current = true;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);

            activeGuardCount--;

            // Restore original pushState when last guard unmounts
            if (activeGuardCount === 0 && nativePushState) {
                window.history.pushState = nativePushState;
            }

            // Clean up sentinel
            if (sentinelPushedRef.current) {
                sentinelPushedRef.current = false;
            }
        };
    }, [shouldBlock]);

    return {
        showDialog,
        message,
        onStay,
        onLeave,
    };
}
