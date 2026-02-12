'use client';

import ReactMapGL, { Marker, Popup, Source, Layer, ViewStateChangeEvent, MapLayerMouseEvent } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useState, useMemo, useEffect, useRef, useCallback, KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { getListingsInBounds, MapListing } from '@/app/actions/get-listings';
import { useDebounce } from 'use-debounce';
import { Loader2, Home, X, MapPin } from 'lucide-react';
import { useAbortableServerAction } from '@/hooks/useAbortableServerAction';
import { fixMarkerWrapperRole } from './fixMarkerA11y';

interface MarkerPosition {
    listing: MapListing;
    lat: number;
    lng: number;
}

// Cluster layer - circles for grouped markers
// Note: No 'source' property - Layer inherits from parent Source component
const clusterLayer: LayerProps = {
    id: 'clusters',
    type: 'circle',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': '#18181b',
        'circle-radius': [
            'step',
            ['get', 'point_count'],
            20, 10, 25, 50, 32, 100, 40
        ],
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff'
    }
};

// Dark mode cluster layer
const clusterLayerDark: LayerProps = {
    id: 'clusters-dark',
    type: 'circle',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': '#ffffff',
        'circle-radius': [
            'step',
            ['get', 'point_count'],
            20, 10, 25, 50, 32, 100, 40
        ],
        'circle-stroke-width': 3,
        'circle-stroke-color': '#18181b'
    }
};

// Cluster count label layer
const clusterCountLayer: LayerProps = {
    id: 'cluster-count',
    type: 'symbol',
    filter: ['has', 'point_count'],
    layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['Noto Sans Regular'],
        'text-size': 14
    },
    paint: { 'text-color': '#ffffff' }
};

// Dark mode cluster count
const clusterCountLayerDark: LayerProps = {
    id: 'cluster-count-dark',
    type: 'symbol',
    filter: ['has', 'point_count'],
    layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['Noto Sans Regular'],
        'text-size': 14
    },
    paint: { 'text-color': '#18181b' }
};

const CLUSTER_THRESHOLD = 50;

