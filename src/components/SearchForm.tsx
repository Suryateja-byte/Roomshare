'use client';

import { useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import { flushSync } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Clock, Loader2, SlidersHorizontal, Home, Users, Building2, LayoutGrid, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import LocationSearchInput from '@/components/LocationSearchInput';
import { SUPPORTED_LANGUAGES, getLanguageName, type LanguageCode } from '@/lib/languages';
import dynamic from 'next/dynamic';

const FilterModal = dynamic(() => import('@/components/search/FilterModal'), {
    ssr: false,
    loading: () => null,
});
import { parseNaturalLanguageQuery, nlQueryToSearchParams } from '@/lib/search/natural-language-parser';
// Import canonical allowlists from shared parsing module
import {
    VALID_AMENITIES,
    VALID_HOUSE_RULES,
} from '@/lib/search-params';
import { useSearchTransitionSafe } from '@/contexts/SearchTransitionContext';
import { useRecentSearches, type RecentSearch, type RecentSearchFilters } from '@/hooks/useRecentSearches';
import { useDebouncedFilterCount } from '@/hooks/useDebouncedFilterCount';
import { useFacets } from '@/hooks/useFacets';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useBatchedFilters } from '@/hooks/useBatchedFilters';
import { pendingToFilterParams } from '@/lib/pending-to-filter-params';
import { generateFilterSuggestions, type FilterSuggestion } from '@/lib/near-matches';

// Debounce delay in milliseconds
const SEARCH_DEBOUNCE_MS = 300;

// Alias for FilterModal props
const AMENITY_OPTIONS = VALID_AMENITIES;
const HOUSE_RULE_OPTIONS = VALID_HOUSE_RULES;

const ARRAY_PENDING_KEYS = new Set<string>(['amenities', 'houseRules', 'languages']);

