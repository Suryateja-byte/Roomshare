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
 *
 * Split contexts (PERF-H1):
 * - ListingFocusStateContext: read-only state (hoveredId, activeId, scrollRequest, focusSource)
 * - ListingFocusActionsContext: stable callbacks (setHovered, setActive, etc.)
 * Components that only call actions subscribe to neither state context and won't
 * re-render when hover/active changes.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";

/** One-shot scroll request with nonce for deduplication */
export interface ScrollRequest {
  id: string;
  nonce: number;
}

/** Where the current focus originated — used to prevent hover→scroll→hover loops */
export type FocusSource = "map" | "list" | null;

interface ListingFocusState {
  /** ID of listing being hovered (null = none) */
  hoveredId: string | null;
  /** ID of listing actively selected (persistent until changed/cleared) */
  activeId: string | null;
  /** One-shot scroll command - consumer should ack after handling */
  scrollRequest: ScrollRequest | null;
  /** Where the current hover originated (auto-clears after 300ms) */
  focusSource: FocusSource;
}

interface ListingFocusContextValue extends ListingFocusState {
  /** Set hovered listing (from card or marker hover). Pass source to enable jank guard. */
  setHovered: (id: string | null, source?: FocusSource) => void;
  /** Set active listing (persistent selection, no auto-clear) */
  setActive: (id: string | null) => void;
  /** Request scroll to a listing (fires one-shot command with nonce) */
  requestScrollTo: (id: string) => void;
  /** Acknowledge scroll request (clears only if nonce matches) */
  ackScrollTo: (nonce: number) => void;
  /** Clear all focus state (hovered + active + scrollRequest) */
  clearFocus: () => void;
  /** Whether a ListingFocusProvider is present in the tree (false = no map available) */
  hasProvider: boolean;
}

// ─── Split context interfaces (PERF-H1) ──────────────────────────────────────

export interface ListingFocusStateValue {
  hoveredId: string | null;
  activeId: string | null;
  scrollRequest: ScrollRequest | null;
  focusSource: FocusSource;
}

export interface ListingFocusActionsValue {
  setHovered: (id: string | null, source?: FocusSource) => void;
  setActive: (id: string | null) => void;
  requestScrollTo: (id: string) => void;
  ackScrollTo: (nonce: number) => void;
  clearFocus: () => void;
  hasProvider: boolean;
  focusSourceRef: React.RefObject<FocusSource>;
}

// ─── Contexts ─────────────────────────────────────────────────────────────────

const ListingFocusContext = createContext<ListingFocusContextValue | null>(
  null
);

const ListingFocusStateContext = createContext<ListingFocusStateValue | null>(
  null
);

const ListingFocusActionsContext =
  createContext<ListingFocusActionsValue | null>(null);

// ─── SSR Fallbacks ────────────────────────────────────────────────────────────

/**
 * Stable fallback for SSR and when used outside provider.
 * This prevents the re-render cascade that occurs when returning
 * a new object from useListingFocus() on every call.
 */
const SSR_FALLBACK: ListingFocusContextValue = {
  hoveredId: null,
  activeId: null,
  scrollRequest: null,
  focusSource: null,
  hasProvider: false,
  setHovered: () => {},
  setActive: () => {},
  requestScrollTo: () => {},
  ackScrollTo: () => {},
  clearFocus: () => {},
};

const SSR_STATE_FALLBACK: ListingFocusStateValue = {
  hoveredId: null,
  activeId: null,
  scrollRequest: null,
  focusSource: null,
};

// Stable ref for SSR fallback (never changes identity)
const SSR_FOCUS_SOURCE_REF: React.RefObject<FocusSource> = { current: null };

const SSR_ACTIONS_FALLBACK: ListingFocusActionsValue = {
  hasProvider: false,
  setHovered: () => {},
  setActive: () => {},
  requestScrollTo: () => {},
  ackScrollTo: () => {},
  clearFocus: () => {},
  focusSourceRef: SSR_FOCUS_SOURCE_REF,
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ListingFocusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(
    null
  );
  const [focusSource, setFocusSource] = useState<FocusSource>(null);

  // Nonce counter for scroll requests - allows triggering scroll to same listing twice
  const nonceRef = useRef(0);
  const focusSourceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Ref mirror of focusSource — actions subscribers read this without subscribing to state
  const focusSourceRef = useRef<FocusSource>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (focusSourceTimeoutRef.current)
        clearTimeout(focusSourceTimeoutRef.current);
    };
  }, []);

  const setHovered = useCallback((id: string | null, source?: FocusSource) => {
    setHoveredId(id);
    if (id && source) {
      setFocusSource(source);
      focusSourceRef.current = source;
      if (focusSourceTimeoutRef.current)
        clearTimeout(focusSourceTimeoutRef.current);
      focusSourceTimeoutRef.current = setTimeout(() => {
        setFocusSource(null);
        focusSourceRef.current = null;
      }, 300);
    } else if (!id) {
      setFocusSource(null);
      focusSourceRef.current = null;
      if (focusSourceTimeoutRef.current)
        clearTimeout(focusSourceTimeoutRef.current);
    }
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
    setFocusSource(null);
    focusSourceRef.current = null;
    if (focusSourceTimeoutRef.current)
      clearTimeout(focusSourceTimeoutRef.current);
  }, []);

  // Split memos: state changes frequently, actions are stable
  const stateValue = useMemo<ListingFocusStateValue>(
    () => ({ hoveredId, activeId, scrollRequest, focusSource }),
    [hoveredId, activeId, scrollRequest, focusSource]
  );

  const actionsValue = useMemo<ListingFocusActionsValue>(
    () => ({
      hasProvider: true,
      setHovered,
      setActive,
      requestScrollTo,
      ackScrollTo,
      clearFocus,
      focusSourceRef,
    }),
    [setHovered, setActive, requestScrollTo, ackScrollTo, clearFocus]
  );

  // Backward-compat combined context value
  const contextValue = useMemo<ListingFocusContextValue>(
    () => ({
      hoveredId,
      activeId,
      scrollRequest,
      focusSource,
      hasProvider: true,
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
      focusSource,
      setHovered,
      setActive,
      requestScrollTo,
      ackScrollTo,
      clearFocus,
    ]
  );

  return (
    <ListingFocusContext.Provider value={contextValue}>
      <ListingFocusStateContext.Provider value={stateValue}>
        <ListingFocusActionsContext.Provider value={actionsValue}>
          {children}
        </ListingFocusActionsContext.Provider>
      </ListingFocusStateContext.Provider>
    </ListingFocusContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Hook for components that need listing focus state
 * Returns stable SSR_FALLBACK when used outside provider (SSR)
 */
export function useListingFocus() {
  const context = useContext(ListingFocusContext);
  return context ?? SSR_FALLBACK;
}

/**
 * Hook for components that only need read-only focus state.
 * Re-renders on every state change (hoveredId, activeId, scrollRequest, focusSource).
 */
export function useListingFocusState(): ListingFocusStateValue {
  const context = useContext(ListingFocusStateContext);
  return context ?? SSR_STATE_FALLBACK;
}

/**
 * Hook for components that only call focus actions (setHovered, setActive, etc.).
 * Never re-renders due to hover/active state changes — actions are stable callbacks.
 * Uses focusSourceRef to read the current focusSource without subscribing to state.
 */
export function useListingFocusActions(): ListingFocusActionsValue {
  const context = useContext(ListingFocusActionsContext);
  return context ?? SSR_ACTIONS_FALLBACK;
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
    [hoveredId, activeId, listingId]
  );
}
