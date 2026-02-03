'use client';

/**
 * Map Component for displaying listings with marker clustering
 *
 * Uses Mapbox GL JS built-in clustering for performance optimization.
 * - Clustered points show as circles with count
 * - Individual points show custom price markers
 * - Click cluster to zoom and expand
 */

import '@/lib/mapbox-init'; // Must be first - initializes worker
import Map, { Marker, Popup, Source, Layer, MapLayerMouseEvent, ViewStateChangeEvent } from 'react-map-gl';
import type { LayerProps, GeoJSONSource } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Home, Loader2, MapPin, Maximize2, X, Map as MapIcon, Satellite, TrainFront } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { Button } from './ui/button';
import { MAP_FLY_TO_EVENT, MapFlyToEventDetail } from './SearchForm';
import { useListingFocus } from '@/contexts/ListingFocusContext';
import { useSearchTransitionSafe } from '@/contexts/SearchTransitionContext';
import { useMapBounds, useMapMovedBanner } from '@/contexts/MapBoundsContext';
import { MapMovedBanner } from './map/MapMovedBanner';
import { MapGestureHint } from './map/MapGestureHint';
import { PrivacyCircle } from './map/PrivacyCircle';
import { BoundaryLayer } from './map/BoundaryLayer';
import { UserMarker, useUserPin } from './map/UserMarker';
import { POILayer } from './map/POILayer';
import { cn } from '@/lib/utils';

interface Listing {
    id: string;
    title: string;
    price: number;
    availableSlots: number;
    ownerId?: string;
    images?: string[];
    location: {
        lat: number;
        lng: number;
    };
    /** Pin tier for differentiated styling: primary = larger, mini = smaller */
    tier?: "primary" | "mini";
}

interface MarkerPosition {
    listing: Listing;
    lat: number;
    lng: number;
}

// Mapbox Layer Colors - Synced with Tailwind Zinc Palette
const MAP_COLORS = {
    zinc900: '#18181b',
    white: '#ffffff',
    zinc800: '#27272a',
};

// Price bucket colors for cluster rings (green = affordable, yellow = mid, red = expensive)
const CLUSTER_RING_COLORS = {
    green: '#22c55e',   // < $800/mo avg
    yellow: '#eab308',  // $800-$1500/mo avg
    red: '#ef4444',     // > $1500/mo avg
};

// Shared cluster radius expression
const clusterRadiusExpr = [
    'step',
    ['get', 'point_count'],
    20,      // 20px radius for < 10 points
    10, 25,  // 25px radius for 10-49 points
    50, 32,  // 32px radius for 50-99 points
    100, 40  // 40px radius for 100+ points
] as const;

// Price-colored outer ring for clusters (rendered behind main cluster circle)
const clusterRingLayer: LayerProps = {
    id: 'cluster-ring',
    type: 'circle',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': 'transparent',
        'circle-radius': [
            'step',
            ['get', 'point_count'],
            24, 10, 29, 50, 36, 100, 44
        ],
        'circle-stroke-width': 3,
        'circle-stroke-color': [
            'step',
            ['/', ['get', 'priceSum'], ['get', 'point_count']],
            CLUSTER_RING_COLORS.green,
            800, CLUSTER_RING_COLORS.yellow,
            1500, CLUSTER_RING_COLORS.red,
        ],
        'circle-stroke-opacity': 0.7,
    }
};

// Cluster layer - circles for grouped markers
// Note: No 'source' property - Layer inherits from parent Source component
const clusterLayer: LayerProps = {
    id: 'clusters',
    type: 'circle',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': MAP_COLORS.zinc900,
        'circle-radius': clusterRadiusExpr as unknown as number,
        'circle-stroke-width': 3,
        'circle-stroke-color': MAP_COLORS.white
    }
};

// Dark mode cluster layer
const clusterLayerDark: LayerProps = {
    id: 'clusters-dark',
    type: 'circle',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': MAP_COLORS.white,
        'circle-radius': clusterRadiusExpr as unknown as number,
        'circle-stroke-width': 3,
        'circle-stroke-color': MAP_COLORS.zinc900
    }
};

// Cluster count label layer — shows "50+" for large clusters
// text-size scales with OS/browser font-size settings via textScale factor
const clusterCountTextField = [
    'step',
    ['get', 'point_count'],
    ['to-string', ['get', 'point_count']],
    50, ['concat', ['to-string', ['get', 'point_count_abbreviated']], '+'],
] as unknown as string;

function getClusterCountLayer(textScale: number): LayerProps {
    return {
        id: 'cluster-count',
        type: 'symbol',
        filter: ['has', 'point_count'],
        layout: {
            'text-field': clusterCountTextField,
            'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': Math.round(14 * textScale)
        },
        paint: { 'text-color': MAP_COLORS.white }
    };
}

function getClusterCountLayerDark(textScale: number): LayerProps {
    return {
        id: 'cluster-count-dark',
        type: 'symbol',
        filter: ['has', 'point_count'],
        layout: {
            'text-field': clusterCountTextField,
            'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': Math.round(14 * textScale)
        },
        paint: { 'text-color': MAP_COLORS.zinc900 }
    };
}

// Always use clustering — Mapbox handles any count gracefully.
// With few listings, clusters simply won't form and individual markers show.
// Previously used a threshold of 50, but this caused stale cluster layers
// when the persistent map transitioned across the threshold boundary.

// Zoom thresholds for two-tier pin display
const ZOOM_DOTS_ONLY = 12;     // Below: all pins are gray dots (no price)
const ZOOM_TOP_N_PINS = 14;    // 12-14: primary = price pins, mini = dots. 14+: all price pins

