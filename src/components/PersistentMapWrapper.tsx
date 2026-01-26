"use client";

/**
 * PersistentMapWrapper - A wrapper component for the map that fetches its own data.
 *
 * This component is designed to live in the layout.tsx so it persists across
 * page navigations (router.replace/push). It reads URL search params and fetches
 * map listings data via the /api/map-listings endpoint.
 *
 * Key benefits:
 * - Map stays mounted across /search navigations (no Mapbox re-init = no extra billing)
 * - Uses useSearchParams() to react to URL changes
 * - Fetches data independently of the server component page
 *
 * Cost optimization (Phase 1):
 * - DynamicMap is NOT imported at module scope
 * - Only loads Mapbox bundle when shouldRenderMap is true
 * - Unmounts entirely when hidden (not CSS display:none)
 */

import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import type { MapListingData } from "@/lib/data";
import { useSearchV2Data, type V2MapData } from "@/contexts/SearchV2DataContext";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";

// CRITICAL: Lazy import - only loads when component renders
// This defers the 944KB mapbox-gl bundle until user opts to see map
const LazyDynamicMap = lazy(() => import("./DynamicMap"));

// Maximum viewport span (matches server-side validation)
// Increased from 2 to 5 (~550km) to allow regional zoom-out views
// with Mapbox native clustering handling dense markers at wide viewports
const MAX_LAT_SPAN = 5;
const MAX_LNG_SPAN = 5;

/**
 * P3a Fix: Extract only map-relevant params from URLSearchParams
 * Excludes pagination (page, cursor) and sort params that don't affect map markers.
 * This prevents unnecessary map re-fetches when user paginates or changes sort order.
 */
const MAP_RELEVANT_KEYS = [
  "q",
  "minLat",
  "maxLat",
  "minLng",
  "maxLng",
  "lat",
  "lng",
  "minPrice",
  "maxPrice",
  "amenities",
  "moveInDate",
  "leaseDuration",
  "houseRules",
  "languages",
  "roomType",
  "genderPreference",
  "householdGender",
] as const;

function getMapRelevantParams(searchParams: URLSearchParams): string {
  const filtered = new URLSearchParams();
  for (const key of MAP_RELEVANT_KEYS) {
    const values = searchParams.getAll(key);
    values.forEach((v) => filtered.append(key, v));
  }
  // Sort for consistent comparison (URLSearchParams order isn't guaranteed)
  filtered.sort();
  return filtered.toString();
}

/**
 * Get user-friendly error message based on HTTP status
 */
function getStatusErrorMessage(status: number, serverMessage?: string): string {
  switch (status) {
    case 400:
      return serverMessage || "Invalid map area. Try zooming in.";
    case 429:
      return "Too many requests. Please wait a moment.";
    case 500:
      return "Server error. Please try again.";
    default:
      return serverMessage || "Failed to load map data";
  }
}

/**
 * Validate viewport bounds before making API request
 * Mirrors server-side validation to prevent unnecessary requests
 */
function isValidViewport(params: URLSearchParams): {
  valid: boolean;
  error?: string;
} {
  const minLng = parseFloat(params.get("minLng") || "");
  const maxLng = parseFloat(params.get("maxLng") || "");
  const minLat = parseFloat(params.get("minLat") || "");
  const maxLat = parseFloat(params.get("maxLat") || "");

  // NaN/Infinity check
  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat)
  ) {
    return { valid: false, error: "Invalid coordinates" };
  }

  // Viewport size check (handle antimeridian crossing like server does)
  const latSpan = maxLat - minLat;
  const crossesAntimeridian = minLng > maxLng;
  const lngSpan = crossesAntimeridian
    ? 180 - minLng + (maxLng + 180)
    : maxLng - minLng;

  if (latSpan > MAX_LAT_SPAN || lngSpan > MAX_LNG_SPAN) {
    return { valid: false, error: "Zoom in further to see listings" };
  }

  return { valid: true };
}

// Error banner component for map data fetch errors
function MapErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="absolute top-4 left-4 right-4 z-50 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center justify-between gap-2"
    >
      <span className="text-sm text-amber-700 dark:text-amber-300 block">
        {message}
      </span>
      <button
        onClick={onRetry}
        className="text-sm font-medium text-amber-800 dark:text-amber-200 hover:underline flex-shrink-0"
      >
        Retry
      </button>
    </div>
  );
}

// Loading placeholder for lazy map component
function MapLoadingPlaceholder() {
  return (
    <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 animate-pulse flex items-center justify-center">
      <div className="text-zinc-400 dark:text-zinc-500 text-sm">
        Loading map...
      </div>
    </div>
  );
}