const SUGGESTION_TYPE_TO_PENDING_KEYS: Record<string, string[]> = {
    price: ['minPrice', 'maxPrice'],
    date: ['moveInDate'],
    roomType: ['roomType'],
    amenities: ['amenities'],
    leaseDuration: ['leaseDuration'],
};

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
    const formRef = useRef<HTMLFormElement | null>(null);
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
    // Batched filter state — single hook manages pending vs committed
    const [showFilters, setShowFilters] = useState(false);

    const { pending, isDirty: filtersDirty, setPending, commit: commitFilters } = useBatchedFilters({ isDrawerOpen: showFilters });
    // Destructure for convenient access (read-only aliases)
    const { minPrice, maxPrice, moveInDate, leaseDuration, roomType, amenities, houseRules, languages, genderPreference, householdGender } = pending;

    const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number; bbox?: [number, number, number, number] } | null>(parseCoords);
    const [geoLoading, setGeoLoading] = useState(false);

    const [hasMounted, setHasMounted] = useState(false);

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
    // Navigation version counter - ensures only the latest search executes navigation
    // Incremented on each new search to invalidate stale timeout callbacks
    const navigationVersionRef = useRef(0);
    // Track the isSearching reset timeout so it can be cleaned up on unmount
    const resetSearchingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    // Intentionally run-once ([] deps): mount-time validation of URL params and
    // one-time cleanup of stale moveInDate. Re-running on searchParams/moveInDate
    // changes would fight the URL sync effect in useBatchedFilters.
    useEffect(() => {
        setHasMounted(true);
        // Validate moveInDate on mount to clear invalid past dates
        const rawMoveInDate = searchParams.get('moveInDate');
        const validated = validateMoveInDate(rawMoveInDate);
        if (validated !== moveInDate) {
            setPending({ moveInDate: validated });
        }
        // Strip invalid moveInDate from URL so the sync effect in
        // useBatchedFilters doesn't re-override the cleanup from committed state
        if (rawMoveInDate && !validated) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('moveInDate');
            const qs = params.toString();
            router.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync non-filter state (location, coords) with URL when it changes
    // Filter state sync is handled by useBatchedFilters internally
    useEffect(() => {
        const coords = parseCoords();
        if (coords) {
            setSelectedCoords(coords);
        }
        setLocation(searchParams.get('q') || '');
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

    // Stale closure note: geoLoading is captured at callback creation time, but
    // the `disabled={geoLoading}` prop on the button prevents re-entry while
    // a geolocation request is in flight, so stale geoLoading is safe here.
    const handleUseMyLocation = useCallback(() => {
        if (geoLoading) return;
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser');
            return;
        }
        setGeoLoading(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude: lat, longitude: lng } = position.coords;
                flushSync(() => {
                    setLocation('');
                    setSelectedCoords({ lat, lng });
                });
                window.dispatchEvent(new CustomEvent<MapFlyToEventDetail>(MAP_FLY_TO_EVENT, {
                    detail: { lat, lng, zoom: 13 }
                }));
                setGeoLoading(false);
                // Submit the form to trigger search with new coords
                formRef.current?.requestSubmit();
            },
            (error) => {
                setGeoLoading(false);
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        toast.error('Location permission denied. Enable it in browser settings.');
                        break;
                    case error.POSITION_UNAVAILABLE:
                        toast.error('Unable to determine your location.');
                        break;
                    case error.TIMEOUT:
                        toast.error('Location request timed out. Try again.');
                        break;
                }
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
    }, []);

    const handleSearch = useCallback((e: React.FormEvent) => {
        e.preventDefault();

        // Try natural language parsing: if the input contains structured filters
        // (price, room type, amenities, etc.), parse and redirect with those params
        const trimmedLocation = location.trim();
        const nlParsed = trimmedLocation ? parseNaturalLanguageQuery(trimmedLocation) : null;
        if (nlParsed && !selectedCoords) {
            // NL query detected — build URL from parsed filters
            const nlParams = nlQueryToSearchParams(nlParsed);
            // Preserve map bounds and sort from current URL
            const current = new URLSearchParams(searchParams.toString());
            for (const key of ['minLat', 'maxLat', 'minLng', 'maxLng', 'sort']) {
                const val = current.get(key);
                if (val) nlParams.set(key, val);
            }
            setIsSearching(true);
            setShowFilters(false);
            const searchUrl = `/search?${nlParams.toString()}`;
            startTransition(() => {
                router.push(searchUrl);
            });
            return;
        }

        // Prevent unbounded searches: if user typed location but didn't select from dropdown,
        // don't submit (this prevents full-table scans on the server)
        if (trimmedLocation.length > 2 && !selectedCoords) {
            // User needs to select a location from dropdown
            // Scroll the warning into view and briefly shake it for emphasis
            const warningEl = document.getElementById('location-warning');
            if (warningEl) {
                warningEl.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
                warningEl.classList.remove('animate-shake');
                // Force reflow to restart animation
                void warningEl.offsetWidth;
                warningEl.classList.add('animate-shake');
            }
            return;
        }

        // Clear any pending search timeout and invalidate any in-flight navigation
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        // Increment navigation version to invalidate any stale timeout callbacks
        // This prevents race conditions when filters change rapidly
        navigationVersionRef.current++;

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
        if (selectedCoords) {
            params.set('lat', selectedCoords.lat.toString());
            params.set('lng', selectedCoords.lng.toString());
        }

        if (moveInDate) params.set('moveInDate', moveInDate);
        if (leaseDuration) params.set('leaseDuration', leaseDuration);
        const override = formRef.current?.dataset.roomTypeOverride;
        const effectiveRoomType = override !== undefined ? override : roomType;
        if (effectiveRoomType) params.set('roomType', effectiveRoomType);
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
        performance.mark('search-submit');
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

        // Capture current navigation version to check in timeout callback
        const capturedVersion = navigationVersionRef.current;

        searchTimeoutRef.current = setTimeout(() => {
            // Check if this navigation is still valid (not superseded by a newer search)
            // This prevents race conditions when filters change rapidly
            if (navigationVersionRef.current !== capturedVersion) {
                return;
            }

            if (transitionContext) {
                transitionContext.navigateWithTransition(searchUrl);
            } else {
                router.push(searchUrl);
            }
            // Reset searching state after navigation starts (tracked for cleanup)
            if (resetSearchingTimeoutRef.current) clearTimeout(resetSearchingTimeoutRef.current);
            resetSearchingTimeoutRef.current = setTimeout(() => setIsSearching(false), 500);
        }, SEARCH_DEBOUNCE_MS);
    }, [location, minPrice, maxPrice, selectedCoords, moveInDate, leaseDuration, roomType, amenities, houseRules, languages, genderPreference, householdGender, router, isSearching, saveRecentSearch, searchParams]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
            if (resetSearchingTimeoutRef.current) {
                clearTimeout(resetSearchingTimeoutRef.current);
            }
        };
    }, []);

    // INP optimization: Wrap toggle functions in startTransition
    // This marks state updates as non-urgent, allowing React to prioritize
    // visual feedback (button press) over state computation
    const toggleAmenity = useCallback((amenity: string) => {
        startTransition(() => {
            setPending((prev) => ({
                amenities: prev.amenities.includes(amenity)
                    ? prev.amenities.filter(a => a !== amenity)
                    : [...prev.amenities, amenity],
            }));
        });
    }, [setPending]);

    const toggleHouseRule = useCallback((rule: string) => {
        startTransition(() => {
            setPending((prev) => ({
                houseRules: prev.houseRules.includes(rule)
                    ? prev.houseRules.filter(r => r !== rule)
                    : [...prev.houseRules, rule],
            }));
        });
    }, [setPending]);

    const toggleLanguage = useCallback((lang: string) => {
        startTransition(() => {
            setPending((prev) => ({
                languages: prev.languages.includes(lang)
                    ? prev.languages.filter(l => l !== lang)
                    : [...prev.languages, lang],
            }));
        });
    }, [setPending]);

    // Room type selection — updates state and triggers search immediately
    const handleRoomTypeSelect = useCallback((value: string) => {
        const resolved = value === 'any' ? '' : value;
        setPending({ roomType: resolved });
        // Set data attribute synchronously so handleSearch reads fresh value
        // (React state update won't be visible until next render)
        if (formRef.current) {
            formRef.current.dataset.roomTypeOverride = resolved;
        }
        queueMicrotask(() => {
            formRef.current?.requestSubmit();
            // Clean up override after submit
            if (formRef.current) delete formRef.current.dataset.roomTypeOverride;
        });
    }, [setPending]);

    // Clear all filters and reset to defaults
    // INP optimization: Batch state updates in startTransition
    const handleClearAllFilters = useCallback(() => {
        startTransition(() => {
            setLocation('');
            setSelectedCoords(null);
            setPending({
                minPrice: '', maxPrice: '', moveInDate: '', leaseDuration: '',
                roomType: '', amenities: [], houseRules: [], languages: [],
                genderPreference: '', householdGender: '',
            });
        });
        // Navigate to clean search page (outside transition - navigation is user-facing)
        if (transitionContext) {
            transitionContext.navigateWithTransition('/search');
        } else {
            router.push('/search');
        }
    }, [transitionContext, router, setPending]);

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

    // P3-NEW-b: Get dynamic count for FilterModal button
    // filtersDirty is now computed by useBatchedFilters
    const {
        count,
        formattedCount,
        isLoading: isCountLoading,
        boundsRequired,
    } = useDebouncedFilterCount({
        pending,
        isDirty: filtersDirty,
        isDrawerOpen: showFilters,
    });

    // Facets data (histogram + facet counts) for FilterModal
    const { facets } = useFacets({
        pending,
        isDrawerOpen: showFilters,
    });

    // Derive price slider bounds from facets with fallback
    const priceAbsoluteMin = facets?.priceRanges?.min ?? 0;
    const priceAbsoluteMax = facets?.priceRanges?.max ?? 10000;

    // Convert string price state to numbers for slider
    const numericMinPrice = minPrice ? parseFloat(minPrice) : undefined;
    const numericMaxPrice = maxPrice ? parseFloat(maxPrice) : undefined;

    // Handle price slider changes
    const handlePriceChange = useCallback((min: number, max: number) => {
        startTransition(() => {
            setPending({
                minPrice: min <= priceAbsoluteMin ? '' : String(min),
                maxPrice: max >= priceAbsoluteMax ? '' : String(max),
            });
        });
    }, [priceAbsoluteMin, priceAbsoluteMax, setPending]);

    // P4: Compute drawer suggestions when count drops to 0
    const drawerSuggestions = useMemo(() => {
        if (count !== 0 || isCountLoading) return [];
        const fp = pendingToFilterParams(pending);
        return generateFilterSuggestions(fp, count).slice(0, 2);
    }, [count, isCountLoading, pending]);

    // P4: Handle removing a filter suggestion from the drawer
    const handleRemoveFilterSuggestion = useCallback((suggestion: FilterSuggestion) => {
        const keys = SUGGESTION_TYPE_TO_PENDING_KEYS[suggestion.type];
        if (!keys) return;
        const updates: Record<string, string | string[]> = {};
        for (const key of keys) {
            updates[key] = ARRAY_PENDING_KEYS.has(key) ? [] : '';
        }
        setPending(updates as Partial<typeof pending>);
    }, [setPending]);

    // Show warning when user has typed location but not selected from dropdown
    const showLocationWarning = location.trim().length > 2 && !selectedCoords;

    // Handle Escape key to close filter drawer (via shared hook for consistency)
    useKeyboardShortcuts([
        {
            key: 'Escape',
            action: () => setShowFilters(false),
            disabled: !showFilters,
            description: 'Close filter drawer',
        },
    ]);

    // Prevent body scroll when drawer is open
    useEffect(() => {
        if (showFilters) {
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = '';
            };
        }
    }, [showFilters]);

    const isCompact = variant === 'compact';
    const minMoveInDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];

    // CLS fix: min-h matches Suspense fallback in SearchHeaderWrapper.tsx
    return (
        <div className={`w-full mx-auto min-h-[56px] sm:min-h-[64px] ${isCompact ? 'max-w-2xl' : 'max-w-4xl'}`}>
            <form
                ref={formRef}
                onSubmit={handleSearch}
                className={`group relative flex flex-col md:flex-row md:items-center bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08),0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),0_12px_40px_rgba(0,0,0,0.2)] border border-zinc-200/80 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-[0_4px_20px_rgba(0,0,0,0.1),0_16px_48px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.3),0_16px_48px_rgba(0,0,0,0.2)] transition-all duration-200 w-full ${isCompact ? 'p-1' : 'p-1.5 md:p-2 md:pr-2'}`}
                role="search"
            >
                {/* Location Input with Autocomplete - Airbnb-style stacked layout */}
                <div className={`w-full md:flex-1 flex flex-col relative ${isCompact ? 'px-4 py-2' : 'px-5 sm:px-6 py-3 md:py-2'}`}>
                    {!isCompact && (
                        <label htmlFor="search-location" className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-1">
                            Where
                        </label>
                    )}
                    <div className="flex items-center gap-1">
                        <LocationSearchInput
                            id="search-location"
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
                            className={isCompact ? "text-sm flex-1" : "text-sm flex-1"}
                        />
                        <button
                            type="button"
                            onClick={handleUseMyLocation}
                            disabled={geoLoading}
                            className="flex-shrink-0 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                            aria-label="Use my current location"
                            title="Use my current location"
                        >
                            {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                        </button>
                    </div>

                    {/* Recent Searches Dropdown */}
                    {showRecentSearches && recentSearches.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
                                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase">Recent Searches</span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        clearRecentSearches();
                                    }}
                                    className="h-auto py-1 px-2 text-xs"
                                >
                                    Clear
                                </Button>
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
                        <label className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-1">
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
                            onChange={(e) => setPending({ minPrice: e.target.value })}
                            placeholder="Min"
                            className={`w-full bg-transparent border-none p-0 text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300 focus:ring-0 focus:outline-none outline-none ring-0 cursor-text appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] ${isCompact ? 'text-sm' : 'text-sm'}`}
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
                            onChange={(e) => setPending({ maxPrice: e.target.value })}
                            placeholder="Max"
                            className={`w-full bg-transparent border-none p-0 text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300 focus:ring-0 focus:outline-none outline-none ring-0 cursor-text appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] ${isCompact ? 'text-sm' : 'text-sm'}`}
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
                                            onClick={() => handleRoomTypeSelect(value)}
                                            className={`flex items-center justify-center gap-1 px-3 min-h-[44px] rounded-md text-xs font-medium transition-all duration-200 ${isSelected
                                                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-zinc-900/50'
                                            }`}
                                            aria-pressed={isSelected}
                                            aria-label={`Filter by ${label === 'All' ? 'all room types' : label + ' room'}`}
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
                            <Button
                                type="button"
                                variant="filter"
                                size="sm"
                                onClick={() => setShowFilters(true)}
                                data-active={showFilters}
                                aria-expanded={showFilters}
                                aria-controls={showFilters ? "search-filters" : undefined}
                                aria-label={activeFilterCount > 0 ? `Filters (${activeFilterCount} active)` : 'Filters'}
                                className="gap-1.5 rounded-lg"
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
                            </Button>
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
                            <Loader2 className={`animate-spin ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} aria-hidden="true" />
                        ) : (
                            <Search className={`${isCompact ? 'w-4 h-4' : 'w-[22px] h-[22px]'}`} strokeWidth={2.5} aria-hidden="true" />
                        )}
                        <span className={`md:hidden ml-2 font-medium text-sm ${isCompact ? 'hidden' : ''}`}>
                            {isSearching ? 'Searching...' : 'Search'}
                        </span>
                    </Button>
                </div>
            </form>

            {/* Location warning when user hasn't selected from dropdown */}
            {showLocationWarning && !isCompact && (
                <div id="location-warning" className="mt-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-400 flex items-center gap-2">
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
                    commitFilters();
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
                onMoveInDateChange={(v: string) => setPending({ moveInDate: v })}
                onLeaseDurationChange={(v: string) => setPending({ leaseDuration: v === 'any' ? '' : v })}
                onRoomTypeChange={(v: string) => setPending({ roomType: v === 'any' ? '' : v })}
                onToggleAmenity={toggleAmenity}
                onToggleHouseRule={toggleHouseRule}
                onToggleLanguage={toggleLanguage}
                onGenderPreferenceChange={(v: string) => setPending({ genderPreference: v === 'any' ? '' : v })}
                onHouseholdGenderChange={(v: string) => setPending({ householdGender: v === 'any' ? '' : v })}
                languageSearch={languageSearch}
                onLanguageSearchChange={setLanguageSearch}
                filteredLanguages={filteredLanguages}
                minMoveInDate={minMoveInDate}
                amenityOptions={AMENITY_OPTIONS}
                houseRuleOptions={HOUSE_RULE_OPTIONS}
                // Price range filter
                minPrice={numericMinPrice}
                maxPrice={numericMaxPrice}
                priceAbsoluteMin={priceAbsoluteMin}
                priceAbsoluteMax={priceAbsoluteMax}
                priceHistogram={facets?.priceHistogram?.buckets}
                onPriceChange={handlePriceChange}
                // Facet counts
                facetCounts={facets ? {
                    amenities: facets.amenities,
                    houseRules: facets.houseRules,
                    roomTypes: facets.roomTypes,
                } : undefined}
                // P3-NEW-b: Dynamic count props from useDebouncedFilterCount
                formattedCount={formattedCount}
                isCountLoading={isCountLoading}
                boundsRequired={boundsRequired}
                // P4: Zero-count warning
                count={count}
                drawerSuggestions={drawerSuggestions}
                onRemoveFilterSuggestion={handleRemoveFilterSuggestion}
            />
        </div>
    );
}
