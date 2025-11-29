'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LocationSearchInput from '@/components/LocationSearchInput';

// Debounce delay in milliseconds
const SEARCH_DEBOUNCE_MS = 300;

// Custom event for map fly-to
export const MAP_FLY_TO_EVENT = 'mapFlyToLocation';

export interface MapFlyToEventDetail {
    lat: number;
    lng: number;
    bbox?: [number, number, number, number];
    zoom?: number;
}

export default function SearchForm({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
    const searchParams = useSearchParams();
    const [location, setLocation] = useState(searchParams.get('q') || '');
    const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
    const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
    const [showFilters, setShowFilters] = useState(false);

    // Initialize selectedCoords from URL params if they exist
    const getInitialCoords = () => {
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');
        if (lat && lng) {
            return { lat: parseFloat(lat), lng: parseFloat(lng) };
        }
        return null;
    };

    const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number; bbox?: [number, number, number, number] } | null>(getInitialCoords);

    // New filters state
    const [moveInDate, setMoveInDate] = useState(searchParams.get('moveInDate') || '');
    const [leaseDuration, setLeaseDuration] = useState(searchParams.get('leaseDuration') || '');
    const [roomType, setRoomType] = useState(searchParams.get('roomType') || '');
    const [amenities, setAmenities] = useState<string[]>(searchParams.getAll('amenities') || []);
    const [houseRules, setHouseRules] = useState<string[]>(searchParams.getAll('houseRules') || []);

    // Debounce and submission state to prevent race conditions
    const [isSearching, setIsSearching] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSearchRef = useRef<string>(''); // Track last search to prevent duplicates

    // Sync state with URL params when they change (e.g., after navigation)
    useEffect(() => {
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');
        // Always sync coords from URL - set to parsed values if present, otherwise null
        if (lat && lng) {
            setSelectedCoords({ lat: parseFloat(lat), lng: parseFloat(lng) });
        } else {
            // Don't clear coords here - user might be typing a new location
            // Coords will be cleared when user types in location field
        }
        // Sync other form fields from URL
        setLocation(searchParams.get('q') || '');
        setMinPrice(searchParams.get('minPrice') || '');
        setMaxPrice(searchParams.get('maxPrice') || '');
        setMoveInDate(searchParams.get('moveInDate') || '');
        setLeaseDuration(searchParams.get('leaseDuration') || '');
        setRoomType(searchParams.get('roomType') || '');
        setAmenities(searchParams.getAll('amenities') || []);
        setHouseRules(searchParams.getAll('houseRules') || []);
    }, [searchParams]);

    const router = useRouter();

    const handleLocationSelect = (locationData: {
        name: string;
        lat: number;
        lng: number;
        bbox?: [number, number, number, number];
    }) => {
        setSelectedCoords({ lat: locationData.lat, lng: locationData.lng, bbox: locationData.bbox });

        // Dispatch custom event for map to fly to location
        const event = new CustomEvent<MapFlyToEventDetail>(MAP_FLY_TO_EVENT, {
            detail: {
                lat: locationData.lat,
                lng: locationData.lng,
                bbox: locationData.bbox,
                zoom: 13
            }
        });
        window.dispatchEvent(event);
    };

    const handleSearch = useCallback((e: React.FormEvent) => {
        e.preventDefault();

        // Clear any pending search timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        const params = new URLSearchParams();
        // Only include query if it has actual content (not just whitespace)
        const trimmedLocation = location.trim();
        if (trimmedLocation && trimmedLocation.length >= 2) {
            params.set('q', trimmedLocation);
        }

        // Price validation with auto-swap if inverted
        let finalMinPrice = minPrice ? parseFloat(minPrice) : null;
        let finalMaxPrice = maxPrice ? parseFloat(maxPrice) : null;

        // Enforce non-negative values
        if (finalMinPrice !== null && finalMinPrice < 0) finalMinPrice = 0;
        if (finalMaxPrice !== null && finalMaxPrice < 0) finalMaxPrice = 0;

        // Auto-swap if min > max
        if (finalMinPrice !== null && finalMaxPrice !== null && finalMinPrice > finalMaxPrice) {
            [finalMinPrice, finalMaxPrice] = [finalMaxPrice, finalMinPrice];
        }

        if (finalMinPrice !== null) params.set('minPrice', finalMinPrice.toString());
        if (finalMaxPrice !== null) params.set('maxPrice', finalMaxPrice.toString());

        // Include coordinates if a location was selected from suggestions
        // Only include if location text is not empty (prevents stale coords)
        if (selectedCoords && trimmedLocation) {
            params.set('lat', selectedCoords.lat.toString());
            params.set('lng', selectedCoords.lng.toString());
        }

        if (moveInDate) params.set('moveInDate', moveInDate);
        if (leaseDuration) params.set('leaseDuration', leaseDuration);
        if (roomType) params.set('roomType', roomType);
        amenities.forEach(a => params.append('amenities', a));
        houseRules.forEach(r => params.append('houseRules', r));

        const searchUrl = `/search?${params.toString()}`;

        // Prevent duplicate searches (same URL within debounce window)
        if (searchUrl === lastSearchRef.current && isSearching) {
            return;
        }

        // Debounce the navigation to prevent race conditions
        setIsSearching(true);
        lastSearchRef.current = searchUrl;

        searchTimeoutRef.current = setTimeout(() => {
            router.push(searchUrl);
            // Reset searching state after navigation starts
            setTimeout(() => setIsSearching(false), 500);
        }, SEARCH_DEBOUNCE_MS);
    }, [location, minPrice, maxPrice, selectedCoords, moveInDate, leaseDuration, roomType, amenities, houseRules, router, isSearching]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    const toggleAmenity = (amenity: string) => {
        setAmenities(prev =>
            prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
        );
    };

    const toggleHouseRule = (rule: string) => {
        setHouseRules(prev =>
            prev.includes(rule) ? prev.filter(r => r !== rule) : [...prev, rule]
        );
    };

    // Clear all filters and reset to defaults
    const handleClearAllFilters = () => {
        setLocation('');
        setMinPrice('');
        setMaxPrice('');
        setSelectedCoords(null);
        setMoveInDate('');
        setLeaseDuration('');
        setRoomType('');
        setAmenities([]);
        setHouseRules([]);
        // Navigate to clean search page
        router.push('/search');
    };

    // Check if any filters are active
    const hasActiveFilters = location || minPrice || maxPrice || moveInDate ||
        leaseDuration || roomType || amenities.length > 0 || houseRules.length > 0;

    // Show warning when user has typed location but not selected from dropdown
    const showLocationWarning = location.trim().length > 2 && !selectedCoords;

    const isCompact = variant === 'compact';

    return (
        <div className={`w-full mx-auto ${isCompact ? 'max-w-2xl' : 'max-w-4xl'}`}>
            <form
                onSubmit={handleSearch}
                className={`group relative flex flex-col md:flex-row md:items-center bg-white rounded-2xl sm:rounded-[2rem] md:rounded-full shadow-[0_2px_12px_rgb(0,0,0,0.08)] border border-zinc-200 hover:border-zinc-300 hover:shadow-[0_4px_20px_rgb(0,0,0,0.12)] transition-all duration-200 w-full ${isCompact ? 'p-1' : 'p-1.5 md:p-2 md:pr-2'}`}
                role="search"
            >
                {/* Location Input with Autocomplete - Airbnb-style stacked layout */}
                <div className={`w-full md:flex-1 flex flex-col ${isCompact ? 'px-4 py-2' : 'px-5 sm:px-6 py-3 md:py-2'}`}>
                    {!isCompact && (
                        <span className="text-[10px] font-bold text-zinc-900 uppercase tracking-wider mb-1">
                            Where
                        </span>
                    )}
                    <LocationSearchInput
                        value={location}
                        onChange={(value) => {
                            setLocation(value);
                            if (selectedCoords) setSelectedCoords(null);
                        }}
                        onLocationSelect={handleLocationSelect}
                        placeholder="Search destinations"
                        className={isCompact ? "text-sm" : "text-sm"}
                    />
                </div>

                {/* Divider - Taller for better segmentation */}
                <div className="hidden md:flex items-center self-stretch" aria-hidden="true">
                    <div className="w-px h-10 bg-zinc-200"></div>
                </div>
                <div className="md:hidden w-[calc(100%-2rem)] mx-auto h-px bg-zinc-100" aria-hidden="true"></div>

                {/* Price Range Input - Airbnb-style stacked layout */}
                <div className={`w-full md:flex-1 flex flex-col ${isCompact ? 'px-4 py-2' : 'px-5 sm:px-6 py-3 md:py-2'}`}>
                    {!isCompact && (
                        <label className="text-[10px] font-bold text-zinc-900 uppercase tracking-wider mb-1">
                            Budget
                        </label>
                    )}
                    <div className="flex items-center gap-1.5">
                        <input
                            id="search-budget-min"
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={minPrice}
                            onChange={(e) => setMinPrice(e.target.value)}
                            placeholder="Min"
                            className={`w-full bg-transparent border-none p-0 text-zinc-900 placeholder:text-zinc-500 focus:ring-0 focus:outline-none ${isCompact ? 'text-sm' : 'text-sm'}`}
                            min="0"
                            step="50"
                            aria-label="Minimum budget"
                        />
                        <span className="text-zinc-400 text-sm">-</span>
                        <input
                            id="search-budget-max"
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={maxPrice}
                            onChange={(e) => setMaxPrice(e.target.value)}
                            placeholder="Max"
                            className={`w-full bg-transparent border-none p-0 text-zinc-900 placeholder:text-zinc-500 focus:ring-0 focus:outline-none ${isCompact ? 'text-sm' : 'text-sm'}`}
                            min="0"
                            step="50"
                            aria-label="Maximum budget"
                        />
                    </div>
                    <span id="budget-hint" className="sr-only">Enter minimum and maximum monthly budget in dollars</span>
                </div>

                {/* Filters Toggle */}
                {!isCompact && (
                    <>
                        <div className="hidden md:flex items-center self-stretch" aria-hidden="true">
                            <div className="w-px h-10 bg-zinc-200"></div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowFilters(!showFilters)}
                            className={`hidden sm:flex items-center px-4 py-2 text-sm font-medium rounded-full border transition-colors touch-target ${showFilters ? 'bg-zinc-100 text-zinc-900 border-zinc-200' : 'text-zinc-600 border-transparent hover:bg-zinc-50 hover:border-zinc-100'}`}
                            aria-expanded={showFilters}
                            aria-controls="search-filters"
                        >
                            Filters
                        </button>
                    </>
                )}

                {/* Search Button */}
                <div className={`flex items-center justify-center mt-2 md:mt-0 ${isCompact ? 'p-0.5' : 'p-1 md:ml-2'}`}>
                    <button
                        type="submit"
                        disabled={isSearching}
                        aria-label={isSearching ? "Searching..." : "Search listings"}
                        aria-busy={isSearching}
                        className={`bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md ${isCompact ? 'h-9 w-9' : 'h-11 sm:h-12 w-full md:w-12'}`}
                    >
                        {isSearching ? (
                            <svg className={`animate-spin ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <Search className={`${isCompact ? 'w-4 h-4' : 'w-[22px] h-[22px]'}`} strokeWidth={2.5} />
                        )}
                        <span className={`md:hidden ml-2 font-medium text-sm ${isCompact ? 'hidden' : ''}`}>
                            {isSearching ? 'Searching...' : 'Search'}
                        </span>
                    </button>
                </div>
            </form>

            {/* Location warning when user hasn't selected from dropdown */}
            {showLocationWarning && !isCompact && (
                <div className="mt-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>
                        Select a location from the dropdown for more accurate results
                    </span>
                </div>
            )}

            {/* Expanded Filters */}
            {showFilters && (
                <div
                    id="search-filters"
                    className="mt-3 sm:mt-4 p-4 sm:p-6 bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-zinc-100 animate-in fade-in slide-in-from-top-4"
                >
                    {/* Clear All Button - only show when filters are active */}
                    {hasActiveFilters && (
                        <div className="flex justify-end mb-4">
                            <button
                                type="button"
                                onClick={handleClearAllFilters}
                                className="text-sm font-medium text-zinc-500 hover:text-zinc-900 underline underline-offset-2 transition-colors"
                            >
                                Clear all filters
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                    {/* Move-in Date */}
                    <div className="space-y-2">
                        <label htmlFor="filter-move-in" className="text-sm font-semibold text-zinc-900 ">Move-in Date</label>
                        <input
                            id="filter-move-in"
                            type="date"
                            value={moveInDate}
                            onChange={(e) => setMoveInDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]} // Prevent past dates
                            className="w-full p-2.5 sm:p-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-sm touch-target"
                        />
                    </div>

                    {/* Lease Duration */}
                    <div className="space-y-2">
                        <label htmlFor="filter-lease" className="text-sm font-semibold text-zinc-900 ">Lease Duration</label>
                        <select
                            id="filter-lease"
                            value={leaseDuration}
                            onChange={(e) => setLeaseDuration(e.target.value)}
                            className="w-full p-2.5 sm:p-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-sm touch-target"
                        >
                            <option value="">Any</option>
                            <option value="Month-to-month">Month-to-month</option>
                            <option value="6 months">6 months</option>
                            <option value="1 year">1 year</option>
                            <option value="1 year+">1 year+</option>
                        </select>
                    </div>

                    {/* Room Type */}
                    <div className="space-y-2 sm:col-span-2 md:col-span-1">
                        <label htmlFor="filter-room-type" className="text-sm font-semibold text-zinc-900 ">Room Type</label>
                        <select
                            id="filter-room-type"
                            value={roomType}
                            onChange={(e) => setRoomType(e.target.value)}
                            className="w-full p-2.5 sm:p-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-sm touch-target"
                        >
                            <option value="">Any</option>
                            <option value="Private Room">Private Room</option>
                            <option value="Shared Room">Shared Room</option>
                            <option value="Entire Place">Entire Place</option>
                        </select>
                    </div>

                    {/* Amenities */}
                    <fieldset className="space-y-2 sm:col-span-2 md:col-span-3">
                        <legend className="text-sm font-semibold text-zinc-900 ">Amenities</legend>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Select amenities">
                            {['Wifi', 'AC', 'Parking', 'Washer', 'Dryer', 'Kitchen', 'Gym', 'Pool'].map(amenity => (
                                <button
                                    key={amenity}
                                    type="button"
                                    onClick={() => toggleAmenity(amenity)}
                                    aria-pressed={amenities.includes(amenity)}
                                    className={`px-3 py-2 rounded-full text-xs sm:text-sm font-medium border transition-colors touch-target focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 ${amenities.includes(amenity)
                                        ? 'bg-zinc-900 text-white border-zinc-900 '
                                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 '
                                        }`}
                                >
                                    {amenity}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    {/* House Rules */}
                    <fieldset className="space-y-2 sm:col-span-2 md:col-span-3">
                        <legend className="text-sm font-semibold text-zinc-900 ">House Rules</legend>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Select house rules">
                            {['Pets allowed', 'Smoking allowed', 'Couples allowed', 'Guests allowed'].map(rule => (
                                <button
                                    key={rule}
                                    type="button"
                                    onClick={() => toggleHouseRule(rule)}
                                    aria-pressed={houseRules.includes(rule)}
                                    className={`px-3 py-2 rounded-full text-xs sm:text-sm font-medium border transition-colors touch-target focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 ${houseRules.includes(rule)
                                        ? 'bg-zinc-900 text-white border-zinc-900 '
                                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 '
                                        }`}
                                >
                                    {rule}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    </div>
                </div>
            )}
        </div>
    );
}
