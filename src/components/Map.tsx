"use client";

/**
 * Map Component for displaying listings with marker clustering
 *
 * Uses MapLibre GL JS built-in clustering for performance optimization.
 * - Clustered points show as circles with count
 * - Individual points show custom price markers
 * - Click cluster to zoom and expand
 */

import Map, {
  Marker,
  Popup,
  Source,
  Layer,
  MapLayerMouseEvent,
  ViewStateChangeEvent,
  MapRef,
} from "react-map-gl/maplibre";
import type { LayerProps, MapSourceDataEvent } from "react-map-gl/maplibre";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Home,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Star,
  X,
} from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { formatPrice } from "@/lib/format";
import { Button } from "./ui/button";
import { MAP_FLY_TO_EVENT, MapFlyToEventDetail } from "./SearchForm";
import { useListingFocus } from "@/contexts/ListingFocusContext";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import { useSearchMapUI } from "@/contexts/SearchMapUIContext";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useMapBounds } from "@/contexts/MapBoundsContext";
import { useActivePanBoundsSetter } from "@/contexts/ActivePanBoundsContext";
import {
  MobileMapStatusCard,
  type MobileMapStatus,
} from "./map/MobileMapStatusCard";
import { MapGestureHint } from "./map/MapGestureHint";
import { MapEmptyState } from "./map/MapEmptyState";
import { hasAnyFilter, FILTER_PARAM_KEYS } from "./filters/filter-chip-utils";
import { PrivacyCircle } from "./map/PrivacyCircle";
import { fixMarkerWrapperRole } from "./map/fixMarkerA11y";
import { BoundaryLayer } from "./map/BoundaryLayer";
import { UserMarker, useUserPin } from "./map/UserMarker";
import DesktopMapControls from "./map/DesktopMapControls";
import DesktopListingPreviewCard from "./map/DesktopListingPreviewCard";
import MobileMapToolsSheet from "./map/MobileMapToolsSheet";
import { POILayer, usePOILayerState } from "./map/POILayer";
import {
  PROGRAMMATIC_MOVE_TIMEOUT_MS,
  USA_MAX_BOUNDS,
  MAP_MIN_ZOOM,
  MAP_FETCH_MAX_LAT_SPAN,
  MAP_FETCH_MAX_LNG_SPAN,
} from "@/lib/constants";
import { groupExactMapListingClones } from "@/lib/maps/marker-utils";
import {
  SEARCH_MOBILE_PREVIEW_CARD_OFFSET,
  SNAP_COLLAPSED,
} from "@/lib/mobile-layout";
import { SEARCH_PHONE_MAX_QUERY } from "@/lib/search-layout";
import {
  applySearchQueryChange,
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";
import {
  getAvailabilityPresentation,
  type AvailabilityPublicAvailability,
} from "@/lib/search/availability-presentation";
import { buildListingDetailHref } from "@/lib/search/listing-detail-link";
import type { GroupContextPresentation } from "@/lib/search-types";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  LazyMotion,
  domAnimation,
  AnimatePresence,
  m,
  useReducedMotion,
} from "framer-motion";

/** Parse a string to float and validate it's a finite number within an optional range. */
function safeParseFloat(
  value: string,
  min?: number,
  max?: number
): number | undefined {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (min !== undefined && parsed < min) return undefined;
  if (max !== undefined && parsed > max) return undefined;
  return parsed;
}

function normalizeMapNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function getLongitudeSpan(bounds: MapBounds): number {
  if (bounds.minLng <= bounds.maxLng) {
    return bounds.maxLng - bounds.minLng;
  }

  return 180 - bounds.minLng + (bounds.maxLng + 180);
}

function isLongitudeWithinBounds(lng: number, bounds: MapBounds): boolean {
  if (bounds.minLng <= bounds.maxLng) {
    return lng >= bounds.minLng && lng <= bounds.maxLng;
  }

  return lng >= bounds.minLng || lng <= bounds.maxLng;
}

interface Listing {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  totalSlots?: number;
  images?: string[];
  avgRating?: number;
  reviewCount?: number;
  roomType?: string;
  publicAvailability?: AvailabilityPublicAvailability;
  groupContext?: GroupContextPresentation | null;
  location: {
    city?: string;
    state?: string;
    lat: number;
    lng: number;
  };
  /** Pin tier for differentiated styling: primary = larger, mini = smaller */
  tier?: "primary" | "mini";
}

type DesktopPopupFocusOrigin =
  | {
      type: "marker";
      listingId: string;
    }
  | {
      type: "list";
      listingId: string;
      element: HTMLElement | null;
    }
  | null;

interface MarkerPosition {
  listing: Listing;
  memberIds: string[];
  lat: number;
  lng: number;
}

interface ClusterFeatureProperties {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  publicAvailabilityJson?: string;
  groupContextJson?: string;
  images?: string;
  lat: number;
  lng: number;
  tier?: "primary" | "mini";
}

function parseFeatureImages(rawImages: unknown): string[] {
  if (typeof rawImages !== "string" || rawImages.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawImages);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function parseFeatureAvailability(
  rawAvailability: unknown
): AvailabilityPublicAvailability | undefined {
  if (typeof rawAvailability !== "string" || rawAvailability.length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawAvailability);
    return parsed && typeof parsed === "object"
      ? (parsed as AvailabilityPublicAvailability)
      : undefined;
  } catch {
    return undefined;
  }
}

function parseFeatureGroupContext(
  rawGroupContext: unknown
): GroupContextPresentation | null {
  if (typeof rawGroupContext !== "string" || rawGroupContext.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawGroupContext);
    return parsed && typeof parsed === "object"
      ? (parsed as GroupContextPresentation)
      : null;
  } catch {
    return null;
  }
}

/**
 * Map view state for controlled component pattern.
 * Contains center coordinates and zoom level.
 */
export interface MapViewState {
  /** Longitude of map center */
  longitude: number;
  /** Latitude of map center */
  latitude: number;
  /** Zoom level (0-22) */
  zoom: number;
  /** Optional bearing (rotation) in degrees */
  bearing?: number;
  /** Optional pitch (tilt) in degrees */
  pitch?: number;
}

/**
 * Map bounds coordinates (bounding box).
 * Used for search queries and viewport tracking.
 */
export interface MapBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

/**
 * Payload for view state change callback.
 * Includes both view state and computed bounds.
 */
export interface MapViewStateChangeEvent {
  /** The new view state */
  viewState: MapViewState;
  /** The computed bounds of the new viewport */
  bounds: MapBounds;
  /** Whether this change was from a programmatic move (flyTo/fitBounds) */
  isProgrammatic: boolean;
}

/**
 * Props for the MapComponent.
 * Supports both controlled and uncontrolled usage patterns.
 *
 * @example Uncontrolled usage (default):
 * ```tsx
 * <MapComponent listings={listings} />
 * ```
 *
 * @example Controlled usage:
 * ```tsx
 * const [viewState, setViewState] = useState({ longitude: -122.4, latitude: 37.8, zoom: 12 });
 * <MapComponent
 *   listings={listings}
 *   viewState={viewState}
 *   onViewStateChange={({ viewState }) => setViewState(viewState)}
 * />
 * ```
 *
 * @example With selected listing control:
 * ```tsx
 * const [selectedId, setSelectedId] = useState<string | null>(null);
 * <MapComponent
 *   listings={listings}
 *   selectedListingId={selectedId}
 *   onSelectedListingChange={setSelectedId}
 * />
 * ```
 */
export interface MapComponentProps {
  /** Array of listings to display on the map */
  listings: Listing[];

  // --- Controlled View State Props ---

  /**
   * Controlled view state (center, zoom).
   * When provided, the map operates in controlled mode.
   * Parent component must update this via onViewStateChange.
   */
  viewState?: MapViewState;

  /**
   * Initial view state for uncontrolled mode.
   * Only used when `viewState` prop is not provided.
   * Defaults to URL bounds or first listing location.
   */
  defaultViewState?: MapViewState;

  /**
   * Callback fired when the map view state changes (pan, zoom).
   * Called on every move in controlled mode.
   * Provides both viewState and computed bounds.
   */
  onViewStateChange?: (event: MapViewStateChangeEvent) => void;

  /**
   * Callback fired when the map finishes moving (debounced).
   * Useful for triggering search queries on move end.
   */
  onMoveEnd?: (event: MapViewStateChangeEvent) => void;

  // --- Controlled Selection Props ---

  /**
   * Controlled selected listing ID.
   * When provided, popup state is controlled by parent.
   */
  selectedListingId?: string | null;

  /**
   * Callback fired when selected listing changes.
   * Called when user clicks a marker or closes popup.
   */
  onSelectedListingChange?: (listingId: string | null) => void;

  /**
   * How marker selection is presented.
   * Search uses "preview" on phones, "sheet" on tablets, and "popup" on desktop.
   * @default "popup"
   */
  selectionPresentation?: "popup" | "sheet" | "preview";

  // --- Behavior Props ---

  /**
   * Whether to disable automatic fly-to behavior when listings change.
   * Useful when parent controls viewport via viewState.
   * @default false
   */
  disableAutoFit?: boolean;

  /**
   * Hide the "No listings in this area" overlay.
   * Useful when viewport is intentionally too wide and results are paused.
   * @default false
   */
  suppressEmptyState?: boolean;
}

// Mapbox Layer Colors - Synced with Tailwind Zinc Palette
const MAP_COLORS = {
  zinc900: "#18181b",
  white: "#ffffff",
  zinc800: "#27272a",
};

type DesktopPopupAnchor =
  | "top"
  | "right"
  | "left"
  | "bottom"
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

interface PopupSize {
  width: number;
  height: number;
}

interface LocalRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface DesktopPopupPlacement {
  anchor: DesktopPopupAnchor;
  popupRect: LocalRect;
  overflowScore: number;
  overlapScore: number;
  requiresCameraShift: boolean;
  deltaX: number;
  deltaY: number;
}

const DESKTOP_POPUP_SAFE_AREA = {
  top: 24,
  right: 24,
  bottom: 24,
  left: 24,
} as const;

// MapLibre anchors name the popup edge or corner closest to the coordinate.
// Example: `bottom` renders the popup above the marker, while `right` renders
// the popup to the left of the marker.
const DESKTOP_POPUP_ANCHOR_PRIORITY: DesktopPopupAnchor[] = [
  "bottom",
  "right",
  "left",
  "top",
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
];
const DESKTOP_POPUP_FOCUS_ANIMATION_MS = 280;
const DESKTOP_POPUP_CORRECTION_ANIMATION_MS = 250;
const DESKTOP_POPUP_ANCHOR_GAP_PX = 20;
const DESKTOP_POPUP_FALLBACK_CARD_WIDTH_PX = 304;
const DESKTOP_POPUP_FALLBACK_CARD_HEIGHT_PX = 296;
const POPUP_CONTAINMENT_TOLERANCE_PX = 2;
const MAP_SEARCH_STATUS_DELAY_MS = 275;

const DESKTOP_POPUP_OFFSETS: {
  center: [number, number];
} & Record<DesktopPopupAnchor, [number, number]> = {
  center: [0, 0],
  top: [0, DESKTOP_POPUP_ANCHOR_GAP_PX],
  right: [-DESKTOP_POPUP_ANCHOR_GAP_PX, 0],
  left: [DESKTOP_POPUP_ANCHOR_GAP_PX, 0],
  bottom: [0, -DESKTOP_POPUP_ANCHOR_GAP_PX],
  "top-right": [-DESKTOP_POPUP_ANCHOR_GAP_PX, DESKTOP_POPUP_ANCHOR_GAP_PX],
  "top-left": [DESKTOP_POPUP_ANCHOR_GAP_PX, DESKTOP_POPUP_ANCHOR_GAP_PX],
  "bottom-right": [-DESKTOP_POPUP_ANCHOR_GAP_PX, -DESKTOP_POPUP_ANCHOR_GAP_PX],
  "bottom-left": [DESKTOP_POPUP_ANCHOR_GAP_PX, -DESKTOP_POPUP_ANCHOR_GAP_PX],
};

function createLocalRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): LocalRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function translateLocalRect(
  rect: LocalRect,
  deltaX: number,
  deltaY: number
): LocalRect {
  return createLocalRect({
    left: rect.left + deltaX,
    top: rect.top + deltaY,
    width: rect.width,
    height: rect.height,
  });
}

function getDesktopPopupRectForAnchor(
  anchor: DesktopPopupAnchor,
  point: { x: number; y: number },
  popupSize: PopupSize
): LocalRect {
  switch (anchor) {
    case "top":
      return createLocalRect({
        left: point.x - popupSize.width / 2,
        top: point.y + DESKTOP_POPUP_ANCHOR_GAP_PX,
        width: popupSize.width,
        height: popupSize.height,
      });
    case "right":
      return createLocalRect({
        left: point.x - DESKTOP_POPUP_ANCHOR_GAP_PX - popupSize.width,
        top: point.y - popupSize.height / 2,
        width: popupSize.width,
        height: popupSize.height,
      });
    case "left":
      return createLocalRect({
        left: point.x + DESKTOP_POPUP_ANCHOR_GAP_PX,
        top: point.y - popupSize.height / 2,
        width: popupSize.width,
        height: popupSize.height,
      });
    case "bottom":
      return createLocalRect({
        left: point.x - popupSize.width / 2,
        top: point.y - DESKTOP_POPUP_ANCHOR_GAP_PX - popupSize.height,
        width: popupSize.width,
        height: popupSize.height,
      });
    case "top-right":
      return createLocalRect({
        left: point.x - DESKTOP_POPUP_ANCHOR_GAP_PX - popupSize.width,
        top: point.y + DESKTOP_POPUP_ANCHOR_GAP_PX,
        width: popupSize.width,
        height: popupSize.height,
      });
    case "top-left":
      return createLocalRect({
        left: point.x + DESKTOP_POPUP_ANCHOR_GAP_PX,
        top: point.y + DESKTOP_POPUP_ANCHOR_GAP_PX,
        width: popupSize.width,
        height: popupSize.height,
      });
    case "bottom-right":
      return createLocalRect({
        left: point.x - DESKTOP_POPUP_ANCHOR_GAP_PX - popupSize.width,
        top: point.y - DESKTOP_POPUP_ANCHOR_GAP_PX - popupSize.height,
        width: popupSize.width,
        height: popupSize.height,
      });
    case "bottom-left":
      return createLocalRect({
        left: point.x + DESKTOP_POPUP_ANCHOR_GAP_PX,
        top: point.y - DESKTOP_POPUP_ANCHOR_GAP_PX - popupSize.height,
        width: popupSize.width,
        height: popupSize.height,
      });
  }
}

function getRectOverflowScore(rect: LocalRect, safeRect: LocalRect): number {
  return (
    Math.max(safeRect.left - rect.left, 0) +
    Math.max(rect.right - safeRect.right, 0) +
    Math.max(safeRect.top - rect.top, 0) +
    Math.max(rect.bottom - safeRect.bottom, 0)
  );
}

function getRectIntersectionArea(a: LocalRect, b: LocalRect): number {
  const overlapWidth = Math.max(
    0,
    Math.min(a.right, b.right) - Math.max(a.left, b.left)
  );
  const overlapHeight = Math.max(
    0,
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  );
  return overlapWidth * overlapHeight;
}

function isRectInsideSafeArea(rect: LocalRect, safeRect: LocalRect): boolean {
  return (
    rect.left >= safeRect.left &&
    rect.right <= safeRect.right &&
    rect.top >= safeRect.top &&
    rect.bottom <= safeRect.bottom
  );
}

function getPopupAdjustmentDelta(
  rect: LocalRect,
  safeRect: LocalRect,
  avoidRects: LocalRect[]
): { deltaX: number; deltaY: number } {
  let adjustedRect = rect;
  let deltaX = 0;
  let deltaY = 0;

  if (adjustedRect.left < safeRect.left) {
    deltaX += safeRect.left - adjustedRect.left;
  } else if (adjustedRect.right > safeRect.right) {
    deltaX += safeRect.right - adjustedRect.right;
  }

  if (adjustedRect.top < safeRect.top) {
    deltaY += safeRect.top - adjustedRect.top;
  } else if (adjustedRect.bottom > safeRect.bottom) {
    deltaY += safeRect.bottom - adjustedRect.bottom;
  }

  adjustedRect = translateLocalRect(adjustedRect, deltaX, deltaY);

  for (const avoidRect of avoidRects) {
    if (getRectIntersectionArea(adjustedRect, avoidRect) === 0) continue;

    const candidateAdjustments = [
      { deltaX: avoidRect.left - adjustedRect.right, deltaY: 0 },
      { deltaX: avoidRect.right - adjustedRect.left, deltaY: 0 },
      { deltaX: 0, deltaY: avoidRect.top - adjustedRect.bottom },
      { deltaX: 0, deltaY: avoidRect.bottom - adjustedRect.top },
    ]
      .map((candidate) => ({
        ...candidate,
        rect: translateLocalRect(
          adjustedRect,
          candidate.deltaX,
          candidate.deltaY
        ),
      }))
      .filter((candidate) => isRectInsideSafeArea(candidate.rect, safeRect))
      .sort(
        (a, b) =>
          Math.abs(a.deltaX) +
          Math.abs(a.deltaY) -
          (Math.abs(b.deltaX) + Math.abs(b.deltaY))
      );

    const bestCandidate = candidateAdjustments[0];
    if (!bestCandidate) continue;

    deltaX += bestCandidate.deltaX;
    deltaY += bestCandidate.deltaY;
    adjustedRect = bestCandidate.rect;
  }

  return { deltaX, deltaY };
}

