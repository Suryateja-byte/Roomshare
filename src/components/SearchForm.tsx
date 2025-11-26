'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LocationSearchInput from '@/components/LocationSearchInput';

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
    const [price, setPrice] = useState(searchParams.get('maxPrice') || '');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number; bbox?: [number, number, number, number] } | null>(null);

    // New filters state
    const [moveInDate, setMoveInDate] = useState(searchParams.get('moveInDate') || '');
    const [leaseDuration, setLeaseDuration] = useState(searchParams.get('leaseDuration') || '');
    const [roomType, setRoomType] = useState(searchParams.get('roomType') || '');
    const [amenities, setAmenities] = useState<string[]>(searchParams.getAll('amenities') || []);
    const [houseRules, setHouseRules] = useState<string[]>(searchParams.getAll('houseRules') || []);



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

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (location.trim()) params.set('q', location);
        if (price) params.set('maxPrice', price);

        // Include coordinates if a location was selected from suggestions
        if (selectedCoords) {
            params.set('lat', selectedCoords.lat.toString());
            params.set('lng', selectedCoords.lng.toString());
        }

        if (moveInDate) params.set('moveInDate', moveInDate);
        if (leaseDuration) params.set('leaseDuration', leaseDuration);
        if (roomType) params.set('roomType', roomType);
        amenities.forEach(a => params.append('amenities', a));
        houseRules.forEach(r => params.append('houseRules', r));

        router.push(`/search?${params.toString()}`);
    };

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

    const isCompact = variant === 'compact';

    return (
        <div className={`w-full mx-auto ${isCompact ? 'max-w-2xl' : 'max-w-4xl'}`}>
            <form
                onSubmit={handleSearch}
                className={`group relative flex flex-col md:flex-row items-center bg-white rounded-2xl sm:rounded-[2rem] md:rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-100 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 w-full ${isCompact ? 'p-1.5' : 'p-2'}`}
                role="search"
            >
                {/* Location Input with Autocomplete */}
                <div className="w-full md:flex-1 relative px-4 sm:px-6 py-2 md:py-0 group/input">
                    <label htmlFor="search-location" className={`block text-[11px] sm:text-xs font-bold text-zinc-500 mb-0.5 uppercase tracking-wider text-left ${isCompact ? 'hidden' : ''}`}>
                        Where
                    </label>
                    <LocationSearchInput
                        value={location}
                        onChange={(value) => {
                            setLocation(value);
                            // Clear coordinates if user manually changes the input
                            if (selectedCoords) setSelectedCoords(null);
                        }}
                        onLocationSelect={handleLocationSelect}
                        placeholder={isCompact ? "City, neighborhood..." : "City, neighborhood..."}
                        className={isCompact ? "text-sm" : ""}
                    />
                </div>

                {/* Divider */}
                <div className="hidden md:block w-[1px] h-8 bg-zinc-100 " aria-hidden="true"></div>
                <div className="md:hidden w-[calc(100%-2rem)] mx-auto h-[1px] bg-zinc-100 my-1" aria-hidden="true"></div>

                {/* Price Input */}
                <div className="w-full md:flex-1 relative px-4 sm:px-6 py-2 md:py-0 group/input">
                    <label htmlFor="search-budget" className={`block text-[11px] sm:text-xs font-bold text-zinc-500 mb-0.5 uppercase tracking-wider text-left ${isCompact ? 'hidden' : ''}`}>
                        Budget
                    </label>
                    <input
                        id="search-budget"
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder={isCompact ? "Max price" : "Max price"}
                        className={`w-full bg-transparent border-none p-0 text-zinc-900 placeholder:text-zinc-400 focus:ring-0 focus:outline-none font-medium ${isCompact ? 'text-sm' : 'text-sm sm:text-base'}`}
                        min="0"
                        aria-describedby="budget-hint"
                    />
                    <span id="budget-hint" className="sr-only">Enter maximum monthly budget in dollars</span>
                </div>

                {/* Filters Toggle */}
                {!isCompact && (
                    <>
                        <div className="hidden md:block w-[1px] h-10 bg-zinc-100 mx-2" aria-hidden="true"></div>
                        <button
                            type="button"
                            onClick={() => setShowFilters(!showFilters)}
                            className={`hidden sm:block px-4 py-2 text-sm font-medium rounded-full transition-colors touch-target ${showFilters ? 'bg-zinc-100 text-zinc-900 ' : 'text-zinc-500 hover:bg-zinc-50 '}`}
                            aria-expanded={showFilters}
                            aria-controls="search-filters"
                        >
                            Filters
                        </button>
                    </>
                )}

                {/* Search Button */}
                <button
                    type="submit"
                    aria-label="Search listings"
                    className={`mt-2 md:mt-0 md:ml-2 bg-zinc-900 hover:bg-zinc-800 text-white md:rounded-full rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg touch-target ${isCompact ? 'h-9 w-9' : 'h-11 sm:h-12 w-full md:w-12'}`}
                >
                    <Search className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                    <span className={`md:hidden ml-2 font-medium text-sm ${isCompact ? 'hidden' : ''}`}>Search</span>
                </button>
            </form>

            {/* Expanded Filters */}
            {showFilters && (
                <div
                    id="search-filters"
                    className="mt-3 sm:mt-4 p-4 sm:p-6 bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-zinc-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 animate-in fade-in slide-in-from-top-4"
                >
                    {/* Move-in Date */}
                    <div className="space-y-2">
                        <label htmlFor="filter-move-in" className="text-sm font-semibold text-zinc-900 ">Move-in Date</label>
                        <input
                            id="filter-move-in"
                            type="date"
                            value={moveInDate}
                            onChange={(e) => setMoveInDate(e.target.value)}
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
                                    className={`px-3 py-2 rounded-full text-xs sm:text-sm font-medium border transition-colors touch-target ${amenities.includes(amenity)
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
                                    className={`px-3 py-2 rounded-full text-xs sm:text-sm font-medium border transition-colors touch-target ${houseRules.includes(rule)
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
            )}
        </div>
    );
}
