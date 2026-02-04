"use client";

/**
 * SearchTransitionContext - Coordinates transitions across search components
 *
 * This context provides:
 * - isPending: Whether a navigation/transition is in progress
 * - startTransition: Wrapper for navigation calls to enable smooth transitions
 *
 * Benefits:
 * - Keeps current results visible while new data loads
 * - Shows loading overlay instead of full page flash
 * - Preserves scroll position during filter changes
 */

import {
  createContext,
  useContext,
  useTransition,
  useCallback,
  useState,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
  type TransitionStartFunction,
} from "react";
import { useRouter } from "next/navigation";
import { SLOW_TRANSITION_THRESHOLD_MS } from "@/lib/constants";

interface SearchTransitionContextValue {
  /** Whether a transition is currently in progress */
  isPending: boolean;
  /** Whether the transition has exceeded the slow threshold (6s) */
  isSlowTransition: boolean;
  /** Navigate to a URL within a transition (keeps old UI visible) */
  navigateWithTransition: (url: string, options?: { scroll?: boolean }) => void;
  /** Navigate with replace (for map - avoids history pollution) */
  replaceWithTransition: (url: string, options?: { scroll?: boolean }) => void;
  /** Raw startTransition for custom transition logic */
  startTransition: TransitionStartFunction;
  /** Replay the last navigation (available only during slow transitions) */
  retryLastNavigation: (() => void) | null;
}

const SearchTransitionContext =
  createContext<SearchTransitionContextValue | null>(null);

export function SearchTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [isSlowTransition, setIsSlowTransition] = useState(false);
  const router = useRouter();

  // Store last navigation for retry
  const lastNavRef = useRef<{ url: string; method: "push" | "replace"; scroll: boolean } | null>(null);

  // Track slow transitions (>6s)
  useEffect(() => {
    if (!isPending) {
      // Reset when transition ends
      setIsSlowTransition(false);
      return;
    }

    // Set timeout to mark as slow after threshold
    const timeout = setTimeout(() => {
      setIsSlowTransition(true);
    }, SLOW_TRANSITION_THRESHOLD_MS);

    return () => clearTimeout(timeout);
  }, [isPending]);

  const navigateWithTransition = useCallback(
    (url: string, options?: { scroll?: boolean }) => {
      const scroll = options?.scroll ?? false;
      lastNavRef.current = { url, method: "push", scroll };
      startTransition(() => {
        router.push(url, { scroll });
      });
    },
    [router, startTransition],
  );

  const replaceWithTransition = useCallback(
    (url: string, options?: { scroll?: boolean }) => {
      const scroll = options?.scroll ?? false;
      lastNavRef.current = { url, method: "replace", scroll };
      startTransition(() => {
        router.replace(url, { scroll });
      });
    },
    [router, startTransition],
  );

  // Retry callback — only meaningful during slow transitions
  const retryLastNavigation = useCallback(() => {
    const last = lastNavRef.current;
    if (!last) return;
    startTransition(() => {
      if (last.method === "replace") {
        router.replace(last.url, { scroll: last.scroll });
      } else {
        router.push(last.url, { scroll: last.scroll });
      }
    });
  }, [router, startTransition]);

  // P2-FIX (#172): Memoize context value to prevent unnecessary consumer re-renders
  const contextValue = useMemo(
    () => ({
      isPending,
      isSlowTransition,
      navigateWithTransition,
      replaceWithTransition,
      startTransition,
      retryLastNavigation: isSlowTransition ? retryLastNavigation : null,
    }),
    [
      isPending,
      isSlowTransition,
      navigateWithTransition,
      replaceWithTransition,
      startTransition,
      retryLastNavigation,
    ]
  );

  return (
    <SearchTransitionContext.Provider value={contextValue}>
      {children}
    </SearchTransitionContext.Provider>
  );
}

/**
 * Hook to access search transition state
 * @throws Error if used outside SearchTransitionProvider
 */
export function useSearchTransition(): SearchTransitionContextValue {
  const context = useContext(SearchTransitionContext);
  if (!context) {
    throw new Error(
      "useSearchTransition must be used within SearchTransitionProvider",
    );
  }
  return context;
}

/**
 * Safe hook that returns null if outside provider
 * Useful for components that may be rendered outside search context
 */
export function useSearchTransitionSafe(): SearchTransitionContextValue | null {
  return useContext(SearchTransitionContext);
}