// Price bucket colors for cluster rings (green = affordable, yellow = mid, red = expensive)
const CLUSTER_RING_COLORS = {
  green: "#22c55e", // < $800/mo avg
  yellow: "#eab308", // $800-$1500/mo avg
  red: "#ef4444", // > $1500/mo avg
};

// Shared cluster radius expression
const clusterRadiusExpr = [
  "step",
  ["get", "point_count"],
  20, // 20px radius for < 10 points
  10,
  25, // 25px radius for 10-49 points
  50,
  32, // 32px radius for 50-99 points
  100,
  40, // 40px radius for 100+ points
] as const;

// Price-colored outer ring for clusters (rendered behind main cluster circle)
const clusterRingLayer: LayerProps = {
  id: "cluster-ring",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "transparent",
    "circle-radius": [
      "step",
      ["get", "point_count"],
      24,
      10,
      29,
      50,
      36,
      100,
      44,
    ],
    "circle-stroke-width": 3,
    "circle-stroke-color": [
      "step",
      ["/", ["get", "priceSum"], ["get", "point_count"]],
      CLUSTER_RING_COLORS.green,
      800,
      CLUSTER_RING_COLORS.yellow,
      1500,
      CLUSTER_RING_COLORS.red,
    ],
    "circle-stroke-opacity": 0.7,
  },
};

// Cluster layer - circles for grouped markers
// Note: No 'source' property - Layer inherits from parent Source component
const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": MAP_COLORS.zinc900,
    "circle-radius": clusterRadiusExpr as unknown as number,
    "circle-stroke-width": 3,
    "circle-stroke-color": MAP_COLORS.white,
  },
};

// Dark mode cluster layer
const clusterLayerDark: LayerProps = {
  id: "clusters-dark",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": MAP_COLORS.white,
    "circle-radius": clusterRadiusExpr as unknown as number,
    "circle-stroke-width": 3,
    "circle-stroke-color": MAP_COLORS.zinc900,
  },
};

// Cluster count label layer — shows "50+" for large clusters
// text-size scales with OS/browser font-size settings via textScale factor
const clusterCountTextField = [
  "step",
  ["get", "point_count"],
  ["to-string", ["get", "point_count"]],
  50,
  ["concat", ["to-string", ["get", "point_count_abbreviated"]], "+"],
] as unknown as string;

function getClusterCountLayer(textScale: number): LayerProps {
  return {
    id: "cluster-count",
    type: "symbol",
    filter: ["has", "point_count"],
    layout: {
      "text-field": clusterCountTextField,
      "text-font": ["Noto Sans Bold"],
      "text-size": Math.round(14 * textScale),
    },
    paint: { "text-color": MAP_COLORS.white },
  };
}

function getClusterCountLayerDark(textScale: number): LayerProps {
  return {
    id: "cluster-count-dark",
    type: "symbol",
    filter: ["has", "point_count"],
    layout: {
      "text-field": clusterCountTextField,
      "text-font": ["Noto Sans Bold"],
      "text-size": Math.round(14 * textScale),
    },
    paint: { "text-color": MAP_COLORS.zinc900 },
  };
}

// Always use clustering — Mapbox handles any count gracefully.
// With few listings, clusters simply won't form and individual markers show.
// Previously used a threshold of 50, but this caused stale cluster layers
// when the persistent map transitioned across the threshold boundary.

// Zoom thresholds for two-tier pin display
const ZOOM_DOTS_ONLY = 10; // Below: all pins are gray dots (no price)
const ZOOM_TOP_N_PINS = 14; // 12-14: primary = price pins, mini = dots. 14+: all price pins

// Module-level constant: prevent double-click zoom on markers
const preventDoubleClickZoom = (e: React.MouseEvent) => {
  e.stopPropagation();
  e.preventDefault();
};

// ============================================================================
// CRIT-1 FIX: Extracted memoized components replacing inline IIFEs
// ============================================================================

/**
 * MarkerPinContent — renders dot or price pill for a single marker.
 * React.memo with 4 primitive props ensures only markers whose visual state
 * actually changed re-render their pin content. Returns fragment to preserve
 * group-hover/marker CSS ancestry in the parent div.
 */
interface MarkerPinContentProps {
  price: number;
  tier: "primary" | "mini" | undefined;
  currentZoom: number;
  isHovered: boolean;
  isActive: boolean;
  isViewed: boolean;
}

const MarkerPinContent = React.memo(function MarkerPinContent({
  price,
  tier,
  currentZoom,
  isHovered,
  isActive,
  isViewed,
}: MarkerPinContentProps) {
  const isMini = tier === "mini";
  const showAsDot =
    currentZoom < ZOOM_DOTS_ONLY || (currentZoom < ZOOM_TOP_N_PINS && isMini);

  if (showAsDot && !isHovered && !isActive) {
    return (
      <m.div layout>
        <div
          className={cn(
            "w-3 h-3 rounded-full shadow-ambient transition-transform duration-200",
            isViewed
              ? "bg-surface-container-highest ring-2 ring-outline-variant/50"
              : "bg-on-surface ring-2 ring-white shadow-ambient",
            "group-hover/marker:scale-125"
          )}
        />
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-[1px] w-2 h-0.5 bg-on-surface/20 rounded-full blur-[1px]" />
      </m.div>
    );
  }

  return (
    <m.div layout className="relative">
      <div
        className={cn(
          "flex items-center justify-center bg-surface-container-lowest text-on-surface px-4 py-2 rounded-full font-display font-semibold text-sm transition-all duration-300 shadow-[0_10px_40px_0px_rgba(27,28,25,0.06)] border border-outline-variant/20 group-hover/marker:bg-on-surface group-hover/marker:text-surface-canvas group-hover/marker:scale-110 group-hover/marker:z-10",
          (isHovered || isActive) &&
            "bg-on-surface text-surface-canvas scale-[1.15] shadow-[0_14px_32px_rgba(27,28,25,0.16)] z-20",
          isViewed &&
            !isHovered &&
            !isActive &&
            "bg-surface-container-high text-on-surface-variant border-outline-variant/10"
        )}
      >
        {formatPrice(price)}
      </div>
    </m.div>
  );
});

/**
 * MapMarkerItem — wraps a single react-map-gl Marker with its inner div,
 * MarkerPinContent, pulse ring, and keyboard focus ring.
 *
 * React.memo on this component is the key CRIT-2 fix: when the parent
 * MapComponent re-renders due to non-marker state (isSearching, areTilesLoading,
 * etc.), all 200 MapMarkerItem instances bail out of rendering because none
 * of their ~15 primitive/boolean/stable-callback props changed.
 */
interface MapMarkerItemProps {
  listingId: string;
  lng: number;
  lat: number;
  price: number;
  title: string;
  availabilityAriaLabel: string;
  tier: "primary" | "mini" | undefined;
  currentZoom: number;
  isHovered: boolean;
  isActive: boolean;
  isDimmed: boolean;
  isKeyboardFocused: boolean;
  isViewed: boolean;
  onClickById: (id: string) => void;
  onPointerEnter: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: (e: React.PointerEvent<HTMLDivElement>) => void;
  onKeyboardNav: (e: ReactKeyboardEvent<HTMLDivElement>, id: string) => void;
  onFocusChange: React.Dispatch<React.SetStateAction<string | null>>;
  markerRefsMap: React.RefObject<globalThis.Map<string, HTMLDivElement>>;
}

const MapMarkerItem = React.memo(function MapMarkerItem({
  listingId,
  lng,
  lat,
  price,
  title,
  availabilityAriaLabel,
  tier,
  currentZoom,
  isHovered,
  isActive,
  isDimmed,
  isKeyboardFocused,
  isViewed,
  onClickById,
  onPointerEnter,
  onPointerLeave,
  onKeyboardNav,
  onFocusChange,
  markerRefsMap,
}: MapMarkerItemProps) {
  const handleClick = useCallback(
    (e: { originalEvent: { stopPropagation: () => void } }) => {
      e.originalEvent.stopPropagation();
      onClickById(listingId);
    },
    [listingId, onClickById]
  );

  const refCallback = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        markerRefsMap.current.set(listingId, el);
        fixMarkerWrapperRole(el);
      } else {
        markerRefsMap.current.delete(listingId);
      }
    },
    [listingId, markerRefsMap]
  );

  const handleFocus = useCallback(() => {
    onFocusChange(listingId);
  }, [listingId, onFocusChange]);

  const handleBlur = useCallback(() => {
    onFocusChange((current) => (current === listingId ? null : current));
  }, [listingId, onFocusChange]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onClickById(listingId);
      } else if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
        ].includes(e.key)
      ) {
        onKeyboardNav(e, listingId);
      }
    },
    [listingId, onClickById, onKeyboardNav]
  );

  const ariaLabel = `${formatPrice(price)} per month${title ? `, ${title}` : ""}, ${availabilityAriaLabel}. Use arrow keys to navigate between markers.`;

  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="bottom"
      onClick={handleClick}
    >
      <div
        ref={refCallback}
        className={cn(
          "relative cursor-pointer group/marker animate-[fadeIn_200ms_ease-out] motion-reduce:animate-none min-w-[44px] min-h-[44px] flex items-center justify-center outline-none",
          "transition-all duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]",
          isHovered && "scale-[1.15] z-50",
          isActive && !isHovered && "z-40",
          isDimmed && "opacity-60",
          isKeyboardFocused && "z-50"
        )}
        data-listing-id={listingId}
        data-testid={`map-pin-${tier || "primary"}-${listingId}`}
        data-focus-state={
          isHovered
            ? "hovered"
            : isActive
              ? "active"
              : isDimmed
                ? "dimmed"
                : "none"
        }
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-describedby="map-marker-instructions"
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onKeyDown={handleKeyDown}
        onDoubleClick={preventDoubleClickZoom}
      >
        <MarkerPinContent
          price={price}
          tier={tier}
          currentZoom={currentZoom}
          isHovered={isHovered}
          isActive={isActive}
          isViewed={isViewed}
        />
        {/* Pulsing ring on hover/active for visibility on dense maps */}
        {(isHovered || isActive) && (
          <div
            className={cn(
              "absolute -inset-2 -top-2 rounded-full border-2 pointer-events-none motion-reduce:animate-none",
              isHovered
                ? "border-outline-variant/20 animate-ping opacity-40"
                : "border-outline-variant/30 animate-[pulse-ring_2s_ease-in-out_infinite] opacity-30"
            )}
          />
        )}
        {/* Keyboard focus halo - neutral shadow without a bright accent border */}
        {isKeyboardFocused && (
          <div
            className="absolute -inset-2 rounded-full pointer-events-none shadow-[0_14px_32px_rgba(27,28,25,0.14)]"
            aria-hidden="true"
          />
        )}
      </div>
    </Marker>
  );
});

/**
 * ClusterHighlightMarker — renders an indigo dot when a hovered/active listing
 * is inside a cluster (not visible as an individual marker).
 */
interface ClusterHighlightMarkerProps {
  targetId: string | null;
  markerPositionIds: Set<string>;
  listings: Listing[];
}

const ClusterHighlightMarker = React.memo(function ClusterHighlightMarker({
  targetId,
  markerPositionIds,
  listings,
}: ClusterHighlightMarkerProps) {
  if (!targetId) return null;
  if (markerPositionIds.has(targetId)) return null;
  const listing = listings.find((l) => l.id === targetId);
  if (!listing) return null;
  return (
    <Marker
      longitude={listing.location.lng}
      latitude={listing.location.lat}
      anchor="center"
    >
      <div className="pointer-events-none flex items-center justify-center">
        <div className="w-4 h-4 rounded-full bg-primary border-2 border-white shadow-ambient animate-pulse" />
        <div className="absolute w-8 h-8 rounded-full border-2 border-primary animate-ping opacity-40" />
      </div>
    </Marker>
  );
});

// Safe light-style fallback that avoids complex expression validation failures.
const LIGHT_STYLE_FALLBACK: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-raster",
      type: "raster",
      source: "osm",
    },
  ],
};

/**
 * MapLibre requires `["zoom"]` to be used only as the input expression of
 * top-level `step`/`interpolate` for layout/paint properties.
 *
 * Some external/legacy layers can provide invalid nested zoom expressions
 * (e.g. in text-size), which throws during addLayer and breaks map rendering.
 * This sanitizer patches those cases to a safe numeric fallback.
 */
function sanitizeLayerTextSizeExpression(layer: unknown): unknown {
  if (!layer || typeof layer !== "object") return layer;

  const candidate = layer as {
    id?: string;
    type?: string;
    layout?: Record<string, unknown>;
  };

  if (
    candidate.type !== "symbol" ||
    !candidate.layout ||
    typeof candidate.layout !== "object"
  ) {
    return layer;
  }

  const textSize = candidate.layout["text-size"];
  if (!Array.isArray(textSize)) return layer;

  const hasZoomToken = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    if (value[0] === "zoom") return true;
    return value.some(hasZoomToken);
  };

  const hasValidTopLevelZoomInput = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    if (value[0] === "step") {
      return Array.isArray(value[1]) && value[1][0] === "zoom";
    }
    if (value[0] === "interpolate") {
      return Array.isArray(value[2]) && value[2][0] === "zoom";
    }
    return false;
  };

  if (!hasZoomToken(textSize) || hasValidTopLevelZoomInput(textSize)) {
    return layer;
  }

  const sanitized = {
    ...candidate,
    layout: {
      ...candidate.layout,
      "text-size": 12,
    },
  };

  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[Map] Sanitized invalid text-size zoom expression on layer:",
      candidate.id ?? "(unknown)"
    );
  }

  return sanitized;
}

function sanitizeStyleSpecification(style: unknown): unknown {
  if (!style || typeof style !== "object") return style;

  const candidate = style as { layers?: unknown[] };
  if (!Array.isArray(candidate.layers)) return style;

  let didSanitize = false;
  const sanitizedLayers = candidate.layers.map((layer) => {
    const sanitizedLayer = sanitizeLayerTextSizeExpression(layer);
    if (sanitizedLayer !== layer) didSanitize = true;
    return sanitizedLayer;
  });

  if (!didSanitize) return style;

  return {
    ...(style as Record<string, unknown>),
    layers: sanitizedLayers,
  };
}

/**
 * Patch the Map prototype's addLayer to sanitize zoom expressions.
 * Uses the map instance's actual constructor prototype to ensure we
 * patch the correct class (pnpm/Turbopack may resolve different copies).
 */
function patchMapPrototypeAddLayer(mapInstance: unknown): void {
  if (!mapInstance || typeof mapInstance !== "object") return;

  const proto = Object.getPrototypeOf(mapInstance) as {
    addLayer?: (layer: unknown, beforeId?: string) => unknown;
    __roomsharePatchedAddLayer?: boolean;
  } | null;

  if (
    !proto ||
    proto.__roomsharePatchedAddLayer ||
    typeof proto.addLayer !== "function"
  ) {
    return;
  }

  const originalAddLayer = proto.addLayer;
  proto.addLayer = function (layer: unknown, beforeId?: string) {
    const safeLayer = sanitizeLayerTextSizeExpression(layer);
    return originalAddLayer.call(this, safeLayer, beforeId);
  };
  proto.__roomsharePatchedAddLayer = true;
}

