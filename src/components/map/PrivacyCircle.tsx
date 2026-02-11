'use client';

/**
 * PrivacyCircle — renders a translucent ~200m radius circle around listing
 * locations instead of showing exact pin placement. The circle radius scales
 * with zoom level to maintain a consistent real-world size.
 *
 * Uses a Mapbox `circle` layer on top of GeoJSON point features.
 */

import { Source, Layer } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import { useMemo } from 'react';

interface PrivacyCircleProps {
    /** Listings to render privacy circles for */
    listings: Array<{
        id: string;
        location: { lat: number; lng: number };
    }>;
    /** Whether dark mode is active */
    isDarkMode: boolean;
}

// Build circle layer paint props based on dark mode.
// ~200m radius circle: circle-radius interpolated by zoom to approximate
// 200m in screen pixels. At zoom 12: ~3px, 14: ~12px, 16: ~48px.
function getCircleLayer(isDarkMode: boolean): LayerProps {
    return {
        id: 'privacy-circles',
        type: 'circle',
        paint: {
            'circle-radius': [
                'interpolate',
                ['exponential', 2],
                ['zoom'],
                10, 1,
                12, 3,
                14, 12,
                16, 48,
                18, 192,
            ],
            'circle-color': isDarkMode
                ? 'rgba(161, 161, 170, 0.15)'
                : 'rgba(113, 113, 122, 0.12)',
            'circle-stroke-width': 1,
            'circle-stroke-color': isDarkMode
                ? 'rgba(161, 161, 170, 0.25)'
                : 'rgba(113, 113, 122, 0.2)',
            'circle-stroke-opacity': 0.6,
        },
    };
}

export function PrivacyCircle({ listings, isDarkMode }: PrivacyCircleProps) {
    const geojson = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: listings.map(listing => ({
            type: 'Feature' as const,
            geometry: {
                type: 'Point' as const,
                coordinates: [listing.location.lng, listing.location.lat],
            },
            properties: { id: listing.id },
        })),
    }), [listings]);

    const layer = useMemo(() => getCircleLayer(isDarkMode), [isDarkMode]);

    if (listings.length === 0) return null;

    return (
        <Source id="privacy-circles" type="geojson" data={geojson}>
            <Layer {...layer} />
        </Source>
    );
}
