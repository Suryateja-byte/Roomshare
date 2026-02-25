"use client";

/**
 * PersistentMapWrapper - A wrapper component for the map that fetches its own data.
 *
 * This component is designed to live in the layout.tsx so it persists across
 * page navigations (router.replace/push). It reads URL search params and fetches
 * map listings data via the /api/map-tiles endpoint.
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
  LNG_MAX
} from "@/lib/constants";

// CRITICAL: Lazy import - only loads when component renders
// This defers the maplibre-gl bundle until user opts to see map
const LazyDynamicMap = lazy(() => import("./DynamicMap"));

const MAP_FETCH_DEBOUNCE_MS = 250;

// Tile cache constants
const TILE_CACHE_MAX_ENTRIES = 80;
const MAX_MAP_MARKERS = 200;
const FETCH_BOUNDS_PADDING = 0.2;

interface ViewportBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface TileCacheEntry {
  listings: MapListingData[];
  filterKey: string;
  mode: "cluster" | "pins";
  density?: {
    listingCount: number;
    returnedCount: number;
  };
  timestamp: number;
}

function getZoomForBounds(bounds: ViewportBounds): number {
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.000001);
  return Math.max(0, Math.min(22, Math.floor(Math.log2(360 / lngSpan))));
}

function lngToTileX(lng: number, z: number): number {
  const n = 2 ** z;
  return Math.floor(((lng + 180) / 360) * n);
}

function latToTileY(lat: number, z: number): number {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return Math.floor(((1 - merc / Math.PI) / 2) * n);
}

function getVisibleTileKeys(bounds: ViewportBounds, zoom: number): string[] {
  const n = 2 ** zoom;
  const minX = Math.max(0, Math.min(n - 1, lngToTileX(bounds.minLng, zoom)));
  const maxX = Math.max(0, Math.min(n - 1, lngToTileX(bounds.maxLng, zoom)));
  const minY = Math.max(0, Math.min(n - 1, latToTileY(bounds.maxLat, zoom)));
  const maxY = Math.max(0, Math.min(n - 1, latToTileY(bounds.minLat, zoom)));

  const keys: string[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      keys.push(`${zoom}/${x}/${y}`);
    }
  }
  return keys;
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
 * - title: for popup/tooltip
 * - availableSlots: for "N Available" / "Filled" badge in popup
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
        title: feature.properties.title ?? "",
        price: feature.properties.price ?? 0,
        availableSlots: feature.properties.availableSlots,
        images: feature.properties.image ? [feature.properties.image] : [],
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
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const previousListingsRef = useRef<MapListingData[]>([]);
  const tileCacheRef = useRef<Map<string, TileCacheEntry>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const lastSubscriptionKeyRef = useRef<string | null>(null);
  const lastFilterKeyRef = useRef<string>("");

  const { v2MapData, isV2Enabled, setIsV2Enabled } = useSearchV2Data();
  const [lastV2Data, setLastV2Data] = useState<V2MapData | null>(null);
  const [dataPathDetermined, setDataPathDetermined] = useState(false);

  const transitionContext = useSearchTransitionSafe();
  const isListTransitioning = transitionContext?.isPending ?? false;
  const hasV2Data = isV2Enabled && v2MapData !== null;
  const hasAnyV2Data = isV2Enabled && (hasV2Data || lastV2Data !== null);
  const hasBoundsInUrl =
    searchParams.has("minLng") &&
    searchParams.has("maxLng") &&
    searchParams.has("minLat") &&
    searchParams.has("maxLat");

  useEffect(() => {
    if (isV2Enabled || hasAnyV2Data || listings.length > 0 || hasBoundsInUrl) {
      setDataPathDetermined(true);
    }
  }, [isV2Enabled, hasAnyV2Data, listings.length, hasBoundsInUrl]);

  useEffect(() => {
    if (v2MapData) {
      setLastV2Data(v2MapData);
    } else if (!isV2Enabled) {
      setLastV2Data(null);
    }
  }, [v2MapData, isV2Enabled]);

  const effectiveListings = useMemo(() => {
    const activeV2Data = isV2Enabled ? (v2MapData ?? lastV2Data) : null;
    if (activeV2Data) {
      return v2MapDataToListings(activeV2Data);
    }

    if (isFetchingMapData && previousListingsRef.current.length > 0) {
      const seen = new Set<string>();
      const merged: MapListingData[] = [];
      for (const entry of [listings, previousListingsRef.current]) {
        for (const item of entry) {
          if (!seen.has(item.id) && merged.length < MAX_MAP_MARKERS) {
            seen.add(item.id);
            merged.push(item);
          }
        }
      }
      return merged;
    }

    return listings;
  }, [isV2Enabled, v2MapData, lastV2Data, listings, isFetchingMapData]);

  const fetchTile = useCallback(async (
    tileKey: string,
    tilePath: string,
    filterParams: string,
    zoom: number,
    signal: AbortSignal,
  ) => {
    try {
      const response = await fetch(`/api/map-tiles/${tilePath}?${filterParams}&zoom=${zoom}&includeDensity=true`, { signal });
      if (!response.ok) {
        if (response.status === 429 && retryCountRef.current < 1) {
          retryCountRef.current += 1;
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryDelayMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 2000;
          retryTimeoutRef.current = setTimeout(() => {
            fetchTile(tileKey, tilePath, filterParams, zoom, signal);
          }, retryDelayMs);
          return;
        }
        const body = await response.json().catch(() => ({}));
        throw new Error(getStatusErrorMessage(response.status, body?.error));
      }

      const payload = await response.json();
      tileCacheRef.current.set(tileKey, {
        listings: payload.listings || [],
        filterKey: lastFilterKeyRef.current,
        mode: payload.mode,
        density: payload.density
          ? {
              listingCount: payload.density.listingCount ?? 0,
              returnedCount: payload.density.returnedCount ?? 0,
            }
          : undefined,
        timestamp: Date.now(),
      });

      if (tileCacheRef.current.size > TILE_CACHE_MAX_ENTRIES) {
        let oldestKey: string | null = null;
        let oldestTs = Infinity;
        for (const [key, entry] of tileCacheRef.current) {
          if (entry.timestamp < oldestTs) {
            oldestTs = entry.timestamp;
            oldestKey = key;
          }
        }
        if (oldestKey) tileCacheRef.current.delete(oldestKey);
      }
    } finally {
      inFlightRef.current.delete(tileKey);
    }
  }, []);

  useEffect(() => {
    if (!shouldRenderMap) return;

    retryCountRef.current = 0;
    const hasBounds = hasBoundsInUrl;
    const clampedSearchParams = new URLSearchParams(searchParams.toString());

    if (hasBounds) {
      const validation = isValidViewport(searchParams);
      if (!validation.valid) {
        const minLat = parseFloat(searchParams.get("minLat") || "");
        if (!Number.isFinite(minLat)) {
          setError(validation.error || "Invalid viewport");
          setIsFetchingMapData(false);
          return;
        }

        const parsedMinLat = parseFloat(searchParams.get("minLat")!);
        const parsedMaxLat = parseFloat(searchParams.get("maxLat")!);
        const parsedMinLng = parseFloat(searchParams.get("minLng")!);
        const parsedMaxLng = parseFloat(searchParams.get("maxLng")!);
        const centerLat = (parsedMinLat + parsedMaxLat) / 2;
        const centerLng = (parsedMinLng + parsedMaxLng) / 2;
        clampedSearchParams.set("minLat", (centerLat - MAX_LAT_SPAN / 2).toString());
        clampedSearchParams.set("maxLat", (centerLat + MAX_LAT_SPAN / 2).toString());
        clampedSearchParams.set("minLng", (centerLng - MAX_LNG_SPAN / 2).toString());
        clampedSearchParams.set("maxLng", (centerLng + MAX_LNG_SPAN / 2).toString());
        setInfoMessage("Zoomed in to show results");
      } else {
        setInfoMessage(null);
      }
    }

    if (isV2Enabled && !hasV2Data) {
      const raceGuardTimeout = setTimeout(() => setIsV2Enabled(false), 200);
      return () => clearTimeout(raceGuardTimeout);
    }
    if (hasV2Data) return;

    if (!hasBounds) {
      setIsFetchingMapData(false);
      return;
    }

    const currentBounds: ViewportBounds = {
      minLat: parseFloat(clampedSearchParams.get("minLat") || "0"),
      maxLat: parseFloat(clampedSearchParams.get("maxLat") || "0"),
      minLng: parseFloat(clampedSearchParams.get("minLng") || "0"),
      maxLng: parseFloat(clampedSearchParams.get("maxLng") || "0"),
    };

    const filterKey = getFilterKey(clampedSearchParams);
    if (filterKey !== lastFilterKeyRef.current) {
      tileCacheRef.current.clear();
      lastFilterKeyRef.current = filterKey;
    }

    const paddedBounds = padBounds(currentBounds);
    const zoomFromUrl = parseInt(clampedSearchParams.get("zoom") || "", 10);
    const zoom = Number.isFinite(zoomFromUrl) ? zoomFromUrl : getZoomForBounds(paddedBounds);
    const visibleTileKeys = getVisibleTileKeys(paddedBounds, zoom);
    const subscriptionKey = `${filterKey}|z${zoom}|${visibleTileKeys.join(",")}`;
    if (subscriptionKey === lastSubscriptionKeyRef.current) return;
    lastSubscriptionKeyRef.current = subscriptionKey;

    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const filterParams = buildCanonicalFilterParamsFromSearchParams(clampedSearchParams);
    filterParams.sort();
    const filterParamsString = filterParams.toString();

    fetchTimeoutRef.current = setTimeout(async () => {
      setIsFetchingMapData(true);
      setError(null);

      const fetches: Promise<void>[] = [];
      for (const tileKey of visibleTileKeys) {
        if (tileCacheRef.current.has(tileKey) || inFlightRef.current.has(tileKey)) continue;
        inFlightRef.current.add(tileKey);
        fetches.push(fetchTile(tileKey, tileKey, filterParamsString, zoom, abortController.signal));
      }

      try {
        await Promise.all(fetches);

        const seen = new Set<string>();
        const merged: MapListingData[] = [];
        for (const tileKey of visibleTileKeys) {
          const entry = tileCacheRef.current.get(tileKey);
          if (!entry || entry.filterKey !== filterKey) continue;
          for (const item of entry.listings) {
            if (!seen.has(item.id) && merged.length < MAX_MAP_MARKERS) {
              seen.add(item.id);
              merged.push(item);
            }
          }
        }

        previousListingsRef.current = merged.length > 0 ? merged : previousListingsRef.current;
        setListings(merged);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message || "Failed to load map data");
        }
      } finally {
        setIsFetchingMapData(false);
      }
    }, MAP_FETCH_DEBOUNCE_MS);

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      abortController.abort();
    };
  }, [searchParams, shouldRenderMap, isV2Enabled, hasV2Data, setIsV2Enabled, fetchTile, hasBoundsInUrl]);

  const handleRetry = useCallback(() => {
    const validation = isValidViewport(searchParams);
    if (!validation.valid) {
      setError(validation.error || "Invalid viewport");
      return;
    }
    lastSubscriptionKeyRef.current = null;
    setError(null);
    setIsFetchingMapData(false);
  }, [searchParams]);

  const showInitialPlaceholder = !dataPathDetermined || (isV2Enabled && !hasAnyV2Data);
  const showV2LoadingOverlay = isV2Enabled && !hasV2Data && hasAnyV2Data;

  if (!shouldRenderMap) {
    return null;
  }

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
      {error && <MapErrorBanner message={error} onRetry={handleRetry} />}
      {!error && infoMessage && <MapInfoBanner message={infoMessage} />}
      {(isFetchingMapData || isListTransitioning || showV2LoadingOverlay) && (
        <MapDataLoadingBar />
      )}
      {isListTransitioning && <MapTransitionOverlay />}
      <MapErrorBoundary>
        <Suspense fallback={<MapLoadingPlaceholder />}>
          <LazyDynamicMap listings={effectiveListings} />
        </Suspense>
      </MapErrorBoundary>
    </div>
  );
}