export default function MapComponent({ listings }: { listings: Listing[] }) {
    const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
    const [unclusteredListings, setUnclusteredListings] = useState<Listing[]>([]);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isHighContrast, setIsHighContrast] = useState(false);
    // Scale map label text with OS/browser font-size (Dynamic Type support)
    const [textScale, setTextScale] = useState(1);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(12);
    const [mapStyleKey, setMapStyleKey] = useState<'standard' | 'satellite' | 'transit'>(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('roomshare-map-style');
            if (saved === 'satellite' || saved === 'transit') return saved;
        }
        return 'standard';
    });
    const [areTilesLoading, setAreTilesLoading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const { hoveredId, activeId, setHovered, setActive, requestScrollTo } = useListingFocus();
    const router = useRouter();
    const searchParams = useSearchParams();
    const transitionContext = useSearchTransitionSafe();

    // Map bounds context for "search as move" and dirty tracking
    const {
        searchAsMove,
        setSearchAsMove,
        setHasUserMoved,
        setBoundsDirty,
        setCurrentMapBounds,
        setSearchHandler,
        setResetHandler,
        setSearchLocation,
        setProgrammaticMove,
        isProgrammaticMoveRef,
    } = useMapBounds();

    // Banner visibility from context
    const { showBanner, showLocationConflict, onSearch, onReset, areaCount, isAreaCountLoading } = useMapMovedBanner();

    const mapRef = useRef<any>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const lastSearchTimeRef = useRef<number>(0);
    const pendingBoundsRef = useRef<{ minLng: number; maxLng: number; minLat: number; maxLat: number } | null>(null);
    const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Track URL bounds for reset functionality
    const urlBoundsRef = useRef<{ minLng: number; maxLng: number; minLat: number; maxLat: number } | null>(null);
    // Request deduplication: skip search if bounds haven't changed
    const lastSearchBoundsRef = useRef<string | null>(null);
    // P0 Issue #25: Track mount state to prevent stale callbacks updating state after unmount
    const isMountedRef = useRef(true);
    // Track map-initiated activeId to avoid re-triggering popup from card "Show on Map"
    const lastMapActiveRef = useRef<string | null>(null);
    // Skip the very first moveEnd (map settling at initialViewState) to prevent
    // search-as-move from locking URL to SF defaults before auto-fly runs
    const isInitialMoveRef = useRef(true);

    // Minimum interval between map searches (prevents 429 rate limiting)
    const MIN_SEARCH_INTERVAL_MS = 2000;

    // E2E testing instrumentation - track map instance for persistence tests
    // Only runs when NEXT_PUBLIC_E2E=true to avoid polluting production
    useEffect(() => {
        if (process.env.NEXT_PUBLIC_E2E === 'true') {
            // Namespace to avoid global collisions
            const roomshare = ((window as unknown as Record<string, unknown>).__roomshare || {}) as Record<string, unknown>;
            (window as unknown as Record<string, unknown>).__roomshare = roomshare;

            // Only set mapInstanceId once on mount (persists across re-renders)
            if (!roomshare.mapInstanceId) {
                roomshare.mapInstanceId = crypto.randomUUID();
            }

            // Increment init count each time component mounts
            roomshare.mapInitCount = ((roomshare.mapInitCount as number) || 0) + 1;

            console.log('[Map E2E] Component mounted', {
                instanceId: roomshare.mapInstanceId,
                initCount: roomshare.mapInitCount
            });
        }
    }, []); // Empty deps = only on mount

    // Detect dark mode
    useEffect(() => {
        const checkDarkMode = () => {
            setIsDarkMode(document.documentElement.classList.contains('dark'));
        };
        checkDarkMode();

        // Watch for theme changes
        const observer = new MutationObserver(checkDarkMode);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        return () => observer.disconnect();
    }, []);

    // Detect high contrast preference
    useEffect(() => {
        const mq = window.matchMedia('(prefers-contrast: more)');
        setIsHighContrast(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsHighContrast(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Detect OS/browser font-size scale for map label Dynamic Type support
    useEffect(() => {
        const update = () => {
            const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
            setTextScale(rootFontSize / 16);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    const scaledClusterCountLayer = useMemo(() => getClusterCountLayer(textScale), [textScale]);
    const scaledClusterCountLayerDark = useMemo(() => getClusterCountLayerDark(textScale), [textScale]);

    // Always enable clustering — Mapbox handles any count gracefully.
    // With few listings clusters simply won't form and individual markers show.
    const useClustering = true;

    // Convert listings to GeoJSON for Mapbox clustering
    const geojsonData = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: listings.map(listing => ({
            type: 'Feature' as const,
            geometry: {
                type: 'Point' as const,
                coordinates: [listing.location.lng, listing.location.lat]
            },
            properties: {
                id: listing.id,
                title: listing.title,
                price: listing.price,
                availableSlots: listing.availableSlots,
                ownerId: listing.ownerId || '',
                images: JSON.stringify(listing.images || []),
                lat: listing.location.lat,
                lng: listing.location.lng,
                // P3a: Include tier for differentiated pin styling (primary = larger, mini = smaller)
                tier: listing.tier
            }
        }))
    }), [listings]);

    // Handle cluster click to zoom in and expand
    const onClusterClick = useCallback((event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || !mapRef.current) return;

        const clusterId = feature.properties?.cluster_id;
        if (!clusterId) return;

        const mapboxSource = mapRef.current.getSource('listings') as GeoJSONSource | undefined;
        if (!mapboxSource) return;

        try {
            mapboxSource.getClusterExpansionZoom(clusterId, (err: Error | null, zoom: number) => {
                if (err || !feature.geometry || feature.geometry.type !== 'Point') return;
                // P0 Issue #25: Guard against stale callback after unmount
                if (!isMountedRef.current) return;

                // Mark as programmatic move to prevent banner showing
                setProgrammaticMove(true);
                mapRef.current?.flyTo({
                    center: feature.geometry.coordinates as [number, number],
                    zoom: zoom,
                    duration: 700,
                    padding: { top: 50, bottom: 50, left: 50, right: 50 },
                });
            });
        } catch (error) {
            console.warn('Cluster expansion failed', error);
        }
    }, [setProgrammaticMove]);

    // Update unclustered listings when map moves (for rendering individual markers)
    const updateUnclusteredListings = useCallback(() => {
        if (!mapRef.current || !useClustering) return;

        const map = mapRef.current.getMap();
        if (!map || !map.getSource('listings')) return;

        // Query for unclustered points (points without cluster)
        const features = map.querySourceFeatures('listings', {
            filter: ['!', ['has', 'point_count']]
        });

        const unclustered = features.map((f: any) => ({
            id: f.properties.id,
            title: f.properties.title,
            price: f.properties.price,
            availableSlots: f.properties.availableSlots,
            ownerId: f.properties.ownerId,
            images: JSON.parse(f.properties.images || '[]'),
            location: {
                lat: f.properties.lat,
                lng: f.properties.lng
            },
            tier: f.properties.tier
        }));

        // Deduplicate by id
        const seen = new Set<string>();
        const unique = unclustered.filter((l: Listing) => {
            if (seen.has(l.id)) return false;
            seen.add(l.id);
            return true;
        });

        // P0 Issue #25: Guard against state update after unmount
        if (!isMountedRef.current) return;
        setUnclusteredListings(unique);
    }, [useClustering]);

    // Add small offsets to markers that share the same coordinates
    // When clustering, use unclustered listings; otherwise use all listings
    const markersSource = useClustering ? unclusteredListings : listings;

    const markerPositions = useMemo(() => {
        const positions: MarkerPosition[] = [];
        const coordsCounts: Record<string, number> = {};

        // First pass: count how many listings share each coordinate
        markersSource.forEach(listing => {
            const key = `${listing.location.lat},${listing.location.lng}`;
            coordsCounts[key] = (coordsCounts[key] || 0) + 1;
        });

        // Second pass: add offsets for overlapping markers
        const coordsIndices: Record<string, number> = {};

        markersSource.forEach(listing => {
            const key = `${listing.location.lat},${listing.location.lng}`;
            const count = coordsCounts[key] || 1;

            if (count === 1) {
                // No overlap, use original coordinates
                positions.push({
                    listing,
                    lat: listing.location.lat,
                    lng: listing.location.lng
                });
            } else {
                // Multiple markers at same location - add small offset
                const index = coordsIndices[key] || 0;
                coordsIndices[key] = index + 1;

                // Calculate offset in a circular pattern around the original point
                const angle = (index / count) * 2 * Math.PI;
                const offsetDistance = 0.0015; // ~150 meters offset

                const latOffset = Math.cos(angle) * offsetDistance;
                const lngOffset = Math.sin(angle) * offsetDistance;

                positions.push({
                    listing,
                    lat: listing.location.lat + latOffset,
                    lng: listing.location.lng + lngOffset
                });
            }
        });

        return positions;
    }, [markersSource]);

    // Stabilize initial view state so it's only computed once on mount.
    // Prevents SF default from being re-applied when listings temporarily become empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initialViewState = useMemo(() =>
        (() => {
            const minLat = searchParams.get('minLat');
            const maxLat = searchParams.get('maxLat');
            const minLng = searchParams.get('minLng');
            const maxLng = searchParams.get('maxLng');

            if (minLat && maxLat && minLng && maxLng) {
                const parsedMinLat = parseFloat(minLat);
                const parsedMaxLat = parseFloat(maxLat);
                const parsedMinLng = parseFloat(minLng);
                const parsedMaxLng = parseFloat(maxLng);

                if (
                    Number.isFinite(parsedMinLat) &&
                    Number.isFinite(parsedMaxLat) &&
                    Number.isFinite(parsedMinLng) &&
                    Number.isFinite(parsedMaxLng)
                ) {
                    const centerLat = (parsedMinLat + parsedMaxLat) / 2;
                    let centerLng: number;

                    if (parsedMinLng > parsedMaxLng) {
                        const wrappedMaxLng = parsedMaxLng + 360;
                        centerLng = (parsedMinLng + wrappedMaxLng) / 2;
                        if (centerLng > 180) centerLng -= 360;
                    } else {
                        centerLng = (parsedMinLng + parsedMaxLng) / 2;
                    }

                    return { longitude: centerLng, latitude: centerLat, zoom: 12 };
                }
            }

            return listings.length > 0
                ? { longitude: listings[0].location.lng, latitude: listings[0].location.lat, zoom: 12 }
                : { longitude: -122.4194, latitude: 37.7749, zoom: 12 };
        })(),
    []);

    // Auto-fly to listings on search (but not on map move)
    useEffect(() => {
        if (!mapRef.current || listings.length === 0) return;

        // If "search as I move" is ON, the user controls the viewport — don't auto-fly
        if (searchAsMove) return;

        // If we have map bounds in the URL, it means the user is panning/zooming manually
        // So we shouldn't auto-fly the map
        if (searchParams.has('minLat')) return;

        const points = listings.map(l => ({ lng: l.location.lng, lat: l.location.lat }));

        // Mark as programmatic move to prevent banner showing
        setProgrammaticMove(true);

        if (points.length === 1) {
            mapRef.current.flyTo({
                center: [points[0].lng, points[0].lat],
                zoom: 14,
                duration: 2000
            });
        } else {
            // Calculate bounds
            const minLng = Math.min(...points.map(p => p.lng));
            const maxLng = Math.max(...points.map(p => p.lng));
            const minLat = Math.min(...points.map(p => p.lat));
            const maxLat = Math.max(...points.map(p => p.lat));

            mapRef.current.fitBounds(
                [
                    [minLng, minLat],
                    [maxLng, maxLat]
                ],
                {
                    padding: { top: 50, bottom: 50, left: 50, right: 50 },
                    duration: 2000
                }
            );
        }
    }, [listings, searchParams, searchAsMove, setProgrammaticMove]);

    // Listen for fly-to events from location search
    useEffect(() => {
        const handleFlyTo = (event: CustomEvent<MapFlyToEventDetail>) => {
            if (!mapRef.current) return;

            const { lat, lng, bbox, zoom } = event.detail;

            // Mark as programmatic move to prevent banner showing
            setProgrammaticMove(true);

            // If bbox (bounding box) is available, use fitBounds for a better view
            if (bbox) {
                mapRef.current.fitBounds(
                    [
                        [bbox[0], bbox[1]], // [minLng, minLat]
                        [bbox[2], bbox[3]]  // [maxLng, maxLat]
                    ],
                    {
                        padding: { top: 50, bottom: 50, left: 50, right: 50 },
                        duration: 2000,
                        essential: true
                    }
                );
            } else {
                // Use flyTo with smooth animation
                mapRef.current.flyTo({
                    center: [lng, lat],
                    zoom: zoom || 13,
                    duration: 2000,
                    essential: true,
                    curve: 1.42, // Animation curve (ease)
                    speed: 1.2  // Animation speed
                });
            }
        };

        window.addEventListener(MAP_FLY_TO_EVENT, handleFlyTo as EventListener);
        return () => {
            window.removeEventListener(MAP_FLY_TO_EVENT, handleFlyTo as EventListener);
        };
    }, [setProgrammaticMove]);

    // Clear searching state when listings update from SSR
    // Also update E2E marker count tracking
    useEffect(() => {
        // P0 Issue #25: Guard against state update after unmount
        if (!isMountedRef.current) return;
        setIsSearching(false);

        // E2E testing: expose marker count for test verification
        if (process.env.NEXT_PUBLIC_E2E === 'true') {
            const roomshare = ((window as unknown as Record<string, unknown>).__roomshare || {}) as Record<string, unknown>;
            (window as unknown as Record<string, unknown>).__roomshare = roomshare;
            roomshare.markerCount = listings.length;
        }
    }, [listings]);

    // Cleanup timers on unmount and mark component as unmounted
    useEffect(() => {
        return () => {
            // P0 Issue #25: Mark unmounted to prevent stale state updates
            isMountedRef.current = false;
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
            if (throttleTimeoutRef.current) {
                clearTimeout(throttleTimeoutRef.current);
            }
        };
    }, []);

    // Keyboard: Escape closes popup
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedListing) {
                setSelectedListing(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedListing]);

    // Sync URL bounds to context and track for reset functionality
    useEffect(() => {
        const minLat = searchParams.get('minLat');
        const maxLat = searchParams.get('maxLat');
        const minLng = searchParams.get('minLng');
        const maxLng = searchParams.get('maxLng');

        if (minLat && maxLat && minLng && maxLng) {
            const bounds = {
                minLat: parseFloat(minLat),
                maxLat: parseFloat(maxLat),
                minLng: parseFloat(minLng),
                maxLng: parseFloat(maxLng),
            };
            urlBoundsRef.current = bounds;
        }

        // Extract search location from URL for location conflict detection
        const q = searchParams.get('q');
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');

        if (q && lat && lng) {
            setSearchLocation(q, { lat: parseFloat(lat), lng: parseFloat(lng) });
        } else if (q) {
            setSearchLocation(q, null);
        } else {
            setSearchLocation(null, null);
        }

        // Reset dirty state when URL changes (new search performed)
        setHasUserMoved(false);
        setBoundsDirty(false);
    }, [searchParams, setSearchLocation, setHasUserMoved, setBoundsDirty]);

    // Suppress mapbox-gl worker communication errors during HMR/Turbopack
    // These are non-fatal and occur when the worker connection is lost during hot reload
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            const message = event.message || '';
            if (message.includes("reading 'send'") || message.includes("reading 'target'")) {
                event.preventDefault();
                console.warn('[Map] Suppressed worker communication error during HMR');
            }
        };

        window.addEventListener('error', handleError);
        return () => window.removeEventListener('error', handleError);
    }, []);

    // Execute the actual search with the given bounds
    const executeMapSearch = useCallback((bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number }) => {
        // Request deduplication: skip if bounds haven't meaningfully changed (rounded to 4 decimal places ~11m precision)
        const boundsKey = `${bounds.minLng.toFixed(4)},${bounds.maxLng.toFixed(4)},${bounds.minLat.toFixed(4)},${bounds.maxLat.toFixed(4)}`;
        if (boundsKey === lastSearchBoundsRef.current) return;
        lastSearchBoundsRef.current = boundsKey;

        const params = new URLSearchParams(searchParams.toString());

        // Remove single point coordinates since we now have bounds
        params.delete('lat');
        params.delete('lng');
        // Reset pagination state when bounds change (keyset + offset)
        params.delete('page');
        params.delete('cursor');
        params.delete('cursorStack');
        params.delete('pageNumber');

        params.set('minLng', bounds.minLng.toString());
        params.set('maxLng', bounds.maxLng.toString());
        params.set('minLat', bounds.minLat.toString());
        params.set('maxLat', bounds.maxLat.toString());

        lastSearchTimeRef.current = Date.now();
        pendingBoundsRef.current = null;
        setIsSearching(true);
        // Use replace to update bounds without creating history entries
        // This prevents Back button from stepping through each map pan position
        const url = `/search?${params.toString()}`;
        if (transitionContext) {
            transitionContext.replaceWithTransition(url);
        } else {
            router.replace(url);
        }
    }, [router, searchParams, transitionContext]);

    // Register search and reset handlers with context (after executeMapSearch is defined)
    useEffect(() => {
        // Search handler: execute search with current map bounds
        setSearchHandler(() => {
            if (!mapRef.current) return;
            const map = mapRef.current.getMap();
            if (!map) return;

            const mapBounds = map.getBounds();
            if (!mapBounds) return;

            const bounds = {
                minLng: mapBounds.getWest(),
                maxLng: mapBounds.getEast(),
                minLat: mapBounds.getSouth(),
                maxLat: mapBounds.getNorth(),
            };

            executeMapSearch(bounds);
            setHasUserMoved(false);
            setBoundsDirty(false);
        });

        // Reset handler: fly back to URL bounds
        setResetHandler(() => {
            if (!mapRef.current || !urlBoundsRef.current) return;

            // Mark as programmatic move to prevent banner showing
            setProgrammaticMove(true);

            const { minLng, maxLng, minLat, maxLat } = urlBoundsRef.current;
            mapRef.current.fitBounds(
                [[minLng, minLat], [maxLng, maxLat]],
                { padding: 50, duration: 1000 }
            );
            setHasUserMoved(false);
            setBoundsDirty(false);
        });
    }, [executeMapSearch, setSearchHandler, setResetHandler, setHasUserMoved, setBoundsDirty, setProgrammaticMove]);

    // When a card's "Show on Map" button sets activeId, open popup and center map
    useEffect(() => {
        if (!activeId || activeId === lastMapActiveRef.current) return;
        const listing = listings.find((l) => l.id === activeId);
        if (!listing) return;
        setSelectedListing(listing);
        setProgrammaticMove(true);
        mapRef.current?.easeTo({
            center: [listing.location.lng, listing.location.lat],
            offset: [0, -150],
            duration: 400,
        });
    }, [activeId, listings, setProgrammaticMove]);

    const handleMoveEnd = (e: ViewStateChangeEvent) => {
        // Track zoom for two-tier pin display
        setCurrentZoom(e.viewState.zoom);
        // Update unclustered listings for rendering individual markers
        updateUnclusteredListings();

        // Get current map bounds
        const mapBounds = e.target.getBounds();
        if (!mapBounds) return;

        const bounds = {
            minLng: mapBounds.getWest(),
            maxLng: mapBounds.getEast(),
            minLat: mapBounds.getSouth(),
            maxLat: mapBounds.getNorth()
        };

        // Always update current bounds in context for location conflict detection
        setCurrentMapBounds(bounds);

        // Skip search/dirty logic during programmatic moves (auto-fly, card click, cluster expand)
        if (isProgrammaticMoveRef.current) {
            setProgrammaticMove(false); // Clear immediately on moveend instead of waiting for timeout
            return;
        }

        // Skip the very first moveEnd (map settling at initialViewState)
        // This prevents search-as-move from locking URL to SF defaults
        // before the auto-fly effect has a chance to run
        if (isInitialMoveRef.current) {
            isInitialMoveRef.current = false;
            return;
        }

        // Mark that user has manually moved the map
        setHasUserMoved(true);

        // If search-as-move is ON, trigger search with throttle/debounce
        if (searchAsMove) {
            // Don't trigger search when zoomed out too far — viewport exceeds server max span
            const latSpan = bounds.maxLat - bounds.minLat;
            const lngSpan = bounds.maxLng - bounds.minLng;
            if (latSpan > 5 || lngSpan > 5) {
                setBoundsDirty(true);
                return;
            }

            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }

            debounceTimer.current = setTimeout(() => {
                const now = Date.now();
                const timeSinceLastSearch = now - lastSearchTimeRef.current;

                // If we're within the throttle window, queue the search for later
                if (timeSinceLastSearch < MIN_SEARCH_INTERVAL_MS) {
                    pendingBoundsRef.current = bounds;

                    // Clear any existing throttle timeout
                    if (throttleTimeoutRef.current) {
                        clearTimeout(throttleTimeoutRef.current);
                    }

                    // Schedule the pending search for when the throttle window expires
                    const delay = MIN_SEARCH_INTERVAL_MS - timeSinceLastSearch;
                    throttleTimeoutRef.current = setTimeout(() => {
                        if (pendingBoundsRef.current) {
                            executeMapSearch(pendingBoundsRef.current);
                        }
                    }, delay);
                    return;
                }

                // Execute immediately if outside throttle window
                executeMapSearch(bounds);
            }, 500); // 500ms debounce
        } else {
            // Search-as-move is OFF - mark bounds as dirty so banner shows
            setBoundsDirty(true);
        }
    };

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    // User pin (drop-a-pin) state
    const { isDropMode, toggleDropMode, pin: userPin, setPin: setUserPin, handleMapClick: handleUserPinClick } = useUserPin(token || '');

    // Get hovered listing coords for distance display
    const hoveredListingCoords = useMemo(() => {
        if (!hoveredId) return null;
        const listing = listings.find(l => l.id === hoveredId);
        return listing ? { lat: listing.location.lat, lng: listing.location.lng } : null;
    }, [hoveredId, listings]);

    if (!token) {
        return (
            <div className="w-full h-full rounded-xl overflow-hidden border shadow-lg relative bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-center">
                    <p className="font-bold">Mapbox Token Missing</p>
                    <p className="text-sm">Please add NEXT_PUBLIC_MAPBOX_TOKEN to your .env file</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="w-full h-full rounded-xl overflow-hidden border shadow-lg relative group"
            role="region"
            aria-label="Interactive map showing listing locations"
            aria-roledescription="map"
            onWheel={(e) => e.stopPropagation()}
        >
            {/* Initial loading skeleton */}
            {!isMapLoaded && (
                <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-800 z-20 flex items-center justify-center" role="status" aria-label="Loading map">
                    <div className="flex flex-col items-center gap-3">
                        <MapPin className="w-10 h-10 text-zinc-300 dark:text-zinc-600 animate-pulse" aria-hidden="true" />
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">Loading map...</span>
                    </div>
                </div>
            )}

            {/* Tile loading indicator */}
            {isMapLoaded && areTilesLoading && (
                <div className="absolute inset-0 bg-zinc-100/30 dark:bg-zinc-900/30 backdrop-blur-[1px] z-10 flex items-center justify-center pointer-events-none" role="status" aria-label="Loading map tiles">
                    <div className="flex items-center gap-2 bg-white/90 dark:bg-zinc-800/90 px-4 py-2 rounded-lg shadow-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-600 dark:text-zinc-300" aria-hidden="true" />
                        <span className="text-sm text-zinc-600 dark:text-zinc-300">Loading tiles...</span>
                    </div>
                </div>
            )}

            {/* Search-as-move loading indicator */}
            {isSearching && isMapLoaded && !areTilesLoading && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-zinc-800/90 px-3 py-2 rounded-lg shadow-sm flex items-center gap-2 z-10 pointer-events-none" role="status" aria-label="Searching area">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-600 dark:text-zinc-300" aria-hidden="true" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">Searching area...</span>
                </div>
            )}

            {/* Issue #11: Screen reader announcement for marker selection */}
            <div
                className="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {selectedListing
                    ? `Selected listing: ${selectedListing.title}, $${selectedListing.price} per month, ${selectedListing.availableSlots > 0 ? `${selectedListing.availableSlots} spots available` : 'currently filled'}`
                    : ''
                }
            </div>

            <Map
                ref={mapRef}
                mapboxAccessToken={token}
                initialViewState={initialViewState}
                style={{ width: '100%', height: '100%' }}
                scrollZoom={true}
                dragPan={true}
                doubleClickZoom={true}
                keyboard={true}
                touchZoomRotate={true}
                mapStyle={(() => {
                    if (isHighContrast) {
                        return isDarkMode ? "mapbox://styles/mapbox/navigation-night-v1" : "mapbox://styles/mapbox/navigation-day-v1";
                    }
                    if (mapStyleKey === 'satellite') {
                        return "mapbox://styles/mapbox/satellite-streets-v12";
                    }
                    if (mapStyleKey === 'transit') {
                        return isDarkMode ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";
                    }
                    return isDarkMode ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v11";
                })()}
                onMoveEnd={handleMoveEnd}
                onLoad={() => {
                    setIsMapLoaded(true);
                    updateUnclusteredListings();

                    // Restore exact viewport from URL bounds on (re)mount.
                    // When the map remounts during "search as I move" navigation,
                    // initialViewState only sets center + zoom 12 which doesn't
                    // match the user's actual viewport. fitBounds restores it exactly.
                    if (mapRef.current) {
                        const sp = searchParams;
                        const minLat = sp.get('minLat');
                        const maxLat = sp.get('maxLat');
                        const minLng = sp.get('minLng');
                        const maxLng = sp.get('maxLng');
                        if (minLat && maxLat && minLng && maxLng) {
                            const bounds: [[number, number], [number, number]] = [
                                [parseFloat(minLng), parseFloat(minLat)],
                                [parseFloat(maxLng), parseFloat(maxLat)],
                            ];
                            setProgrammaticMove(true);
                            mapRef.current.fitBounds(bounds, { duration: 0, padding: 0 });
                        }
                    }
                }}
                onMoveStart={() => setAreTilesLoading(true)}
                onIdle={() => setAreTilesLoading(false)}
                onClick={async (e: MapLayerMouseEvent) => {
                    // User pin drop takes priority
                    if (isDropMode && e.lngLat) {
                        await handleUserPinClick(e.lngLat.lng, e.lngLat.lat);
                        return;
                    }
                    // Otherwise handle cluster click
                    if (useClustering) onClusterClick(e);
                }}
                interactiveLayerIds={useClustering ? (isDarkMode ? ['clusters-dark', 'cluster-count-dark'] : ['clusters', 'cluster-count']) : []}
                onError={(e) => {
                    const error = (e as { error?: Error }).error;
                    const message = error?.message || 'Unknown map error';

                    // Worker communication errors are non-fatal during HMR/navigation
                    // These occur when the mapbox-gl worker loses connection during hot reload
                    if (message.includes('send') || message.includes('worker') || message.includes('Actor')) {
                        console.warn('[Map] Worker communication issue (safe to ignore during HMR):', message);
                        return;
                    }

                    console.error('Map Error:', message, error?.stack);
                }}
            >
                {/* Boundary polygon for named search areas */}
                <BoundaryLayer
                    query={searchParams.get('q')}
                    mapboxToken={token}
                    isDarkMode={isDarkMode}
                />

                {/* Privacy circles — translucent ~200m radius around listings */}
                <PrivacyCircle listings={listings} isDarkMode={isDarkMode} />

                {/* Clustering Source and Layers - Layer nested inside Source inherits source automatically */}
                {useClustering && (
                    <Source
                        id="listings"
                        type="geojson"
                        data={geojsonData}
                        cluster={true}
                        clusterMaxZoom={14}
                        clusterRadius={50}
                        clusterProperties={{
                            priceSum: ['+', ['get', 'price']],
                        }}
                    >
                        {/* Price-colored outer ring (rendered first, behind main circle) */}
                        <Layer {...clusterRingLayer} />
                        {isDarkMode && <Layer {...clusterLayerDark} />}
                        {isDarkMode && <Layer {...scaledClusterCountLayerDark} />}
                        {!isDarkMode && <Layer {...clusterLayer} />}
                        {!isDarkMode && <Layer {...scaledClusterCountLayer} />}
                    </Source>
                )}

                {/* Individual price markers - shown for unclustered points or when not clustering */}
                {markerPositions.map((position) => {
                    // Shared click handler for both Marker and inner content
                    const handleMarkerClick = () => {
                        triggerHaptic();
                        setSelectedListing(position.listing);
                        // Set active listing for card highlight and scroll-to
                        lastMapActiveRef.current = position.listing.id;
                        setActive(position.listing.id);
                        requestScrollTo(position.listing.id);
                        // Mark as programmatic move to prevent banner showing
                        setProgrammaticMove(true);
                        // Smooth pan to center popup both horizontally and vertically
                        mapRef.current?.easeTo({
                            center: [position.lng, position.lat],
                            offset: [0, -150], // NEGATIVE Y pushes marker UP, centering popup below it
                            duration: 400
                        });
                    };

                    return (
                    <Marker
                        key={position.listing.id}
                        longitude={position.lng}
                        latitude={position.lat}
                        anchor="bottom"
                        onClick={(e: any) => {
                            e.originalEvent.stopPropagation();
                            handleMarkerClick();
                        }}
                    >
                        <div
                            className={cn(
                                "relative cursor-pointer group/marker animate-[fadeIn_200ms_ease-out] motion-reduce:animate-none min-w-[44px] min-h-[44px] flex items-center justify-center",
                                // Spring easing for scale: cubic-bezier(0.34, 1.56, 0.64, 1)
                                "transition-all duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]",
                                hoveredId === position.listing.id && "scale-[1.15] z-50",
                                activeId === position.listing.id && !hoveredId && "z-40",
                                hoveredId && hoveredId !== position.listing.id && "opacity-60"
                            )}
                            data-listing-id={position.listing.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`$${position.listing.price}/month${position.listing.title ? `, ${position.listing.title}` : ""}${position.listing.availableSlots > 0 ? `, ${position.listing.availableSlots} spots available` : ", currently filled"}`}
                            onMouseEnter={() => {
                                setHovered(position.listing.id, "map");
                                requestScrollTo(position.listing.id);
                            }}
                            onMouseLeave={() => setHovered(null)}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleMarkerClick();
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleMarkerClick();
                                }
                            }}
                        >
                            {/* Zoom-based two-tier pin rendering:
                                - Below zoom 12: all pins are gray dots (no price)
                                - Zoom 12-14: primary = price pills, mini = gray dots
                                - Above zoom 14: all pins show price pills */}
                            {(() => {
                                const isMini = position.listing.tier === "mini";
                                const showAsDot = currentZoom < ZOOM_DOTS_ONLY || (currentZoom < ZOOM_TOP_N_PINS && isMini);
                                const isHovered = hoveredId === position.listing.id;

                                if (showAsDot && !isHovered) {
                                    // Gray dot marker (no price)
                                    return (
                                        <>
                                            <div className={cn(
                                                "w-3 h-3 rounded-full shadow-md transition-transform duration-200",
                                                "bg-zinc-400 dark:bg-zinc-500 ring-2 ring-white dark:ring-zinc-900",
                                                "group-hover/marker:scale-125"
                                            )} />
                                            {/* Small shadow under dot */}
                                            <div className="absolute left-1/2 -translate-x-1/2 -bottom-[1px] w-2 h-0.5 bg-zinc-950/20 dark:bg-zinc-950/40 rounded-full blur-[1px]" />
                                        </>
                                    );
                                }

                                // Price pill marker (full or mini size)
                                return (
                                    <>
                                        <div className={cn(
                                            "shadow-lg font-semibold whitespace-nowrap relative transition-all duration-200",
                                            "group-hover/marker:scale-105",
                                            isMini && currentZoom >= ZOOM_TOP_N_PINS
                                                ? "px-2 py-1 rounded-lg text-xs"
                                                : "px-3 py-1.5 rounded-xl text-sm",
                                            isHovered
                                                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white ring-2 ring-zinc-900 dark:ring-white scale-105"
                                                : "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 group-hover/marker:bg-zinc-800 dark:group-hover/marker:bg-zinc-200"
                                        )}>
                                            ${position.listing.price}
                                        </div>
                                        {/* Pin tail/pointer */}
                                        <div className={cn(
                                            "absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-transparent border-r-transparent transition-colors",
                                            isMini && currentZoom >= ZOOM_TOP_N_PINS
                                                ? "-bottom-[4px] border-l-[5px] border-r-[5px] border-t-[5px]"
                                                : "-bottom-[6px] border-l-[7px] border-r-[7px] border-t-[7px]",
                                            isHovered
                                                ? "border-t-white dark:border-t-zinc-700"
                                                : "border-t-zinc-900 dark:border-t-white group-hover/marker:border-t-zinc-800 dark:group-hover/marker:border-t-zinc-200"
                                        )} />
                                        {/* Shadow under pin */}
                                        <div className={cn(
                                            "absolute left-1/2 -translate-x-1/2 bg-zinc-950/20 dark:bg-zinc-950/40 rounded-full blur-[2px]",
                                            isMini && currentZoom >= ZOOM_TOP_N_PINS
                                                ? "-bottom-[2px] w-2 h-0.5"
                                                : "-bottom-1 w-3 h-1"
                                        )} />
                                    </>
                                );
                            })()}
                            {/* Pulsing ring on hover/active for visibility on dense maps */}
                            {(hoveredId === position.listing.id || activeId === position.listing.id) && (
                                <div className={cn(
                                    "absolute -inset-2 -top-2 rounded-full border-2 pointer-events-none motion-reduce:animate-none",
                                    hoveredId === position.listing.id
                                        ? "border-zinc-900 dark:border-white animate-ping opacity-40"
                                        : "border-zinc-400 dark:border-zinc-500 animate-[pulse-ring_2s_ease-in-out_infinite] opacity-30"
                                )} />
                            )}
                        </div>
                    </Marker>
                    );
                })}

                {selectedListing && (
                    <Popup
                        longitude={selectedListing.location.lng}
                        latitude={selectedListing.location.lat}
                        anchor="top"
                        onClose={() => setSelectedListing(null)}
                        closeOnClick={false}
                        maxWidth="320px"
                        className={`z-50 [&_.mapboxgl-popup-content]:rounded-xl [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:!bg-transparent [&_.mapboxgl-popup-content]:!shadow-none [&_.mapboxgl-popup-close-button]:hidden ${isDarkMode
                            ? '[&_.mapboxgl-popup-tip]:border-t-zinc-900'
                            : '[&_.mapboxgl-popup-tip]:border-t-white'
                            }`}
                    >
                        {/* Premium Card Design */}
                        <div className={`w-[280px] overflow-hidden rounded-xl ${isDarkMode
                            ? 'bg-zinc-900 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]'
                            : 'bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)]'
                            }`}>
                            {/* Image Thumbnail - optimized with next/image */}
                            <div className={`aspect-[16/9] relative overflow-hidden ${isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                                {selectedListing.images && selectedListing.images[0] ? (
                                    <Image
                                        src={selectedListing.images[0]}
                                        alt={selectedListing.title}
                                        fill
                                        sizes="280px"
                                        className="object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Home className={`w-10 h-10 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-300'}`} />
                                    </div>
                                )}
                                {/* Close button overlay */}
                                <div className="absolute top-2 right-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setSelectedListing(null)}
                                        className="rounded-full bg-zinc-950/50 hover:bg-zinc-950/70 text-white hover:text-white border-none"
                                        aria-label="Close listing preview"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                                {/* Availability badge */}
                                <div className="absolute bottom-2 left-2">
                                    <span className={`inline-flex px-2 py-0.5 rounded-md text-2xs font-semibold uppercase ${selectedListing.availableSlots > 0
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-zinc-900 text-white'
                                        }`}>
                                        {selectedListing.availableSlots > 0 ? `${selectedListing.availableSlots} Available` : 'Filled'}
                                    </span>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-3">
                                <h3 className={`font-semibold text-sm line-clamp-1 mb-1 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                    {selectedListing.title}
                                </h3>
                                <p className="mb-3">
                                    <span className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                                        ${selectedListing.price}
                                    </span>
                                    <span className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>/month</span>
                                </p>
                                <div className="flex gap-2">
                                    <Link href={`/listings/${selectedListing.id}`} className="flex-1">
                                        <Button
                                            size="sm"
                                            className={`w-full h-9 text-xs-plus font-medium rounded-lg ${isDarkMode
                                                ? 'bg-white text-zinc-900 hover:bg-zinc-200'
                                                : 'bg-zinc-900 text-white hover:bg-zinc-800'
                                                }`}
                                        >
                                            View Details
                                        </Button>
                                    </Link>
                                    {selectedListing.ownerId && (
                                        <Link href={`/messages?userId=${selectedListing.ownerId}`} className="flex-1">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className={`w-full h-9 text-xs-plus font-medium rounded-lg ${isDarkMode
                                                    ? 'border-zinc-700 text-white hover:bg-zinc-800'
                                                    : 'border-zinc-300 text-zinc-900 hover:bg-zinc-100'
                                                    }`}
                                            >
                                                Message
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Popup>
                )}

                {/* User-placed pin marker */}
                <UserMarker
                    isDropMode={isDropMode}
                    onToggleDropMode={toggleDropMode}
                    pin={userPin}
                    onSetPin={setUserPin}
                    mapboxToken={token}
                    hoveredListingCoords={hoveredListingCoords}
                    isDarkMode={isDarkMode}
                />
            </Map>

            {/* Search as I move toggle - prominent pill button */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                <button
                    role="switch"
                    aria-checked={searchAsMove}
                    onClick={() => setSearchAsMove(!searchAsMove)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg border text-sm font-medium transition-all select-none ${
                        searchAsMove
                            ? "bg-zinc-900 text-white border-zinc-900 ring-2 ring-green-400/30 dark:bg-white dark:text-zinc-900 dark:border-white dark:ring-green-500/30"
                            : "bg-white text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                    }`}
                >
                    <div className={`w-3 h-3 rounded-full transition-colors ${searchAsMove ? "bg-green-400" : "bg-zinc-300 dark:bg-zinc-600"}`} />
                    Search as I move
                </button>
            </div>

            {/* POI & Neighborhood label toggles */}
            <POILayer mapRef={mapRef} isMapLoaded={isMapLoaded} />

            {/* Fit all results button - zoom to show all markers */}
            {listings.length >= 1 && isMapLoaded && (
                <button
                    onClick={() => {
                        if (!mapRef.current || listings.length === 0) return;
                        const points = listings.map(l => ({ lng: l.location.lng, lat: l.location.lat }));
                        const minLng = Math.min(...points.map(p => p.lng));
                        const maxLng = Math.max(...points.map(p => p.lng));
                        const minLat = Math.min(...points.map(p => p.lat));
                        const maxLat = Math.max(...points.map(p => p.lat));
                        setProgrammaticMove(true);
                        mapRef.current.fitBounds(
                            [[minLng, minLat], [maxLng, maxLat]],
                            { padding: 50, duration: 1000 }
                        );
                    }}
                    className="absolute bottom-4 right-4 z-10 w-11 h-11 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-lg shadow-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                    aria-label="Fit all results in view"
                    title="Fit all results"
                >
                    <Maximize2 className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                </button>
            )}

            {/* Map style toggle — Standard / Satellite / Transit */}
            {isMapLoaded && (
                <div className="absolute bottom-4 right-16 z-10 flex rounded-lg shadow-md border border-zinc-200 dark:border-zinc-700 overflow-hidden" role="radiogroup" aria-label="Map style">
                    {([
                        { key: 'standard' as const, icon: <MapIcon className="w-3.5 h-3.5" />, label: 'Standard' },
                        { key: 'satellite' as const, icon: <Satellite className="w-3.5 h-3.5" />, label: 'Satellite' },
                        { key: 'transit' as const, icon: <TrainFront className="w-3.5 h-3.5" />, label: 'Transit' },
                    ]).map(style => (
                        <button
                            key={style.key}
                            role="radio"
                            aria-checked={mapStyleKey === style.key}
                            onClick={() => {
                                setMapStyleKey(style.key);
                                try { sessionStorage.setItem('roomshare-map-style', style.key); } catch { /* SSR safe */ }
                            }}
                            className={cn(
                                "flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors",
                                mapStyleKey === style.key
                                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                                    : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                            )}
                            aria-label={style.label}
                            title={style.label}
                        >
                            {style.icon}
                            <span className="hidden sm:inline">{style.label}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* MapMovedBanner - Shows when user panned with search-as-move OFF */}
            {(showBanner || showLocationConflict) && (
                <MapMovedBanner
                    variant="map"
                    onSearch={onSearch}
                    onReset={onReset}
                    areaCount={areaCount}
                    isAreaCountLoading={isAreaCountLoading}
                />
            )}

            {/* Mobile gesture hint - shown once for first-time touch users */}
            {isMapLoaded && <MapGestureHint />}

            {/* Empty state overlay - when map is loaded but no listings in viewport */}
            {isMapLoaded && !areTilesLoading && !isSearching && listings.length === 0 && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 px-5 py-4 max-w-[280px] text-center pointer-events-auto">
                    <MapPin className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" aria-hidden="true" />
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">No listings in this area</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Try zooming out or adjusting your filters</p>
                    <div className="flex gap-2 justify-center">
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8"
                            onClick={() => {
                                if (!mapRef.current) return;
                                const map = mapRef.current.getMap();
                                if (!map) return;
                                const currentZoom = map.getZoom();
                                setProgrammaticMove(true);
                                mapRef.current.flyTo({ zoom: Math.max(currentZoom - 2, 1), duration: 800 });
                            }}
                        >
                            Zoom out
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
