"use client";

/**
 * PersistentMapWrapper - A wrapper component for the map that fetches its own data.
 *
 * This component is designed to live in the layout.tsx so it persists across
 * page navigations (router.replace/push). It reads URL search params and fetches
 * map listings data via the /api/map-listings endpoint.
 *
 * Key benefits:
 * - Map stays mounted across /search navigations (no map re-init)
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
import { buildCanonicalFilterParamsFromSearchParams } from "@/lib/search-params";
import { useSearchV2Data, type V2MapData } from "@/contexts/SearchV2DataContext";
import { MapErrorBoundary } from "@/components/map/MapErrorBoundary";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import {
  MAX_LAT_SPAN,
  MAX_LNG_SPAN,
  LAT_MIN,
  LAT_MAX,
  LNG_MIN,
  LNG_MAX,
  BOUNDS_EPSILON,
} from "@/lib/constants";

// CRITICAL: Lazy import - only loads when component renders
// This defers the maplibre-gl bundle until user opts to see map
const LazyDynamicMap = lazy(() => import("./DynamicMap"));

const MAP_FETCH_DEBOUNCE_MS = 250;

// Spatial cache constants
const SPATIAL_CACHE_MAX_ENTRIES = 20;
const MAX_MAP_MARKERS = 200;
const FETCH_BOUNDS_PADDING = 0.2;

// ============================================
// Spatial Cache Types & Utilities
// ============================================

interface ViewportBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface SpatialCacheEntry {
  listings: MapListingData[];
  bounds: ViewportBounds;
  filterKey: string;
  timestamp: number;
}

/** Quantize bounds to BOUNDS_EPSILON precision for cache key */
function quantizeBounds(bounds: ViewportBounds): string {
  const q = (n: number) => (Math.round(n / BOUNDS_EPSILON) * BOUNDS_EPSILON).toFixed(3);
  return `${q(bounds.minLat)},${q(bounds.maxLat)},${q(bounds.minLng)},${q(bounds.maxLng)}`;
}

/**
 * Check if inner viewport is mostly contained within outer bounds.
 * Returns true if overlap >= threshold of inner's area (skip fetch).
 */
function isViewportContained(inner: ViewportBounds, outer: ViewportBounds, threshold = 0.9): boolean {
  const innerArea = (inner.maxLat - inner.minLat) * (inner.maxLng - inner.minLng);
  if (innerArea <= 0) return false;

  const overlapMinLat = Math.max(inner.minLat, outer.minLat);
  const overlapMaxLat = Math.min(inner.maxLat, outer.maxLat);
  const overlapMinLng = Math.max(inner.minLng, outer.minLng);
  const overlapMaxLng = Math.min(inner.maxLng, outer.maxLng);

  if (overlapMinLat >= overlapMaxLat || overlapMinLng >= overlapMaxLng) return false;

  const overlapArea = (overlapMaxLat - overlapMinLat) * (overlapMaxLng - overlapMinLng);
  return (overlapArea / innerArea) >= threshold;
}

/**
 * Pad viewport bounds by a percentage to pre-fetch nearby listings.
 * Clamps to LAT/LNG limits and MAX_LAT/LNG_SPAN.
 */
function padBounds(bounds: ViewportBounds, padding = FETCH_BOUNDS_PADDING): ViewportBounds {
  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = bounds.maxLng - bounds.minLng;
  const padded = {
    minLat: Math.max(LAT_MIN, bounds.minLat - latSpan * padding),
    maxLat: Math.min(LAT_MAX, bounds.maxLat + latSpan * padding),
    minLng: Math.max(LNG_MIN, bounds.minLng - lngSpan * padding),
    maxLng: Math.min(LNG_MAX, bounds.maxLng + lngSpan * padding),
  };
  // Clamp padded result to MAX_LAT/LNG_SPAN
  const paddedLatSpan = padded.maxLat - padded.minLat;
  const paddedLngSpan = padded.maxLng - padded.minLng;
  if (paddedLatSpan > MAX_LAT_SPAN) {
    const center = (padded.minLat + padded.maxLat) / 2;
    padded.minLat = center - MAX_LAT_SPAN / 2;
    padded.maxLat = center + MAX_LAT_SPAN / 2;
  }
  if (paddedLngSpan > MAX_LNG_SPAN) {
    const center = (padded.minLng + padded.maxLng) / 2;
    padded.minLng = center - MAX_LNG_SPAN / 2;
    padded.maxLng = center + MAX_LNG_SPAN / 2;
  }
  return padded;
}

