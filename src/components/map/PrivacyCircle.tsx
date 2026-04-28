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

interface PrivacyCircleProps {
  /** Listings to render privacy circles for */
  listings: Array<{
    id: string;
    location: { lat: number; lng: number };
  }>;
  /** Whether dark mode is active */
  isDarkMode: boolean;
}

function getCircleLayer(isDarkMode: boolean): LayerProps {
  const fillColor = isDarkMode ? "#93c5fd" : "#2563eb";
  const strokeColor = isDarkMode ? "#bfdbfe" : "#1d4ed8";

  return {
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
      "circle-color": fillColor,
      "circle-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.1,
        12,
        0.12,
        14,
        0.1,
        16,
        0.08,
        18,
        0.05,
      ],
      "circle-stroke-width": 1,
      "circle-stroke-color": strokeColor,
      "circle-stroke-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.2,
        12,
        0.2,
        14,
        0.18,
        16,
        0.14,
        18,
        0.1,
      ],
    },
  };
}

export function PrivacyCircle({ listings, isDarkMode }: PrivacyCircleProps) {
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

  const layer = useMemo(() => getCircleLayer(isDarkMode), [isDarkMode]);

  if (listings.length === 0) return null;

  return (
    <Source id="privacy-circles" type="geojson" data={geojson}>
      <Layer {...layer} />
    </Source>
  );
}
