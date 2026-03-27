"use client";

/**
 * BoundaryLayer — fetches and renders neighborhood/locality boundary polygons
 * when the search query matches a named area. Uses Nominatim to get actual
 * boundary GeoJSON polygons (upgrade from Mapbox bbox rectangles).
 */

import { Source, Layer } from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";
import { useEffect, useState, useMemo, useRef } from "react";
import { searchBoundary } from "@/lib/geocoding/nominatim";

interface BoundaryLayerProps {
  /** Search query text (e.g. "Mission District, SF") */
  query: string | null;
  /** Dark mode flag */
  isDarkMode: boolean;
}

import type { FeatureCollection, Polygon } from "geojson";

type BoundaryGeoJSON = FeatureCollection<Polygon>;

const EMPTY_GEOJSON: BoundaryGeoJSON = {
  type: "FeatureCollection",
  features: [],
};

function getBoundaryFillLayer(isDarkMode: boolean): LayerProps {
  return {
    id: "boundary-fill",
    type: "fill",
    paint: {
      "fill-color": "#4a4941", // on-surface-variant
      "fill-opacity": 0.08,
    },
  };
}

function getBoundaryLineLayer(isDarkMode: boolean): LayerProps {
  return {
    id: "boundary-line",
    type: "line",
    paint: {
      "line-color": "#4a4941", // on-surface-variant
      "line-width": 1.5,
      "line-opacity": 0.3,
      "line-dasharray": [4, 2],
    },
  };
}

export function BoundaryLayer({ query, isDarkMode }: BoundaryLayerProps) {
  const [geojson, setGeojson] = useState<BoundaryGeoJSON>(EMPTY_GEOJSON);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<string | null>(null);
  // MED-12 FIX: Debounce boundary fetch to prevent rapid Nominatim requests
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Cancel previous fetch and debounce
    abortRef.current?.abort();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!query || query.trim().length < 2) {
      setGeojson(EMPTY_GEOJSON);
      lastQueryRef.current = null;
      return;
    }

    // Skip if same query
    if (query === lastQueryRef.current) return;
    lastQueryRef.current = query;

    const controller = new AbortController();
    abortRef.current = controller;

    const fetchBoundary = async () => {
      try {
        const result = await searchBoundary(query.trim(), {
          signal: controller.signal,
        });

        if (!result || controller.signal.aborted) {
          if (!controller.signal.aborted) {
            setGeojson(EMPTY_GEOJSON);
          }
          return;
        }

        let boundaryGeojson: BoundaryGeoJSON;

        if (
          result.geometry &&
          (result.geometry.type === "Polygon" ||
            result.geometry.type === "MultiPolygon")
        ) {
          // Use actual polygon geometry from Nominatim (upgrade!)
          boundaryGeojson = {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: result.geometry as Polygon,
                properties: {
                  name: result.displayName,
                },
              },
            ],
          };
        } else if (result.bbox) {
          // Fallback: construct bbox rectangle (same as old Mapbox behavior)
          const [minLng, minLat, maxLng, maxLat] = result.bbox;
          boundaryGeojson = {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "Polygon" as const,
                  coordinates: [
                    [
                      [minLng, minLat],
                      [maxLng, minLat],
                      [maxLng, maxLat],
                      [minLng, maxLat],
                      [minLng, minLat],
                    ],
                  ],
                },
                properties: {
                  name: result.displayName,
                },
              },
            ],
          };
        } else {
          setGeojson(EMPTY_GEOJSON);
          return;
        }

        if (!controller.signal.aborted) {
          setGeojson(boundaryGeojson);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("[BoundaryLayer] Failed to fetch boundary:", err);
      }
    };

    // MED-12 FIX: 300ms debounce prevents rapid Nominatim requests (rate limited to 1 req/sec)
    debounceRef.current = setTimeout(fetchBoundary, 300);

    return () => {
      controller.abort();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query]);

  const fillLayer = useMemo(
    () => getBoundaryFillLayer(isDarkMode),
    [isDarkMode]
  );
  const lineLayer = useMemo(
    () => getBoundaryLineLayer(isDarkMode),
    [isDarkMode]
  );

  if (geojson.features.length === 0) return null;

  return (
    <Source id="boundary" type="geojson" data={geojson}>
      <Layer {...fillLayer} />
      <Layer {...lineLayer} />
    </Source>
  );
}
