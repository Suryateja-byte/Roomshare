"use client";

/**
 * PrivacyCircle — renders a subtle approximate-location halo around public
 * listing coordinates. Public search coordinates are already server-coarsened;
 * this layer communicates that the marker is approximate.
 *
 * Uses a Mapbox `circle` layer on top of GeoJSON point features.
 */

import { Source, Layer } from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";
import { useMemo } from "react";
import { MAP_BRAND } from "@/lib/maps/map-theme";

interface PrivacyCircleProps {
  /** Listings to render privacy circles for */
  listings: Array<{
    id: string;
    location: { lat: number; lng: number };
  }>;
}

// Terracotta halo — the approximate-location hint IS listing information,
// so it shares the listing accent at whisper opacity (single light theme).
const CIRCLE_LAYER: LayerProps = {
  id: "privacy-circles",
  type: "circle",
  paint: {
    "circle-radius": [
      "interpolate",
      ["exponential", 2],
      ["zoom"],
      10,
      1,
      12,
      3,
      14,
      10,
      15,
      18,
      16,
      28,
      17,
      38,
      18,
      48,
    ],
    "circle-color": MAP_BRAND.primary,
    "circle-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      0.06,
      12,
      0.08,
      14,
      0.07,
      16,
      0.05,
      18,
      0.04,
    ],
    "circle-stroke-width": 1,
    "circle-stroke-color": MAP_BRAND.primary,
    "circle-stroke-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      0.16,
      18,
      0.08,
    ],
  },
};

export function PrivacyCircle({ listings }: PrivacyCircleProps) {
  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: listings.map((listing) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [listing.location.lng, listing.location.lat],
        },
        properties: { id: listing.id },
      })),
    }),
    [listings]
  );

  if (listings.length === 0) return null;

  return (
    <Source id="privacy-circles" type="geojson" data={geojson}>
      <Layer {...CIRCLE_LAYER} />
    </Source>
  );
}
