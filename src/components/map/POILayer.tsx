"use client";

/**
 * POILayer — synchronizes curated POI visibility with the active category set.
 */

import type { RefObject } from "react";
import { useEffect, useCallback, useState } from "react";
import {
  TRANSIT_LAYERS,
  LANDMARK_LAYERS,
  PARK_LAYERS,
} from "@/lib/maps/map-style-contract";

interface POILayerProps {
  /** Reference to the Mapbox map instance */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapRef type varies by map library (react-map-gl wraps maplibre)
  mapRef: RefObject<any>;
  /** Whether map is loaded */
  isMapLoaded: boolean;
  /** Currently active categories */
  activeCategories: Set<POICategory>;
}

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

  return null;
}
