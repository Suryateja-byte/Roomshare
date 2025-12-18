'use client';

/**
 * Map Component for displaying listings with marker clustering
 *
 * Uses Mapbox GL JS built-in clustering for performance optimization.
 * - Clustered points show as circles with count
 * - Individual points show custom price markers
 * - Click cluster to zoom and expand
 */

import Map, { Marker, Popup, Source, Layer, MapLayerMouseEvent, ViewStateChangeEvent } from 'react-map-gl';
import type { LayerProps, GeoJSONSource } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Home, Loader2, MapPin, X } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { MAP_FLY_TO_EVENT, MapFlyToEventDetail } from './SearchForm';

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


// Cluster layer - circles for grouped markers
const clusterLayer: LayerProps = {
    id: 'clusters',
    type: 'circle',
    source: 'listings',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': MAP_COLORS.zinc900, // zinc-900
        'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,  // 20px radius for < 10 points
            10, 25,  // 25px radius for 10-49 points
            50, 32,  // 32px radius for 50-99 points
            100, 40  // 40px radius for 100+ points
        ],
        'circle-stroke-width': 3,
        'circle-stroke-color': MAP_COLORS.white
    }
};

// Dark mode cluster layer
const clusterLayerDark: LayerProps = {
    id: 'clusters-dark',
    type: 'circle',
    source: 'listings',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': MAP_COLORS.white,
        'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,
            10, 25,
            50, 32,
            100, 40
        ],
        'circle-stroke-width': 3,
        'circle-stroke-color': MAP_COLORS.zinc900
    }
};

// Cluster count label layer
const clusterCountLayer: LayerProps = {
    id: 'cluster-count',
    type: 'symbol',
    source: 'listings',
    filter: ['has', 'point_count'],
    layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 14
    },
    paint: {
        'text-color': MAP_COLORS.white
    }
};

// Dark mode cluster count
const clusterCountLayerDark: LayerProps = {
    id: 'cluster-count-dark',
    type: 'symbol',
    source: 'listings',
    filter: ['has', 'point_count'],
    layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 14
    },
    paint: {
        'text-color': MAP_COLORS.zinc900
    }
};

// Threshold for when to use clustering vs individual markers
const CLUSTER_THRESHOLD = 50;

