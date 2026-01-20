"use client";

/**
 * ListingFocusContext - Shared state for list ↔ map hover/selection sync
 *
 * This context enables the two-way mirror between listing cards and map markers:
 * 1. Hovering a card highlights the corresponding map marker
 * 2. Clicking a map marker scrolls to and highlights the card
 *
 * State:
 * - hoveredId: Listing being hovered (from either list or map)
 * - activeId: Listing actively selected (persistent, no auto-clear)
 * - scrollRequest: One-shot scroll command with nonce for deduplication
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";

/** One-shot scroll request with nonce for deduplication */
export interface ScrollRequest {
  id: string;
  nonce: number;
}

interface ListingFocusState {
  /** ID of listing being hovered (null = none) */
  hoveredId: string | null;
  /** ID of listing actively selected (persistent until changed/cleared) */
  activeId: string | null;
  /** One-shot scroll command - consumer should ack after handling */
  scrollRequest: ScrollRequest | null;
}

interface ListingFocusContextValue extends ListingFocusState {
  /** Set hovered listing (from card or marker hover) */
  setHovered: (id: string | null) => void;
  /** Set active listing (persistent selection, no auto-clear) */
  setActive: (id: string | null) => void;
  /** Request scroll to a listing (fires one-shot command with nonce) */
  requestScrollTo: (id: string) => void;
  /** Acknowledge scroll request (clears only if nonce matches) */
  ackScrollTo: (nonce: number) => void;
  /** Clear all focus state (hovered + active + scrollRequest) */
  clearFocus: () => void;
}

const ListingFocusContext = createContext<ListingFocusContextValue | null>(
  null,
);

/**
 * Stable fallback for SSR and when used outside provider.
 * This prevents the re-render cascade that occurs when returning
 * a new object from useListingFocus() on every call.
 */
const SSR_FALLBACK: ListingFocusContextValue = {
  hoveredId: null,
  activeId: null,
  scrollRequest: null,
  setHovered: () => {},
  setActive: () => {},
  requestScrollTo: () => {},
  ackScrollTo: () => {},
  clearFocus: () => {},
};

export function ListingFocusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(
    null,
  );

  // Nonce counter for scroll requests - allows triggering scroll to same listing twice
  const nonceRef = useRef(0);

  const setHovered = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  const setActive = useCallback((id: string | null) => {
    setActiveId(id);
  }, []);

  const requestScrollTo = useCallback((id: string) => {
    nonceRef.current += 1;
    setScrollRequest({ id, nonce: nonceRef.current });
  }, []);

  const ackScrollTo = useCallback((nonce: number) => {
    setScrollRequest((current) => {
      if (current?.nonce === nonce) {
        return null;
      }
      return current;
    });
  }, []);

  const clearFocus = useCallback(() => {
    setHoveredId(null);
    setActiveId(null);
    setScrollRequest(null);
  }, []);

  const contextValue = useMemo(
    () => ({
      hoveredId,
      activeId,
      scrollRequest,
      setHovered,
      setActive,
      requestScrollTo,
      ackScrollTo,
      clearFocus,
    }),
    [
      hoveredId,
      activeId,
      scrollRequest,
      setHovered,
      setActive,
      requestScrollTo,
      ackScrollTo,
      clearFocus,
    ],
  );

  return (
    <ListingFocusContext.Provider value={contextValue}>
      {children}
    </ListingFocusContext.Provider>
  );
}

/**
 * Hook for components that need listing focus state
 * Returns stable SSR_FALLBACK when used outside provider (SSR)
 */
export function useListingFocus() {
  const context = useContext(ListingFocusContext);
  return context ?? SSR_FALLBACK;
}

/**
 * Hook for checking if a specific listing is focused
 * Memoized to prevent unnecessary re-renders in list items
 */
export function useIsListingFocused(listingId: string) {
  const { hoveredId, activeId } = useListingFocus();
  return useMemo(
    () => ({
      isHovered: hoveredId === listingId,
      isActive: activeId === listingId,
      isFocused: hoveredId === listingId || activeId === listingId,
    }),
    [hoveredId, activeId, listingId],
  );
}