/** Build a filter-only key (excludes viewport params) for cache invalidation */
function getFilterKey(searchParams: URLSearchParams): string {
  const filtered = buildCanonicalFilterParamsFromSearchParams(searchParams);
  filtered.sort();
  return filtered.toString();
}

// Legacy map-relevant key list kept as explicit documentation and fallback shape.
// The active serialization path uses canonical parser output so map/list stay in sync.
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
  "nearMatches",
] as const;

const MAP_VIEWPORT_KEYS = MAP_RELEVANT_KEYS.filter(
  (key) =>
    key === "minLat" ||
    key === "maxLat" ||
    key === "minLng" ||
    key === "maxLng" ||
    key === "lat" ||
    key === "lng",
);

function getMapRelevantParams(searchParams: URLSearchParams): string {
  // Canonicalize filter params using shared parser so map and list receive identical filters.
  const filtered = buildCanonicalFilterParamsFromSearchParams(searchParams);

  // Preserve explicit viewport/location keys from current URL (including clamped bounds).
  for (const key of MAP_VIEWPORT_KEYS) {
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

// P2-FIX (#151): Separate informational banner (no retry button) for non-error messages
// Used for viewport clamping notification where map is still functional
function MapInfoBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-4 left-4 right-4 z-50 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-3"
    >
      <span className="text-sm text-blue-700 dark:text-blue-300 block">
        {message}
      </span>
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
      className="absolute inset-0 z-10 bg-transparent pointer-events-none flex items-start justify-center pt-20"
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

// Thin loading bar at top of map when fetching new marker data
function MapDataLoadingBar() {
  return (
    <div
      className="absolute top-0 left-0 right-0 z-20 h-1 overflow-hidden pointer-events-none"
      role="status"
      aria-label="Loading map data"
    >
      <div className="h-full bg-zinc-900/80 dark:bg-white/80 animate-[shimmer_1.5s_ease-in-out_infinite] origin-left" />
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @media (prefers-reduced-motion: reduce) {
          div { animation: none; opacity: 0.7; transform: none; }
        }
      `}</style>
    </div>
  );
}

/**
 * Convert v2 GeoJSON features to MapListingData format.
 * Maps GeoJSON properties to fields used by Map.tsx:
 * - id: for key and click handling
 * - location: for pin placement
 * - price: for pin label
 * - compactTitle: for popup/tooltip
 * - thumbnailUrl: for popup image preview
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

  // P2-3 FIX: Filter out malformed features before accessing coordinates
  return v2MapData.geojson.features
    .filter((feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
      const [lng, lat] = coordinates;
      return (
        Number.isFinite(lng) && Number.isFinite(lat) &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180
      );
    })
    .map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      return {
        id: feature.properties.id,
        compactTitle: feature.properties.title ?? "",
        price: feature.properties.price ?? 0,
        availableSlots: feature.properties.availableSlots,
        thumbnailUrl: feature.properties.image ?? null,
        location: { lng, lat },
        // Add tier from pins lookup (defaults to undefined if not in pins mode)
        tier: pinTierMap.get(feature.properties.id),
      };
    });
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
  // Stale-while-revalidate: keep last successful fetch visible during loading
  const previousListingsRef = useRef<MapListingData[]>([]);
  // Spatial cache: instant markers from previously-viewed areas on zoom-out/pan-back
  const spatialCacheRef = useRef<Map<string, SpatialCacheEntry>>(new Map());
  // Track last-fetched padded bounds for hysteresis (skip fetch when viewport mostly contained)
  const lastFetchedBoundsRef = useRef<ViewportBounds | null>(null);
  // Track filter key to invalidate spatial cache on filter change
  const lastFilterKeyRef = useRef<string>("");
  // P2-FIX (#151): Separate info messages from errors - info is non-blocking (no retry needed)
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Check for v2 data from context (injected by page.tsx via V2MapDataSetter)
  const { v2MapData, isV2Enabled, setIsV2Enabled } = useSearchV2Data();
  // P2-FIX (#124): Use state instead of ref for last V2 data to ensure memo dependencies are correct
  // Using a ref in useMemo causes stale data because refs aren't tracked by React
  const [lastV2Data, setLastV2Data] = useState<V2MapData | null>(null);
  // P2-FIX (#115): Track if data path has been determined to prevent brief empty map.
  // On initial mount, we don't know if v2 or v1 will provide data. Show loading until determined.
  const [dataPathDetermined, setDataPathDetermined] = useState(false);

  // Coordinate with list transitions - show overlay when list is loading
  const transitionContext = useSearchTransitionSafe();
  const isListTransitioning = transitionContext?.isPending ?? false;
  // Only trust V2 data when V2 mode is explicitly enabled.
  // This prevents stale context data from masking fresh V1 filtered results.
  const hasV2Data = isV2Enabled && v2MapData !== null;
  const hasAnyV2Data = isV2Enabled && (hasV2Data || lastV2Data !== null);

  // P2-FIX (#115): Mark data path as determined when we receive any signal
  // Check if URL has bounds (indicates V1 path with known location)
  const hasBoundsInUrl =
    searchParams.has("minLng") &&
    searchParams.has("maxLng") &&
    searchParams.has("minLat") &&
    searchParams.has("maxLat");

  useEffect(() => {
    // V2 mode signaled (either enabled or explicitly disabled after being enabled)
    // OR we have v2 data OR we have v1 listings OR we have bounds in URL (V1 path)
    if (isV2Enabled || hasAnyV2Data || listings.length > 0 || hasBoundsInUrl) {
      setDataPathDetermined(true);
    }
  }, [isV2Enabled, hasAnyV2Data, listings.length, hasBoundsInUrl]);

  useEffect(() => {
    if (v2MapData) {
      setLastV2Data(v2MapData);
    } else if (!isV2Enabled) {
      // Clear stale V2 cache when v1 path is active to prevent map/list desync.
      setLastV2Data(null);
    }
  }, [v2MapData, isV2Enabled]);

  // Compute effective listings based on data source (v2 context or v1 fetch)
  // Memoized for stable reference to prevent unnecessary Map re-renders
  // During V1 fetch: merge cached listings from overlapping areas for instant display
  const effectiveListings = useMemo(() => {
    // P2-FIX (#124): Use lastV2Data state (not ref) so memo properly recalculates
    const activeV2Data = isV2Enabled ? (v2MapData ?? lastV2Data) : null;
    if (activeV2Data) {
      return v2MapDataToListings(activeV2Data);
    }
    // During V1 fetch, merge previous data + cached spatial data so markers never disappear
    if (isFetchingMapData && previousListingsRef.current.length > 0) {
      // Deduplicate by listing ID, cap at MAX_MAP_MARKERS
      const seenIds = new Set<string>();
      const merged: MapListingData[] = [];
      // Start with current listings (highest priority)
      for (const l of listings) {
        if (!seenIds.has(l.id) && merged.length < MAX_MAP_MARKERS) {
          seenIds.add(l.id);
          merged.push(l);
        }
      }
      // Add previous listings
      for (const l of previousListingsRef.current) {
        if (!seenIds.has(l.id) && merged.length < MAX_MAP_MARKERS) {
          seenIds.add(l.id);
          merged.push(l);
        }
      }
      // Add from spatial cache entries that overlap current viewport
      const currentFilterKey = lastFilterKeyRef.current;
      for (const entry of spatialCacheRef.current.values()) {
        if (entry.filterKey !== currentFilterKey) continue;
        for (const l of entry.listings) {
          if (!seenIds.has(l.id) && merged.length < MAX_MAP_MARKERS) {
            seenIds.add(l.id);
            merged.push(l);
          }
        }
      }
      return merged;
    }
    return listings;
  }, [isV2Enabled, v2MapData, lastV2Data, listings, isFetchingMapData]);

  // Track current params to detect changes for debouncing
  const lastFetchedParamsRef = useRef<string | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchListings = useCallback(
    async (paramsString: string, signal?: AbortSignal, fetchBounds?: ViewportBounds) => {
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

          // Handle 429 with automatic retry (max 1 retry)
          if (response.status === 429 && retryCountRef.current < 1) {
            retryCountRef.current += 1;

            // Check for Retry-After header (in seconds)
            const retryAfterHeader = response.headers.get("Retry-After");
            const retryDelayMs = retryAfterHeader
              ? parseInt(retryAfterHeader, 10) * 1000
              : 2000; // Default 2s exponential backoff

            // P2-7 FIX: Guard dev logging to avoid production console pollution
            if (process.env.NODE_ENV === 'development') {
              console.debug('[PersistentMapWrapper] Rate limited (429), retrying after', retryDelayMs, 'ms');
            }

            // Schedule automatic retry
            retryTimeoutRef.current = setTimeout(() => {
              fetchListings(paramsString, signal, fetchBounds);
            }, retryDelayMs);

            return; // Exit without throwing - retry will happen automatically
          }

          // Log error for debugging (PII-safe - no raw params)
          // Use warn for 400 (expected validation failures) to avoid polluting error overlay
          if (response.status === 400) {
            // P2-7 FIX: Guard dev logging
            if (process.env.NODE_ENV === 'development') {
              console.debug('[PersistentMapWrapper] Map viewport validation failed:', {
                status: response.status,
                error: serverMessage,
              });
            }
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
        const fetched = data.listings || [];
        previousListingsRef.current = fetched;
        setListings(fetched);

        // Store in spatial cache for instant zoom-out/pan-back display
        if (fetchBounds) {
          const cacheKey = quantizeBounds(fetchBounds);
          const filterKey = lastFilterKeyRef.current;
          spatialCacheRef.current.set(cacheKey, {
            listings: fetched,
            bounds: fetchBounds,
            filterKey,
            timestamp: Date.now(),
          });
          // LRU eviction: remove oldest entries beyond limit
          if (spatialCacheRef.current.size > SPATIAL_CACHE_MAX_ENTRIES) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;
            for (const [key, entry] of spatialCacheRef.current) {
              if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
              }
            }
            if (oldestKey) spatialCacheRef.current.delete(oldestKey);
          }
          // Update last-fetched bounds for hysteresis checks
          lastFetchedBoundsRef.current = fetchBounds;
        }

        // Reset retry counter on successful fetch
        retryCountRef.current = 0;
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

    // P1-2 FIX: Reset retry counter when effect re-runs with new params
    // This ensures fresh retry attempts for each new search
    retryCountRef.current = 0;

    // VIEWPORT VALIDATION: Check bounds validity FIRST, before any v2 checks.
    // This ensures "Zoom in further" error shows regardless of data source (v1 or v2).
    const hasBounds =
      searchParams.has("minLng") &&
      searchParams.has("maxLng") &&
      searchParams.has("minLat") &&
      searchParams.has("maxLat");

    // Track whether we need to clamp bounds for the fetch
    // Use URLSearchParams (writable) so we can modify if clamping is needed
    let clampedSearchParams: URLSearchParams = new URLSearchParams(searchParams.toString());

    if (hasBounds) {
      // Client-side bounds validation - applies to both v1 and v2 paths
      const validation = isValidViewport(searchParams);
      if (!validation.valid) {
        // For NaN/Infinity, reject entirely
        const minLat = parseFloat(searchParams.get("minLat") || "");
        if (!Number.isFinite(minLat)) {
          setError(validation.error || "Invalid viewport");
          setIsFetchingMapData(false);
          return;
        }
        // For "too wide" viewports, clamp to max span centered on viewport center
        // instead of rejecting — keeps listings visible when zoomed out
        const parsedMinLat = parseFloat(searchParams.get("minLat")!);
        const parsedMaxLat = parseFloat(searchParams.get("maxLat")!);
        const parsedMinLng = parseFloat(searchParams.get("minLng")!);
        const parsedMaxLng = parseFloat(searchParams.get("maxLng")!);
        const centerLat = (parsedMinLat + parsedMaxLat) / 2;
        const centerLng = (parsedMinLng + parsedMaxLng) / 2;
        const clamped = new URLSearchParams(searchParams.toString());
        clamped.set("minLat", (centerLat - MAX_LAT_SPAN / 2).toString());
        clamped.set("maxLat", (centerLat + MAX_LAT_SPAN / 2).toString());
        clamped.set("minLng", (centerLng - MAX_LNG_SPAN / 2).toString());
        clamped.set("maxLng", (centerLng + MAX_LNG_SPAN / 2).toString());
        clampedSearchParams = clamped;

        // P2-7 FIX: Guard dev logging
        if (process.env.NODE_ENV === 'development') {
          console.debug('[PersistentMapWrapper] Map viewport clamped to max span:', {
            original: {
              lat: [parsedMinLat, parsedMaxLat],
              lng: [parsedMinLng, parsedMaxLng],
            },
            clamped: {
              lat: [centerLat - MAX_LAT_SPAN / 2, centerLat + MAX_LAT_SPAN / 2],
              lng: [centerLng - MAX_LNG_SPAN / 2, centerLng + MAX_LNG_SPAN / 2],
            },
            maxSpan: { lat: MAX_LAT_SPAN, lng: MAX_LNG_SPAN },
          });
        }

        // P2-FIX (#151): Use info message instead of error - map is functional, just clamped
        setInfoMessage("Zoomed in to show results");
      } else {
        // Clear info message when viewport is valid (no clamping occurred)
        setInfoMessage(null);
      }
    }

    // RACE GUARD: If v2 mode is signaled but data hasn't arrived yet,
    // delay the v1 fetch to give the setter time to run.
    // This prevents double-fetch and flicker.
    // P1-3 NOTE: Error state set during viewport validation above is preserved
    // through this early return - the cleanup doesn't clear error state.
    if (isV2Enabled && !hasV2Data) {
      const raceGuardTimeout = setTimeout(() => {
        // V2 data didn't arrive in time — disable v2 to fall back to v1 fetch.
        // This triggers a re-render, the effect re-runs, skips this guard,
        // and proceeds to the v1 fetch below.
        setIsV2Enabled(false);
      }, 200); // 200ms — enough for React flush, with margin
      return () => clearTimeout(raceGuardTimeout);
    }

    // Skip v1 fetch entirely if v2 data is provided via context
    if (hasV2Data) {
      return;
    }

    // P3a Fix: Use only map-relevant params for deduplication
    // This prevents re-fetching when page/sort changes (which don't affect markers)
    // VERIFIED: URLSearchParams.sort() ensures consistent ordering and toString()
    // produces consistent URL-encoded strings, making string comparison reliable
    const paramsString = getMapRelevantParams(clampedSearchParams);

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

    // Parse current viewport bounds for spatial cache + hysteresis
    const currentBounds: ViewportBounds = {
      minLat: parseFloat(clampedSearchParams.get("minLat") || "0"),
      maxLat: parseFloat(clampedSearchParams.get("maxLat") || "0"),
      minLng: parseFloat(clampedSearchParams.get("minLng") || "0"),
      maxLng: parseFloat(clampedSearchParams.get("maxLng") || "0"),
    };

    // Invalidate spatial cache when filters change
    const currentFilterKey = getFilterKey(clampedSearchParams);
    if (currentFilterKey !== lastFilterKeyRef.current) {
      spatialCacheRef.current.clear();
      lastFetchedBoundsRef.current = null;
      lastFilterKeyRef.current = currentFilterKey;
    }

    // Viewport hysteresis: skip fetch if new viewport is mostly within last-fetched padded area
    if (lastFetchedBoundsRef.current && isViewportContained(currentBounds, lastFetchedBoundsRef.current)) {
      return;
    }

    // Clear any pending fetch timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // M6-MAP: Client AbortController cancels the fetch but cannot cancel the
    // in-progress DB query on the server. Server-side statement_timeout provides
    // the safety net for runaway queries.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create abort controller for this fetch
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Pad fetch bounds by 20% to pre-fetch nearby listings (reduces fetches on small pans)
    // Only the map's /api/map-listings fetch uses padded bounds.
    // URL params (for list/page sync) continue using actual visible viewport — no conflict.
    const paddedBounds = padBounds(currentBounds);
    const paddedParams = new URLSearchParams(clampedSearchParams.toString());
    paddedParams.set("minLat", paddedBounds.minLat.toString());
    paddedParams.set("maxLat", paddedBounds.maxLat.toString());
    paddedParams.set("minLng", paddedBounds.minLng.toString());
    paddedParams.set("maxLng", paddedBounds.maxLng.toString());
    const paddedParamsString = getMapRelevantParams(paddedParams);

    // Small debounce to coalesce rapid URL updates without adding noticeable lag.
    fetchTimeoutRef.current = setTimeout(() => {
      lastFetchedParamsRef.current = paramsString;
      fetchListings(paddedParamsString, abortController.signal, paddedBounds);
    }, MAP_FETCH_DEBOUNCE_MS);

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [searchParams, fetchListings, shouldRenderMap, isV2Enabled, hasV2Data]);

  const handleRetry = useCallback(() => {
    // Validate viewport before retrying - prevents API call for known-invalid viewports
    const validation = isValidViewport(searchParams);
    if (!validation.valid) {
      setError(validation.error || "Invalid viewport");
      return;
    }

    // P1-1 FIX: Abort any existing request before starting retry
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for retry request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Force a refetch by clearing the last fetched ref
    lastFetchedParamsRef.current = null;
    setError(null);
    fetchListings(getMapRelevantParams(searchParams), abortController.signal);
  }, [searchParams, fetchListings]);

  // P2-FIX (#115): Also show placeholder when data path hasn't been determined yet.
  // This prevents the brief empty map flash between mount and v2 signal.
  const showInitialPlaceholder = !dataPathDetermined || (isV2Enabled && !hasAnyV2Data);
  const showV2LoadingOverlay = isV2Enabled && !hasV2Data && hasAnyV2Data;

  // CRITICAL: Don't render map component if shouldRenderMap is false
  // This prevents MapLibre GL JS from loading until needed
  if (!shouldRenderMap) {
    return null;
  }

  // Show loading placeholder while waiting for data (race guard)
  // P2-FIX (#115): Also show when data path hasn't been determined to prevent brief empty map.
  // IMPORTANT: If there's an error (e.g., viewport too large), show error banner instead
  // NOTE: min-h-[300px] ensures error banner is visible even when parent chain has
  // zero height (h-full chain issue) combined with overflow-hidden clipping
  if (showInitialPlaceholder) {
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
      {/* P2-FIX (#151): Show error banner for errors, info banner for non-error messages */}
      {error && <MapErrorBanner message={error} onRetry={handleRetry} />}
      {!error && infoMessage && <MapInfoBanner message={infoMessage} />}
      {/* Data loading bar - shows when fetching map markers after pan/zoom/filter */}
      {(isFetchingMapData || isListTransitioning || showV2LoadingOverlay) && (
        <MapDataLoadingBar />
      )}
      {/* Marker loading shimmer removed - stale-while-revalidate keeps old markers visible */}
      {/* Coordinated loading overlay - shows when list is transitioning (filter change) */}
      {isListTransitioning && <MapTransitionOverlay />}
      <MapErrorBoundary>
        <Suspense fallback={<MapLoadingPlaceholder />}>
          <LazyDynamicMap listings={effectiveListings} />
        </Suspense>
      </MapErrorBoundary>
    </div>
  );
}