// Subtle loading overlay shown when list is transitioning (filter change)
// This coordinates visual feedback between map and list
function MapTransitionOverlay() {
  return (
    <div
      className="absolute inset-0 z-10 bg-white/30 dark:bg-zinc-950/30 pointer-events-none flex items-start justify-center pt-20"
      role="status"
      aria-label="Updating map results"
    >
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 rounded-full shadow-md border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse" />
        Updating...
      </span>
    </div>
  );
}

/**
 * Convert v2 GeoJSON features to MapListingData format.
 * Maps GeoJSON properties to fields used by Map.tsx:
 * - id: for key and click handling
 * - location: for pin placement
 * - price: for pin label
 * - title: for popup/tooltip
 * - availableSlots: for "N Available" / "Filled" badge in popup
 * - ownerId: for showing "Message" button in popup
 * - tier: for differentiated pin styling (primary = larger, mini = smaller)
 */
function v2MapDataToListings(v2MapData: V2MapData): MapListingData[] {
  // Build lookup map from pins for tier data (O(1) lookups)
  const pinTierMap = new Map<string, "primary" | "mini">();
  if (v2MapData.pins) {
    for (const pin of v2MapData.pins) {
      if (pin.tier) {
        pinTierMap.set(pin.id, pin.tier);
      }
    }
  }

  return v2MapData.geojson.features.map((feature) => ({
    id: feature.properties.id,
    title: feature.properties.title ?? "",
    price: feature.properties.price ?? 0,
    availableSlots: feature.properties.availableSlots,
    ownerId: feature.properties.ownerId,
    images: feature.properties.image ? [feature.properties.image] : [],
    location: {
      lng: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
    },
    // Add tier from pins lookup (defaults to undefined if not in pins mode)
    tier: pinTierMap.get(feature.properties.id),
  }));
}

interface PersistentMapWrapperProps {
  /**
   * Whether to render the map. When false, map bundle is not loaded.
   * Used for lazy map initialization (cost optimization).
   */
  shouldRenderMap: boolean;
}

