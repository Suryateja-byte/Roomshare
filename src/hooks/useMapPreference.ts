"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Map visibility preference hook with localStorage persistence.
 *
 * Cost optimization: Deferring map initialization until user opts in saves
 * Mapbox billing (charged per Map object initialization, not page views).
 *
 * Defaults:
 * - Mobile: list-only (biggest cost savings - most mobile users won't tap "Show Map")
 * - Desktop: split view (user expectation for desktop search)
 *
 * Preferences are persisted in localStorage so returning users see their preference.
 */

type DesktopPreference = "split" | "list-only";
type MobilePreference = "list" | "map";

interface MapPreference {
  desktop: DesktopPreference;
  mobile: MobilePreference;
}

const STORAGE_KEY = "roomshare-map-preference";
const DEFAULT_PREFERENCE: MapPreference = {
  desktop: "split",
  mobile: "list",
};

/**
 * Safe localStorage access (handles SSR, private browsing, etc.)
 */
function getStoredPreference(): MapPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // Validate shape
    if (
      typeof parsed === "object" &&
      (parsed.desktop === "split" || parsed.desktop === "list-only") &&
      (parsed.mobile === "list" || parsed.mobile === "map")
    ) {
      return parsed as MapPreference;
    }
    return null;
  } catch {
    return null;
  }
}

function setStoredPreference(pref: MapPreference): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // localStorage unavailable (private browsing, etc.) - fail silently
  }
}

/**
 * Hook for managing map visibility preference with localStorage persistence.
 *
 * Returns:
 * - shouldShowMap: Whether map should be visible (accounts for device type)
 * - shouldRenderMap: Whether map component should mount (for lazy init)
 * - toggleMap: Toggle map visibility for current device type
 * - isMobile: Current device type detection
 * - isLoading: True during hydration (prevents flash of wrong state)
 */
export function useMapPreference() {
  const [preference, setPreference] =
    useState<MapPreference>(DEFAULT_PREFERENCE);
  const [isMobile, setIsMobile] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = getStoredPreference();
    if (stored) {
      setPreference(stored);
    }

    // Detect mobile (matches md: breakpoint at 768px)
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };
    mql.addEventListener("change", handleChange);

    setIsHydrated(true);

    return () => mql.removeEventListener("change", handleChange);
  }, []);

  // Compute current visibility based on device type
  const shouldShowMap = isMobile
    ? preference.mobile === "map"
    : preference.desktop === "split";

  // Map should only render if user wants to see it
  // This is the key for cost savings - don't mount MapGL until needed
  const shouldRenderMap = shouldShowMap;

  const toggleMap = useCallback(() => {
    setPreference((prev) => {
      const next = { ...prev };
      if (isMobile) {
        next.mobile = prev.mobile === "list" ? "map" : "list";
      } else {
        next.desktop = prev.desktop === "split" ? "list-only" : "split";
      }
      setStoredPreference(next);
      return next;
    });
  }, [isMobile]);

  // For explicit show/hide (desktop "Hide map" button)
  const showMap = useCallback(() => {
    setPreference((prev) => {
      const next = { ...prev };
      if (isMobile) {
        next.mobile = "map";
      } else {
        next.desktop = "split";
      }
      setStoredPreference(next);
      return next;
    });
  }, [isMobile]);

  const hideMap = useCallback(() => {
    setPreference((prev) => {
      const next = { ...prev };
      if (isMobile) {
        next.mobile = "list";
      } else {
        next.desktop = "list-only";
      }
      setStoredPreference(next);
      return next;
    });
  }, [isMobile]);

  return {
    shouldShowMap,
    shouldRenderMap,
    toggleMap,
    showMap,
    hideMap,
    isMobile,
    isLoading: !isHydrated,
  };
}
