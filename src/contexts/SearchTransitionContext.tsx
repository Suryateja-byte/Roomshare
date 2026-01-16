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
  type ReactNode,
  type TransitionStartFunction,
} from "react";
import { useRouter } from "next/navigation";

// Threshold for "slow" transition warning (6 seconds)
const SLOW_TRANSITION_THRESHOLD_MS = 6000;

interface SearchTransitionContextValue {
  /** Whether a transition is currently in progress */
  isPending: boolean;
  /** Whether the transition has exceeded the slow threshold (6s) */
  isSlowTransition: boolean;
  /** Navigate to a URL within a transition (keeps old UI visible) */
  navigateWithTransition: (url: string, options?: { scroll?: boolean }) => void;
  /** Raw startTransition for custom transition logic */
  startTransition: TransitionStartFunction;
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
      startTransition(() => {
        // Default scroll: false to preserve scroll position
        router.push(url, { scroll: options?.scroll ?? false });
      });
    },
    [router, startTransition],
  );

  return (
    <SearchTransitionContext.Provider
      value={{
        isPending,
        isSlowTransition,
        navigateWithTransition,
        startTransition,
      }}
    >
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