export default function PersistentMapWrapper({
  shouldRenderMap,
}: PersistentMapWrapperProps) {
  const searchParams = useSearchParams();
  const [listings, setListings] = useState<MapListingData[]>([]);
  const [isFetchingMapData, setIsFetchingMapData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for v2 data from context (injected by page.tsx via V2MapDataSetter)
  const { v2MapData, isV2Enabled } = useSearchV2Data();

  // Coordinate with list transitions - show overlay when list is loading
  const transitionContext = useSearchTransitionSafe();
  const isListTransitioning = transitionContext?.isPending ?? false;
  const hasV2Data = v2MapData !== null;

  // Compute effective listings based on data source (v2 context or v1 fetch)
  // Memoized for stable reference to prevent unnecessary Map re-renders
  const effectiveListings = useMemo(() => {
    // Safe: check both flags before accessing v2MapData
    if (hasV2Data && v2MapData) {
      return v2MapDataToListings(v2MapData);
    }
    // Defensive: if v2 signaled but data missing, log and fallback
    if (hasV2Data && !v2MapData) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[PersistentMapWrapper] hasV2Data=true but v2MapData is null",
        );
      }
      return [];
    }
    return listings;
  }, [hasV2Data, v2MapData, listings]);

  // Track current params to detect changes for debouncing
  const lastFetchedParamsRef = useRef<string | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchListings = useCallback(
    async (paramsString: string, signal?: AbortSignal) => {
      setIsFetchingMapData(true);
      setError(null);

      try {
        const response = await fetch(`/api/map-listings?${paramsString}`, {
          signal,
        });

        if (!response.ok) {
          // Extract detailed error from response body
          let serverMessage: string | undefined;
          let requestId: string | undefined;

          try {
            const errorData = await response.json();
            serverMessage = errorData.error;
            requestId = response.headers.get("x-request-id") || undefined;
          } catch {
            // JSON parsing failed, use status-based message
          }

          // Log error for debugging (PII-safe - no raw params)
          // Use warn for 400 (expected validation failures) to avoid polluting error overlay
          if (response.status === 400) {
            console.warn("Map viewport validation failed:", {
              status: response.status,
              error: serverMessage,
            });
          } else {
            console.error("Map listings fetch failed:", {
              status: response.status,
              statusText: response.statusText,
              error: serverMessage,
              requestId,
            });
          }

          const errorMessage = getStatusErrorMessage(
            response.status,
            serverMessage,
          );
          throw new Error(errorMessage);
        }

        const data = await response.json();
        setListings(data.listings || []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to fetch map listings:", err);
          setError((err as Error).message || "Failed to load map data");
        }
      } finally {
        setIsFetchingMapData(false);
      }
    },
    [],
  );

  // Single effect that handles both initial fetch and param changes
  // Only fetches when map is rendered to avoid unnecessary API calls
  // V2 mode: Skip fetch entirely when v2MapData is provided via context
  useEffect(() => {
    // Don't fetch if map isn't being rendered
    if (!shouldRenderMap) {
      return;
    }

    // VIEWPORT VALIDATION: Check bounds validity FIRST, before any v2 checks.
    // This ensures "Zoom in further" error shows regardless of data source (v1 or v2).
    const hasBounds =
      searchParams.has("minLng") &&
      searchParams.has("maxLng") &&
      searchParams.has("minLat") &&
      searchParams.has("maxLat");

    if (hasBounds) {
      // Client-side bounds validation - applies to both v1 and v2 paths
      const validation = isValidViewport(searchParams);
      if (!validation.valid) {
        setError(validation.error || "Invalid viewport");
        setIsFetchingMapData(false);
        return;
      }
      // Clear error if viewport is now valid
      setError(null);
    }

    // RACE GUARD: If v2 mode is signaled but data hasn't arrived yet,
    // delay the v1 fetch to give the setter time to run.
    // This prevents double-fetch and flicker.
    if (isV2Enabled && !hasV2Data) {
      const raceGuardTimeout = setTimeout(() => {
        // After delay, if still no v2 data, the component will re-render
        // and this effect will run again. If v2 data still hasn't arrived,
        // it means v2 failed and we should fall back to v1 (done on next effect run).
      }, 100); // 100ms is enough for React to flush the setter
      return () => clearTimeout(raceGuardTimeout);
    }

    // Skip v1 fetch entirely if v2 data is provided via context
    if (hasV2Data) {
      return;
    }

    // P3a Fix: Use only map-relevant params for deduplication
    // This prevents re-fetching when page/sort changes (which don't affect markers)
    const paramsString = getMapRelevantParams(searchParams);

    // Skip if we've already fetched for these exact params
    if (paramsString === lastFetchedParamsRef.current) {
      return;
    }

    // Skip if bounds are missing - wait for map to set them
    if (!hasBounds) {
      // Don't fetch without bounds - map will set them after load
      // Clear loading state so map is interactive
      setIsFetchingMapData(false);
      return;
    }

    // Clear any pending fetch timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // Create abort controller for this fetch
    const abortController = new AbortController();

    // Throttle to 2s to stay within 30 req/min rate limit
    fetchTimeoutRef.current = setTimeout(() => {
      lastFetchedParamsRef.current = paramsString;
      fetchListings(paramsString, abortController.signal);
    }, 2000);

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      abortController.abort();
    };
  }, [searchParams, fetchListings, shouldRenderMap, isV2Enabled, hasV2Data]);

  const handleRetry = useCallback(() => {
    // Validate viewport before retrying - prevents API call for known-invalid viewports
    const validation = isValidViewport(searchParams);
    if (!validation.valid) {
      setError(validation.error || "Invalid viewport");
      return;
    }

    // Force a refetch by clearing the last fetched ref
    lastFetchedParamsRef.current = null;
    setError(null);
    fetchListings(getMapRelevantParams(searchParams));
  }, [searchParams, fetchListings]);

  // CRITICAL: Don't render map component if shouldRenderMap is false
  // This prevents Mapbox GL JS from loading (saves ~944KB and Mapbox billing)
  if (!shouldRenderMap) {
    return null;
  }

  // Show loading placeholder while waiting for v2 data (race guard)
  // This prevents showing an empty map before v2MapData arrives
  // IMPORTANT: If there's an error (e.g., viewport too large), show error banner instead
  // NOTE: min-h-[300px] ensures error banner is visible even when parent chain has
  // zero height (h-full chain issue) combined with overflow-hidden clipping
  if (isV2Enabled && !hasV2Data) {
    return (
      <div className="relative w-full h-full min-h-[300px]">
        {error ? (
          <MapErrorBanner message={error} onRetry={handleRetry} />
        ) : (
          <MapLoadingPlaceholder />
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[300px]">
      {error && <MapErrorBanner message={error} onRetry={handleRetry} />}
      {/* Coordinated loading overlay - shows when list is transitioning (filter change) */}
      {isListTransitioning && <MapTransitionOverlay />}
      <Suspense fallback={<MapLoadingPlaceholder />}>
        <LazyDynamicMap listings={effectiveListings} />
      </Suspense>
    </div>
  );
}
