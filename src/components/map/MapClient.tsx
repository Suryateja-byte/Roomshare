'use client';

import Map, { Marker, Popup, ViewStateChangeEvent } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getListingsInBounds, MapListing } from '@/app/actions/get-listings';
import { useDebounce } from 'use-debounce';
import ListingCard from '@/components/listings/ListingCard';
import { Loader2 } from 'lucide-react';

interface MarkerPosition {
    listing: MapListing;
    lat: number;
    lng: number;
}

export default function MapClient({ initialListings = [] }: { initialListings?: MapListing[] }) {
    const [listings, setListings] = useState<MapListing[]>(initialListings);
    const [selectedListing, setSelectedListing] = useState<MapListing | null>(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [viewState, setViewState] = useState({
        longitude: -122.4194,
        latitude: 37.7749,
        zoom: 12
    });

    // Debounce the view state to prevent excessive API calls
    const [debouncedViewState] = useDebounce(viewState, 500);
    const mapRef = useRef<any>(null);

    // Fetch listings when the map moves (debounced)
    useEffect(() => {
        const fetchListings = async () => {
            if (!mapRef.current) return;

            const map = mapRef.current.getMap();
            const bounds = map.getBounds();

            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();

            const newListings = await getListingsInBounds({
                ne_lat: ne.lat,
                ne_lng: ne.lng,
                sw_lat: sw.lat,
                sw_lng: sw.lng,
            });

            setListings(newListings);
        };

        fetchListings();
    }, [debouncedViewState]);

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
    const markerPositions = useMemo(() => {
        const positions: MarkerPosition[] = [];
        const coordsCounts: Record<string, number> = {};

        // First pass: count how many listings share each coordinate
        listings.forEach(listing => {
            const key = `${listing.lat},${listing.lng}`;
            coordsCounts[key] = (coordsCounts[key] || 0) + 1;
        });

        // Second pass: add offsets for overlapping markers
        const coordsIndices: Record<string, number> = {};

        listings.forEach(listing => {
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
    }, [listings]);

    const onMove = useCallback((evt: ViewStateChangeEvent) => {
        setViewState(evt.viewState);
    }, []);

    return (
        <div className="w-full h-full rounded-xl overflow-hidden border shadow-lg relative">
            {!isMapLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/20 backdrop-blur-sm z-10">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-sm font-medium text-muted-foreground">Loading map...</span>
                    </div>
                </div>
            )}
            <Map
                ref={mapRef}
                mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
                {...viewState}
                onMove={onMove}
                onLoad={() => setIsMapLoaded(true)}
                style={{ width: '100%', height: '100%' }}
                mapStyle="mapbox://styles/mapbox/streets-v11"
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
                        <div className="relative cursor-pointer group">
                            {/* Pin body with price */}
                            <div className="bg-white text-foreground px-3 py-1.5 rounded-lg shadow-lg hover:scale-110 transition-all duration-200 border border-border/50 font-bold text-sm whitespace-nowrap group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary">
                                ${position.listing.price}
                            </div>
                            {/* Pin point */}
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white group-hover:border-t-primary"></div>
                        </div>
                    </Marker>
                ))}

                {selectedListing && (
                    <Popup
                        longitude={selectedListing.lng}
                        latitude={selectedListing.lat}
                        anchor="top"
                        onClose={() => setSelectedListing(null)}
                        closeOnClick={false}
                        className="z-50"
                        maxWidth="300px"
                    >
                        <div className="p-0 w-[280px]">
                            <ListingCard listing={selectedListing} className="border-none shadow-none" />
                        </div>
                    </Popup>
                )}
            </Map>
            {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white z-50 pointer-events-none">
                    <div className="bg-destructive p-4 rounded-lg">
                        Mapbox Token Missing
                    </div>
                </div>
            )}
        </div>
    );
}
