"use client";

/**
 * SearchMapUIContext - Context for card-to-map focus coordination
 *
 * When a user clicks "View on map" on a ListingCard, this context:
 * 1. Stores the pending focus request (listing ID + nonce)
 * 2. Opens the map if hidden (calls showMap)
 * 3. Map.tsx consumes the pending focus to flyTo + open popup
 *
 * Key design decisions:
 * - No timeout: pendingFocus persists until acknowledged or replaced
 * - Nonce deduplication: rapid clicks only honor the latest request
 * - ListingCard owns setActive (user-initiated), Map only handles flyTo + popup
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";

interface PendingMapFocus {
  listingId: string;
  nonce: number;
}

interface SearchMapUIContextValue {
  pendingFocus: PendingMapFocus | null;
  focusListingOnMap: (listingId: string) => void;
  acknowledgeFocus: (nonce: number) => void;
  clearPendingFocus: () => void;
  /** Register a dismiss function (called by Map.tsx on mount) */
  registerDismiss: (fn: () => void) => void;
  /** Dismiss popups and clear selection (called by ListingCard before navigation) */
  dismiss: () => void;
}

const SearchMapUIContext = createContext<SearchMapUIContextValue | null>(null);

interface SearchMapUIProviderProps {
  children: React.ReactNode;
  showMap: () => void;
  shouldShowMap: boolean;
}

export function SearchMapUIProvider({
  children,
  showMap,
  shouldShowMap,
}: SearchMapUIProviderProps) {
  const [pendingFocus, setPendingFocus] = useState<PendingMapFocus | null>(
    null,
  );
  const nonceRef = useRef(0);
  const dismissRef = useRef<(() => void) | null>(null);

  const focusListingOnMap = useCallback(
    (listingId: string) => {
      nonceRef.current += 1;
      const nonce = nonceRef.current;

      // New focus replaces any previous pending focus (nonce deduplication)
      setPendingFocus({ listingId, nonce });

      if (!shouldShowMap) {
        showMap();
      }
    },
    [showMap, shouldShowMap],
  );

  const acknowledgeFocus = useCallback((nonce: number) => {
    setPendingFocus((current) => (current?.nonce === nonce ? null : current));
  }, []);

  const clearPendingFocus = useCallback(() => {
    setPendingFocus(null);
  }, []);

  const registerDismiss = useCallback((fn: () => void) => {
    dismissRef.current = fn;
  }, []);

  const dismiss = useCallback(() => {
    dismissRef.current?.();
  }, []);

  const contextValue = useMemo(
    () => ({
      pendingFocus,
      focusListingOnMap,
      acknowledgeFocus,
      clearPendingFocus,
      registerDismiss,
      dismiss,
    }),
    [
      pendingFocus,
      focusListingOnMap,
      acknowledgeFocus,
      clearPendingFocus,
      registerDismiss,
      dismiss,
    ],
  );

  return (
    <SearchMapUIContext.Provider value={contextValue}>
      {children}
    </SearchMapUIContext.Provider>
  );
}

/**
 * Hook for components that trigger map focus (e.g., ListingCard)
 */
export function useSearchMapUI() {
  const context = useContext(SearchMapUIContext);
  if (!context) {
    // Return no-op when used outside provider (e.g., non-search pages)
    return {
      pendingFocus: null,
      focusListingOnMap: () => {},
      acknowledgeFocus: () => {},
      clearPendingFocus: () => {},
      registerDismiss: () => {},
      dismiss: () => {},
    };
  }
  return context;
}

/**
 * Hook for Map.tsx to consume pending focus
 */
export function usePendingMapFocus() {
  const { pendingFocus, acknowledgeFocus, clearPendingFocus } =
    useSearchMapUI();
  return { pendingFocus, acknowledgeFocus, clearPendingFocus };
}
