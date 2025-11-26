'use client';

import Map, { Marker, Popup, MapLayerMouseEvent, ViewStateChangeEvent } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { MAP_FLY_TO_EVENT, MapFlyToEventDetail } from './SearchForm';

interface Listing {
    id: string;
    title: string;
    price: number;
    availableSlots: number;
    ownerId?: string;
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

export default function MapComponent({ listings }: { listings: Listing[] }) {
    const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
    const [searchAsMove, setSearchAsMove] = useState(true);
    const router = useRouter();
    const searchParams = useSearchParams();
    const mapRef = useRef<any>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Add small offsets to markers that share the same coordinates
    const markerPositions = useMemo(() => {
        const positions: MarkerPosition[] = [];
        const coordsCounts: Record<string, number> = {};

        // First pass: count how many listings share each coordinate
        listings.forEach(listing => {
            const key = `${listing.location.lat},${listing.location.lng}`;
            coordsCounts[key] = (coordsCounts[key] || 0) + 1;
        });

        // Second pass: add offsets for overlapping markers
        const coordsIndices: Record<string, number> = {};

        listings.forEach(listing => {
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
    }, [listings]);

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

    const handleMoveEnd = (e: ViewStateChangeEvent) => {
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

            router.push(`/search?${params.toString()}`);
        }, 500); // 500ms debounce
    };

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!token) {
        return (
            <div className="w-full h-full rounded-xl overflow-hidden border shadow-lg relative bg-zinc-100 flex items-center justify-center">
                <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-center">
                    <p className="font-bold">Mapbox Token Missing</p>
                    <p className="text-sm">Please add NEXT_PUBLIC_MAPBOX_TOKEN to your .env file</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full rounded-xl overflow-hidden border shadow-lg relative group">
            <Map
                ref={mapRef}
                mapboxAccessToken={token}
                initialViewState={initialViewState}
                style={{ width: '100%', height: '100%' }}
                mapStyle="mapbox://styles/mapbox/streets-v11"
                onMoveEnd={handleMoveEnd}
                onError={(e) => console.error('Map Error:', e)}
            >
                {markerPositions.map((position) => (
                    <Marker
                        key={position.listing.id}
                        longitude={position.lng}
                        latitude={position.lat}
                        anchor="bottom"
                        onClick={(e: any) => {
                            e.originalEvent.stopPropagation();
                            setSelectedListing(position.listing);
                        }}
                    >
                        <div className="relative cursor-pointer">
                            {/* Pin body with price */}
                            <div className="bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow-xl hover:bg-blue-700 hover:scale-110 transition-all duration-200 border-2 border-white font-semibold text-sm whitespace-nowrap">
                                ${position.listing.price}
                            </div>
                            {/* Pin point */}
                            < div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-blue-600"></div>
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
                        className="z-50"
                    >
                        <div className="p-2 min-w-[200px]">
                            <h3 className="font-bold text-lg mb-1">{selectedListing.title}</h3>
                            <p className="text-muted-foreground mb-2">${selectedListing.price}/month</p>
                            <div className="flex gap-2">
                                <Link href={`/listings/${selectedListing.id}`} className="flex-1">
                                    <Button size="sm" className="w-full">View</Button>
                                </Link>
                                {selectedListing.ownerId && (
                                    <Link href={`/messages?userId=${selectedListing.ownerId}`} className="flex-1">
                                        <Button size="sm" variant="outline" className="w-full">Message</Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </Popup>
                )}
            </Map>

            {/* Search as I move toggle */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 z-10 transition-opacity duration-200">
                <input
                    type="checkbox"
                    id="searchAsMove"
                    checked={searchAsMove}
                    onChange={(e) => setSearchAsMove(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
                />
                <label htmlFor="searchAsMove" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                    Search as I move the map
                </label>
            </div>
        </div>
    );
}
