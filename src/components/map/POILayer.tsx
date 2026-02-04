'use client';

/**
 * POILayer — toggle-able layer that shows curated POIs (transit, landmarks,
 * parks) by controlling visibility of Mapbox built-in layers. Also renders
 * neighborhood "vibe" labels as a symbol layer.
 */

import { useEffect, useCallback, useState } from 'react';
import { Layers, Bus, Trees, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';

interface POILayerProps {
    /** Reference to the Mapbox map instance */
    mapRef: React.RefObject<any>;
    /** Whether map is loaded */
    isMapLoaded: boolean;
}

// Mapbox built-in layer IDs for POI categories
const TRANSIT_LAYERS = [
    'transit-label',
    'transit-station-label',
    'transit-line',
];

const LANDMARK_LAYERS = [
    'poi-label',
];

const PARK_LAYERS = [
    'landuse',
    'national-park',
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
        { id: 'transit', label: 'Transit', icon: <Bus className="w-3.5 h-3.5" /> },
        { id: 'landmarks', label: 'POIs', icon: <Landmark className="w-3.5 h-3.5" /> },
        { id: 'parks', label: 'Parks', icon: <Trees className="w-3.5 h-3.5" /> },
    ];

    return (
        <div className="absolute top-16 right-4 z-10 flex flex-col gap-1">
            {/* POI toggle header */}
            <button
                onClick={() => {
                    // Toggle all on/off
                    if (activeCategories.size === categories.length) {
                        setActiveCategories(new Set());
                    } else {
                        setActiveCategories(new Set(categories.map(c => c.id)));
                    }
                }}
                className={cn(
                    // P2-8 FIX: Ensure 44px minimum touch target for WCAG 2.5.5
                    // P2-9 FIX: Add focus ring for keyboard navigation
                    "flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow-md border text-xs font-medium transition-all min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                    activeCategories.size > 0
                        ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white"
                        : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                )}
                aria-label={activeCategories.size > 0 ? "Hide all POIs" : "Show all POIs"}
                aria-pressed={activeCategories.size > 0}
                title="Toggle POI layers"
            >
                <Layers className="w-3.5 h-3.5" />
                POIs
            </button>

            {/* Individual category toggles */}
            {categories.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={cn(
                        // P2-8 FIX: Ensure 44px minimum touch target for WCAG 2.5.5
                        // P2-9 FIX: Add focus ring for keyboard navigation
                        "flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow-sm border text-xs transition-all min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                        activeCategories.has(cat.id)
                            ? "bg-zinc-800 text-white border-zinc-800 dark:bg-zinc-200 dark:text-zinc-900 dark:border-zinc-200"
                            : "bg-white/90 dark:bg-zinc-800/90 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
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