export default function MapComponent({
  listings,
  viewState: controlledViewState,
  defaultViewState,
  onViewStateChange,
  onMoveEnd: onMoveEndProp,
  selectedListingId: controlledSelectedId,
  onSelectedListingChange,
  selectionPresentation = "popup",
  disableAutoFit = false,
  suppressEmptyState = false,
}: MapComponentProps) {
  // --- Controlled vs Uncontrolled View State ---
  // When viewState prop is provided, map runs in controlled mode
  const isControlledViewState = controlledViewState !== undefined;
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  // --- Controlled vs Uncontrolled Selection ---
  // When selectedListingId prop is provided, selection is controlled by parent
  const isControlledSelection = controlledSelectedId !== undefined;
  const usesPopupSelection = selectionPresentation === "popup";
  const usesPreviewSelection = selectionPresentation === "preview";
  const usesOverlaySelection = usesPopupSelection || usesPreviewSelection;
  const [internalSelectedListingId, setInternalSelectedListingId] =
    useState<string | null>(null);
  const selectedListingId = isControlledSelection
    ? controlledSelectedId ?? null
    : internalSelectedListingId;

  // Computed selected listing - use controlled ID or internal state
  const selectedListing = useMemo(() => {
    return selectedListingId
      ? (listings.find((l) => l.id === selectedListingId) ?? null)
      : null;
  }, [listings, selectedListingId]);
  const listingDetailDateParams = useMemo(() => {
    const params = new URLSearchParams(searchParamsString);

    return {
      startDate: params.get("startDate"),
      moveInDate: params.get("moveInDate"),
      endDate: params.get("endDate"),
    };
  }, [searchParamsString]);
  const selectedListingHref = useMemo(() => {
    if (!selectedListing) return null;

    return buildListingDetailHref(selectedListing.id, listingDetailDateParams);
  }, [listingDetailDateParams, selectedListing]);
  const selectedAvailabilityPresentation = useMemo(
    () =>
      selectedListing
        ? getAvailabilityPresentation({
            availableSlots: selectedListing.availableSlots,
            totalSlots: selectedListing.totalSlots,
            publicAvailability: selectedListing.publicAvailability,
            groupContext: selectedListing.groupContext,
          })
        : null,
    [selectedListing]
  );

  // Unified setter for selected listing that respects controlled/uncontrolled mode
  const setSelectedListing = useCallback(
    (listing: Listing | null) => {
      if (isControlledSelection) {
        onSelectedListingChange?.(listing?.id ?? null);
      } else {
        setInternalSelectedListingId(listing?.id ?? null);
      }
    },
    [isControlledSelection, onSelectedListingChange]
  );
  const [unclusteredListings, setUnclusteredListings] = useState<Listing[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  // Scale map label text with OS/browser font-size (Dynamic Type support)
  const [textScale, setTextScale] = useState(1);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  // Suppress MapEmptyState during initialization — map data fetch lags behind list SSR
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [isWebglContextLost, setIsWebglContextLost] = useState(false);
  const [mapRemountKey, setMapRemountKey] = useState(0);
  const [currentZoom, setCurrentZoom] = useState(12);
  const [areTilesLoading, setAreTilesLoading] = useState(false);
  // M3-MAP FIX: Debounce tile loading state to avoid visual flash on brief pans
  const tileLoadingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchStatus, setShowSearchStatus] = useState(false);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [viewportInfoMessage, setViewportInfoMessage] = useState<string | null>(
    null
  );
  const isPhoneViewport = useMediaQuery(SEARCH_PHONE_MAX_QUERY);
  const isDesktopViewport = isPhoneViewport === false;
  const reducedMotion = useReducedMotion();
  const { hoveredId, activeId, setHovered, setActive, requestScrollTo } =
    useListingFocus();
  const { hideMap } = useSearchMapUI();
  // Keyboard navigation state for arrow key navigation between markers
  const [keyboardFocusedId, setKeyboardFocusedId] = useState<string | null>(
    null
  );
  const markerRefs = useRef<globalThis.Map<string, HTMLDivElement>>(
    new globalThis.Map()
  );
  const {
    mobileResultsView,
    setMobileMapOverlayActive,
    setMobileSheetOverrideLabel,
    setMobileResultsViewPreference,
  } = useMobileSearch();
  const transitionContext = useSearchTransitionSafe();
  const {
    activeCategories: activePOICategories,
    toggleCategory: togglePOICategory,
  } = usePOILayerState();
  const appliedPOICategories = activePOICategories;
  const {
    hasUserMoved,
    setHasUserMoved,
    setProgrammaticMove,
    isProgrammaticMoveRef,
  } = useMapBounds();

  const { setActivePanBounds } = useActivePanBoundsSetter();

  const mapRef = useRef<MapRef | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapPortalContainer, setMapPortalContainer] =
    useState<HTMLDivElement | null>(null);
  const [mapPaneSize, setMapPaneSize] = useState({ width: 0, height: 0 });
  const selectedPopupCardRef = useRef<HTMLDivElement | null>(null);
  const selectedPopupCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const popupFocusOriginRef = useRef<DesktopPopupFocusOrigin>(null);
  const [desktopPopupSize, setDesktopPopupSize] = useState<PopupSize>({
    width: DESKTOP_POPUP_FALLBACK_CARD_WIDTH_PX,
    height: DESKTOP_POPUP_FALLBACK_CARD_HEIGHT_PX,
  });
  const [popupPlacementRevision, setPopupPlacementRevision] = useState(0);
  const handledDesktopPopupCorrectionTokenRef = useRef<string | null>(null);
  const [showMobileToolsSheet, setShowMobileToolsSheet] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastSearchTimeRef = useRef<number>(0);
  const pendingBoundsRef = useRef<{
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  } | null>(null);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchSafetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchStatusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onMoveThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const hasCompletedInitialMobileViewportSyncRef = useRef(false);
  const hasPendingRealUserMoveRef = useRef(false);
  const hasPerformedInitialMobileResultsFitRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  // P2-FIX (#79): Ref to hold latest executeMapSearch to prevent stale closure in nested timeouts
  const executeMapSearchRef = useRef<
    | ((bounds: {
        minLng: number;
        maxLng: number;
        minLat: number;
        maxLat: number;
      }) => void)
    | null
  >(null);
  // Track pending search after zoom-out (user-initiated zoom that should trigger search)
  const pendingSearchAfterZoomRef = useRef(false);
  // Programmatic camera changes (marker focus, URL restore, cluster expand) can
  // emit one extra synthetic moveend after the main animation settles. Ignore
  // the follow-up event so it doesn't rewrite URL bounds or clear selection.
  const suppressNextSyntheticMoveEndRef = useRef(false);
  // Track last map center to detect resize-triggered moveEnd events (center barely moves)
  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  // P2-FIX (#154): Store numeric bounds for deduplication instead of string
  // String comparison with toFixed can have floating-point precision issues
  const lastSearchBoundsRef = useRef<{
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  } | null>(null);
  // P0 Issue #25: Track mount state to prevent stale callbacks updating state after unmount
  const isMountedRef = useRef(true);
  // Track map-initiated activeId to avoid re-triggering popup from card "Show on Map"
  const lastMapActiveRef = useRef<string | null>(null);
  // Guard the synthetic blank-map click that can follow a marker tap on phone
  // preview mode. Without this, the preview can dismiss immediately.
  const ignoreNextPreviewBackgroundClickRef = useRef(false);
  const previewBackgroundClickGuardTimeoutRef = useRef<NodeJS.Timeout | null>(
    null
  );
  const clearPreviewBackgroundClickGuard = useCallback(() => {
    ignoreNextPreviewBackgroundClickRef.current = false;
    if (previewBackgroundClickGuardTimeoutRef.current) {
      clearTimeout(previewBackgroundClickGuardTimeoutRef.current);
      previewBackgroundClickGuardTimeoutRef.current = null;
    }
  }, []);
  const armPreviewBackgroundClickGuard = useCallback(() => {
    if (!usesPreviewSelection) return;

    clearPreviewBackgroundClickGuard();
    ignoreNextPreviewBackgroundClickRef.current = true;
    previewBackgroundClickGuardTimeoutRef.current = setTimeout(() => {
      ignoreNextPreviewBackgroundClickRef.current = false;
      previewBackgroundClickGuardTimeoutRef.current = null;
    }, 250);
  }, [clearPreviewBackgroundClickGuard, usesPreviewSelection]);
  const captureDesktopPopupMarkerOrigin = useCallback((listingId: string) => {
    popupFocusOriginRef.current = {
      type: "marker",
      listingId,
    };
  }, []);
  const captureDesktopPopupListOrigin = useCallback((listingId: string) => {
    if (typeof document === "undefined") {
      popupFocusOriginRef.current = {
        type: "list",
        listingId,
        element: null,
      };
      return;
    }

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const trigger = activeElement?.closest(
      `[data-show-on-map-id="${listingId}"]`
    );

    popupFocusOriginRef.current = {
      type: "list",
      listingId,
      element: trigger instanceof HTMLElement ? trigger : null,
    };
  }, []);
  const restoreDesktopPopupOriginFocus = useCallback(() => {
    const origin = popupFocusOriginRef.current;
    popupFocusOriginRef.current = null;
    if (!origin) return;

    if (origin.type === "list" && origin.element?.isConnected) {
      origin.element.focus();
      return;
    }

    const markerEl = markerRefs.current.get(origin.listingId);
    markerEl?.focus();
  }, []);
  const dismissPreviewSelection = useCallback(() => {
    if (!usesPreviewSelection) return;
    clearPreviewBackgroundClickGuard();
    lastMapActiveRef.current = null;
    setSelectedListing(null);
    setActive(null);
  }, [
    clearPreviewBackgroundClickGuard,
    usesPreviewSelection,
    setSelectedListing,
    setActive,
  ]);
  const dismissDesktopPopupSelection = useCallback(
    ({ restoreFocus = false }: { restoreFocus?: boolean } = {}) => {
      if (!usesPopupSelection) return;
      lastMapActiveRef.current = null;
      setSelectedListing(null);
      setActive(null);

      if (restoreFocus) {
        setTimeout(() => {
          if (!isMountedRef.current) return;
          restoreDesktopPopupOriginFocus();
        }, 0);
      } else {
        popupFocusOriginRef.current = null;
      }
    },
    [
      usesPopupSelection,
      setSelectedListing,
      setActive,
      restoreDesktopPopupOriginFocus,
    ]
  );
  const handleSelectedListingClose = useCallback((restoreFocus = true) => {
    if (usesPreviewSelection) {
      dismissPreviewSelection();
      return;
    }
    dismissDesktopPopupSelection({ restoreFocus });
  }, [usesPreviewSelection, dismissPreviewSelection, dismissDesktopPopupSelection]);
  // Safety timeout: clear programmatic move flag if moveEnd doesn't fire
  const programmaticClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Auto-zoom: fire once per search context when results are empty and no filters active
  const hasAutoZoomedRef = useRef(false);
  // Ref for sourcedata handler cleanup
  const sourcedataHandlerRef = useRef<((e: MapSourceDataEvent) => void) | null>(
    null
  );
  const webglCleanupRef = useRef<(() => void) | null>(null);
  const webglRecoveryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Guard against rapid cluster clicks causing multiple simultaneous flyTo calls
  const isClusterExpandingRef = useRef(false);
  // Debounce timer for updateUnclusteredListings to batch rapid moveEnd events
  const updateUnclusteredDebounceRef = useRef<NodeJS.Timeout | null>(null);
  // Debounce timer for sourcedata handler to avoid dozens of calls per second during panning
  const sourcedataDebounceRef = useRef<NodeJS.Timeout | null>(null);
  // Debounce timer for marker hover scroll (300ms delay to prevent jank)
  const hoverScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      clearPreviewBackgroundClickGuard();
    };
  }, [clearPreviewBackgroundClickGuard]);

  // Map-move auto-search tuning:
  // - Reduced from 400ms to 50ms to instantly update list after drag
  //   due to new proactive map marker fetching.
  // - 800ms minimum interval allows more responsive intentional panning
  const MAP_MOVE_SEARCH_DEBOUNCE_MS = 50;
  const MIN_SEARCH_INTERVAL_MS = 800;

  // E2E testing instrumentation - track map instance for persistence tests
  // Only runs when NEXT_PUBLIC_E2E=true to avoid polluting production
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E === "true") {
      // Namespace to avoid global collisions
      const roomshare = ((window as unknown as Record<string, unknown>)
        .__roomshare || {}) as Record<string, unknown>;
      (window as unknown as Record<string, unknown>).__roomshare = roomshare;

      // Only set mapInstanceId once on mount (persists across re-renders)
      if (!roomshare.mapInstanceId) {
        roomshare.mapInstanceId = crypto.randomUUID();
      }

      // Increment init count each time component mounts
      roomshare.mapInitCount = ((roomshare.mapInitCount as number) || 0) + 1;
    }
  }, []); // Empty deps = only on mount

  // Mark map as initialized after data has had time to arrive.
  // Prevents "No listings" flash while map fetch catches up to list SSR.
  useEffect(() => {
    if (listings.length > 0) {
      setIsMapInitialized(true);
      return;
    }
    const timer = setTimeout(() => setIsMapInitialized(true), 1500);
    return () => clearTimeout(timer);
  }, [listings.length]);

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();

    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Detect OS/browser font-size scale for map label Dynamic Type support
  useEffect(() => {
    const update = () => {
      const rootFontSize = parseFloat(
        getComputedStyle(document.documentElement).fontSize
      );
      setTextScale(rootFontSize / 16);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const scaledClusterCountLayer = useMemo(
    () => getClusterCountLayer(textScale),
    [textScale]
  );
  const scaledClusterCountLayerDark = useMemo(
    () => getClusterCountLayerDark(textScale),
    [textScale]
  );

  // Always enable clustering — Mapbox handles any count gracefully.
  // With few listings clusters simply won't form and individual markers show.
  const useClustering = true;

  // Convert listings to GeoJSON for Mapbox clustering
  const geojsonData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: listings.map((listing) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [
            normalizeMapNumber(listing.location.lng),
            normalizeMapNumber(listing.location.lat),
          ],
        },
        properties: {
          id: listing.id,
          title: listing.title,
          price: normalizeMapNumber(listing.price),
          availableSlots: normalizeMapNumber(listing.availableSlots),
          publicAvailabilityJson: listing.publicAvailability
            ? JSON.stringify(listing.publicAvailability)
            : undefined,
          groupContextJson: listing.groupContext
            ? JSON.stringify(listing.groupContext)
            : undefined,
          images: JSON.stringify(listing.images || []),
          lat: normalizeMapNumber(listing.location.lat),
          lng: normalizeMapNumber(listing.location.lng),
          // P3a: Include tier for differentiated pin styling (primary = larger, mini = smaller)
          tier: listing.tier,
        },
      })),
    }),
    [listings]
  );

  // Avoid JSON.parse on every map move by reusing listing images keyed by listing id.
  const imagesByListingId = useMemo(() => {
    const imageLookup = new globalThis.Map<string, string[]>();
    for (const listing of listings) {
      imageLookup.set(
        listing.id,
        Array.isArray(listing.images) ? listing.images : []
      );
    }
    return imageLookup;
  }, [listings]);

  // Handle cluster click to zoom in and expand
  const onClusterClick = useCallback(
    async (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || !mapRef.current) return;

      // Guard: skip if already expanding a cluster to prevent multiple simultaneous flyTo calls
      if (isClusterExpandingRef.current) return;

      const clusterId = feature.properties?.cluster_id;
      if (!clusterId) return;

      const mapboxSource = mapRef.current.getSource("listings") as
        | GeoJSONSource
        | undefined;
      if (!mapboxSource) return;

      try {
        const zoom = await mapboxSource.getClusterExpansionZoom(clusterId);
        if (!feature.geometry || feature.geometry.type !== "Point") return;
        // P0 Issue #25: Guard against stale callback after unmount
        if (!isMountedRef.current) return;

        // Mark as programmatic move to prevent follow-up auto-search from firing.
        setProgrammaticMove(true);
        isClusterExpandingRef.current = true;
        pendingSearchAfterZoomRef.current = true;
        // P1-FIX (#109): Safety timeout to clear BOTH flags if moveEnd/onIdle don't fire.
        // This prevents isClusterExpandingRef from getting stuck if animation is interrupted.
        if (programmaticClearTimeoutRef.current)
          clearTimeout(programmaticClearTimeoutRef.current);
        programmaticClearTimeoutRef.current = setTimeout(() => {
          if (isProgrammaticMoveRef.current) {
            setProgrammaticMove(false);
          }
          // P1-FIX (#109): Also clear cluster expansion flag on timeout
          if (isClusterExpandingRef.current) {
            isClusterExpandingRef.current = false;
          }
        }, PROGRAMMATIC_MOVE_TIMEOUT_MS);
        mapRef.current?.flyTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: zoom,
          duration: 700,
          padding: { top: 50, bottom: 50, left: 50, right: 50 },
        });
      } catch (error) {
        // P1-FIX (#109): Clear cluster expansion flag on error to prevent stuck state
        isClusterExpandingRef.current = false;
        console.warn("Cluster expansion failed", error);
      }
    },
    [setProgrammaticMove, isProgrammaticMoveRef]
  );

  // Update unclustered listings when map moves (for rendering individual markers)
  // H6 FIX: Returns count for success guard pattern in retry logic
  const updateUnclusteredListings = useCallback((): number => {
    if (!mapRef.current || !useClustering) return 0;

    const map = mapRef.current.getMap();
    if (!map || !map.getSource("listings")) return 0;

    // Query for unclustered points (points without cluster)
    const features = map.querySourceFeatures("listings", {
      filter: ["!", ["has", "point_count"]],
    });

    const unclustered = features
      .map((f) => {
        const properties = (f.properties ??
          {}) as Partial<ClusterFeatureProperties>;
        const listingId = properties.id ?? "";
        const images =
          imagesByListingId.get(listingId) ??
          parseFeatureImages(properties.images);
        return {
          id: listingId,
          title: properties.title ?? "",
          price: Number(properties.price) || 0,
          availableSlots: Number(properties.availableSlots) || 0,
          publicAvailability: parseFeatureAvailability(
            properties.publicAvailabilityJson
          ),
          groupContext: parseFeatureGroupContext(properties.groupContextJson),
          totalSlots: parseFeatureAvailability(properties.publicAvailabilityJson)
            ?.totalSlots,
          images,
          location: {
            lat: Number(properties.lat) || 0,
            lng: Number(properties.lng) || 0,
          },
          tier: properties.tier,
        } satisfies Listing;
      })
      .filter((listing) => listing.id.length > 0);

    // Deduplicate by id
    const seen = new Set<string>();
    const unique = unclustered.filter((l: Listing) => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });

    // P0 Issue #25: Guard against state update after unmount
    if (!isMountedRef.current) return 0;

    // CLUSTER FIX: Skip setting empty state during cluster expansion
    // querySourceFeatures returns [] before tiles load after flyTo
    // Only allow empty state if NOT expanding (normal pan/zoom to empty area)
    if (unique.length === 0 && isClusterExpandingRef.current) {
      return 0; // Tiles not loaded yet, retry will happen on onIdle
    }

    setUnclusteredListings(unique);
    return unique.length;
  }, [imagesByListingId, useClustering]);

  // Defense-in-depth: retry updateUnclusteredListings when listings exist
  // but unclustered is empty (source tiles may not be ready yet)
  useEffect(() => {
    if (!isMapLoaded || !useClustering || listings.length === 0) return;
    if (unclusteredListings.length > 0) return;

    // H6 FIX: Success guard pattern — stop retries once markers are found.
    // Previous approach fired all 4 timeouts unconditionally; now each
    // retry checks the return count and cancels remaining on success.
    const retryDelays = [200, 500, 1000, 2000];
    const timeouts: NodeJS.Timeout[] = [];
    let cancelled = false;

    for (const delay of retryDelays) {
      timeouts.push(
        setTimeout(() => {
          if (cancelled || !isMountedRef.current) return;
          const count = updateUnclusteredListings();
          if (count > 0) {
            // Success — cancel remaining retries
            cancelled = true;
            timeouts.forEach(clearTimeout);
          }
        }, delay)
      );
    }

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [
    isMapLoaded,
    useClustering,
    listings.length,
    unclusteredListings.length,
    updateUnclusteredListings,
  ]);

  // Refresh markers when listings data changes after map-driven searches.
  useEffect(() => {
    if (!isMapLoaded || !useClustering || listings.length === 0) return;

    const timeout = setTimeout(() => {
      if (isMountedRef.current) {
        updateUnclusteredListings();
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [isMapLoaded, useClustering, listings, updateUnclusteredListings]);

  // Add small offsets to markers that share the same coordinates
  // When clustering, use unclustered listings; otherwise use all listings
  const markersSource = useClustering ? unclusteredListings : listings;

  // Build a stable marker signature so grouping recalculates only when the
  // rendered marker payload changes, not when parent arrays are recreated.
  const markersSourceSignature = useMemo(() => {
    return markersSource
      .map((listing) => {
        const availabilityPresentation = getAvailabilityPresentation({
          availableSlots: listing.availableSlots,
          totalSlots: listing.totalSlots,
          publicAvailability: listing.publicAvailability,
          groupContext: listing.groupContext,
        });

        return [
          listing.id,
          listing.title.trim(),
          listing.price,
          availabilityPresentation.presentationKey,
          listing.location.lat,
          listing.location.lng,
          listing.tier ?? "",
        ].join(":");
      })
      .sort()
      .join(",");
  }, [markersSource]);

  const groupedMarkers = useMemo(() => {
    return groupExactMapListingClones(markersSource);
    // markersSourceSignature controls recomputation while the closure reads the latest source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersSourceSignature]);

  const markerPositions = useMemo(() => {
    const source = groupedMarkers;
    const positions: MarkerPosition[] = [];
    const coordsCounts: Record<string, number> = {};

    // First pass: count how many listings share each coordinate
    source.forEach((group) => {
      const key = `${group.listing.location.lat},${group.listing.location.lng}`;
      coordsCounts[key] = (coordsCounts[key] || 0) + 1;
    });

    // Second pass: add offsets for overlapping markers
    const coordsIndices: Record<string, number> = {};

    source.forEach((group) => {
      const listing = group.listing;
      const key = `${listing.location.lat},${listing.location.lng}`;
      const count = coordsCounts[key] || 1;

      if (count === 1) {
        // No overlap, use original coordinates
        positions.push({
          listing,
          memberIds: group.memberIds,
          lat: listing.location.lat,
          lng: listing.location.lng,
        });
      } else {
        // Multiple markers at same location - add small offset
        const index = coordsIndices[key] || 0;
        coordsIndices[key] = index + 1;

        // Calculate offset in a circular pattern around the original point
        const angle = (index / count) * 2 * Math.PI;
        const offsetDistance = 0.0015; // ~150 meters offset

        const latOffset = Math.cos(angle) * offsetDistance;
        // L4-MAP FIX: Scale longitude offset by latitude to account for
        // meridian convergence at higher latitudes
        const lat = listing.location.lat;
        const lngOffset =
          (Math.sin(angle) * offsetDistance) / Math.cos((lat * Math.PI) / 180);

        positions.push({
          listing,
          memberIds: group.memberIds,
          lat: listing.location.lat + latOffset,
          lng: listing.location.lng + lngOffset,
        });
      }
    });

    return positions;
    // Depend on the grouped marker signature instead of array reference churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersSourceSignature]);

  // CRIT-2 FIX: Synchronous ref for stable callback access to latest positions.
  // Synchronous assignment (not useEffect) avoids timing issues between render and effect.
  const markerPositionsRef = useRef(markerPositions);
  markerPositionsRef.current = markerPositions;

  const markerPositionById = useMemo(() => {
    const map = new globalThis.Map<string, MarkerPosition>();
    markerPositions.forEach((position) => {
      position.memberIds.forEach((memberId) => {
        map.set(memberId, position);
      });
    });
    return map;
  }, [markerPositions]);

  // O(1) lookup Set for ClusterHighlightMarker — includes alias IDs for clone groups.
  const markerPositionIds = useMemo(
    () => new Set(markerPositions.flatMap((position) => position.memberIds)),
    [markerPositions]
  );

  // Render privacy circles from the same displayed marker positions to avoid
  // translucent "ghost clusters" when clustered/overlapping raw points split visually.
  const privacyCircleListings = useMemo(() => {
    return markerPositions.map((position) => ({
      id: position.listing.id,
      location: {
        lat: position.lat,
        lng: position.lng,
      },
    }));
  }, [markerPositions]);

  // Sorted marker positions for keyboard navigation (top-to-bottom, left-to-right)
  // This provides intuitive arrow key navigation order based on visual position
  const sortedMarkerPositions = useMemo(() => {
    return [...markerPositions].sort((a, b) => {
      // Sort by latitude (descending - north to south) first, then longitude (ascending - west to east)
      const latDiff = b.lat - a.lat;
      if (Math.abs(latDiff) > 0.001) return latDiff; // ~100m threshold for "same row"
      return a.lng - b.lng;
    });
  }, [markerPositions]);

  // Find marker index in sorted list
  const findMarkerIndex = useCallback(
    (id: string | null): number => {
      if (!id) return -1;
      return sortedMarkerPositions.findIndex((p) => p.memberIds.includes(id));
    },
    [sortedMarkerPositions]
  );

  // Keyboard navigation handler for arrow keys
  const handleMarkerKeyboardNavigation = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>, currentListingId: string) => {
      const currentIndex = findMarkerIndex(currentListingId);
      if (currentIndex === -1 || sortedMarkerPositions.length === 0) return;

      let nextIndex: number | null = null;
      const currentPos = sortedMarkerPositions[currentIndex];

      switch (e.key) {
        case "ArrowUp": {
          // Find the nearest marker above (higher latitude)
          let bestIndex = -1;
          let bestDistance = Infinity;
          for (let i = 0; i < sortedMarkerPositions.length; i++) {
            if (i === currentIndex) continue;
            const pos = sortedMarkerPositions[i];
            if (pos.lat > currentPos.lat) {
              const distance = Math.sqrt(
                Math.pow(pos.lat - currentPos.lat, 2) +
                  Math.pow(pos.lng - currentPos.lng, 2)
              );
              if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
              }
            }
          }
          if (bestIndex !== -1) nextIndex = bestIndex;
          break;
        }
        case "ArrowDown": {
          // Find the nearest marker below (lower latitude)
          let bestIndex = -1;
          let bestDistance = Infinity;
          for (let i = 0; i < sortedMarkerPositions.length; i++) {
            if (i === currentIndex) continue;
            const pos = sortedMarkerPositions[i];
            if (pos.lat < currentPos.lat) {
              const distance = Math.sqrt(
                Math.pow(pos.lat - currentPos.lat, 2) +
                  Math.pow(pos.lng - currentPos.lng, 2)
              );
              if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
              }
            }
          }
          if (bestIndex !== -1) nextIndex = bestIndex;
          break;
        }
        case "ArrowLeft": {
          // Find the nearest marker to the left (lower longitude)
          let bestIndex = -1;
          let bestDistance = Infinity;
          for (let i = 0; i < sortedMarkerPositions.length; i++) {
            if (i === currentIndex) continue;
            const pos = sortedMarkerPositions[i];
            if (pos.lng < currentPos.lng) {
              const distance = Math.sqrt(
                Math.pow(pos.lat - currentPos.lat, 2) +
                  Math.pow(pos.lng - currentPos.lng, 2)
              );
              if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
              }
            }
          }
          if (bestIndex !== -1) nextIndex = bestIndex;
          break;
        }
        case "ArrowRight": {
          // Find the nearest marker to the right (higher longitude)
          let bestIndex = -1;
          let bestDistance = Infinity;
          for (let i = 0; i < sortedMarkerPositions.length; i++) {
            if (i === currentIndex) continue;
            const pos = sortedMarkerPositions[i];
            if (pos.lng > currentPos.lng) {
              const distance = Math.sqrt(
                Math.pow(pos.lat - currentPos.lat, 2) +
                  Math.pow(pos.lng - currentPos.lng, 2)
              );
              if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
              }
            }
          }
          if (bestIndex !== -1) nextIndex = bestIndex;
          break;
        }
        case "Home": {
          // Jump to first marker
          if (sortedMarkerPositions.length > 0) {
            nextIndex = 0;
          }
          break;
        }
        case "End": {
          // Jump to last marker
          if (sortedMarkerPositions.length > 0) {
            nextIndex = sortedMarkerPositions.length - 1;
          }
          break;
        }
        default:
          return; // Don't prevent default for other keys
      }

      if (nextIndex !== null && nextIndex !== currentIndex) {
        e.preventDefault();
        e.stopPropagation();
        const nextMarker = sortedMarkerPositions[nextIndex];
        const nextId = nextMarker.listing.id;

        // Update keyboard focus state
        setKeyboardFocusedId(nextId);

        // Focus the marker element
        const markerEl = markerRefs.current.get(nextId);
        if (markerEl) {
          markerEl.focus();
        }

        // Pan map to show the focused marker
        if (mapRef.current) {
          mapRef.current.easeTo({
            center: [nextMarker.lng, nextMarker.lat],
            duration: 300,
          });
        }
      }
    },
    [findMarkerIndex, sortedMarkerPositions]
  );

  // Clear keyboard focus when clicking elsewhere or when markers change
  useEffect(() => {
    if (keyboardFocusedId && !markerPositionById.has(keyboardFocusedId)) {
      setKeyboardFocusedId(null);
    }
  }, [keyboardFocusedId, markerPositionById]);

  // Stabilize initial view state so it's only computed once on mount.
  // Prevents SF default from being re-applied when listings temporarily become empty.
  // In controlled mode, this is used as the starting point before parent provides viewState.

  const initialViewState = useMemo(
    () =>
      (() => {
        // Use defaultViewState prop if provided (uncontrolled with custom initial)
        if (defaultViewState) {
          return defaultViewState;
        }

        const minLat = searchParams.get("minLat");
        const maxLat = searchParams.get("maxLat");
        const minLng = searchParams.get("minLng");
        const maxLng = searchParams.get("maxLng");

        if (minLat && maxLat && minLng && maxLng) {
          const parsedMinLat = parseFloat(minLat);
          const parsedMaxLat = parseFloat(maxLat);
          const parsedMinLng = parseFloat(minLng);
          const parsedMaxLng = parseFloat(maxLng);

          if (
            Number.isFinite(parsedMinLat) &&
            Number.isFinite(parsedMaxLat) &&
            Number.isFinite(parsedMinLng) &&
            Number.isFinite(parsedMaxLng)
          ) {
            const centerLat = (parsedMinLat + parsedMaxLat) / 2;
            let centerLng: number;

            if (parsedMinLng > parsedMaxLng) {
              const wrappedMaxLng = parsedMaxLng + 360;
              centerLng = (parsedMinLng + wrappedMaxLng) / 2;
              if (centerLng > 180) centerLng -= 360;
            } else {
              centerLng = (parsedMinLng + parsedMaxLng) / 2;
            }

            return { longitude: centerLng, latitude: centerLat, zoom: 12 };
          }
        }

        // Fallback: use point coordinates from URL (e.g. homepage → search navigation)
        const lat = searchParams.get("lat");
        const lng = searchParams.get("lng");
        if (lat && lng) {
          const parsedLat = parseFloat(lat);
          const parsedLng = parseFloat(lng);
          if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
            return { longitude: parsedLng, latitude: parsedLat, zoom: 13 };
          }
        }

        return listings.length > 0
          ? {
              longitude: listings[0].location.lng,
              latitude: listings[0].location.lat,
              zoom: 12,
            }
          : { longitude: -122.4194, latitude: 37.7749, zoom: 12 };
      })(),
    // M1-MAP: `listings` intentionally excluded — initialViewState must be stable after mount.
    // The listings fallback (SF default) only applies when there are no URL bounds on mount.
    // Adding listings to deps would re-center the map on every search result change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultViewState]
  );

  // Mobile-aware fitBounds padding: on phone viewports the collapsed bottom
  // sheet still obscures the lower edge of the map, so we add bottom padding
  // to keep markers visible above the compact strip.
  const fitBoundsPadding = useMemo(() => {
    if (isPhoneViewport) {
      const bottomSheetPx = Math.round(
        SNAP_COLLAPSED *
          (typeof window !== "undefined" ? window.innerHeight : 800)
      );
      return { top: 50, bottom: bottomSheetPx + 60, left: 50, right: 50 };
    }
    return { top: 50, bottom: 50, left: 50, right: 50 };
  }, [isPhoneViewport]);

  const clusterConfig = useMemo(
    () =>
      isPhoneViewport === true
        ? { maxZoom: 10, radius: 32 }
        : { maxZoom: 14, radius: 50 },
    [isPhoneViewport]
  );

  useEffect(() => {
    if (!usesPopupSelection || isPhoneViewport === true || !selectedListing) {
      return;
    }

    const popupCard = selectedPopupCardRef.current;
    if (!popupCard) return;

    const updatePopupSize = () => {
      const rect = popupCard.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      setDesktopPopupSize((current) => {
        const nextWidth = Math.round(rect.width);
        const nextHeight = Math.round(rect.height);
        if (
          current.width === nextWidth &&
          current.height === nextHeight
        ) {
          return current;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    updatePopupSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updatePopupSize();
    });

    observer.observe(popupCard);
    return () => observer.disconnect();
  }, [usesPopupSelection, isPhoneViewport, selectedListing?.id]);

  const getDesktopPopupAvoidRects = useCallback((): LocalRect[] => {
    const container = mapContainerRef.current;
    if (!container) return [];

    const containerRect = container.getBoundingClientRect();

    return Array.from(
      container.querySelectorAll<HTMLElement>("[data-map-avoid]")
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        return createLocalRect({
          left: rect.left - containerRect.left,
          top: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height,
        });
      })
      .filter((rect): rect is LocalRect => rect !== null);
  }, []);

  const getDesktopPopupPlacementForListing = useCallback(
    (listing: Listing): DesktopPopupPlacement | null => {
      const mapInstance = mapRef.current?.getMap();
      const container = mapContainerRef.current;
      if (!mapInstance || !container) return null;

      const paneWidth =
        mapPaneSize.width ||
        container.clientWidth ||
        container.getBoundingClientRect().width;
      const paneHeight =
        mapPaneSize.height ||
        container.clientHeight ||
        container.getBoundingClientRect().height;

      if (paneWidth <= 0 || paneHeight <= 0) {
        return null;
      }

      const projectedPoint = mapInstance.project([
        listing.location.lng,
        listing.location.lat,
      ]);

      const point = {
        x: projectedPoint.x,
        y: projectedPoint.y,
      };
      const safeRect = createLocalRect({
        left: DESKTOP_POPUP_SAFE_AREA.left,
        top: DESKTOP_POPUP_SAFE_AREA.top,
        width:
          paneWidth -
          DESKTOP_POPUP_SAFE_AREA.left -
          DESKTOP_POPUP_SAFE_AREA.right,
        height:
          paneHeight -
          DESKTOP_POPUP_SAFE_AREA.top -
          DESKTOP_POPUP_SAFE_AREA.bottom,
      });
      const avoidRects = getDesktopPopupAvoidRects();

      let bestPlacement: DesktopPopupPlacement | null = null;

      for (const [priorityIndex, anchor] of DESKTOP_POPUP_ANCHOR_PRIORITY.entries()) {
        const popupRect = getDesktopPopupRectForAnchor(
          anchor,
          point,
          desktopPopupSize
        );
        const overflowScore = getRectOverflowScore(popupRect, safeRect);
        const overlapScore = avoidRects.reduce(
          (total, avoidRect) => total + getRectIntersectionArea(popupRect, avoidRect),
          0
        );
        const { deltaX, deltaY } = getPopupAdjustmentDelta(
          popupRect,
          safeRect,
          avoidRects
        );
        const requiresCameraShift =
          Math.abs(deltaX) > POPUP_CONTAINMENT_TOLERANCE_PX ||
          Math.abs(deltaY) > POPUP_CONTAINMENT_TOLERANCE_PX;
        const candidate: DesktopPopupPlacement = {
          anchor,
          popupRect,
          overflowScore,
          overlapScore,
          requiresCameraShift,
          deltaX,
          deltaY,
        };

        const candidateScore =
          overflowScore * 1_000_000 + overlapScore * 1_000 + priorityIndex;
        const bestScore =
          bestPlacement === null
            ? Number.POSITIVE_INFINITY
            : bestPlacement.overflowScore * 1_000_000 +
              bestPlacement.overlapScore * 1_000 +
              DESKTOP_POPUP_ANCHOR_PRIORITY.indexOf(bestPlacement.anchor);

        if (candidateScore < bestScore) {
          bestPlacement = candidate;
        }
      }

      return bestPlacement;
    },
    [
      desktopPopupSize,
      getDesktopPopupAvoidRects,
      mapPaneSize.height,
      mapPaneSize.width,
    ]
  );

  const desktopPopupPlacement = useMemo(() => {
    if (!usesPopupSelection || isPhoneViewport === true || !selectedListing) {
      return null;
    }

    return getDesktopPopupPlacementForListing(selectedListing);
  }, [
    usesPopupSelection,
    isPhoneViewport,
    selectedListing,
    getDesktopPopupPlacementForListing,
    popupPlacementRevision,
  ]);

  const desktopPopupCorrectionToken = useMemo(() => {
    if (!usesPopupSelection || isPhoneViewport === true || !selectedListing) {
      return null;
    }

    return `${selectedListing.id}:${mapPaneSize.width}:${mapPaneSize.height}:${desktopPopupSize.width}:${desktopPopupSize.height}:${isFullscreen ? "1" : "0"}:${popupPlacementRevision}`;
  }, [
    usesPopupSelection,
    isPhoneViewport,
    selectedListing,
    mapPaneSize.width,
    mapPaneSize.height,
    desktopPopupSize.width,
    desktopPopupSize.height,
    isFullscreen,
    popupPlacementRevision,
  ]);

  useEffect(() => {
    if (!desktopPopupCorrectionToken) {
      handledDesktopPopupCorrectionTokenRef.current = null;
      return;
    }

    if (
      handledDesktopPopupCorrectionTokenRef.current ===
      desktopPopupCorrectionToken
    ) {
      return;
    }

    if (!desktopPopupPlacement) {
      return;
    }

    if (isProgrammaticMoveRef.current) {
      return;
    }

    if (!desktopPopupPlacement.requiresCameraShift) {
      handledDesktopPopupCorrectionTokenRef.current =
        desktopPopupCorrectionToken;
      return;
    }

    const mapInstance = mapRef.current?.getMap();
    const container = mapContainerRef.current;
    if (!mapInstance || !container) {
      return;
    }

    const containerWidth =
      container.clientWidth || container.getBoundingClientRect().width;
    const containerHeight =
      container.clientHeight || container.getBoundingClientRect().height;
    const nextCenter = mapInstance.unproject([
      containerWidth / 2 - desktopPopupPlacement.deltaX,
      containerHeight / 2 - desktopPopupPlacement.deltaY,
    ]);

    handledDesktopPopupCorrectionTokenRef.current = desktopPopupCorrectionToken;
    setProgrammaticMove(true);
    if (programmaticClearTimeoutRef.current) {
      clearTimeout(programmaticClearTimeoutRef.current);
    }
    programmaticClearTimeoutRef.current = setTimeout(() => {
      if (isProgrammaticMoveRef.current) {
        setProgrammaticMove(false);
      }
    }, PROGRAMMATIC_MOVE_TIMEOUT_MS);

    mapInstance.easeTo({
      center: [nextCenter.lng, nextCenter.lat],
      duration: reducedMotion ? 0 : DESKTOP_POPUP_CORRECTION_ANIMATION_MS,
    });
  }, [
    desktopPopupCorrectionToken,
    desktopPopupPlacement,
    reducedMotion,
    setProgrammaticMove,
    isProgrammaticMoveRef,
  ]);

  useEffect(() => {
    if (!usesPopupSelection || isPhoneViewport === true || !selectedListing) {
      return;
    }

    const focusTimeout = setTimeout(() => {
      selectedPopupCloseButtonRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => clearTimeout(focusTimeout);
  }, [usesPopupSelection, isPhoneViewport, selectedListing?.id]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const updateFullscreenState = () => {
      const container = mapContainerRef.current;
      setIsFullscreen(document.fullscreenElement === container);
      setCanFullscreen(Boolean(container?.requestFullscreen));
    };

    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
    };
  }, []);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    setMapPortalContainer(container);

    const updatePaneSize = () => {
      setMapPaneSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updatePaneSize();

    if (typeof ResizeObserver === "undefined") {
      if (typeof window === "undefined") return;
      window.addEventListener("resize", updatePaneSize);
      return () => {
        window.removeEventListener("resize", updatePaneSize);
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextWidth = entry?.contentRect?.width ?? container.clientWidth;
      const nextHeight = entry?.contentRect?.height ?? container.clientHeight;

      setMapPaneSize({
        width: nextWidth,
        height: nextHeight,
      });
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const resizeTimer = window.setTimeout(() => {
      const mapInstance = mapRef.current?.getMap?.() ?? mapRef.current;
      mapInstance?.resize?.();
    }, 150);

    return () => window.clearTimeout(resizeTimer);
  }, [isFullscreen]);

  const handleFitAllResults = useCallback(() => {
    if (!mapRef.current || listings.length === 0) return;
    const points = listings.map((l) => ({
      lng: l.location.lng,
      lat: l.location.lat,
    }));
    const minLng = Math.min(...points.map((p) => p.lng));
    const maxLng = Math.max(...points.map((p) => p.lng));
    const minLat = Math.min(...points.map((p) => p.lat));
    const maxLat = Math.max(...points.map((p) => p.lat));
    setProgrammaticMove(true);
    if (programmaticClearTimeoutRef.current) {
      clearTimeout(programmaticClearTimeoutRef.current);
    }
    programmaticClearTimeoutRef.current = setTimeout(() => {
      if (isProgrammaticMoveRef.current) setProgrammaticMove(false);
    }, PROGRAMMATIC_MOVE_TIMEOUT_MS);
    mapRef.current.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: fitBoundsPadding, duration: 1000 }
    );
  }, [
    fitBoundsPadding,
    isProgrammaticMoveRef,
    listings,
    setProgrammaticMove,
  ]);

  useEffect(() => {
    if (isPhoneViewport !== true || !isMapLoaded || listings.length === 0) {
      return;
    }
    if (hasPerformedInitialMobileResultsFitRef.current || hasUserMoved) {
      return;
    }

    hasPerformedInitialMobileResultsFitRef.current = true;
    hasCompletedInitialMobileViewportSyncRef.current = false;
    hasPendingRealUserMoveRef.current = false;
    handleFitAllResults();
  }, [
    handleFitAllResults,
    hasUserMoved,
    isMapLoaded,
    isPhoneViewport,
    listings.length,
  ]);

  const handleToggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;

    const container = mapContainerRef.current;
    if (!container?.requestFullscreen) return;

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
        return;
      }

      await container.requestFullscreen();
    } catch {
      // Ignore fullscreen API failures and leave the inline layout intact.
    }
  }, []);

  const handleHideMap = useCallback(async () => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore fullscreen API failures and continue hiding the inline map.
      }
    }

    setIsSearching(false);
    setShowMobileToolsSheet(false);
    hideMap();
  }, [hideMap]);

  // Auto-zoom-out: when map loads empty with no active filters, zoom out once
  // Build a key from non-bounds params so we reset per search context
  const nonBoundsParamsKey = useMemo(() => {
    const keys = ["q", ...FILTER_PARAM_KEYS];
    return keys
      .map((k) => `${k}=${searchParams.getAll(k).sort().join(",")}`)
      .join("&");
  }, [searchParams]);

  // Reset auto-zoom flag when search context (non-bounds filters) changes
  useEffect(() => {
    hasAutoZoomedRef.current = false;
  }, [nonBoundsParamsKey]);

  const handleZoomOut = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map) return;
    const currentZoom = map.getZoom();
    pendingSearchAfterZoomRef.current = true;
    setProgrammaticMove(true);
    if (programmaticClearTimeoutRef.current)
      clearTimeout(programmaticClearTimeoutRef.current);
    programmaticClearTimeoutRef.current = setTimeout(() => {
      if (isProgrammaticMoveRef.current) setProgrammaticMove(false);
    }, PROGRAMMATIC_MOVE_TIMEOUT_MS);
    mapRef.current.flyTo({ zoom: Math.max(currentZoom - 2, 1), duration: 800 });
  }, [setProgrammaticMove, isProgrammaticMoveRef]);

  const handleZoomIn = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map) return;
    const currentZoom = map.getZoom();
    pendingSearchAfterZoomRef.current = true;
    setProgrammaticMove(true);
    if (programmaticClearTimeoutRef.current)
      clearTimeout(programmaticClearTimeoutRef.current);
    programmaticClearTimeoutRef.current = setTimeout(() => {
      if (isProgrammaticMoveRef.current) setProgrammaticMove(false);
    }, PROGRAMMATIC_MOVE_TIMEOUT_MS);
    mapRef.current.flyTo({
      zoom: Math.min(currentZoom + 1.5, 18),
      duration: 500,
    });
  }, [setProgrammaticMove, isProgrammaticMoveRef]);

  // Fire auto-zoom when empty results, no filters, and user hasn't manually panned
  useEffect(() => {
    if (!isMapLoaded || areTilesLoading || isSearching) return;
    if (listings.length > 0) return;
    if (hasAutoZoomedRef.current) return;
    if (hasAnyFilter(searchParams)) return;
    if (hasUserMoved) return;

    hasAutoZoomedRef.current = true;
    handleZoomOut();
  }, [
    isMapLoaded,
    areTilesLoading,
    isSearching,
    listings.length,
    searchParams,
    hasUserMoved,
    handleZoomOut,
  ]);

  // Expose map ref and helpers for E2E testing
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;

    const win = window as unknown as Record<string, unknown>;
    win.__e2eMapRef = mapRef.current.getMap();
    win.__e2eSetProgrammaticMove = setProgrammaticMove;
    win.__e2eUpdateMarkers = updateUnclusteredListings;

    // Signal to E2E tests that the map ref is ready (not just DOM-present).
    // waitForMapReady() waits for this attribute instead of falling back to
    // DOM presence which doesn't guarantee the ref is available.
    const mapContainer = mapRef.current.getMap().getContainer();
    mapContainer?.setAttribute("data-map-ready", "true");

    win.__e2eSimulateUserPan = (dx: number, dy: number) => {
      const map = mapRef.current?.getMap();
      if (!map) return false;
      // Don't set isProgrammaticMoveRef — this simulates a user pan
      map.panBy([dx, dy], { duration: 0 });
      return true;
    };

    win.__e2eSimulateUserZoom = (zoomLevel: number) => {
      const map = mapRef.current?.getMap();
      if (!map) return false;
      // Don't set isProgrammaticMoveRef — this simulates a user zoom
      map.zoomTo(zoomLevel, { duration: 0 });
      return true;
    };

    return () => {
      delete win.__e2eMapRef;
      delete win.__e2eSetProgrammaticMove;
      delete win.__e2eUpdateMarkers;
      delete win.__e2eSimulateUserPan;
      delete win.__e2eSimulateUserZoom;
      mapContainer?.removeAttribute("data-map-ready");
    };
  }, [isMapLoaded, setProgrammaticMove, updateUnclusteredListings]);

  // Listen for fly-to events from location search
  useEffect(() => {
    const handleFlyTo = (event: CustomEvent<MapFlyToEventDetail>) => {
      if (!mapRef.current) return;

      const { lat, lng, bbox, zoom } = event.detail;

      // Mark as programmatic move to prevent follow-up auto-search from firing.
      setProgrammaticMove(true);

      // If bbox (bounding box) is available, use fitBounds for a better view
      if (bbox) {
        mapRef.current.fitBounds(
          [
            [bbox[0], bbox[1]], // [minLng, minLat]
            [bbox[2], bbox[3]], // [maxLng, maxLat]
          ],
          {
            padding: fitBoundsPadding,
            duration: 2000,
            essential: true,
          }
        );
      } else {
        // Use flyTo with smooth animation
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: zoom || 13,
          duration: 2000,
          essential: true,
          curve: 1.42, // Animation curve (ease)
          speed: 1.2, // Animation speed
        });
      }
    };

    window.addEventListener(MAP_FLY_TO_EVENT, handleFlyTo as EventListener);
    return () => {
      window.removeEventListener(
        MAP_FLY_TO_EVENT,
        handleFlyTo as EventListener
      );
    };
  }, [setProgrammaticMove, fitBoundsPadding]);

  // Clear searching state when listings update from SSR
  // Also update E2E marker count tracking
  // Clear activeId if it references a listing that no longer exists
  useEffect(() => {
    // P0 Issue #25: Guard against state update after unmount
    if (!isMountedRef.current) return;
    setIsSearching(false);
    if (searchSafetyTimeoutRef.current) {
      clearTimeout(searchSafetyTimeoutRef.current);
      searchSafetyTimeoutRef.current = null;
    }

    // Clear activeId if the listing no longer exists in new results
    if (activeId && !listings.find((l) => l.id === activeId)) {
      setActive(null);
    }

    // P1-FIX (#106): Clear selectedListing popup if the listing no longer exists.
    // Prevents showing stale popup data after search results update.
    if (selectedListingId && !listings.find((l) => l.id === selectedListingId)) {
      lastMapActiveRef.current = null;
      popupFocusOriginRef.current = null;
      setSelectedListing(null);
    }

    // E2E testing: expose marker count for test verification
    if (process.env.NEXT_PUBLIC_E2E === "true") {
      const roomshare = ((window as unknown as Record<string, unknown>)
        .__roomshare || {}) as Record<string, unknown>;
      (window as unknown as Record<string, unknown>).__roomshare = roomshare;
      roomshare.markerCount = listings.length;
    }
  }, [listings, activeId, selectedListingId, setActive, setSelectedListing]);

  useEffect(() => {
    if (searchStatusTimerRef.current) {
      clearTimeout(searchStatusTimerRef.current);
      searchStatusTimerRef.current = null;
    }

    if (!isSearching) {
      setShowSearchStatus(false);
      return;
    }

    setShowSearchStatus(false);
    searchStatusTimerRef.current = setTimeout(() => {
      if (isMountedRef.current && isSearching) {
        setShowSearchStatus(true);
      }
    }, MAP_SEARCH_STATUS_DELAY_MS);

    return () => {
      if (searchStatusTimerRef.current) {
        clearTimeout(searchStatusTimerRef.current);
        searchStatusTimerRef.current = null;
      }
    };
  }, [isSearching]);

  useEffect(() => {
    if (!usesOverlaySelection && !isControlledSelection && selectedListing) {
      lastMapActiveRef.current = null;
      popupFocusOriginRef.current = null;
      setSelectedListing(null);
    }
  }, [
    usesOverlaySelection,
    isControlledSelection,
    selectedListing,
    setSelectedListing,
  ]);

  // P0 FIX: Clear isSearching when transition completes, even if listings didn't change
  // This fixes the "loading forever" bug when panning to an area with identical results
  useEffect(() => {
    // Only act when transition just completed AND we're still in searching state
    if (transitionContext && !transitionContext.isPending && isSearching) {
      // Small delay to allow listings prop to update first (batched renders)
      const timeout = setTimeout(() => {
        if (isMountedRef.current && isSearching) {
          setIsSearching(false);
          if (searchSafetyTimeoutRef.current) {
            clearTimeout(searchSafetyTimeoutRef.current);
            searchSafetyTimeoutRef.current = null;
          }
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [transitionContext, transitionContext?.isPending, isSearching]);

  // Cleanup timers on unmount and mark component as unmounted
  useEffect(() => {
    // Reset mounted flag on (re)mount — required for React Strict Mode
    // which unmounts/remounts in development, leaving the ref as false
    isMountedRef.current = true;
    const mapInstanceAtMount = mapRef.current;
    return () => {
      // P0 Issue #25: Mark unmounted to prevent stale state updates
      isMountedRef.current = false;
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
      if (searchSafetyTimeoutRef.current) {
        clearTimeout(searchSafetyTimeoutRef.current);
      }
      if (searchStatusTimerRef.current) {
        clearTimeout(searchStatusTimerRef.current);
        searchStatusTimerRef.current = null;
      }
      if (programmaticClearTimeoutRef.current) {
        clearTimeout(programmaticClearTimeoutRef.current);
      }
      if (onMoveThrottleRef.current) {
        clearTimeout(onMoveThrottleRef.current);
        onMoveThrottleRef.current = null;
      }
      if (hoverScrollTimeoutRef.current) {
        clearTimeout(hoverScrollTimeoutRef.current);
      }
      if (updateUnclusteredDebounceRef.current) {
        clearTimeout(updateUnclusteredDebounceRef.current);
      }
      if (sourcedataDebounceRef.current) {
        clearTimeout(sourcedataDebounceRef.current);
      }
      if (tileLoadingTimerRef.current) {
        clearTimeout(tileLoadingTimerRef.current);
        tileLoadingTimerRef.current = null;
      }
      if (webglRecoveryTimeoutRef.current) {
        clearTimeout(webglRecoveryTimeoutRef.current);
        webglRecoveryTimeoutRef.current = null;
      }
      // P1-FIX (#109): Clear cluster expansion flag on unmount
      isClusterExpandingRef.current = false;
      // Remove sourcedata listener
      if (mapInstanceAtMount && sourcedataHandlerRef.current) {
        try {
          mapInstanceAtMount
            .getMap()
            .off("sourcedata", sourcedataHandlerRef.current);
        } catch {
          /* map may already be destroyed */
        }
      }
      // P2-FIX (#153): Clear refs to help garbage collection
      sourcedataHandlerRef.current = null;
      webglCleanupRef.current?.();
      webglCleanupRef.current = null;
      pendingBoundsRef.current = null;
      lastSearchBoundsRef.current = null;
      lastMapActiveRef.current = null;
    };
  }, []);

  // Keyboard: Escape closes popup/preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedListing) {
        e.stopImmediatePropagation(); // Prevent other Escape handlers (e.g., bottom sheet)
        handleSelectedListingClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedListing, handleSelectedListingClose]);

  // Reset interaction-only state when the URL changes.
  useEffect(() => {
    setHasUserMoved(false);
  }, [searchParams, setHasUserMoved]);

  // Suppress mapbox-gl worker communication errors during HMR/Turbopack
  // These are non-fatal and occur when the worker connection is lost during hot reload
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event.message || "";
      if (
        message.includes("reading 'send'") ||
        message.includes("reading 'target'")
      ) {
        event.preventDefault();
        console.warn("[Map] Suppressed worker communication error during HMR");
      }
    };

    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  // Execute the actual search with the given bounds
  const executeMapSearch = useCallback(
    (bounds: {
      minLng: number;
      maxLng: number;
      minLat: number;
      maxLat: number;
    }) => {
      // E2E: allow tests to freeze map-driven URL updates during pagination flows.
      if (typeof window !== "undefined") {
        const win = window as unknown as Record<string, unknown>;
        if (win["__e2eMapSearchFrozen"] === true) return;
      }
      // P2-FIX (#154): Use numeric comparison with tolerance instead of string comparison
      // This avoids floating-point precision issues with toFixed() rounding
      // Tolerance of 0.0001 = ~11 meters, same precision as before but more robust
      const BOUNDS_TOLERANCE = 0.0001;
      const prev = lastSearchBoundsRef.current;
      if (
        prev &&
        Math.abs(bounds.minLng - prev.minLng) < BOUNDS_TOLERANCE &&
        Math.abs(bounds.maxLng - prev.maxLng) < BOUNDS_TOLERANCE &&
        Math.abs(bounds.minLat - prev.minLat) < BOUNDS_TOLERANCE &&
        Math.abs(bounds.maxLat - prev.maxLat) < BOUNDS_TOLERANCE
      ) {
        return; // Bounds haven't meaningfully changed, skip search
      }
      lastSearchBoundsRef.current = { ...bounds };
      // CFM-604: canonical-on-write guarantee — must go through buildCanonicalSearchUrl.
      const url = buildCanonicalSearchUrl(
        applySearchQueryChange(
          normalizeSearchQuery(new URLSearchParams(searchParams.toString())),
          "map-pan",
          { bounds }
        )
      );
      setViewportInfoMessage(null);

      lastSearchTimeRef.current = Date.now();
      pendingBoundsRef.current = null;
      setIsSearching(true);
      // P2-FIX (#133): Increased safety timeout from 5s to 8s for slow networks
      // Previous 5s was too aggressive for 3G/slow connections, causing loader to
      // disappear before results arrived. 8s balances UX (not "forever") with reliability.
      if (searchSafetyTimeoutRef.current)
        clearTimeout(searchSafetyTimeoutRef.current);
      searchSafetyTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) setIsSearching(false);
      }, 8_000);
      // Use replace to update bounds without creating history entries
      // This prevents Back button from stepping through each map pan position
      if (
        process.env.NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH === "true" &&
        typeof window !== "undefined"
      ) {
        // Client-side search: URL-only update, no SSR round-trip.
        // Next.js patches replaceState to sync useSearchParams hooks,
        // so SearchResultsClient + PersistentMapWrapper react to the change.
        window.history.replaceState(null, "", url);
      } else if (transitionContext) {
        transitionContext.replaceWithTransition(url, { reason: "map-pan" });
      } else {
        router.replace(url);
      }
    },
    [router, searchParams, transitionContext]
  );

  // P2-FIX (#79): Keep ref updated with latest executeMapSearch to prevent stale closures
  useEffect(() => {
    executeMapSearchRef.current = executeMapSearch;
  }, [executeMapSearch]);

  // When a card's "Show on Map" button sets activeId, reveal the active selection
  // presentation and center the map on the listing.
  // Zoom in past clusterMaxZoom (14) to ensure the individual pin is visible
  // and not absorbed into a cluster circle.
  useEffect(() => {
    if (!activeId || activeId === lastMapActiveRef.current) return;
    const listing = listings.find((l) => l.id === activeId);
    if (!listing) {
      // UX-12 FIX: Show info message when listing isn't in the map's dataset.
      // This happens when "Show on Map" is clicked for a listing loaded via
      // "Load more" that's beyond the map's 200-marker cap or outside the
      // current padded viewport.
      setViewportInfoMessage("This listing is outside the current map view");
      setTimeout(() => {
        if (isMountedRef.current) setViewportInfoMessage(null);
      }, 3000);
      return;
    }
    if (usesOverlaySelection) {
      if (usesPopupSelection) {
        captureDesktopPopupListOrigin(listing.id);
      }
      setSelectedListing(listing);
    }

    setProgrammaticMove(true);
    // Safety: clear programmatic flag if moveEnd doesn't fire
    if (programmaticClearTimeoutRef.current)
      clearTimeout(programmaticClearTimeoutRef.current);
    programmaticClearTimeoutRef.current = setTimeout(() => {
      if (isProgrammaticMoveRef.current) setProgrammaticMove(false);
    }, PROGRAMMATIC_MOVE_TIMEOUT_MS);
    const map = mapRef.current;
    const mapInstance = map?.getMap();
    const currentZoom = map?.getZoom() ?? 12;
    // clusterMaxZoom is 14 — zoom to at least 15 to guarantee the pin is unclustered
    const minZoomToBreakCluster = 15;
    const targetZoom = Math.max(currentZoom, minZoomToBreakCluster);
    let targetCenter: [number, number] = [
      listing.location.lng,
      listing.location.lat,
    ];

    if (
      usesPopupSelection &&
      isPhoneViewport !== true &&
      mapInstance &&
      mapContainerRef.current
    ) {
      const placement = getDesktopPopupPlacementForListing(listing);
      if (placement?.requiresCameraShift) {
        const container = mapContainerRef.current;
        const containerWidth =
          container.clientWidth || container.getBoundingClientRect().width;
        const containerHeight =
          container.clientHeight || container.getBoundingClientRect().height;
        const adjustedCenter = mapInstance.unproject([
          containerWidth / 2 - placement.deltaX,
          containerHeight / 2 - placement.deltaY,
        ]);

        targetCenter = [adjustedCenter.lng, adjustedCenter.lat];
      }
    }
    map?.easeTo({
      center: targetCenter,
      zoom: targetZoom,
      duration: reducedMotion ? 0 : DESKTOP_POPUP_FOCUS_ANIMATION_MS,
    });

    if (usesPopupSelection && isPhoneViewport !== true && typeof window !== "undefined") {
      const revisionTimers = [
        window.setTimeout(() => {
          setPopupPlacementRevision((current) => current + 1);
        }, 0),
        window.setTimeout(() => {
          setPopupPlacementRevision((current) => current + 1);
        }, Math.max(Math.round(DESKTOP_POPUP_FOCUS_ANIMATION_MS / 2), 120)),
        window.setTimeout(() => {
          setPopupPlacementRevision((current) => current + 1);
        }, DESKTOP_POPUP_FOCUS_ANIMATION_MS + 40),
      ];

      return () => {
        revisionTimers.forEach((timerId) => window.clearTimeout(timerId));
      };
    }
  }, [
    activeId,
    listings,
    usesOverlaySelection,
    usesPopupSelection,
    isPhoneViewport,
    captureDesktopPopupListOrigin,
    getDesktopPopupPlacementForListing,
    setProgrammaticMove,
    isProgrammaticMoveRef,
    setSelectedListing,
    reducedMotion,
  ]);

  // P1-FIX (#77): Wrap handleMoveEnd in useCallback to prevent stale closures.
  // Without this, the function captures state values at definition time which can become stale.
  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      setPopupPlacementRevision((current) => current + 1);
      const isMobileViewport = isPhoneViewport === true;
      const hasOriginalEvent = Boolean(
        (e as ViewStateChangeEvent & { originalEvent?: Event }).originalEvent
      );
      if (hasOriginalEvent) {
        suppressNextSyntheticMoveEndRef.current = false;
      }
      // Track zoom for two-tier pin display
      setCurrentZoom(e.viewState.zoom);
      // Debounce updateUnclusteredListings to batch rapid moveEnd events (100ms)
      if (updateUnclusteredDebounceRef.current) {
        clearTimeout(updateUnclusteredDebounceRef.current);
      }
      updateUnclusteredDebounceRef.current = setTimeout(() => {
        updateUnclusteredListings();
      }, 100);

      // Get current map bounds
      const mapBounds = e.target.getBounds();
      if (!mapBounds) return;

      const bounds: MapBounds = {
        minLng: mapBounds.getWest(),
        maxLng: mapBounds.getEast(),
        minLat: mapBounds.getSouth(),
        maxLat: mapBounds.getNorth(),
      };

      // Build view state change event for callbacks
      const viewStateChangeEvent: MapViewStateChangeEvent = {
        viewState: {
          longitude: e.viewState.longitude,
          latitude: e.viewState.latitude,
          zoom: e.viewState.zoom,
          bearing: e.viewState.bearing,
          pitch: e.viewState.pitch,
        },
        bounds,
        isProgrammatic: isProgrammaticMoveRef.current,
      };

      // Fire onMoveEnd callback (controlled component API)
      onMoveEndProp?.(viewStateChangeEvent);

      // Track center for resize-triggered moveEnd detection
      const center = { lat: e.viewState.latitude, lng: e.viewState.longitude };

      // Skip search/dirty logic during programmatic moves (auto-fly, card click, cluster expand)
      let skipCenterDedup = false;
      if (isProgrammaticMoveRef.current) {
        // Clear the safety timeout before clearing the flag — prevents orphaned
        // timeout from firing after a new programmatic move starts (#32)
        if (programmaticClearTimeoutRef.current) {
          clearTimeout(programmaticClearTimeoutRef.current);
          programmaticClearTimeoutRef.current = null;
        }
        setProgrammaticMove(false); // Clear immediately on moveend instead of waiting for timeout
        setActivePanBounds(null); // Clear active pan bounds
        if (isMobileViewport) {
          hasCompletedInitialMobileViewportSyncRef.current = true;
          hasPendingRealUserMoveRef.current = false;
        }
        // CLUSTER FIX: Don't clear isClusterExpandingRef here - wait for onIdle
        // Tiles may not be loaded yet, clearing here causes empty markers
        // Zoom-out button is user-initiated — allow search to proceed
        if (!pendingSearchAfterZoomRef.current) {
          suppressNextSyntheticMoveEndRef.current = true;
          lastCenterRef.current = center;
          return;
        }
        pendingSearchAfterZoomRef.current = false;
        skipCenterDedup = true;
        // Fall through to search logic below
      }

      if (!hasOriginalEvent && suppressNextSyntheticMoveEndRef.current) {
        suppressNextSyntheticMoveEndRef.current = false;
        lastCenterRef.current = center;
        if (isMobileViewport) {
          hasCompletedInitialMobileViewportSyncRef.current = true;
          hasPendingRealUserMoveRef.current = false;
        }
        return;
      }

      // Desktop map lifecycle can emit synthetic moveend events after initial
      // URL restoration, resize, popup placement correction, and other
      // programmatic camera work. Those should never rewrite URL bounds or
      // trigger a search unless we explicitly queued one (skipCenterDedup).
      if (!isMobileViewport && !hasOriginalEvent && !skipCenterDedup) {
        setActivePanBounds(null);
        lastCenterRef.current = center;
        return;
      }

      // Clear active pan bounds since move has ended
      setActivePanBounds(null);

      // Skip resize-triggered moveEnd events where center barely changed.
      // Container resize (e.g., header height change from warning banner) triggers moveEnd
      // but doesn't actually move the map center — no reason to re-search.
      const CENTER_THRESHOLD = 0.0001; // ~11 meters
      const prevCenter = lastCenterRef.current;
      lastCenterRef.current = center;
      if (
        !skipCenterDedup &&
        prevCenter &&
        Math.abs(center.lat - prevCenter.lat) < CENTER_THRESHOLD &&
        Math.abs(center.lng - prevCenter.lng) < CENTER_THRESHOLD
      ) {
        return;
      }

      const hasRealMobileGesture =
        hasPendingRealUserMoveRef.current || hasOriginalEvent;

      if (isMobileViewport && !hasRealMobileGesture) {
        hasCompletedInitialMobileViewportSyncRef.current = true;
        return;
      }

      hasPendingRealUserMoveRef.current = false;
      if (isMobileViewport) {
        hasCompletedInitialMobileViewportSyncRef.current = true;
      }

      // Mark that user has manually moved the map
      setHasUserMoved(true);

      // Don't trigger search when zoomed out too far — viewport exceeds server max span
      const latSpan = bounds.maxLat - bounds.minLat;
      // H2-MAP FIX: Handle antimeridian crossing (west > east when crossing 180/-180)
      const crossesAntimeridian = bounds.minLng > bounds.maxLng;
      const lngSpan = crossesAntimeridian
        ? 180 - bounds.minLng + (bounds.maxLng + 180)
        : bounds.maxLng - bounds.minLng;
      if (
        latSpan > MAP_FETCH_MAX_LAT_SPAN ||
        lngSpan > MAP_FETCH_MAX_LNG_SPAN
      ) {
        setViewportInfoMessage("Zoom in further to update results");
        return;
      }
      setViewportInfoMessage(null);

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(
        () => {
          const now = Date.now();
          const timeSinceLastSearch = now - lastSearchTimeRef.current;

          // If we're within the throttle window, queue the search for later
          if (timeSinceLastSearch < MIN_SEARCH_INTERVAL_MS) {
            pendingBoundsRef.current = bounds;

            // Clear any existing throttle timeout
            if (throttleTimeoutRef.current) {
              clearTimeout(throttleTimeoutRef.current);
            }

            // Schedule the pending search for when the throttle window expires
            const delay = MIN_SEARCH_INTERVAL_MS - timeSinceLastSearch;
            throttleTimeoutRef.current = setTimeout(() => {
              if (pendingBoundsRef.current && executeMapSearchRef.current) {
                executeMapSearchRef.current(pendingBoundsRef.current);
              }
            }, delay);
            return;
          }

          // Execute immediately if outside throttle window
          if (executeMapSearchRef.current) {
            executeMapSearchRef.current(bounds);
          }
        },
        isMobileViewport ? 150 : MAP_MOVE_SEARCH_DEBOUNCE_MS
      );
    },
    [
      updateUnclusteredListings,
      setActivePanBounds,
      isProgrammaticMoveRef,
      setProgrammaticMove,
      setHasUserMoved,
      isPhoneViewport,
      setViewportInfoMessage,
      onMoveEndProp,
      MAP_MOVE_SEARCH_DEBOUNCE_MS,
    ]
  );

  // User pin (drop-a-pin) state — uses Nominatim reverse geocoding (no token needed)
  const {
    isDropMode,
    toggleDropMode,
    pin: userPin,
    setPin: setUserPin,
    handleMapClick: handleUserPinClick,
  } = useUserPin();
  const hasConfirmedEmptyViewport =
    isMapLoaded &&
    isMapInitialized &&
    !areTilesLoading &&
    !isSearching &&
    !suppressEmptyState &&
    listings.length === 0;
  const mobileMapStatus = useMemo<MobileMapStatus | null>(() => {
    if (isPhoneViewport !== true || !hasConfirmedEmptyViewport) {
      return null;
    }

    return "confirmed-empty";
  }, [hasConfirmedEmptyViewport, isPhoneViewport]);
  const hasPhonePreviewCard =
    usesPreviewSelection &&
    isPhoneViewport === true &&
    selectedListing !== null;
  const shouldShowMobileStatusCard =
    mobileMapStatus !== null && !hasPhonePreviewCard;
  const shouldShowDesktopEmptyState =
    isPhoneViewport === false && hasConfirmedEmptyViewport;
  const [lightMapStyle, setLightMapStyle] = useState<
    string | StyleSpecification
  >(LIGHT_STYLE_FALLBACK);
  const [darkMapStyle, setDarkMapStyle] = useState<StyleSpecification | null>(
    null
  );

  // Patch the Map prototype as soon as the map instance is available.
  // This runs before onLoad and before react-maplibre <Layer> components
  // fire addLayer on styledata events.
  useEffect(() => {
    if (!mapRef.current) return;
    patchMapPrototypeAddLayer(mapRef.current.getMap());
  }, [isMapLoaded]);

  useEffect(() => {
    if (isDarkMode) return;

    const controller = new AbortController();
    let cancelled = false;

    const loadLightStyle = async () => {
      try {
        const response = await fetch(
          "https://tiles.openfreemap.org/styles/liberty",
          {
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          throw new Error(`Style fetch failed with status ${response.status}`);
        }

        const rawStyle = await response.json();
        if (cancelled) return;

        const sanitizedStyle = sanitizeStyleSpecification(
          rawStyle
        ) as StyleSpecification;
        setLightMapStyle(sanitizedStyle);
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[Map] Falling back to raster light style after style load failure",
            error
          );
        }
        if (!cancelled) setLightMapStyle(LIGHT_STYLE_FALLBACK);
      }
    };

    loadLightStyle();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isDarkMode]);

  useEffect(() => {
    if (isPhoneViewport !== true || mobileMapStatus === null) {
      setMobileSheetOverrideLabel(null);
      setMobileResultsViewPreference(null);
      return;
    }

    setMobileResultsViewPreference("map");
    setMobileSheetOverrideLabel("No places here");
  }, [
    isPhoneViewport,
    mobileMapStatus,
    setMobileResultsViewPreference,
    setMobileSheetOverrideLabel,
  ]);

  useEffect(() => {
    return () => {
      setMobileSheetOverrideLabel(null);
      setMobileResultsViewPreference(null);
    };
  }, [setMobileResultsViewPreference, setMobileSheetOverrideLabel]);

  useEffect(() => {
    if (
      isPhoneViewport !== true ||
      shouldShowMobileStatusCard ||
      hasPhonePreviewCard ||
      mobileResultsView !== "map"
    ) {
      setShowMobileToolsSheet(false);
    }
  }, [
    hasPhonePreviewCard,
    isPhoneViewport,
    mobileResultsView,
    shouldShowMobileStatusCard,
  ]);

  useEffect(() => {
    const isActive = isPhoneViewport === true && showMobileToolsSheet;
    setMobileMapOverlayActive(isActive);

    return () => {
      setMobileMapOverlayActive(false);
    };
  }, [isPhoneViewport, setMobileMapOverlayActive, showMobileToolsSheet]);

  // Fetch and sanitize dark style as JSON object (same pattern as light style)
  // so zoom expression sanitization is applied before MapLibre processes it.
  useEffect(() => {
    if (!isDarkMode) return;

    const controller = new AbortController();
    let cancelled = false;

    const loadDarkStyle = async () => {
      try {
        const response = await fetch("/map-styles/liberty-dark.json", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            `Dark style fetch failed with status ${response.status}`
          );
        }

        const rawStyle = await response.json();
        if (cancelled) return;

        const sanitizedStyle = sanitizeStyleSpecification(
          rawStyle
        ) as StyleSpecification;
        setDarkMapStyle(sanitizedStyle);
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[Map] Dark style fetch failed, using URL fallback",
            error
          );
        }
        // Fallback: let MapLibre fetch the URL directly (unsanitized but functional)
        if (!cancelled) setDarkMapStyle(null);
      }
    };

    loadDarkStyle();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isDarkMode]);

  // Get hovered listing coords for distance display
  const hoveredListingCoords = useMemo(() => {
    if (!hoveredId) return null;
    const listing = listings.find((l) => l.id === hoveredId);
    return listing
      ? { lat: listing.location.lat, lng: listing.location.lng }
      : null;
  }, [hoveredId, listings]);

  // Handler for controlled mode - fires on every move to update parent's viewState
  const handleControlledMove = useCallback(
    (e: ViewStateChangeEvent) => {
      if (!isControlledViewState || !onViewStateChange) return;

      const mapBounds = e.target.getBounds();
      const bounds: MapBounds = mapBounds
        ? {
            minLng: mapBounds.getWest(),
            maxLng: mapBounds.getEast(),
            minLat: mapBounds.getSouth(),
            maxLat: mapBounds.getNorth(),
          }
        : { minLng: 0, maxLng: 0, minLat: 0, maxLat: 0 };

      onViewStateChange({
        viewState: {
          longitude: e.viewState.longitude,
          latitude: e.viewState.latitude,
          zoom: e.viewState.zoom,
          bearing: e.viewState.bearing,
          pitch: e.viewState.pitch,
        },
        bounds,
        isProgrammatic: isProgrammaticMoveRef.current,
      });
    },
    [isControlledViewState, onViewStateChange, isProgrammaticMoveRef]
  );

  // Throttled handler during actual map dragging/zooming
  // Proactively updates context bounds which triggers client-side /api/map-listings fetch
  const handleMove = useCallback(
    (e: ViewStateChangeEvent) => {
      // Fire controlled view state if provided
      handleControlledMove(e);

      if (
        usesPopupSelection &&
        isPhoneViewport !== true &&
        selectedListing
      ) {
        setPopupPlacementRevision((current) => current + 1);
      }

      if (isProgrammaticMoveRef.current) return;

      if (onMoveThrottleRef.current) return; // Throttled

      // 200ms throttle for proactive marker fetching
      onMoveThrottleRef.current = setTimeout(() => {
        onMoveThrottleRef.current = null;
      }, 200);

      const mapBounds = e.target.getBounds();
      if (!mapBounds) return;

      setActivePanBounds({
        minLng: mapBounds.getWest(),
        maxLng: mapBounds.getEast(),
        minLat: mapBounds.getSouth(),
        maxLat: mapBounds.getNorth(),
      });
    },
    [
      handleControlledMove,
      isPhoneViewport,
      isProgrammaticMoveRef,
      selectedListing,
      setActivePanBounds,
      usesPopupSelection,
    ]
  );

  // P1-FIX (#83): Memoize handleMarkerClick to prevent recreation on every render
  const handleMarkerClick = useCallback(
    (listing: Listing, coords: { lng: number; lat: number }) => {
      triggerHaptic();
      if (usesOverlaySelection) {
        if (usesPreviewSelection) {
          armPreviewBackgroundClickGuard();
        }
        if (usesPopupSelection) {
          captureDesktopPopupMarkerOrigin(listing.id);
        }
        setSelectedListing(listing);
      }
      // Set active listing for card highlight and scroll-to
      lastMapActiveRef.current = listing.id;
      setActive(listing.id);
      requestScrollTo(listing.id);
      const shouldOpenDesktopPopupInPlace =
        usesPopupSelection && isPhoneViewport !== true;

      if (!shouldOpenDesktopPopupInPlace) {
        // Mark as programmatic move to prevent follow-up auto-search from firing.
        setProgrammaticMove(true);
        // Safety: clear programmatic flag if moveEnd doesn't fire within 1.5s
        if (programmaticClearTimeoutRef.current)
          clearTimeout(programmaticClearTimeoutRef.current);
        programmaticClearTimeoutRef.current = setTimeout(() => {
          if (isProgrammaticMoveRef.current) {
            setProgrammaticMove(false);
          }
        }, PROGRAMMATIC_MOVE_TIMEOUT_MS);
        mapRef.current?.easeTo({
          center: [coords.lng, coords.lat],
          duration: reducedMotion ? 0 : DESKTOP_POPUP_FOCUS_ANIMATION_MS,
        });
      }
    },
    [
      armPreviewBackgroundClickGuard,
      isPhoneViewport,
      usesOverlaySelection,
      usesPopupSelection,
      usesPreviewSelection,
      captureDesktopPopupMarkerOrigin,
      setSelectedListing,
      setActive,
      requestScrollTo,
      setProgrammaticMove,
      isProgrammaticMoveRef,
      reducedMotion,
    ]
  );

  // CRIT-2 FIX: Stable callbacks replacing per-marker handler Maps.
  // These callbacks use ref-based lookup to access listing data at call time,
  // so they don't depend on markerPositions and never change when listings change.
  const handleMarkerClickById = useCallback(
    (listingId: string) => {
      const position = markerPositionsRef.current.find((p) =>
        p.memberIds.includes(listingId)
      );
      if (!position) return;
      setViewedIds((prev) => new Set(prev).add(listingId));
      handleMarkerClick(position.listing, {
        lng: position.lng,
        lat: position.lat,
      });
    },
    [handleMarkerClick]
  );

  const handleMarkerPointerEnter = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") return;
      const listingId = e.currentTarget.dataset.listingId;
      if (!listingId) return;
      setHovered(listingId, "map");
      if (hoverScrollTimeoutRef.current)
        clearTimeout(hoverScrollTimeoutRef.current);
      hoverScrollTimeoutRef.current = setTimeout(() => {
        requestScrollTo(listingId);
      }, 300);
    },
    [setHovered, requestScrollTo]
  );

  const handleMarkerPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") return;
      setHovered(null);
      if (hoverScrollTimeoutRef.current) {
        clearTimeout(hoverScrollTimeoutRef.current);
        hoverScrollTimeoutRef.current = null;
      }
    },
    [setHovered]
  );

  return (
    <div
      ref={mapContainerRef}
      data-testid="map"
      className="w-full h-full overflow-hidden relative group"
      role="region"
      aria-label="Interactive map showing listing locations"
      aria-roledescription="map"
      onWheel={(e) => e.stopPropagation()}
    >
      {isWebglContextLost && (
        <div
          className="absolute inset-0 bg-on-surface/70 z-30 flex items-center justify-center pointer-events-none"
          role="status"
          aria-live="assertive"
          aria-label="Map paused"
        >
          <div className="text-center px-4">
            <p className="text-sm font-medium text-white">Map paused</p>
            <p className="text-xs text-on-surface-variant mt-1">
              Recovering map context...
            </p>
          </div>
        </div>
      )}

      {/* Initial loading skeleton */}
      {!isMapLoaded && (
        <div
          className="absolute inset-0 bg-surface-container-high z-20 flex items-center justify-center"
          role="status"
          aria-label="Loading map"
        >
          <div className="flex flex-col items-center gap-3">
            <MapPin
              className="w-10 h-10 text-on-surface-variant animate-pulse"
              aria-hidden="true"
            />
            <span className="text-sm text-on-surface-variant">
              Loading map...
            </span>
          </div>
        </div>
      )}

      {/* Search-as-move loading indicator */}
      {showSearchStatus && isMapLoaded && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 bg-surface-container-lowest/90 px-3 py-2 rounded-lg shadow-ambient-sm flex items-center gap-2 z-10 pointer-events-none"
          role="status"
          aria-label="Searching this area"
          aria-live="polite"
        >
          <Loader2
            className="w-4 h-4 animate-spin text-on-surface-variant"
            aria-hidden="true"
          />
          <span className="text-sm text-on-surface-variant">
            Searching this area...
          </span>
        </div>
      )}

      {/* Issue #11: Screen reader announcement for marker selection */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {selectedListing
          ? `Selected listing: ${selectedListing.title}, ${formatPrice(selectedListing.price)} per month, ${selectedAvailabilityPresentation?.ariaLabel ?? "Filled"}`
          : ""}
      </div>

      {/* Screen reader instructions for keyboard navigation */}
      <div id="map-marker-instructions" className="sr-only">
        Use arrow keys to navigate between markers based on their position on
        the map. Press Enter or Space to select a marker and view listing
        details. Press Home to jump to the first marker, End to jump to the last
        marker.
      </div>

      {/* Screen reader announcement for keyboard navigation */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {keyboardFocusedId &&
          markerPositionById.has(keyboardFocusedId) &&
          (() => {
            const focused = markerPositionById.get(keyboardFocusedId);
            if (!focused) return "";
            const index = sortedMarkerPositions.findIndex((p) =>
              p.memberIds.includes(keyboardFocusedId)
            );
            return `Marker ${index + 1} of ${sortedMarkerPositions.length}: ${focused.listing.title || "Listing"}, ${formatPrice(focused.listing.price)} per month`;
          })()}
      </div>

      <Map
        key={mapRemountKey}
        ref={mapRef}
        // Controlled mode: use viewState prop + onMove handler
        // Uncontrolled mode: use initialViewState (default behavior)
        {...(isControlledViewState && controlledViewState
          ? { ...controlledViewState, onMove: handleMove }
          : { initialViewState, onMove: handleMove })}
        style={{ width: "100%", height: "100%" }}
        maxBounds={USA_MAX_BOUNDS}
        minZoom={MAP_MIN_ZOOM}
        scrollZoom={true}
        dragPan={true}
        doubleClickZoom={true}
        keyboard={true}
        touchZoomRotate={true}
        mapStyle={
          isDarkMode
            ? (darkMapStyle ?? "/map-styles/liberty-dark.json")
            : lightMapStyle
        }
        onMoveEnd={handleMoveEnd}
        onLoad={() => {
          // Ensure prototype patch is applied (belt-and-suspenders with useEffect)
          if (mapRef.current) {
            patchMapPrototypeAddLayer(mapRef.current.getMap());
          }

          // P2-FIX (#84): Clean up old sourcedata listener on style change before adding new one
          // When mapStyleKey changes, the map style reloads and onLoad fires again.
          // Without cleanup, we'd accumulate duplicate listeners.
          if (mapRef.current && sourcedataHandlerRef.current) {
            try {
              mapRef.current
                .getMap()
                .off("sourcedata", sourcedataHandlerRef.current);
            } catch {
              /* map may have been destroyed during style change */
            }
            sourcedataHandlerRef.current = null;
          }

          setIsMapLoaded(true);
          setIsWebglContextLost(false);
          if (webglRecoveryTimeoutRef.current) {
            clearTimeout(webglRecoveryTimeoutRef.current);
            webglRecoveryTimeoutRef.current = null;
          }
          // Defer to next tick so <Source> can mount before we query
          setTimeout(() => updateUnclusteredListings(), 0);

          // A11y fix: Remove canvas from tab order to prevent keyboard trap.
          // The mapbox-gl canvas absorbs Tab key events when focused, trapping
          // keyboard navigation. Individual marker buttons (tabIndex=0) remain
          // tabbable since they are separate DOM elements overlaying the canvas.
          if (mapRef.current) {
            const canvas = mapRef.current.getMap().getCanvas();
            if (canvas) {
              canvas.tabIndex = -1;
            }
          }

          // Handle WebGL context loss/restoration to recover from mobile GPU eviction.
          if (mapRef.current) {
            const map = mapRef.current.getMap();
            const canvas = map.getCanvas();

            webglCleanupRef.current?.();
            if (
              typeof canvas.addEventListener !== "function" ||
              typeof canvas.removeEventListener !== "function"
            ) {
              webglCleanupRef.current = null;
            } else {
              const handleContextLost = (event: Event) => {
                event.preventDefault();
                setIsWebglContextLost(true);
                console.warn("[Map] WebGL context lost");

                if (webglRecoveryTimeoutRef.current) {
                  clearTimeout(webglRecoveryTimeoutRef.current);
                }
                webglRecoveryTimeoutRef.current = setTimeout(() => {
                  if (!isMountedRef.current) return;
                  console.warn(
                    "[Map] WebGL context restore timeout - remounting map"
                  );
                  setIsWebglContextLost(false);
                  setIsMapLoaded(false);
                  setMapRemountKey((value) => value + 1);
                }, 5000);
              };

              const handleContextRestored = () => {
                console.warn("[Map] WebGL context restored");
                if (webglRecoveryTimeoutRef.current) {
                  clearTimeout(webglRecoveryTimeoutRef.current);
                  webglRecoveryTimeoutRef.current = null;
                }
                setIsWebglContextLost(false);
                map.triggerRepaint();
                setIsMapLoaded(false);
                setTimeout(() => {
                  if (isMountedRef.current) setIsMapLoaded(true);
                }, 0);
              };

              canvas.addEventListener("webglcontextlost", handleContextLost);
              canvas.addEventListener(
                "webglcontextrestored",
                handleContextRestored
              );
              webglCleanupRef.current = () => {
                canvas.removeEventListener(
                  "webglcontextlost",
                  handleContextLost
                );
                canvas.removeEventListener(
                  "webglcontextrestored",
                  handleContextRestored
                );
              };
            }
          }

          // Expose E2E map ref in onLoad (before React re-render triggers the useEffect).
          // No NODE_ENV guard needed: window properties have no production impact,
          // and the test-helpers API route is the real security gate.
          if (mapRef.current) {
            const win = window as unknown as Record<string, unknown>;
            win.__e2eMapRef = mapRef.current.getMap();
            win.__e2eSetProgrammaticMove = setProgrammaticMove;
            win.__e2eUpdateMarkers = updateUnclusteredListings;
            mapRef.current
              .getMap()
              .getContainer()
              ?.setAttribute("data-map-ready", "true");
          }

          // Fix 1: Listen for sourcedata to retry unclustered query after tiles load.
          // querySourceFeatures only returns results for rendered tiles, so after
          // flyTo/zoom, tiles reload asynchronously and we need to re-query.
          if (mapRef.current) {
            const map = mapRef.current.getMap();
            const handler = (e: MapSourceDataEvent) => {
              if (e.sourceId !== "listings") return;

              // During cluster expansion, accept any sourcedata event immediately
              if (isClusterExpandingRef.current) {
                updateUnclusteredListings();
                return;
              }

              // Accept content/idle events or when source reports loaded.
              // MapLibre v5 provides sourceDataType on GeoJSON source events;
              // the old !e.tile guard filtered out the events we need.
              const sourceDataType = (e as Record<string, unknown>)
                .sourceDataType as string | undefined;
              const mapInstance = mapRef.current?.getMap();
              if (
                sourceDataType === "content" ||
                sourceDataType === "idle" ||
                e.isSourceLoaded ||
                (mapInstance?.getSource("listings") &&
                  mapInstance.isSourceLoaded("listings"))
              ) {
                // Debounce: sourcedata fires dozens of times/sec during tile loads
                if (sourcedataDebounceRef.current) {
                  clearTimeout(sourcedataDebounceRef.current);
                }
                sourcedataDebounceRef.current = setTimeout(() => {
                  updateUnclusteredListings();
                }, 150);
              }
            };
            sourcedataHandlerRef.current = handler;
            map.on("sourcedata", handler);
          }

          // Restore exact viewport from URL bounds on (re)mount.
          // When the map remounts during "search as I move" navigation,
          // initialViewState only sets center + zoom 12 which doesn't
          // match the user's actual viewport. fitBounds restores it exactly.
          if (mapRef.current) {
            const sp = searchParams;
            const minLat = sp.get("minLat");
            const maxLat = sp.get("maxLat");
            const minLng = sp.get("minLng");
            const maxLng = sp.get("maxLng");
            if (minLat && maxLat && minLng && maxLng) {
              const pMinLat = safeParseFloat(minLat, -90, 90);
              const pMaxLat = safeParseFloat(maxLat, -90, 90);
              const pMinLng = safeParseFloat(minLng, -180, 180);
              const pMaxLng = safeParseFloat(maxLng, -180, 180);
              if (
                pMinLat === undefined ||
                pMaxLat === undefined ||
                pMinLng === undefined ||
                pMaxLng === undefined
              ) {
                return; // Invalid URL coordinates — skip fitBounds
              }
              const bounds: [[number, number], [number, number]] = [
                [pMinLng, pMinLat],
                [pMaxLng, pMaxLat],
              ];
              if (isPhoneViewport === true) {
                hasCompletedInitialMobileViewportSyncRef.current = false;
                hasPendingRealUserMoveRef.current = false;
              }
              setProgrammaticMove(true);
              // Safety: clear programmatic flag if moveEnd doesn't fire
              if (programmaticClearTimeoutRef.current)
                clearTimeout(programmaticClearTimeoutRef.current);
              programmaticClearTimeoutRef.current = setTimeout(() => {
                if (isProgrammaticMoveRef.current) setProgrammaticMove(false);
              }, PROGRAMMATIC_MOVE_TIMEOUT_MS);
              mapRef.current.fitBounds(bounds, { duration: 0, padding: 0 });
            }
          }
        }}
        onMoveStart={(e) => {
          if (
            isPhoneViewport === true &&
            !isProgrammaticMoveRef.current &&
            Boolean(e?.originalEvent)
          ) {
            hasPendingRealUserMoveRef.current = true;
          }
          if (
            usesPreviewSelection &&
            selectedListing &&
            !isProgrammaticMoveRef.current
          ) {
            dismissPreviewSelection();
          }
          // M3-MAP FIX: Defer tile-loading indicator by 200ms so brief pans
          // don't flash the loading overlay
          if (tileLoadingTimerRef.current)
            clearTimeout(tileLoadingTimerRef.current);
          tileLoadingTimerRef.current = setTimeout(
            () => setAreTilesLoading(true),
            200
          );
        }}
        onIdle={() => {
          // M3-MAP FIX: Cancel pending tile-loading timer and clear state
          if (tileLoadingTimerRef.current) {
            clearTimeout(tileLoadingTimerRef.current);
            tileLoadingTimerRef.current = null;
          }
          setAreTilesLoading(false);
          // CLUSTER FIX: Clear expansion flag AFTER tiles are loaded
          // This ensures updateUnclusteredListings has valid data
          if (isClusterExpandingRef.current) {
            isClusterExpandingRef.current = false;
          }
          // Fix 2: Re-query unclustered features after all tiles rendered.
          // onIdle is the most reliable signal that tiles are fully loaded.
          updateUnclusteredListings();
        }}
        onClick={async (e: MapLayerMouseEvent) => {
          // User pin drop takes priority
          if (isDropMode && e.lngLat) {
            await handleUserPinClick(e.lngLat.lng, e.lngLat.lat);
            return;
          }
          // P2-FIX (#110): Check if click originated from a marker element.
          // stopPropagation on Marker's onClick stops DOM bubbling, but
          // mapbox-gl still detects the click via canvas hit-testing.
          // Skip cluster handling if click was on a marker to prevent both firing.
          const target = e.originalEvent?.target as HTMLElement | undefined;
          if (target?.closest("[data-listing-id]")) {
            return;
          }
          if (
            usesPreviewSelection &&
            ignoreNextPreviewBackgroundClickRef.current
          ) {
            clearPreviewBackgroundClickGuard();
            return;
          }
          if (usesPreviewSelection && selectedListing) {
            dismissPreviewSelection();
          }
          if (usesPopupSelection && selectedListing) {
            dismissDesktopPopupSelection({ restoreFocus: false });
          }
          // Otherwise handle cluster click
          if (useClustering) onClusterClick(e);
        }}
        interactiveLayerIds={
          useClustering
            ? isDarkMode
              ? ["clusters-dark", "cluster-count-dark"]
              : ["clusters", "cluster-count"]
            : []
        }
        onError={(e) => {
          const error = (e as { error?: Error }).error;
          const message = error?.message || "Unknown map error";

          // Worker communication errors are non-fatal during HMR/navigation
          // These occur when the mapbox-gl worker loses connection during hot reload
          if (
            (message.includes("send") && message.includes("worker")) ||
            message.includes("Actor")
          ) {
            console.warn(
              "[Map] Worker communication issue (safe to ignore during HMR):",
              message
            );
            return;
          }

          // Zoom expression errors from external styles (e.g. OpenFreeMap liberty)
          // are non-fatal — the layer simply won't render text-size correctly
          if (message.includes('"zoom" expression may only be used')) {
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "[Map] Suppressed external style zoom expression error:",
                message
              );
            }
            return;
          }

          // Tile fetch errors (status 0) are benign — occur when map is unmounted
          // while tile requests are still in-flight (e.g. hide/show map toggle)
          if (
            message.includes("AJAXError") &&
            message.includes("Failed to fetch")
          ) {
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "[Map] Suppressed tile fetch error (safe during unmount):",
                message
              );
            }
            return;
          }

          console.error("Map Error:", message, error?.stack);
        }}
      >
        {/* Boundary polygon for named search areas */}
        <BoundaryLayer
          query={
            searchParams.get("locationLabel") ||
            searchParams.get("where") ||
            searchParams.get("q")
          }
          isDarkMode={isDarkMode}
        />

        {/* Privacy circles — translucent ~200m radius around listings */}
        <PrivacyCircle
          listings={privacyCircleListings}
          isDarkMode={isDarkMode}
        />

        {/* Clustering Source and Layers - Layer nested inside Source inherits source automatically */}
        {useClustering && (
          <Source
            id="listings"
            type="geojson"
            data={geojsonData}
            cluster={true}
            clusterMaxZoom={clusterConfig.maxZoom}
            clusterRadius={clusterConfig.radius}
            clusterProperties={{
              priceSum: ["+", ["get", "price"]],
            }}
          >
            {/* Price-colored outer ring (rendered first, behind main circle) */}
            <Layer {...clusterRingLayer} />
            {isDarkMode && <Layer {...clusterLayerDark} />}
            {isDarkMode && <Layer {...scaledClusterCountLayerDark} />}
            {!isDarkMode && <Layer {...clusterLayer} />}
            {!isDarkMode && <Layer {...scaledClusterCountLayer} />}
          </Source>
        )}

        {/* CRIT-1/CRIT-2 FIX: Memoized MapMarkerItem replaces inline IIFEs and handler Maps.
            Each MapMarkerItem receives only primitive/boolean/stable-callback props, so React.memo
            can bail out when non-marker state changes (isSearching, areTilesLoading, etc.).
            MarkerPinContent inside each item only re-renders when its 4 primitive props change. */}
        {markerPositions.map((position) => (
          (() => {
            const availabilityPresentation = getAvailabilityPresentation({
              availableSlots: position.listing.availableSlots,
              totalSlots: position.listing.totalSlots,
              publicAvailability: position.listing.publicAvailability,
              groupContext: position.listing.groupContext,
            });

            return (
          <MapMarkerItem
            key={position.listing.id}
            listingId={position.listing.id}
            lng={position.lng}
            lat={position.lat}
            price={position.listing.price}
            title={position.listing.title}
            availabilityAriaLabel={availabilityPresentation.ariaLabel}
            tier={position.listing.tier}
            currentZoom={currentZoom}
            isHovered={
              hoveredId ? position.memberIds.includes(hoveredId) : false
            }
            isActive={activeId ? position.memberIds.includes(activeId) : false}
            isDimmed={!!hoveredId && !position.memberIds.includes(hoveredId)}
            isKeyboardFocused={
              keyboardFocusedId
                ? position.memberIds.includes(keyboardFocusedId)
                : false
            }
            isViewed={viewedIds.has(position.listing.id)}
            onClickById={handleMarkerClickById}
            onPointerEnter={handleMarkerPointerEnter}
            onPointerLeave={handleMarkerPointerLeave}
            onKeyboardNav={handleMarkerKeyboardNavigation}
            onFocusChange={setKeyboardFocusedId}
            markerRefsMap={markerRefs}
          />
            );
          })()
        ))}

        {/* Cluster highlight: when a card is hovered/active but its marker is inside
            a cluster (not in markerPositions), render a highlight dot at the listing's
            coordinates so the user can see where it is on the map. */}
        <ClusterHighlightMarker
          key={hoveredId || activeId || "none"}
          targetId={hoveredId || activeId}
          markerPositionIds={markerPositionIds}
          listings={listings}
        />

        {usesPopupSelection && selectedListing && (
          <Popup
            longitude={selectedListing.location.lng}
            latitude={selectedListing.location.lat}
            anchor={desktopPopupPlacement?.anchor ?? "top"}
            offset={DESKTOP_POPUP_OFFSETS}
            onClose={() => handleSelectedListingClose(true)}
            closeOnClick={false}
            maxWidth="320px"
            subpixelPositioning
            className="z-[60] [&_.maplibregl-popup-content]:rounded-xl [&_.maplibregl-popup-content]:p-0 [&_.maplibregl-popup-content]:!bg-transparent [&_.maplibregl-popup-content]:!shadow-none [&_.maplibregl-popup-close-button]:hidden [&_.maplibregl-popup-tip]:hidden"
          >
            <DesktopListingPreviewCard
              key={selectedListing.id}
              listing={selectedListing}
              href={selectedListingHref ?? `/listings/${selectedListing.id}`}
              isDarkMode={isDarkMode}
              onClose={() => handleSelectedListingClose(true)}
              cardRef={selectedPopupCardRef}
              closeButtonRef={selectedPopupCloseButtonRef}
            />
          </Popup>
        )}

        {/* User-placed pin marker */}
        <UserMarker
          isDropMode={isDropMode}
          onToggleDropMode={toggleDropMode}
          pin={userPin}
          onSetPin={setUserPin}
          hoveredListingCoords={hoveredListingCoords}
          isDarkMode={isDarkMode}
          showControl={false}
        />
      </Map>

      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {hasPhonePreviewCard && selectedListing && (
            <m.div
              key={selectedListing.id}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={
                reducedMotion
                  ? { opacity: 0, transition: { duration: 0.15 } }
                  : {
                      opacity: 0,
                      y: 8,
                      transition: { type: "tween", duration: 0.15 },
                    }
              }
              transition={
                reducedMotion
                  ? { duration: 0.15 }
                  : { type: "spring", stiffness: 400, damping: 30 }
              }
              className="pointer-events-none absolute inset-x-0 z-[45] px-4"
              style={{
                bottom: SEARCH_MOBILE_PREVIEW_CARD_OFFSET,
              }}
            >
              <div
                data-testid="map-preview-card"
                className="pointer-events-auto relative overflow-hidden rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest shadow-[0_18px_45px_-20px_rgba(0,0,0,0.35)]"
              >
                <button
                  type="button"
                  onClick={() => handleSelectedListingClose(true)}
                  className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-on-surface/55 text-white backdrop-blur-sm transition-colors hover:bg-on-surface/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  aria-label="Close listing preview"
                >
                  <X className="w-4 h-4" />
                </button>

                <Link
                  href={selectedListingHref ?? `/listings/${selectedListing.id}`}
                  className="flex items-stretch gap-3 p-3 pr-12"
                >
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface-container-high">
                    {selectedListing.images && selectedListing.images[0] ? (
                      <Image
                        src={selectedListing.images[0]}
                        alt={selectedListing.title}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Home className="w-8 h-8 text-on-surface-variant" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 py-0.5">
                    {Number.isFinite(selectedListing.avgRating) &&
                    (selectedListing.reviewCount ?? 0) > 0 ? (
                      <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-on-surface">
                        <Star className="h-3.5 w-3.5 fill-on-surface text-on-surface" />
                        <span>{selectedListing.avgRating!.toFixed(2)}</span>
                      </div>
                    ) : null}

                    <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-on-surface">
                      {selectedListing.title}
                    </h3>

                    <div
                      data-testid="map-popup-availability"
                      className="mt-2 inline-flex items-center rounded-full bg-surface-container-high px-2.5 py-1 text-[11px] font-medium text-on-surface-variant"
                    >
                      {selectedAvailabilityPresentation?.primaryLabel ?? "Filled"}
                    </div>
                    {selectedAvailabilityPresentation?.secondaryGroupLabel ? (
                      <p className="mt-2 text-xs font-medium text-on-surface-variant">
                        {selectedAvailabilityPresentation.secondaryGroupLabel}
                      </p>
                    ) : null}

                    <p className="mt-2 flex items-baseline gap-1">
                      <span className="text-lg font-bold text-on-surface">
                        {formatPrice(selectedListing.price)}
                      </span>
                      <span className="text-sm text-on-surface-variant">
                        /month
                      </span>
                    </p>
                  </div>
                </Link>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>

      {/* Map Controls Group (Right Side) */}
      <div
        className="absolute right-4 z-[50] flex flex-col gap-2"
        style={{ top: "calc(var(--header-height, 4rem) + 1rem)" }}
      >
        {/* Zoom Controls (Mobile Only) */}
        {isPhoneViewport === true && !showMobileToolsSheet && (
          <div className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest/95 shadow-ambient backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                triggerHaptic();
                handleZoomIn();
              }}
              className="flex h-11 w-11 items-center justify-center border-b border-outline-variant/20 text-on-surface-variant transition-colors hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset"
              aria-label="Zoom in on map"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic();
                handleZoomOut();
              }}
              className="flex h-11 w-11 items-center justify-center text-on-surface-variant transition-colors hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset"
              aria-label="Zoom out on map"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        )}

        {isPhoneViewport === true && !shouldShowMobileStatusCard && (
          <MobileMapToolsSheet
            open={showMobileToolsSheet}
            onOpenChange={(open) => {
              if (open) {
                triggerHaptic();
              }
              setShowMobileToolsSheet(open);
            }}
            activePOICategories={activePOICategories}
            onTogglePOICategory={togglePOICategory}
            isDropMode={isDropMode}
            hasPin={Boolean(userPin)}
            onToggleDropMode={() => {
              triggerHaptic();
              toggleDropMode();
            }}
            onClearPin={() => {
              triggerHaptic();
              setUserPin(null);
            }}
          />
        )}
      </div>

      {isDesktopViewport && (
        <DesktopMapControls
          activePOICategories={activePOICategories}
          onTogglePOICategory={togglePOICategory}
          isDropMode={isDropMode}
          hasPin={Boolean(userPin)}
          onToggleDropMode={toggleDropMode}
          onClearPin={() => setUserPin(null)}
          canFullscreen={canFullscreen}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          paneWidth={mapPaneSize.width}
          paneHeight={mapPaneSize.height}
          portalContainer={mapPortalContainer}
        />
      )}

      {/* Apply POI visibility to the map; POI controls live in the map tools UI. */}
      <POILayer
        mapRef={mapRef}
        isMapLoaded={isMapLoaded}
        activeCategories={appliedPOICategories}
      />

      {/* Info banner when the viewport is too wide to issue a search */}
      {viewportInfoMessage && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[50] bg-blue-50/90 backdrop-blur-md border border-blue-200/50 rounded-full px-4 py-2 shadow-ambient pointer-events-none"
        >
          <p className="text-xs text-blue-800 font-medium">
            {viewportInfoMessage}
          </p>
        </div>
      )}

      {/* Mobile gesture hint - shown once for first-time touch users */}
      {isMapLoaded &&
        !showMobileToolsSheet &&
        !shouldShowMobileStatusCard &&
        !hasPhonePreviewCard && (
        <MapGestureHint />
      )}

      {shouldShowMobileStatusCard && mobileMapStatus && (
        <MobileMapStatusCard
          status={mobileMapStatus}
          searchParams={searchParams}
          onZoomOut={handleZoomOut}
        />
      )}

      {/* Empty state overlay - when map is loaded but no listings in viewport */}
      {shouldShowDesktopEmptyState && (
        <MapEmptyState searchParams={searchParams} onZoomOut={handleZoomOut} />
      )}
    </div>
  );
}
