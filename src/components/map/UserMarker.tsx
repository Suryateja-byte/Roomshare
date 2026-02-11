'use client';

/**
 * UserMarker — allows users to drop a custom pin on the map, shows reverse-
 * geocoded address label and straight-line distance to hovered listing.
 * State is session-only (not persisted).
 */

import { Marker } from 'react-map-gl/maplibre';
import { MapPin, X, Navigation } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface UserPinState {
    lng: number;
    lat: number;
    address: string | null;
}

interface UserMarkerProps {
    /** Whether drop-pin mode is active */
    isDropMode: boolean;
    /** Toggle drop-pin mode */
    onToggleDropMode: () => void;
    /** Current user pin (null if none placed) */
    pin: UserPinState | null;
    /** Set user pin */
    onSetPin: (pin: UserPinState | null) => void;
    /** Mapbox access token */
    mapboxToken: string;
    /** Currently hovered listing coordinates */
    hoveredListingCoords: { lat: number; lng: number } | null;
    /** Dark mode */
    isDarkMode: boolean;
}

/** Calculate straight-line distance in km between two points (Haversine) */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)}m`;
    return `${km.toFixed(1)}km`;
}

export function UserMarker({
    isDropMode,
    onToggleDropMode,
    pin,
    onSetPin,
    mapboxToken,
    hoveredListingCoords,
    isDarkMode,
}: UserMarkerProps) {
    const abortRef = useRef<AbortController | null>(null);

    // Reverse geocode when pin is placed
    const reverseGeocode = useCallback(async (lng: number, lat: number): Promise<string | null> => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&types=address,poi&limit=1`;
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) return null;
            const data = await res.json();
            return data.features?.[0]?.place_name ?? null;
        } catch {
            return null;
        }
    }, [mapboxToken]);

    // Clean up on unmount
    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const distance = pin && hoveredListingCoords
        ? haversineKm(pin.lat, pin.lng, hoveredListingCoords.lat, hoveredListingCoords.lng)
        : null;

    return (
        <>
            {/* Drop-a-pin control button */}
            <button
                onClick={onToggleDropMode}
                className={cn(
                    // P2-8 FIX: Ensure 44px minimum touch target for WCAG 2.5.5
                    "absolute bottom-4 left-4 z-10 flex items-center justify-center gap-2 px-3 py-2 rounded-lg shadow-md border text-sm font-medium transition-all min-h-[44px]",
                    isDropMode
                        ? "bg-rose-500 text-white border-rose-500 ring-2 ring-rose-300"
                        : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                )}
                aria-label={isDropMode ? "Cancel drop pin" : "Drop a pin on the map"}
                title={isDropMode ? "Cancel" : "Drop a pin"}
            >
                <MapPin className="w-4 h-4" />
                {isDropMode ? "Cancel" : "Drop pin"}
            </button>

            {/* Rendered user pin marker */}
            {pin && (
                <Marker
                    longitude={pin.lng}
                    latitude={pin.lat}
                    anchor="bottom"
                    draggable
                    onDragEnd={async (e) => {
                        const { lng, lat } = e.lngLat;
                        const address = await reverseGeocode(lng, lat);
                        onSetPin({ lng, lat, address });
                    }}
                >
                    <div className="relative flex flex-col items-center animate-[fadeIn_200ms_ease-out]">
                        {/* Pin icon */}
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shadow-lg",
                            "bg-rose-500 text-white ring-2 ring-white dark:ring-zinc-900"
                        )}>
                            <MapPin className="w-4 h-4" />
                        </div>
                        {/* Pin tail */}
                        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-rose-500 -mt-[1px]" />

                        {/* Address label + distance */}
                        <div className={cn(
                            "absolute top-full mt-2 px-2 py-1 rounded-md shadow-md text-xs whitespace-nowrap max-w-[200px] truncate",
                            isDarkMode ? "bg-zinc-800 text-zinc-200" : "bg-white text-zinc-800"
                        )}>
                            <div className="flex items-center gap-1">
                                {pin.address ? (
                                    <span className="truncate">{pin.address.split(',')[0]}</span>
                                ) : (
                                    <span className="text-zinc-400">Custom pin</span>
                                )}
                                {/* P1-FIX (#97): Ensure 44px minimum touch target for WCAG 2.5.5.
                                    The visual icon is small (12px) but touch area is 44x44 via negative margin. */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onSetPin(null); }}
                                    className="ml-1 hover:text-rose-500 flex-shrink-0 min-w-[44px] min-h-[44px] -m-3 p-3 flex items-center justify-center touch-manipulation"
                                    aria-label="Remove pin"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                            {distance !== null && (
                                <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    <Navigation className="w-3 h-3" />
                                    <span>{formatDistance(distance)} to hovered listing</span>
                                </div>
                            )}
                        </div>
                    </div>
                </Marker>
            )}
        </>
    );
}

/**
 * Hook for managing user pin state and drop-mode in the parent Map component.
 * Call `handleMapClick` from the Map's onClick when drop mode is active.
 */
export function useUserPin(mapboxToken: string) {
    const [isDropMode, setIsDropMode] = useState(false);
    const [pin, setPin] = useState<UserPinState | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const toggleDropMode = useCallback(() => {
        setIsDropMode(prev => !prev);
    }, []);

    const handleMapClick = useCallback(async (lng: number, lat: number) => {
        if (!isDropMode) return false; // Not handled

        // Place pin and reverse geocode
        setPin({ lng, lat, address: null });
        setIsDropMode(false);

        // Cancel any in-flight geocode request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&types=address,poi&limit=1`;
            const res = await fetch(url, { signal: controller.signal });
            if (res.ok && !controller.signal.aborted) {
                const data = await res.json();
                const address = data.features?.[0]?.place_name ?? null;
                setPin(prev => prev ? { ...prev, address } : null);
            }
        } catch {
            // Address lookup failed — pin still works without label
        }

        return true; // Handled
    }, [isDropMode, mapboxToken]);

    // Clean up on unmount
    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    return { isDropMode, toggleDropMode, pin, setPin, handleMapClick };
}
