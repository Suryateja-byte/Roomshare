'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Clock, SlidersHorizontal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FocusTrap } from '@/components/ui/FocusTrap';
import LocationSearchInput from '@/components/LocationSearchInput';
import { DatePicker } from '@/components/ui/date-picker';
import { SUPPORTED_LANGUAGES, getLanguageName, normalizeLanguages, type LanguageCode } from '@/lib/languages';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// Debounce delay in milliseconds
const SEARCH_DEBOUNCE_MS = 300;

// Recent searches config
const RECENT_SEARCHES_KEY = 'roomshare-recent-searches';
const MAX_RECENT_SEARCHES = 5;

const AMENITY_OPTIONS = ['Wifi', 'AC', 'Parking', 'Washer', 'Dryer', 'Kitchen', 'Gym', 'Pool'] as const;
const HOUSE_RULE_OPTIONS = ['Pets allowed', 'Smoking allowed', 'Couples allowed', 'Guests allowed'] as const;
const GENDER_PREFERENCE_OPTIONS = ['any', 'MALE_ONLY', 'FEMALE_ONLY', 'NO_PREFERENCE'] as const;
const HOUSEHOLD_GENDER_OPTIONS = ['any', 'ALL_MALE', 'ALL_FEMALE', 'MIXED'] as const;

