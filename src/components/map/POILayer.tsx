"use client";

/**
 * POILayer — toggle-able layer that shows curated POIs (transit, landmarks,
 * parks) by controlling visibility of Mapbox built-in layers. Also renders
 * neighborhood "vibe" labels as a symbol layer.
 */

import type { ReactNode, RefObject } from "react";
import { useEffect, useCallback, useState } from "react";
import { Bus, Trees, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

interface POILayerProps {
  /** Reference to the Mapbox map instance */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapRef type varies by map library (react-map-gl wraps maplibre)
  mapRef: RefObject<any>;
  /** Whether map is loaded */
  isMapLoaded: boolean;
  /** Currently active categories */
  activeCategories: Set<POICategory>;
  /** Toggle a category when inline controls are rendered */
  onToggleCategory?: (category: POICategory) => void;
  /** Whether to render the inline control strip */
  renderControls?: boolean;
  /** Optional className override for the inline control strip */
  className?: string;
}

// OpenMapTiles (Liberty style) layer IDs for POI categories
const TRANSIT_LAYERS = [
  "poi_transit",
  "road_transit_rail",
  "road_transit_rail_hatching",
];

const LANDMARK_LAYERS = ["poi_r1", "poi_r7", "poi_r20"];

const PARK_LAYERS = [
  "park",
  "park_outline",
  "landcover_wood",
  "landcover_grass",
];

export type POICategory = "transit" | "landmarks" | "parks";

const STORAGE_KEY = "roomshare:poi-layer-active";

export function usePOILayerState() {
  const [activeCategories, setActiveCategories] = useState<Set<POICategory>>(
    () => new Set()
  );

  useEffect(() => {
    const stored = loadActiveCategories();
    if (stored.size > 0) {
      setActiveCategories(stored);
    }
  }, []);

  const toggleCategory = useCallback((category: POICategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      saveActiveCategories(next);
      return next;
    });
  }, []);

  return { activeCategories, toggleCategory };
}

function loadActiveCategories(): Set<POICategory> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveActiveCategories(categories: Set<POICategory>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...categories]));
  } catch {
    // Storage might be disabled
  }
}

export function POILayer({
  mapRef,
  isMapLoaded,
  activeCategories,
  onToggleCategory,
  renderControls = true,
  className,
}: POILayerProps) {
  // Apply layer visibility when categories change
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const map = mapRef.current.getMap?.() ?? mapRef.current;
    if (!map || typeof map.getStyle !== "function") return;

    const style = map.getStyle();
    if (!style?.layers) return;

    const setVisibility = (layerIds: string[], visible: boolean) => {
      for (const id of layerIds) {
        if (style.layers.some((l: { id: string }) => l.id === id)) {
          try {
            map.setLayoutProperty(
              id,
              "visibility",
              visible ? "visible" : "none"
            );
          } catch {
            // Layer may not exist in current style
          }
        }
      }
    };

    setVisibility(TRANSIT_LAYERS, activeCategories.has("transit"));
    setVisibility(LANDMARK_LAYERS, activeCategories.has("landmarks"));
    setVisibility(PARK_LAYERS, activeCategories.has("parks"));
  }, [activeCategories, mapRef, isMapLoaded]);

  if (!renderControls || !onToggleCategory || !isMapLoaded) {
    return null;
  }

  const categories: Array<{
    id: POICategory;
    label: string;
    icon: ReactNode;
  }> = [
    { id: "transit", label: "Transit", icon: <Bus className="w-4 h-4" /> },
    { id: "landmarks", label: "POIs", icon: <Landmark className="w-4 h-4" /> },
    { id: "parks", label: "Parks", icon: <Trees className="w-4 h-4" /> },
  ];

  return (
    <div
      className={cn(
        "absolute top-20 left-4 z-[30] md:z-[50] flex flex-row overflow-hidden rounded-full border border-outline-variant/20 bg-surface-container-lowest/95 shadow-ambient backdrop-blur-md",
        className
      )}
    >
      {/* Grouped category toggles */}
      {categories.map((cat, index) => (
        <button
          key={cat.id}
          onClick={() => onToggleCategory(cat.id)}
          className={cn(
            "flex items-center justify-center h-11 px-3.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset",
            index !== categories.length - 1 && "border-r border-outline-variant/20",
            activeCategories.has(cat.id)
              ? "bg-on-surface/10 text-on-surface"
              : "text-on-surface-variant hover:bg-surface-container-high"
          )}
          title={cat.label}
          aria-label={`${activeCategories.has(cat.id) ? "Hide" : "Show"} ${cat.label}`}
          aria-pressed={activeCategories.has(cat.id)}
          data-testid="poi-category"
        >
          {cat.icon}
          <span className="ml-2 hidden md:inline text-sm font-medium">{cat.label}</span>
        </button>
      ))}
    </div>
  );
}
