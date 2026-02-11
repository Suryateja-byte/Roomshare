'use client';

/**
 * BoundaryLayer — fetches and renders neighborhood/locality boundary polygons
 * when the search query matches a named area. Uses Mapbox Geocoding API to
 * get boundary GeoJSON, rendered as a faint shaded fill layer.
 */

import { Source, Layer } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import { useEffect, useState, useMemo, useRef } from 'react';

interface BoundaryLayerProps {
    /** Search query text (e.g. "Mission District, SF") */
    query: string | null;
    /** Mapbox access token */
    mapboxToken: string;
    /** Dark mode flag */
    isDarkMode: boolean;
}

import type { FeatureCollection, Polygon } from 'geojson';

type BoundaryGeoJSON = FeatureCollection<Polygon>;

const EMPTY_GEOJSON: BoundaryGeoJSON = { type: 'FeatureCollection', features: [] };

function getBoundaryFillLayer(isDarkMode: boolean): LayerProps {
    return {
        id: 'boundary-fill',
        type: 'fill',
        paint: {
            'fill-color': isDarkMode ? '#a1a1aa' : '#3f3f46', // zinc-400 / zinc-700
            'fill-opacity': 0.08,
        },
    };
}

function getBoundaryLineLayer(isDarkMode: boolean): LayerProps {
    return {
        id: 'boundary-line',
        type: 'line',
        paint: {
            'line-color': isDarkMode ? '#a1a1aa' : '#71717a', // zinc-400 / zinc-500
            'line-width': 1.5,
            'line-opacity': 0.3,
            'line-dasharray': [4, 2],
        },
    };
}

export function BoundaryLayer({ query, mapboxToken, isDarkMode }: BoundaryLayerProps) {
    const [geojson, setGeojson] = useState<BoundaryGeoJSON>(EMPTY_GEOJSON);
    const abortRef = useRef<AbortController | null>(null);
    const lastQueryRef = useRef<string | null>(null);

    useEffect(() => {
        // Cancel previous fetch
        abortRef.current?.abort();

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
                // Use Mapbox Geocoding v5 API to find neighborhood/locality boundaries
                const encoded = encodeURIComponent(query.trim());
                const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxToken}&types=neighborhood,locality,place&limit=1`;

                const res = await fetch(url, { signal: controller.signal });
                if (!res.ok || controller.signal.aborted) return;

                const data = await res.json();
                const feature = data.features?.[0];

                if (!feature?.bbox) {
                    setGeojson(EMPTY_GEOJSON);
                    return;
                }

                // Mapbox geocoding doesn't return polygon geometry directly,
                // so we create a bounding box polygon from the bbox
                const [minLng, minLat, maxLng, maxLat] = feature.bbox;
                const bboxPolygon: BoundaryGeoJSON = {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon' as const,
                            coordinates: [[
                                [minLng, minLat],
                                [maxLng, minLat],
                                [maxLng, maxLat],
                                [minLng, maxLat],
                                [minLng, minLat],
                            ]],
                        },
                        properties: {
                            name: feature.place_name || query,
                        },
                    }],
                };

                if (!controller.signal.aborted) {
                    setGeojson(bboxPolygon);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.warn('[BoundaryLayer] Failed to fetch boundary:', err);
            }
        };

        fetchBoundary();

        return () => controller.abort();
    }, [query, mapboxToken]);

    const fillLayer = useMemo(() => getBoundaryFillLayer(isDarkMode), [isDarkMode]);
    const lineLayer = useMemo(() => getBoundaryLineLayer(isDarkMode), [isDarkMode]);

    if (geojson.features.length === 0) return null;

    return (
        <Source id="boundary" type="geojson" data={geojson}>
            <Layer {...fillLayer} />
            <Layer {...lineLayer} />
        </Source>
    );
}