export default function MapComponent({ listings }: { listings: Listing[] }) {
    const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
    const [searchAsMove, setSearchAsMove] = useState(true);
    const [unclusteredListings, setUnclusteredListings] = useState<Listing[]>([]);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [areTilesLoading, setAreTilesLoading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const mapRef = useRef<any>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

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

    // Use clustering only when there are many listings
    const useClustering = listings.length >= CLUSTER_THRESHOLD;

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
                lng: listing.location.lng
            }
        }))
    }), [listings]);

    // Handle cluster click to zoom in and expand
    const onClusterClick = useCallback((event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || !mapRef.current) return;

        const clusterId = feature.properties?.cluster_id;
        if (!clusterId) return;

        const mapboxSource = mapRef.current.getSource('listings') as GeoJSONSource;

        mapboxSource.getClusterExpansionZoom(clusterId, (err: Error | null, zoom: number) => {
            if (err || !feature.geometry || feature.geometry.type !== 'Point') return;

            mapRef.current?.flyTo({
                center: feature.geometry.coordinates as [number, number],
                zoom: zoom,
                duration: 500
            });
        });
    }, []);

    // Update unclustered listings when map moves (for rendering individual markers)
    const updateUnclusteredListings = useCallback(() => {
        if (!mapRef.current || !useClustering) return;

        const map = mapRef.current.getMap();
        if (!map) return;

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
            }
        }));

        // Deduplicate by id
        const seen = new Set<string>();
        const unique = unclustered.filter((l: Listing) => {
            if (seen.has(l.id)) return false;
            seen.add(l.id);
            return true;
        });

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

    // Default to San Francisco if no listings, or center on first listing
    const initialViewState = listings.length > 0
        ? { longitude: listings[0].location.lng, latitude: listings[0].location.lat, zoom: 12 }
        : { longitude: -122.4194, latitude: 37.7749, zoom: 12 };

    // Auto-fly to listings on search (but not on map move)
    useEffect(() => {
        if (!mapRef.current || listings.length === 0) return;

        // If we have map bounds in the URL, it means the user is panning/zooming manually
        // So we shouldn't auto-fly the map
        if (searchParams.has('minLat')) return;

        const points = listings.map(l => ({ lng: l.location.lng, lat: l.location.lat }));

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
    }, [listings, searchParams]);

    // Listen for fly-to events from location search
    useEffect(() => {
        const handleFlyTo = (event: CustomEvent<MapFlyToEventDetail>) => {
            if (!mapRef.current) return;

            const { lat, lng, bbox, zoom } = event.detail;

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
    }, []);

    // Clear searching state when listings update from SSR
    useEffect(() => {
        setIsSearching(false);
    }, [listings]);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    const handleMoveEnd = (e: ViewStateChangeEvent) => {
        // Update unclustered listings for rendering individual markers
        updateUnclusteredListings();

        if (!searchAsMove) return;

        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(() => {
            const bounds = e.target.getBounds();
            if (!bounds) return;

            const minLng = bounds.getWest();
            const maxLng = bounds.getEast();
            const minLat = bounds.getSouth();
            const maxLat = bounds.getNorth();

            const params = new URLSearchParams(searchParams.toString());

            // Remove single point coordinates since we now have bounds
            params.delete('lat');
            params.delete('lng');

            params.set('minLng', minLng.toString());
            params.set('maxLng', maxLng.toString());
            params.set('minLat', minLat.toString());
            params.set('maxLat', maxLat.toString());

            setIsSearching(true);
            router.push(`/search?${params.toString()}`);
        }, 500); // 500ms debounce
    };

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

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
        <div className="w-full h-full rounded-xl overflow-hidden border shadow-lg relative group">
            {/* Initial loading skeleton */}
            {!isMapLoaded && (
                <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-800 z-20 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <MapPin className="w-10 h-10 text-zinc-300 dark:text-zinc-600 animate-pulse" />
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">Loading map...</span>
                    </div>
                </div>
            )}

            {/* Tile loading indicator */}
            {isMapLoaded && areTilesLoading && (
                <div className="absolute inset-0 bg-zinc-100/30 dark:bg-zinc-900/30 backdrop-blur-[1px] z-10 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-2 bg-white/90 dark:bg-zinc-800/90 px-4 py-2 rounded-lg shadow-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-600 dark:text-zinc-300" />
                        <span className="text-sm text-zinc-600 dark:text-zinc-300">Loading tiles...</span>
                    </div>
                </div>
            )}

            {/* Search-as-move loading indicator */}
            {isSearching && isMapLoaded && !areTilesLoading && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-zinc-800/90 px-3 py-2 rounded-lg shadow-sm flex items-center gap-2 z-10 pointer-events-none">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-600 dark:text-zinc-300" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">Searching area...</span>
                </div>
            )}

            <Map
                ref={mapRef}
                mapboxAccessToken={token}
                initialViewState={initialViewState}
                style={{ width: '100%', height: '100%' }}
                mapStyle={isDarkMode ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v11"}
                onMoveEnd={handleMoveEnd}
                onLoad={() => {
                    setIsMapLoaded(true);
                    updateUnclusteredListings();
                }}
                onMoveStart={() => setAreTilesLoading(true)}
                onIdle={() => setAreTilesLoading(false)}
                onClick={useClustering ? onClusterClick : undefined}
                interactiveLayerIds={useClustering ? [isDarkMode ? 'clusters-dark' : 'clusters'] : []}
                onError={(e) => console.error('Map Error:', e)}
            >
                {/* Clustering Source and Layers - only when many listings */}
                {useClustering && (
                    <Source
                        id="listings"
                        type="geojson"
                        data={geojsonData}
                        cluster={true}
                        clusterMaxZoom={14}
                        clusterRadius={50}
                    >
                        {/* Show appropriate theme layers */}
                        {isDarkMode ? (
                            <>
                                <Layer {...clusterLayerDark} />
                                <Layer {...clusterCountLayerDark} />
                            </>
                        ) : (
                            <>
                                <Layer {...clusterLayer} />
                                <Layer {...clusterCountLayer} />
                            </>
                        )}
                    </Source>
                )}

                {/* Individual price markers - shown for unclustered points or when not clustering */}
                {markerPositions.map((position) => (
                    <Marker
                        key={position.listing.id}
                        longitude={position.lng}
                        latitude={position.lat}
                        anchor="bottom"
                        onClick={(e: any) => {
                            e.originalEvent.stopPropagation();
                            setSelectedListing(position.listing);

                            // Smooth pan to center popup both horizontally and vertically
                            mapRef.current?.easeTo({
                                center: [position.lng, position.lat],
                                offset: [0, -150], // NEGATIVE Y pushes marker UP, centering popup below it
                                duration: 400
                            });
                        }}
                    >
                        <div className="relative cursor-pointer group/marker">
                            {/* Pin body with price - Softer corners to match card aesthetic */}
                            <div className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-3 py-1.5 rounded-xl shadow-lg group-hover/marker:bg-zinc-800 dark:group-hover/marker:bg-zinc-200 group-hover/marker:scale-105 transition-all duration-200 font-semibold text-sm whitespace-nowrap relative">
                                ${position.listing.price}
                            </div>
                            {/* Pin tail/pointer - Properly styled triangle */}
                            <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[7px] border-t-zinc-900 dark:border-t-white group-hover/marker:border-t-zinc-800 dark:group-hover/marker:border-t-zinc-200 transition-colors"></div>
                            {/* Shadow under the pin for depth */}
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-1 bg-zinc-950/20 dark:bg-zinc-950/40 rounded-full blur-[2px]"></div>
                        </div>
                    </Marker>
                ))}

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
                                        className="w-7 h-7 rounded-full bg-zinc-950/50 hover:bg-zinc-950/70 text-white hover:text-white border-none"
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
            </Map>

            {/* Search as I move toggle - Consistent rounded-xl radius with soft shadow */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white dark:bg-zinc-900 px-4 py-2.5 rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] border border-zinc-100 dark:border-zinc-800 flex items-center gap-2.5 z-10 transition-opacity duration-200">
                <input
                    type="checkbox"
                    id="searchAsMove"
                    checked={searchAsMove}
                    onChange={(e) => setSearchAsMove(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white bg-white dark:bg-zinc-800 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:ring-offset-0"
                />
                <label htmlFor="searchAsMove" className="text-xs-plus font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                    Search as I move the map
                </label>
            </div>
        </div>
    );
}