interface RecentSearch {
    location: string;
    coords?: { lat: number; lng: number };
    timestamp: number;
}

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
    const parseParamList = (key: string): string[] => {
        const values = searchParams.getAll(key);
        if (values.length === 0) return [];
        return values
            .flatMap(value => value.split(','))
            .map(value => value.trim())
            .filter(Boolean);
    };
    const normalizeByAllowlist = (values: string[], allowlist: readonly string[]) => {
        const allowMap = new Map(allowlist.map(item => [item.toLowerCase(), item]));
        const normalized = values
            .map(value => allowMap.get(value.toLowerCase()))
            .filter((value): value is string => Boolean(value));
        return Array.from(new Set(normalized));
    };
    const parseEnumParam = (key: string, allowlist: readonly string[]) => {
        const value = searchParams.get(key);
        if (!value) return '';
        const trimmed = value.trim();
        return allowlist.includes(trimmed) ? trimmed : '';
    };
    const parseLanguages = () => {
        const normalized = normalizeLanguages(parseParamList('languages'));
        return Array.from(new Set(normalized));
    };
    const parseCoords = () => {
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');
        if (!lat || !lng) return null;
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
            return null;
        }
        return { lat: parsedLat, lng: parsedLng };
    };
    const [location, setLocation] = useState(searchParams.get('q') || '');
    const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
    const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
    const [showFilters, setShowFilters] = useState(false);

    const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number; bbox?: [number, number, number, number] } | null>(parseCoords);

    // New filters state
    const [moveInDate, setMoveInDate] = useState(searchParams.get('moveInDate') || '');
    const [leaseDuration, setLeaseDuration] = useState(searchParams.get('leaseDuration') || '');
    const [roomType, setRoomType] = useState(searchParams.get('roomType') || '');
    const [amenities, setAmenities] = useState<string[]>(normalizeByAllowlist(parseParamList('amenities'), AMENITY_OPTIONS));
    const [houseRules, setHouseRules] = useState<string[]>(normalizeByAllowlist(parseParamList('houseRules'), HOUSE_RULE_OPTIONS));
    const [languages, setLanguages] = useState<string[]>(parseLanguages());
    const [genderPreference, setGenderPreference] = useState(parseEnumParam('genderPreference', GENDER_PREFERENCE_OPTIONS));
    const [householdGender, setHouseholdGender] = useState(parseEnumParam('householdGender', HOUSEHOLD_GENDER_OPTIONS));

    // Language search filter state
    const [languageSearch, setLanguageSearch] = useState('');

    // Get all language codes from canonical list
    const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

    // Filter languages based on search
    const filteredLanguages = useMemo(() => {
        if (!languageSearch.trim()) return LANGUAGE_CODES;
        const search = languageSearch.toLowerCase();
        return LANGUAGE_CODES.filter(code =>
            getLanguageName(code).toLowerCase().includes(search) ||
            code.toLowerCase().includes(search)
        );
    }, [languageSearch]);

    // Debounce and submission state to prevent race conditions
    const [isSearching, setIsSearching] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSearchRef = useRef<string>(''); // Track last search to prevent duplicates

    // Recent searches state
    const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
    const [showRecentSearches, setShowRecentSearches] = useState(false);

    // Load recent searches from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
            if (stored) {
                setRecentSearches(JSON.parse(stored));
            }
        } catch (e) {
            // Ignore localStorage errors
        }
    }, []);

    // Save a search to recent searches
    const saveRecentSearch = useCallback((loc: string, coords?: { lat: number; lng: number }) => {
        if (!loc.trim()) return;

        const newSearch: RecentSearch = {
            location: loc.trim(),
            coords,
            timestamp: Date.now()
        };

        setRecentSearches(prev => {
            // Remove duplicates and add new search at the beginning
            const filtered = prev.filter(s => s.location.toLowerCase() !== loc.toLowerCase());
            const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);

            // Persist to localStorage
            try {
                localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
            } catch (e) {
                // Ignore localStorage errors
            }

            return updated;
        });
    }, []);

    // Clear all recent searches
    const clearRecentSearches = useCallback(() => {
        setRecentSearches([]);
        try {
            localStorage.removeItem(RECENT_SEARCHES_KEY);
        } catch (e) {
            // Ignore localStorage errors
        }
    }, []);

    // Select a recent search
    const selectRecentSearch = useCallback((search: RecentSearch) => {
        setLocation(search.location);
        if (search.coords) {
            setSelectedCoords(search.coords);
        }
        setShowRecentSearches(false);
    }, []);

    // Sync state with URL params when they change (e.g., after navigation)
    useEffect(() => {
        const coords = parseCoords();
        if (coords) {
            setSelectedCoords(coords);
        }
        // Sync other form fields from URL
        setLocation(searchParams.get('q') || '');
        setMinPrice(searchParams.get('minPrice') || '');
        setMaxPrice(searchParams.get('maxPrice') || '');
        setMoveInDate(searchParams.get('moveInDate') || '');
        setLeaseDuration(searchParams.get('leaseDuration') || '');
        setRoomType(searchParams.get('roomType') || '');
        setAmenities(normalizeByAllowlist(parseParamList('amenities'), AMENITY_OPTIONS));
        setHouseRules(normalizeByAllowlist(parseParamList('houseRules'), HOUSE_RULE_OPTIONS));
        setLanguages(parseLanguages());
        setGenderPreference(parseEnumParam('genderPreference', GENDER_PREFERENCE_OPTIONS));
        setHouseholdGender(parseEnumParam('householdGender', HOUSEHOLD_GENDER_OPTIONS));
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

        // Preserve existing sort parameter from URL
        const existingSort = searchParams.get('sort');
        if (existingSort && ['recommended', 'price_asc', 'price_desc', 'newest', 'rating'].includes(existingSort)) {
            params.set('sort', existingSort);
        }

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
        languages.forEach(l => params.append('languages', l));
        if (genderPreference) params.set('genderPreference', genderPreference);
        if (householdGender) params.set('householdGender', householdGender);

        const searchUrl = `/search?${params.toString()}`;

        // Prevent duplicate searches (same URL within debounce window)
        if (searchUrl === lastSearchRef.current && isSearching) {
            return;
        }

        // Debounce the navigation to prevent race conditions
        setIsSearching(true);
        lastSearchRef.current = searchUrl;

        // Save to recent searches when navigating
        if (trimmedLocation) {
            saveRecentSearch(trimmedLocation, selectedCoords || undefined);
        }

        // Close filter drawer on search
        setShowFilters(false);

        searchTimeoutRef.current = setTimeout(() => {
            router.push(searchUrl);
            // Reset searching state after navigation starts
            setTimeout(() => setIsSearching(false), 500);
        }, SEARCH_DEBOUNCE_MS);
    }, [location, minPrice, maxPrice, selectedCoords, moveInDate, leaseDuration, roomType, amenities, houseRules, languages, genderPreference, householdGender, router, isSearching, saveRecentSearch]);

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

    const toggleLanguage = (lang: string) => {
        setLanguages(prev =>
            prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
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
        setLanguages([]);
        setGenderPreference('');
        setHouseholdGender('');
        // Navigate to clean search page
        router.push('/search');
    };

    // Check if any filters are active
    const hasActiveFilters = location || minPrice || maxPrice || moveInDate ||
        (leaseDuration && leaseDuration !== 'any') ||
        (roomType && roomType !== 'any') ||
        amenities.length > 0 || houseRules.length > 0 ||
        languages.length > 0 ||
        (genderPreference && genderPreference !== 'any') ||
        (householdGender && householdGender !== 'any');

    // Count active filters for badge
    const activeFilterCount = [
        moveInDate,
        leaseDuration && leaseDuration !== 'any',
        roomType && roomType !== 'any',
        ...amenities,
        ...houseRules,
        ...languages,
        genderPreference && genderPreference !== 'any',
        householdGender && householdGender !== 'any',
    ].filter(Boolean).length;

    // Show warning when user has typed location but not selected from dropdown
    const showLocationWarning = location.trim().length > 2 && !selectedCoords;

    // Handle Escape key to close filter drawer
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showFilters) {
                setShowFilters(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [showFilters]);

    // Prevent body scroll when drawer is open
    useEffect(() => {
        if (showFilters) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [showFilters]);

    const isCompact = variant === 'compact';
    const minMoveInDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];

    return (
        <div className={`w-full mx-auto ${isCompact ? 'max-w-2xl' : 'max-w-4xl'}`}>
            <form
                onSubmit={handleSearch}
                className={`group relative flex flex-col md:flex-row md:items-center bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08),0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),0_12px_40px_rgba(0,0,0,0.2)] border border-zinc-200/80 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-[0_4px_20px_rgba(0,0,0,0.1),0_16px_48px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.3),0_16px_48px_rgba(0,0,0,0.2)] transition-all duration-200 w-full ${isCompact ? 'p-1' : 'p-1.5 md:p-2 md:pr-2'}`}
                role="search"
            >
                {/* Location Input with Autocomplete - Airbnb-style stacked layout */}
                <div className={`w-full md:flex-1 flex flex-col relative ${isCompact ? 'px-4 py-2' : 'px-5 sm:px-6 py-3 md:py-2'}`}>
                    {!isCompact && (
                        <span className="text-2xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-1">
                            Where
                        </span>
                    )}
                    <LocationSearchInput
                        value={location}
                        onChange={(value) => {
                            setLocation(value);
                            if (selectedCoords) setSelectedCoords(null);
                            setShowRecentSearches(false);
                        }}
                        onLocationSelect={(data) => {
                            handleLocationSelect(data);
                            setShowRecentSearches(false);
                        }}
                        onFocus={() => {
                            if (recentSearches.length > 0 && !location) {
                                setShowRecentSearches(true);
                            }
                        }}
                        onBlur={() => {
                            // Delay hiding to allow click on recent search
                            setTimeout(() => setShowRecentSearches(false), 200);
                        }}
                        placeholder="Search destinations"
                        className={isCompact ? "text-sm" : "text-sm"}
                    />

                    {/* Recent Searches Dropdown */}
                    {showRecentSearches && recentSearches.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
                                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase">Recent Searches</span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        clearRecentSearches();
                                    }}
                                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                >
                                    Clear
                                </button>
                            </div>
                            <ul className="py-1">
                                {recentSearches.map((search, idx) => (
                                    <li key={`${search.location}-${idx}`}>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                selectRecentSearch(search);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors"
                                        >
                                            <Clock className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                                            <span className="text-sm text-zinc-700 dark:text-zinc-200 truncate">
                                                {search.location}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Divider - Taller for better segmentation */}
                <div className="hidden md:flex items-center self-stretch" aria-hidden="true">
                    <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-700"></div>
                </div>
                <div className="md:hidden w-[calc(100%-2rem)] mx-auto h-px bg-zinc-100 dark:bg-zinc-800" aria-hidden="true"></div>

                {/* Price Range Input - Airbnb-style stacked layout */}
                <div className={`w-full md:flex-1 flex flex-col ${isCompact ? 'px-4 py-2' : 'px-5 sm:px-6 py-3 md:py-2'}`}>
                    {!isCompact && (
                        <label className="text-2xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-1">
                            Budget
                        </label>
                    )}
                    <div className="flex items-center gap-1.5 px-2 py-1 -mx-2 -my-1 rounded-lg transition-colors focus-within:bg-zinc-100/50 dark:focus-within:bg-zinc-800/50">
                        <input
                            id="search-budget-min"
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={minPrice}
                            onChange={(e) => setMinPrice(e.target.value)}
                            placeholder="Min"
                            className={`w-full bg-transparent border-none p-0 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:ring-0 focus:outline-none outline-none ring-0 cursor-text appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] ${isCompact ? 'text-sm' : 'text-sm'}`}
                            min="0"
                            step="50"
                            aria-label="Minimum budget"
                        />
                        <span className="text-zinc-300 dark:text-zinc-600 text-sm">-</span>
                        <input
                            id="search-budget-max"
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={maxPrice}
                            onChange={(e) => setMaxPrice(e.target.value)}
                            placeholder="Max"
                            className={`w-full bg-transparent border-none p-0 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:ring-0 focus:outline-none outline-none ring-0 cursor-text appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] ${isCompact ? 'text-sm' : 'text-sm'}`}
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
                        <div className="hidden md:flex items-center self-stretch mx-2" aria-hidden="true">
                            <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-700"></div>
                        </div>
                        <Button
                            type="button"
                            variant="filter"
                            onClick={() => setShowFilters(!showFilters)}
                            data-active={activeFilterCount > 0}
                            className={`hidden sm:flex items-center gap-2 rounded-full h-10 px-5 transition-all duration-200 ${showFilters ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white' : ''}`}
                            aria-expanded={showFilters}
                            aria-controls="search-filters"
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                            Filters
                            {activeFilterCount > 0 && (
                                <span className={`ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full transition-colors ${showFilters ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white' : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'}`}>
                                    {activeFilterCount}
                                </span>
                            )}
                        </Button>
                    </>
                )}

                {/* Search Button */}
                <div className={`flex items-center justify-center mt-2 md:mt-0 ${isCompact ? 'p-0.5' : 'p-1 md:ml-2'}`}>
                    <Button
                        type="submit"
                        disabled={isSearching}
                        aria-label={isSearching ? "Searching..." : "Search listings"}
                        aria-busy={isSearching}
                        className={`rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md ${isCompact ? 'h-9 w-9 p-0' : 'h-11 sm:h-12 w-full md:w-12'}`}
                    >
                        {isSearching ? (
                            <Loader2 className={`animate-spin ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                        ) : (
                            <Search className={`${isCompact ? 'w-4 h-4' : 'w-[22px] h-[22px]'}`} strokeWidth={2.5} />
                        )}
                        <span className={`md:hidden ml-2 font-medium text-sm ${isCompact ? 'hidden' : ''}`}>
                            {isSearching ? 'Searching...' : 'Search'}
                        </span>
                    </Button>
                </div>
            </form>

            {/* Location warning when user hasn't selected from dropdown */}
            {showLocationWarning && !isCompact && (
                <div className="mt-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-400 flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>
                        Select a location from the dropdown for more accurate results
                    </span>
                </div>
            )}

            {/* Filter Drawer Overlay - Rendered via Portal to escape stacking contexts */}
            {showFilters && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-modal overflow-hidden"
                    aria-labelledby="filter-drawer-title"
                    role="dialog"
                    aria-modal="true"
                >
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
                        onClick={() => setShowFilters(false)}
                        aria-label="Close filters"
                    />

                    {/* Drawer Panel with Focus Trap for accessibility */}
                    <FocusTrap active={showFilters}>
                        <div
                            id="search-filters"
                            className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl transform transition-transform duration-300 ease-out animate-in slide-in-from-right overflow-hidden flex flex-col">
                            {/* Note: FocusTrap wraps this - close button below will receive focus */}
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                                <h2 id="filter-drawer-title" className="text-lg font-semibold text-zinc-900 dark:text-white">
                                    Filters
                                    {activeFilterCount > 0 && (
                                        <span className="ml-2 inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-sm font-semibold rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </h2>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowFilters(false)}
                                    className="rounded-full w-9 h-9 p-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                    aria-label="Close filters"
                                >
                                    <X className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                                </Button>
                            </div>

                            {/* Scrollable Filter Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                                {/* Move-in Date */}
                                <div className="space-y-2">
                                    <label htmlFor="filter-move-in" className="text-sm font-semibold text-zinc-900 dark:text-white">Move-in Date</label>
                                    <DatePicker
                                        id="filter-move-in"
                                        value={moveInDate}
                                        onChange={setMoveInDate}
                                        placeholder="Select move-in date"
                                        minDate={minMoveInDate}
                                    />
                                </div>

                                {/* Lease Duration */}
                                <div className="space-y-2">
                                    <label htmlFor="filter-lease" className="text-sm font-semibold text-zinc-900 dark:text-white">Lease Duration</label>
                                    <Select value={leaseDuration} onValueChange={setLeaseDuration}>
                                        <SelectTrigger id="filter-lease">
                                            <SelectValue placeholder="Any" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="any">Any</SelectItem>
                                            <SelectItem value="Month-to-month">Month-to-month</SelectItem>
                                            <SelectItem value="3 months">3 months</SelectItem>
                                            <SelectItem value="6 months">6 months</SelectItem>
                                            <SelectItem value="12 months">12 months</SelectItem>
                                            <SelectItem value="Flexible">Flexible</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Room Type */}
                                <div className="space-y-2">
                                    <label htmlFor="filter-room-type" className="text-sm font-semibold text-zinc-900 dark:text-white">Room Type</label>
                                    <Select value={roomType} onValueChange={setRoomType}>
                                        <SelectTrigger id="filter-room-type">
                                            <SelectValue placeholder="Any" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="any">Any</SelectItem>
                                            <SelectItem value="Private Room">Private Room</SelectItem>
                                            <SelectItem value="Shared Room">Shared Room</SelectItem>
                                            <SelectItem value="Entire Place">Entire Place</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Amenities */}
                                <fieldset className="space-y-3">
                                    <legend className="text-sm font-semibold text-zinc-900 dark:text-white">Amenities</legend>
                                    <div className="flex flex-wrap gap-2" role="group" aria-label="Select amenities">
                                        {AMENITY_OPTIONS.map(amenity => (
                                            <Button
                                                key={amenity}
                                                type="button"
                                                variant="filter"
                                                onClick={() => toggleAmenity(amenity)}
                                                data-active={amenities.includes(amenity)}
                                                aria-pressed={amenities.includes(amenity)}
                                                className={`rounded-full h-auto py-2 px-3 text-sm font-medium transition-all duration-200 ${amenities.includes(amenity) ? 'scale-[1.02]' : 'hover:scale-[1.02]'}`}
                                            >
                                                {amenity}
                                                {amenities.includes(amenity) && (
                                                    <X className="w-3.5 h-3.5 ml-1.5" />
                                                )}
                                            </Button>
                                        ))}
                                    </div>
                                </fieldset>

                                {/* House Rules */}
                                <fieldset className="space-y-3">
                                    <legend className="text-sm font-semibold text-zinc-900 dark:text-white">House Rules</legend>
                                    <div className="flex flex-wrap gap-2" role="group" aria-label="Select house rules">
                                        {HOUSE_RULE_OPTIONS.map(rule => (
                                            <Button
                                                key={rule}
                                                type="button"
                                                variant="filter"
                                                onClick={() => toggleHouseRule(rule)}
                                                data-active={houseRules.includes(rule)}
                                                aria-pressed={houseRules.includes(rule)}
                                                className={`rounded-full h-auto py-2 px-3 text-sm font-medium transition-all duration-200 ${houseRules.includes(rule) ? 'scale-[1.02]' : 'hover:scale-[1.02]'}`}
                                            >
                                                {rule}
                                                {houseRules.includes(rule) && (
                                                    <X className="w-3.5 h-3.5 ml-1.5" />
                                                )}
                                            </Button>
                                        ))}
                                    </div>
                                </fieldset>

                                {/* Languages */}
                                <fieldset className="space-y-3">
                                    <legend className="text-sm font-semibold text-zinc-900 dark:text-white">Can Communicate In</legend>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-1">Show listings where household speaks any of these</p>

                                    {/* Selected languages shown at top */}
                                    {languages.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-700" role="group" aria-label="Selected languages">
                                            {languages.map(code => (
                                                <Button
                                                    key={code}
                                                    type="button"
                                                    variant="filter"
                                                    onClick={() => toggleLanguage(code)}
                                                    data-active={true}
                                                    aria-pressed={true}
                                                    className="rounded-full h-auto py-2 px-3 text-sm font-medium"
                                                >
                                                    {getLanguageName(code)}
                                                    <X className="w-3.5 h-3.5 ml-1.5" />
                                                </Button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Search input */}
                                    <Input
                                        type="text"
                                        placeholder="Search languages..."
                                        value={languageSearch}
                                        onChange={(e) => setLanguageSearch(e.target.value)}
                                        className="h-9"
                                    />

                                    {/* Language chips */}
                                    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto" role="group" aria-label="Available languages">
                                        {filteredLanguages.filter(code => !languages.includes(code)).map(code => (
                                            <Button
                                                key={code}
                                                type="button"
                                                variant="filter"
                                                onClick={() => toggleLanguage(code)}
                                                data-active={false}
                                                aria-pressed={false}
                                                className="rounded-full h-auto py-2 px-3 text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
                                            >
                                                {getLanguageName(code)}
                                            </Button>
                                        ))}
                                        {filteredLanguages.filter(code => !languages.includes(code)).length === 0 && (
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                {languageSearch ? 'No languages found' : 'All languages selected'}
                                            </p>
                                        )}
                                    </div>
                                </fieldset>

                                {/* Gender Preferences */}
                                <div className="space-y-2">
                                    <label htmlFor="filter-gender-pref" className="text-sm font-semibold text-zinc-900 dark:text-white">Gender Preference</label>
                                    <Select value={genderPreference} onValueChange={setGenderPreference}>
                                        <SelectTrigger id="filter-gender-pref">
                                            <SelectValue placeholder="Any" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="any">Any</SelectItem>
                                            <SelectItem value="MALE_ONLY">Male Identifying Only</SelectItem>
                                            <SelectItem value="FEMALE_ONLY">Female Identifying Only</SelectItem>
                                            <SelectItem value="NO_PREFERENCE">Any Gender / All Welcome</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Household Gender */}
                                <div className="space-y-2">
                                    <label htmlFor="filter-household-gender" className="text-sm font-semibold text-zinc-900 dark:text-white">Household Gender</label>
                                    <Select value={householdGender} onValueChange={setHouseholdGender}>
                                        <SelectTrigger id="filter-household-gender">
                                            <SelectValue placeholder="Any" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="any">Any</SelectItem>
                                            <SelectItem value="ALL_MALE">All Male</SelectItem>
                                            <SelectItem value="ALL_FEMALE">All Female</SelectItem>
                                            <SelectItem value="MIXED">Mixed (Co-ed)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Drawer Footer with Actions */}
                            <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center gap-3">
                                {hasActiveFilters && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleClearAllFilters}
                                        className="flex-1 rounded-xl h-12"
                                    >
                                        Clear all
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    onClick={() => {
                                        setShowFilters(false);
                                        // Trigger search with current filters
                                        const form = document.querySelector('form[role="search"]') as HTMLFormElement;
                                        if (form) {
                                            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                                        }
                                    }}
                                    className="flex-1 rounded-xl h-12 bg-zinc-900 text-white hover:bg-zinc-800 shadow-md"
                                >
                                    Show Results
                                </Button>
                            </div>
                        </div>
                    </FocusTrap>
                </div >,
                document.body
            )
            }
        </div >
    );
}
