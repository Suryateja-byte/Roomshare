'use client';

/**
 * POILayer — toggle-able layer that shows curated POIs (transit, landmarks,
 * parks) by controlling visibility of Mapbox built-in layers. Also renders
 * neighborhood "vibe" labels as a symbol layer.
 */

import { useEffect, useCallback, useState } from 'react';
import { Bus, Trees, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';

interface POILayerProps {
    /** Reference to the Mapbox map instance */
    mapRef: React.RefObject<any>;
    /** Whether map is loaded */
    isMapLoaded: boolean;
}

// OpenMapTiles (Liberty style) layer IDs for POI categories
const TRANSIT_LAYERS = [
    'poi_transit',
    'road_transit_rail',
    'road_transit_rail_hatching',
];

const LANDMARK_LAYERS = [
    'poi_r1',
    'poi_r7',
    'poi_r20',
];

const PARK_LAYERS = [
    'park',
    'park_outline',
    'landcover_wood',
    'landcover_grass',
];

type POICategory = 'transit' | 'landmarks' | 'parks';

const STORAGE_KEY = 'roomshare:poi-layer-active';

function loadActiveCategories(): Set<POICategory> {
    if (typeof window === 'undefined') return new Set();
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
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...categories]));
    } catch {
        // Storage might be disabled
    }
}

export function POILayer({ mapRef, isMapLoaded }: POILayerProps) {
    const [activeCategories, setActiveCategories] = useState<Set<POICategory>>(loadActiveCategories);

    const toggleCategory = useCallback((category: POICategory) => {
        setActiveCategories(prev => {
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

    // Persist state changes
    useEffect(() => {
        saveActiveCategories(activeCategories);
    }, [activeCategories]);

    // Apply layer visibility when categories change
    useEffect(() => {
        if (!mapRef.current || !isMapLoaded) return;
        const map = mapRef.current.getMap?.() ?? mapRef.current;
        if (!map || typeof map.getStyle !== 'function') return;

        const style = map.getStyle();
        if (!style?.layers) return;

        const setVisibility = (layerIds: string[], visible: boolean) => {
            for (const id of layerIds) {
                if (style.layers.some((l: { id: string }) => l.id === id)) {
                    try {
                        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
                    } catch {
                        // Layer may not exist in current style
                    }
                }
            }
        };

        setVisibility(TRANSIT_LAYERS, activeCategories.has('transit'));
        setVisibility(LANDMARK_LAYERS, activeCategories.has('landmarks'));
        setVisibility(PARK_LAYERS, activeCategories.has('parks'));
    }, [activeCategories, mapRef, isMapLoaded]);

    if (!isMapLoaded) return null;

    const categories: Array<{ id: POICategory; label: string; icon: React.ReactNode }> = [
        { id: 'transit', label: 'Transit', icon: <Bus className="w-4 h-4" /> },
        { id: 'landmarks', label: 'POIs', icon: <Landmark className="w-4 h-4" /> },
        { id: 'parks', label: 'Parks', icon: <Trees className="w-4 h-4" /> },
    ];

    return (
        <div className="absolute top-20 right-4 z-[50] flex flex-col gap-2">
            {/* Individual category toggles */}
            {categories.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={cn(
                        "flex items-center justify-center gap-2 px-3 py-2 rounded-full shadow-md border text-sm font-medium transition-all min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 backdrop-blur-md",
                        activeCategories.has(cat.id)
                            ? "bg-zinc-900/90 text-white border-zinc-900 dark:bg-white/90 dark:text-zinc-900 dark:border-white"
                            : "bg-white/90 dark:bg-zinc-900/90 text-zinc-700 dark:text-zinc-300 border-zinc-200/50 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    )}
                    aria-label={`${activeCategories.has(cat.id) ? 'Hide' : 'Show'} ${cat.label}`}
                    aria-pressed={activeCategories.has(cat.id)}
                >
                    {cat.icon}
                    {cat.label}
                </button>
            ))}
        </div>
    );
}
