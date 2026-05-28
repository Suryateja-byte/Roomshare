"use client";

import { useState, useEffect, useCallback } from "react";
import { SEARCH_SPLIT_VIEW_MEDIA_QUERY } from "@/lib/search-layout";

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
  const [isSplitViewCapable, setIsSplitViewCapable] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = getStoredPreference();
    if (stored) {
      setPreference(stored);
    }

    // Detect mobile and wide desktop separately. Tablet/narrow desktop keeps
    // desktop controls but stays list-first so the results panel never cramps.
    const mobileMql = window.matchMedia("(max-width: 767px)");
    const splitViewMql = window.matchMedia(SEARCH_SPLIT_VIEW_MEDIA_QUERY);
    setIsMobile(mobileMql.matches);
    setIsSplitViewCapable(splitViewMql.matches);

    const handleMobileChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };
    const handleSplitViewChange = (e: MediaQueryListEvent) => {
      setIsSplitViewCapable(e.matches);
    };
    mobileMql.addEventListener("change", handleMobileChange);
    splitViewMql.addEventListener("change", handleSplitViewChange);

    setIsHydrated(true);

    return () => {
      mobileMql.removeEventListener("change", handleMobileChange);
      splitViewMql.removeEventListener("change", handleSplitViewChange);
    };
  }, []);

  // Compute current visibility based on device type
  // Mobile: map is always visible (bottom sheet overlays it)
  const canShowMap = isMobile || isSplitViewCapable;
  const shouldShowMap = isMobile
    ? true
    : isSplitViewCapable && preference.desktop === "split";

  // Map should only render if user wants to see it AND we've hydrated
  // This is the key for cost savings - don't mount MapGL until needed
  // CRITICAL: Gate on isHydrated to prevent mobile devices from initializing
  // the map during SSR/hydration when isMobile incorrectly defaults to false
  const shouldRenderMap = isHydrated && shouldShowMap;

  const toggleMap = useCallback(() => {
    if (!isMobile && !isSplitViewCapable) return;

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
  }, [isMobile, isSplitViewCapable]);

  // For explicit show/hide (desktop "Hide map" button)
  const showMap = useCallback(() => {
    if (!isMobile && !isSplitViewCapable) return;

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
  }, [isMobile, isSplitViewCapable]);

  const hideMap = useCallback(() => {
    if (!isMobile && !isSplitViewCapable) return;

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
  }, [isMobile, isSplitViewCapable]);

  return {
    shouldShowMap,
    shouldRenderMap,
    toggleMap,
    showMap,
    hideMap,
    canShowMap,
    isMobile,
    isLoading: !isHydrated,
  };
}
