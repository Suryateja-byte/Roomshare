'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Clock, Loader2, SlidersHorizontal, Home, Users, Building2, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LocationSearchInput from '@/components/LocationSearchInput';
import { SUPPORTED_LANGUAGES, getLanguageName, normalizeLanguages, type LanguageCode } from '@/lib/languages';
import FilterModal from '@/components/search/FilterModal';
// Import canonical allowlists and aliases from shared parsing module
// This ensures client-side parsing matches server-side validation
import {
    VALID_AMENITIES,
    VALID_HOUSE_RULES,
    VALID_LEASE_DURATIONS,
    VALID_ROOM_TYPES,
    VALID_GENDER_PREFERENCES,
    VALID_HOUSEHOLD_GENDERS,
    LEASE_DURATION_ALIASES,
    ROOM_TYPE_ALIASES,
} from '@/lib/search-params';
import { useSearchTransitionSafe } from '@/contexts/SearchTransitionContext';
import { useRecentSearches, type RecentSearch, type RecentSearchFilters } from '@/hooks/useRecentSearches';

// Debounce delay in milliseconds
const SEARCH_DEBOUNCE_MS = 300;

// Re-export canonical allowlists with legacy names for backwards compatibility within this component
// This allows gradual migration without breaking existing code
const AMENITY_OPTIONS = VALID_AMENITIES;
const HOUSE_RULE_OPTIONS = VALID_HOUSE_RULES;
const GENDER_PREFERENCE_OPTIONS = VALID_GENDER_PREFERENCES;
const HOUSEHOLD_GENDER_OPTIONS = VALID_HOUSEHOLD_GENDERS;
const LEASE_DURATION_OPTIONS = VALID_LEASE_DURATIONS;
const ROOM_TYPE_OPTIONS = VALID_ROOM_TYPES;

// Room type options for inline filter tabs
const ROOM_TYPE_TABS = [
    { value: 'any', label: 'All', icon: LayoutGrid },
    { value: 'Private Room', label: 'Private', icon: Home },
    { value: 'Shared Room', label: 'Shared', icon: Users },
    { value: 'Entire Place', label: 'Entire', icon: Building2 },
] as const;

/**
 * Validate a move-in date string. Returns the date if valid (today or future, within 2 years),
 * otherwise returns empty string. This matches the server-side safeParseDate logic.
 */