export default function MapClient({ initialListings = [] }: { initialListings?: MapListing[] }) {
    const [listings, setListings] = useState<MapListing[]>(initialListings);
    const [selectedListing, setSelectedListing] = useState<MapListing | null>(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [areTilesLoading, setAreTilesLoading] = useState(false);
    const [unclusteredListings, setUnclusteredListings] = useState<MapListing[]>([]);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [viewState, setViewState] = useState({
        longitude: -122.4194,
        latitude: 37.7749,
        zoom: 12
    });

    // Keyboard navigation state for arrow key navigation between markers
    const [keyboardFocusedId, setKeyboardFocusedId] = useState<string | null>(null);
    const markerRefs = useRef<globalThis.Map<string, HTMLDivElement>>(new globalThis.Map());

    // Debounce the view state to prevent excessive API calls
    const [debouncedViewState] = useDebounce(viewState, 500);
    const mapRef = useRef<any>(null);

    // Detect dark mode
    useEffect(() => {
        const checkDarkMode = () => {
            setIsDarkMode(document.documentElement.classList.contains('dark'));
        };
        checkDarkMode();
        const observer = new MutationObserver(checkDarkMode);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // Use clustering only when there are many listings
    const useClustering = listings.length >= CLUSTER_THRESHOLD;

    // P1-19 FIX: Create lookup map to avoid JSON.parse on every map move
    const listingsLookup = useMemo(() => {
        const lookup = new Map<string, MapListing>();
        listings.forEach(listing => lookup.set(listing.id, listing));
        return lookup;
    }, [listings]);

    // Convert listings to GeoJSON for Mapbox clustering
    const geojsonData = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: listings.map(listing => ({
            type: 'Feature' as const,
            geometry: {
                type: 'Point' as const,
                coordinates: [listing.lng, listing.lat]
            },
            properties: {
                id: listing.id,
                title: listing.title,
                price: listing.price,
                availableSlots: listing.availableSlots,
                ownerId: listing.ownerId,
                amenities: listing.amenities,
                images: listing.images,
                lat: listing.lat,
                lng: listing.lng
            }
        }))
    }), [listings]);

    // Handle cluster click to zoom in and expand
    const onClusterClick = useCallback(async (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || !mapRef.current) return;

        const clusterId = feature.properties?.cluster_id;
        if (!clusterId) return;

        const mapboxSource = mapRef.current.getSource('listings') as GeoJSONSource | undefined;
        if (!mapboxSource) return;

        try {
            const zoom = await mapboxSource.getClusterExpansionZoom(clusterId);
            if (!feature.geometry || feature.geometry.type !== 'Point') return;
            mapRef.current?.flyTo({
                center: feature.geometry.coordinates as [number, number],
                zoom: zoom,
                duration: 500
            });
        } catch (error) {
            console.warn('Cluster expansion failed', error);
        }
    }, []);

    // Update unclustered listings when map moves
    const updateUnclusteredListings = useCallback(() => {
        if (!mapRef.current || !useClustering) return;

        const map = mapRef.current.getMap();
        if (!map || !map.getSource('listings')) return;

        const features = map.querySourceFeatures('listings', {
            filter: ['!', ['has', 'point_count']]
        });

        // P1-19 FIX: Use lookup map instead of JSON.parse on every map move
        const unclustered = features
            .map((f: { properties: { id: string } }) => listingsLookup.get(f.properties.id))
            .filter((listing: MapListing | undefined): listing is MapListing => listing !== undefined);

        const seen = new Set<string>();
        const unique = unclustered.filter((l: MapListing) => {
            if (seen.has(l.id)) return false;
            seen.add(l.id);
            return true;
        });

        setUnclusteredListings(unique);
    }, [useClustering, listingsLookup]);

    // Use abortable server action to prevent race conditions on rapid map movement
    const { execute: fetchListingsAction, isLoading: isFetchingListings, cancel: cancelFetch } =
        useAbortableServerAction({
            action: getListingsInBounds,
            onSuccess: (newListings) => setListings(newListings),
            onError: (err) => console.error('Failed to fetch listings:', err),
        });

    // Fetch listings when the map moves (debounced)
    useEffect(() => {
        if (!mapRef.current) return;

        const map = mapRef.current.getMap();
        const bounds = map.getBounds();
        if (!bounds) return;

        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();

        fetchListingsAction({
            ne_lat: ne.lat,
            ne_lng: ne.lng,
            sw_lat: sw.lat,
            sw_lng: sw.lng,
        });
    }, [debouncedViewState, fetchListingsAction]);

    // Cancel pending fetch requests on unmount
    useEffect(() => {
        return () => cancelFetch();
    }, [cancelFetch]);

    // Initialize view state from initial listings if available
    useEffect(() => {
        if (initialListings.length > 0) {
            setViewState({
                longitude: initialListings[0].lng,
                latitude: initialListings[0].lat,
                zoom: 12
            });
        }
    }, []); // Run only once on mount

    // Add small offsets to markers that share the same coordinates
    // When clustering, use unclustered listings; otherwise use all listings
    const markersSource = useClustering ? unclusteredListings : listings;

    const markerPositions = useMemo(() => {
        const positions: MarkerPosition[] = [];
        const coordsCounts: Record<string, number> = {};

        // First pass: count how many listings share each coordinate
        markersSource.forEach(listing => {
            const key = `${listing.lat},${listing.lng}`;
            coordsCounts[key] = (coordsCounts[key] || 0) + 1;
        });

        // Second pass: add offsets for overlapping markers
        const coordsIndices: Record<string, number> = {};

        markersSource.forEach(listing => {
            const key = `${listing.lat},${listing.lng}`;
            const count = coordsCounts[key] || 1;

            if (count === 1) {
                // No overlap, use original coordinates
                positions.push({
                    listing,
                    lat: listing.lat,
                    lng: listing.lng
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
                    lat: listing.lat + latOffset,
                    lng: listing.lng + lngOffset
                });
            }
        });

        return positions;
    }, [markersSource]);

    // Sorted marker positions for keyboard navigation (top-to-bottom, left-to-right)
    const sortedMarkerPositions = useMemo(() => {
        return [...markerPositions].sort((a, b) => {
            const latDiff = b.lat - a.lat;
            if (Math.abs(latDiff) > 0.001) return latDiff;
            return a.lng - b.lng;
        });
    }, [markerPositions]);

    // Keyboard navigation handler for arrow keys
    const handleMarkerKeyboardNavigation = useCallback((e: ReactKeyboardEvent<HTMLDivElement>, currentListingId: string) => {
        const currentIndex = sortedMarkerPositions.findIndex(p => p.listing.id === currentListingId);
        if (currentIndex === -1 || sortedMarkerPositions.length === 0) return;

        let nextIndex: number | null = null;
        const currentPos = sortedMarkerPositions[currentIndex];

        const findNearest = (filter: (pos: MarkerPosition) => boolean) => {
            let bestIndex = -1;
            let bestDistance = Infinity;
            for (let i = 0; i < sortedMarkerPositions.length; i++) {
                if (i === currentIndex) continue;
                const pos = sortedMarkerPositions[i];
                if (filter(pos)) {
                    const distance = Math.sqrt(
                        Math.pow(pos.lat - currentPos.lat, 2) +
                        Math.pow(pos.lng - currentPos.lng, 2)
                    );
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestIndex = i;
                    }
                }
            }
            return bestIndex;
        };

        switch (e.key) {
            case 'ArrowUp':
                nextIndex = findNearest(pos => pos.lat > currentPos.lat);
                break;
            case 'ArrowDown':
                nextIndex = findNearest(pos => pos.lat < currentPos.lat);
                break;
            case 'ArrowLeft':
                nextIndex = findNearest(pos => pos.lng < currentPos.lng);
                break;
            case 'ArrowRight':
                nextIndex = findNearest(pos => pos.lng > currentPos.lng);
                break;
            case 'Home':
                if (sortedMarkerPositions.length > 0) nextIndex = 0;
                break;
            case 'End':
                if (sortedMarkerPositions.length > 0) nextIndex = sortedMarkerPositions.length - 1;
                break;
            default:
                return;
        }

        if (nextIndex !== null && nextIndex !== -1 && nextIndex !== currentIndex) {
            e.preventDefault();
            e.stopPropagation();
            const nextMarker = sortedMarkerPositions[nextIndex];
            const nextId = nextMarker.listing.id;

            setKeyboardFocusedId(nextId);
            const markerEl = markerRefs.current.get(nextId);
            if (markerEl) markerEl.focus();

            if (mapRef.current) {
                mapRef.current.easeTo({
                    center: [nextMarker.lng, nextMarker.lat],
                    duration: 300
                });
            }
        }
    }, [sortedMarkerPositions]);

    const onMove = useCallback((evt: ViewStateChangeEvent) => {
        setViewState(evt.viewState);
        // Update unclustered listings after move
        updateUnclusteredListings();
    }, [updateUnclusteredListings]);

    return (
        <div className="w-full h-full rounded-xl overflow-hidden border shadow-lg relative">
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

            {/* Data loading indicator - shows when fetching listings after map movement */}
            {isFetchingListings && isMapLoaded && !areTilesLoading && (
                <div className="absolute top-4 right-4 bg-white/90 dark:bg-zinc-800/90 px-3 py-2 rounded-lg shadow-sm flex items-center gap-2 z-10" role="status" aria-label="Updating listings">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-600 dark:text-zinc-300" aria-hidden="true" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">Updating listings...</span>
                </div>
            )}

            <ReactMapGL
                ref={mapRef}
                {...viewState}
                onMove={onMove}
                onMoveStart={() => setAreTilesLoading(true)}
                onIdle={() => setAreTilesLoading(false)}
                onLoad={() => {
                    setIsMapLoaded(true);
                    updateUnclusteredListings();
                }}
                onClick={useClustering ? onClusterClick : undefined}
                interactiveLayerIds={useClustering ? [isDarkMode ? 'clusters-dark' : 'clusters'] : []}
                style={{ width: '100%', height: '100%' }}
                mapStyle={isDarkMode
                    ? "/map-styles/liberty-dark.json"
                    : "https://tiles.openfreemap.org/styles/liberty"
                }
            >
                {/* Clustering Source and Layers - Layer nested inside Source inherits source automatically */}
                {useClustering && (
                    <Source
                        id="listings"
                        type="geojson"
                        data={geojsonData}
                        cluster={true}
                        clusterMaxZoom={14}
                        clusterRadius={50}
                    >
                        {isDarkMode && <Layer {...clusterLayerDark} />}
                        {isDarkMode && <Layer {...clusterCountLayerDark} />}
                        {!isDarkMode && <Layer {...clusterLayer} />}
                        {!isDarkMode && <Layer {...clusterCountLayer} />}
                    </Source>
                )}

                {/* Individual price markers */}
                {markerPositions.map((position) => {
                    const handleMarkerSelect = () => {
                        setSelectedListing(position.listing);
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
                                handleMarkerSelect();
                            }}
                        >
                            <div
                                ref={(el) => {
                                    if (el) {
                                        markerRefs.current.set(position.listing.id, el);
                                        fixMarkerWrapperRole(el);
                                    } else {
                                        markerRefs.current.delete(position.listing.id);
                                    }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label={`$${position.listing.price} listing${position.listing.title ? `: ${position.listing.title}` : ''}. Use arrow keys to navigate between markers.`}
                                onFocus={() => setKeyboardFocusedId(position.listing.id)}
                                onBlur={() => setKeyboardFocusedId(current => current === position.listing.id ? null : current)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleMarkerSelect();
                                    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                                        handleMarkerKeyboardNavigation(e, position.listing.id);
                                    }
                                }}
                                className={`relative cursor-pointer group/marker focus:outline-none rounded-xl ${keyboardFocusedId === position.listing.id ? 'z-50' : ''}`}
                            >
                                {/* Pin body with price - Pill style matching card aesthetic */}
                                <div className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-3 py-1.5 rounded-xl shadow-lg group-hover/marker:bg-zinc-800 dark:group-hover/marker:bg-zinc-200 group-hover/marker:scale-105 transition-all duration-200 font-semibold text-sm whitespace-nowrap relative">
                                    ${position.listing.price}
                                </div>
                                {/* Pin tail/pointer */}
                                <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[7px] border-t-zinc-900 dark:border-t-white group-hover/marker:border-t-zinc-800 dark:group-hover/marker:border-t-zinc-200 transition-colors" aria-hidden="true"></div>
                                {/* Shadow under the pin for depth */}
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-1 bg-zinc-950/20 dark:bg-zinc-950/40 rounded-full blur-[2px]" aria-hidden="true"></div>
                                {/* Keyboard focus ring */}
                                {keyboardFocusedId === position.listing.id && (
                                    <div className="absolute -inset-3 rounded-full border-[3px] border-blue-500 dark:border-blue-400 pointer-events-none shadow-[0_0_0_2px_rgba(59,130,246,0.3)]" aria-hidden="true" />
                                )}
                            </div>
                        </Marker>
                    );
                })}

                {selectedListing && (
                    <Popup
                        longitude={selectedListing.lng}
                        latitude={selectedListing.lat}
                        anchor="top"
                        onClose={() => setSelectedListing(null)}
                        closeOnClick={false}
                        closeButton={false}
                        className={`z-50 [&_.maplibregl-popup-content]:rounded-xl [&_.maplibregl-popup-content]:p-0 [&_.maplibregl-popup-content]:!bg-transparent [&_.maplibregl-popup-content]:!shadow-none [&_.maplibregl-popup-close-button]:hidden ${isDarkMode
                                ? '[&_.maplibregl-popup-tip]:border-t-zinc-900'
                                : '[&_.maplibregl-popup-tip]:border-t-white'
                            }`}
                        maxWidth="300px"
                    >
                        <div className={`w-[280px] overflow-hidden rounded-xl ${isDarkMode
                                ? 'bg-zinc-900 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]'
                                : 'bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)]'
                            }`}>
                            {/* Image Thumbnail */}
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
                                {/* Close button */}
                                <button
                                    onClick={() => setSelectedListing(null)}
                                    aria-label="Close listing preview"
                                    className={`absolute top-1 right-1 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-colors ${isDarkMode
                                            ? 'bg-zinc-900/80 hover:bg-zinc-900 text-white'
                                            : 'bg-white/80 hover:bg-white text-zinc-900'
                                        }`}
                                >
                                    <X className="w-4 h-4" aria-hidden="true" />
                                </button>
                                {/* Availability badge */}
                                <div className={`absolute bottom-2 left-2 px-2 py-1 rounded-md text-xs font-medium ${isDarkMode
                                        ? 'bg-zinc-900/80 text-white'
                                        : 'bg-white/90 text-zinc-900'
                                    }`}>
                                    {selectedListing.availableSlots} {selectedListing.availableSlots === 1 ? 'spot' : 'spots'} available
                                </div>
                            </div>
                            {/* Content */}
                            <div className="p-3">
                                <h3 className={`font-semibold text-sm line-clamp-1 mb-1 ${isDarkMode ? 'text-white' : 'text-zinc-900'
                                    }`}>
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
                                    <Link href={`/messages?to=${selectedListing.ownerId}`} className="flex-1">
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
                                </div>
                            </div>
                        </div>
                    </Popup>
                )}
            </ReactMapGL>
        </div>
    );
}