const validateMoveInDate = (value: string | null): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';

    const [yearStr, monthStr, dayStr] = trimmed.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    if (month < 1 || month > 12) return '';
    if (day < 1 || day > 31) return '';

    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return '';
    }

    // Reject past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return '';

    // Reject dates more than 2 years in the future
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 2);
    if (date > maxDate) return '';

    return trimmed;
};

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
    const parseEnumParam = (key: string, allowlist: readonly string[], aliases?: Record<string, string>) => {
        const value = searchParams.get(key);
        if (!value) return '';
        const trimmed = value.trim();
        // Check direct match first
        if (allowlist.includes(trimmed)) return trimmed;
        // Check case-insensitive match
        const lowerValue = trimmed.toLowerCase();
        const caseMatch = allowlist.find(item => item.toLowerCase() === lowerValue);
        if (caseMatch) return caseMatch;
        // Check aliases if provided
        if (aliases) {
            const aliasMatch = aliases[lowerValue];
            if (aliasMatch && allowlist.includes(aliasMatch)) return aliasMatch;
        }
        // Invalid value - return empty string
        return '';
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

    // New filters state - don't validate in initial state to avoid hydration mismatch
    // Validation happens in useEffect after mount
    const [moveInDate, setMoveInDate] = useState(searchParams.get('moveInDate') || '');
    const [hasMounted, setHasMounted] = useState(false);
    const [leaseDuration, setLeaseDuration] = useState(parseEnumParam('leaseDuration', LEASE_DURATION_OPTIONS, LEASE_DURATION_ALIASES));
    const [roomType, setRoomType] = useState(parseEnumParam('roomType', ROOM_TYPE_OPTIONS, ROOM_TYPE_ALIASES));
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

    // Recent searches from canonical hook (handles localStorage, migration, enhanced format)
    const { recentSearches, saveRecentSearch, clearRecentSearches } = useRecentSearches();
    const [showRecentSearches, setShowRecentSearches] = useState(false);

    // Select a recent search
    const selectRecentSearch = useCallback((search: RecentSearch) => {
        setLocation(search.location);
        if (search.coords) {
            setSelectedCoords(search.coords);
        }
        setShowRecentSearches(false);
    }, []);

    // Set hasMounted after initial render and validate moveInDate
    useEffect(() => {
        setHasMounted(true);
        // Validate moveInDate on mount to clear invalid past dates
        const validated = validateMoveInDate(searchParams.get('moveInDate'));
        setMoveInDate(validated);
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
        // Validate moveInDate to match server-side logic (reject past dates)
        setMoveInDate(validateMoveInDate(searchParams.get('moveInDate')));
        setLeaseDuration(parseEnumParam('leaseDuration', LEASE_DURATION_OPTIONS, LEASE_DURATION_ALIASES));
        setRoomType(parseEnumParam('roomType', ROOM_TYPE_OPTIONS, ROOM_TYPE_ALIASES));
        setAmenities(normalizeByAllowlist(parseParamList('amenities'), AMENITY_OPTIONS));
        setHouseRules(normalizeByAllowlist(parseParamList('houseRules'), HOUSE_RULE_OPTIONS));
        setLanguages(parseLanguages());
        setGenderPreference(parseEnumParam('genderPreference', GENDER_PREFERENCE_OPTIONS));
        setHouseholdGender(parseEnumParam('householdGender', HOUSEHOLD_GENDER_OPTIONS));
    }, [searchParams]);

    const router = useRouter();
    const transitionContext = useSearchTransitionSafe();

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

        // Prevent unbounded searches: if user typed location but didn't select from dropdown,
        // don't submit (this prevents full-table scans on the server)
        const trimmedLocation = location.trim();
        if (trimmedLocation.length > 2 && !selectedCoords) {
            // User needs to select a location from dropdown
            // The warning is already shown via showLocationWarning
            return;
        }

        // Clear any pending search timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Clone existing URL params to preserve bounds, nearMatches, and sort
        // These are set by the map and should persist across filter changes
        const params = new URLSearchParams(searchParams.toString());

        // Clear pagination params (filters changing = back to page 1)
        params.delete('page');
        params.delete('cursor');
        params.delete('cursorStack');
        params.delete('pageNumber');

        // Clear ALL filter params BEFORE setting new values
        // This prevents stale values from persisting when filters are cleared
        const filterParamsToDelete = [
            'q', 'minPrice', 'maxPrice', 'lat', 'lng',
            'moveInDate', 'leaseDuration', 'roomType',
            'amenities', 'houseRules', 'languages',
            'genderPreference', 'householdGender'
        ];
        filterParamsToDelete.forEach(param => params.delete(param));

        // Clear bounds when a new location was selected from autocomplete
        // This allows the map to fly to and set bounds for the new location
        // (bounds are preserved for filter-only changes to maintain current map view)
        if (selectedCoords) {
            params.delete('minLat');
            params.delete('maxLat');
            params.delete('minLng');
            params.delete('maxLng');
        }

        // Only include query if it has actual content (not just whitespace)
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

        // Save to recent searches when navigating (with filters for enhanced format)
        if (trimmedLocation) {
            const activeFilters: Partial<RecentSearchFilters> = {};
            if (minPrice) activeFilters.minPrice = minPrice;
            if (maxPrice) activeFilters.maxPrice = maxPrice;
            if (roomType) activeFilters.roomType = roomType;
            if (leaseDuration) activeFilters.leaseDuration = leaseDuration;
            if (amenities.length > 0) activeFilters.amenities = amenities;
            if (houseRules.length > 0) activeFilters.houseRules = houseRules;

            saveRecentSearch(
                trimmedLocation,
                selectedCoords || undefined,
                Object.keys(activeFilters).length > 0 ? activeFilters : undefined
            );
        }

        // Close filter drawer on search
        setShowFilters(false);

        searchTimeoutRef.current = setTimeout(() => {
            if (transitionContext) {
                transitionContext.navigateWithTransition(searchUrl);
            } else {
                router.push(searchUrl);
            }
            // Reset searching state after navigation starts
            setTimeout(() => setIsSearching(false), 500);
        }, SEARCH_DEBOUNCE_MS);
    }, [location, minPrice, maxPrice, selectedCoords, moveInDate, leaseDuration, roomType, amenities, houseRules, languages, genderPreference, householdGender, router, isSearching, saveRecentSearch, searchParams]);

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
        if (transitionContext) {
            transitionContext.navigateWithTransition('/search');
        } else {
            router.push('/search');
        }
    };

    // Count active filters for badge - split into two parts to avoid hydration mismatch
    // Base count excludes moveInDate (no Date() calls, safe for SSR)
    const baseFilterCount = [
        leaseDuration && leaseDuration !== 'any',
        roomType && roomType !== 'any',
        ...amenities,
        ...houseRules,
        ...languages,
        genderPreference && genderPreference !== 'any',
        householdGender && householdGender !== 'any',
    ].filter(Boolean).length;

    // moveInDate count only calculated after mount (uses Date() which differs server/client)
    // IMPORTANT: Only call validateMoveInDate when hasMounted is true to avoid hydration mismatch
    // The Date() comparison inside validateMoveInDate can produce different results on server vs client
    const moveInDateCount = hasMounted ? (validateMoveInDate(moveInDate) ? 1 : 0) : 0;
    const activeFilterCount = baseFilterCount + moveInDateCount;

    // Check if any filters are active (for "Clear all" button visibility)
    // Cast to boolean to satisfy TypeScript (|| chain returns first truthy value)
    const hasActiveFilters = Boolean(
        location || minPrice || maxPrice ||
        (leaseDuration && leaseDuration !== 'any') ||
        (roomType && roomType !== 'any') ||
        amenities.length > 0 || houseRules.length > 0 ||
        languages.length > 0 ||
        (genderPreference && genderPreference !== 'any') ||
        (householdGender && householdGender !== 'any') ||
        moveInDateCount > 0
    );

    // Handler for removing individual filters from FilterBar pills
    const handleRemoveFilter = useCallback((type: string, value?: string) => {
        switch (type) {
            case 'leaseDuration':
                setLeaseDuration('');
                break;
            case 'moveInDate':
                setMoveInDate('');
                break;
            case 'amenity':
                if (value) setAmenities(prev => prev.filter(a => a !== value));
                break;
            case 'houseRule':
                if (value) setHouseRules(prev => prev.filter(r => r !== value));
                break;
            case 'language':
                if (value) setLanguages(prev => prev.filter(l => l !== value));
                break;
            case 'genderPreference':
                setGenderPreference('');
                break;
            case 'householdGender':
                setHouseholdGender('');
                break;
        }
    }, []);

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

                {/* Inline Filters - Room Type Tabs + Filters Button */}
                {!isCompact && (
                    <>
                        {/* Divider */}
                        <div className="hidden md:flex items-center self-stretch" aria-hidden="true">
                            <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-700"></div>
                        </div>
                        <div className="md:hidden w-[calc(100%-2rem)] mx-auto h-px bg-zinc-100 dark:bg-zinc-800" aria-hidden="true"></div>

                        {/* Room Type Tabs */}
                        <div className={`flex items-center gap-1 px-2 py-1`}>
                            <div className="flex items-center gap-0.5 p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                                {ROOM_TYPE_TABS.map(({ value, label, icon: Icon }) => {
                                    const isSelected = roomType === value || (!roomType && value === 'any');
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setRoomType(value === 'any' ? '' : value)}
                                            className={`
                                                flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium
                                                transition-all duration-200
                                                ${isSelected
                                                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-zinc-900/50'
                                                }
                                            `}
                                            aria-pressed={isSelected}
                                        >
                                            <Icon className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">{label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="hidden md:flex items-center self-stretch" aria-hidden="true">
                            <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-700"></div>
                        </div>

                        {/* Filters Button */}
                        <div className="flex items-center px-2">
                            <button
                                type="button"
                                onClick={() => setShowFilters(true)}
                                className={`
                                    flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                                    transition-all duration-200 border
                                    ${showFilters
                                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white'
                                        : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                    }
                                `}
                                aria-expanded={showFilters}
                                aria-controls="search-filters"
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                <span className="hidden sm:inline">Filters</span>
                                {activeFilterCount > 0 && (
                                    <span className={`
                                        inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-semibold rounded-full
                                        ${showFilters
                                            ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white'
                                            : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                                        }
                                    `}>
                                        {activeFilterCount}
                                    </span>
                                )}
                            </button>
                        </div>
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

            {/* Filter Modal - Presentational component */}
            <FilterModal
                isOpen={showFilters}
                onClose={() => setShowFilters(false)}
                onApply={() => {
                    setShowFilters(false);
                    // Trigger search with current filters
                    const form = document.querySelector('form[role="search"]') as HTMLFormElement;
                    if (form) {
                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    }
                }}
                onClearAll={handleClearAllFilters}
                hasActiveFilters={hasActiveFilters}
                activeFilterCount={activeFilterCount}
                moveInDate={moveInDate}
                leaseDuration={leaseDuration}
                roomType={roomType}
                amenities={amenities}
                houseRules={houseRules}
                languages={languages}
                genderPreference={genderPreference}
                householdGender={householdGender}
                onMoveInDateChange={setMoveInDate}
                onLeaseDurationChange={setLeaseDuration}
                onRoomTypeChange={setRoomType}
                onToggleAmenity={toggleAmenity}
                onToggleHouseRule={toggleHouseRule}
                onToggleLanguage={toggleLanguage}
                onGenderPreferenceChange={setGenderPreference}
                onHouseholdGenderChange={setHouseholdGender}
                languageSearch={languageSearch}
                onLanguageSearchChange={setLanguageSearch}
                filteredLanguages={filteredLanguages}
                minMoveInDate={minMoveInDate}
                amenityOptions={AMENITY_OPTIONS}
                houseRuleOptions={HOUSE_RULE_OPTIONS}
            />
        </div>
    );
}
