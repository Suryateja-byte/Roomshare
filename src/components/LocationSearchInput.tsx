'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { MapPin, Loader2, X, AlertCircle, SearchX } from 'lucide-react';
import { useDebounce } from 'use-debounce';

interface LocationSuggestion {
    id: string;
    place_name: string;
    center: [number, number]; // [lng, lat]
    place_type: string[];
}

interface LocationSearchInputProps {
    value: string;
    onChange: (value: string) => void;
    onLocationSelect?: (location: {
        name: string;
        lat: number;
        lng: number;
        bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
    }) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    placeholder?: string;
    className?: string;
}

export default function LocationSearchInput({
    value,
    onChange,
    onLocationSelect,
    onFocus,
    onBlur,
    placeholder = "City, neighborhood...",
    className = ""
}: LocationSearchInputProps) {
    const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [error, setError] = useState<string | null>(null);
    const [noResults, setNoResults] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const requestIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const listboxId = useId();

    const [debouncedValue] = useDebounce(value, 300);

    // Fetch suggestions from Mapbox Geocoding API
    const fetchSuggestions = useCallback(async (query: string) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        // Reset states
        setError(null);
        setNoResults(false);

        if (!query || query.length < 2) {
            setSuggestions([]);
            return;
        }

        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!token) {
            setError('Location search is temporarily unavailable');
            console.error('Mapbox token is missing');
            return;
        }

        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;

        setIsLoading(true);
        try {
            const encodedQuery = encodeURIComponent(query);
            // Focus on places, regions, localities, neighborhoods
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${token}&types=place,locality,neighborhood,address,region&limit=5&autocomplete=true`;

            const response = await fetch(url, { signal: controller.signal });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new Error('Location service authentication failed');
                } else if (response.status >= 500) {
                    throw new Error('Location service is temporarily unavailable');
                }
                throw new Error('Failed to fetch suggestions');
            }

            const data = await response.json();
            if (requestId !== requestIdRef.current) return;
            const features = data.features || [];
            setSuggestions(features);
            setSelectedIndex(-1);

            // Set noResults if query was long enough but no results found
            if (query.length >= 3 && features.length === 0) {
                setNoResults(true);
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                return;
            }
            console.error('Error fetching location suggestions:', err);
            if (requestId === requestIdRef.current) {
                setSuggestions([]);
                setError(err instanceof Error ? err.message : 'Unable to search locations');
            }
        } finally {
            if (requestId === requestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, []);

    // Fetch suggestions when debounced value changes
    useEffect(() => {
        fetchSuggestions(debouncedValue);
    }, [debouncedValue, fetchSuggestions]);

    // Handle clicking outside to close suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showSuggestions || suggestions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < suggestions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                    handleSelectSuggestion(suggestions[selectedIndex]);
                }
                break;
            case 'Escape':
                setShowSuggestions(false);
                setSelectedIndex(-1);
                break;
        }
    };

    const handleSelectSuggestion = (suggestion: LocationSuggestion) => {
        const [lng, lat] = suggestion.center;
        onChange(suggestion.place_name);
        setShowSuggestions(false);
        setSuggestions([]);

        if (onLocationSelect) {
            onLocationSelect({
                name: suggestion.place_name,
                lat,
                lng,
                // bbox is available on some results
                bbox: (suggestion as any).bbox as [number, number, number, number] | undefined
            });
        }
    };

    const handleClear = () => {
        onChange('');
        setSuggestions([]);
        inputRef.current?.focus();
    };

    const getPlaceTypeIcon = (placeTypes: string[]) => {
        // Return appropriate styling based on place type
        if (placeTypes.includes('neighborhood')) return 'text-orange-500';
        if (placeTypes.includes('locality')) return 'text-blue-500';
        if (placeTypes.includes('place')) return 'text-green-500';
        if (placeTypes.includes('region')) return 'text-purple-500';
        return 'text-zinc-400';
    };

    return (
        <div className={`relative ${className}`}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setShowSuggestions(true);
                    }}
                    onFocus={() => {
                        if (suggestions.length > 0 || value.length >= 2) {
                            setShowSuggestions(true);
                        }
                        onFocus?.();
                    }}
                    onBlur={() => {
                        onBlur?.();
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-transparent border-none p-0 text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:ring-0 focus:outline-none text-sm truncate pr-8"
                    autoComplete="off"
                    // ARIA combobox attributes for screen reader accessibility
                    role="combobox"
                    aria-expanded={showSuggestions && suggestions.length > 0}
                    aria-controls={`${listboxId}-listbox`}
                    aria-activedescendant={selectedIndex >= 0 ? `${listboxId}-option-${selectedIndex}` : undefined}
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                />

                {/* Loading/Clear indicator */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                    ) : value ? (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full transition-colors"
                        >
                            <X className="w-3 h-3 text-zinc-400" />
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
                <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-zinc-200/80 dark:border-zinc-700/80 overflow-hidden z-dropdown min-w-[300px] animate-in fade-in-0 slide-in-from-top-2"
                >
                    <ul
                        className="p-2"
                        role="listbox"
                        id={`${listboxId}-listbox`}
                        aria-label="Location suggestions"
                    >
                        {suggestions.map((suggestion, index) => (
                            <li
                                key={suggestion.id}
                                role="option"
                                id={`${listboxId}-option-${index}`}
                                aria-selected={index === selectedIndex}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleSelectSuggestion(suggestion)}
                                    className={`w-full px-3 py-2.5 flex items-start gap-3 rounded-xl transition-colors duration-150 text-left ${index === selectedIndex
                                        ? 'bg-zinc-100 dark:bg-zinc-800'
                                        : 'hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80'
                                        }`}
                                    tabIndex={-1}
                                >
                                    <MapPin className={`w-5 h-5 mt-0.5 flex-shrink-0 ${getPlaceTypeIcon(suggestion.place_type)}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                                            {suggestion.place_name.split(',')[0]}
                                        </p>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                            {suggestion.place_name.split(',').slice(1).join(',').trim()}
                                        </p>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Error state dropdown */}
            {showSuggestions && error && !isLoading && (
                <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-zinc-200/80 dark:border-zinc-700/80 overflow-hidden z-dropdown min-w-[300px] animate-in fade-in-0 slide-in-from-top-2"
                >
                    <div className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                            <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-red-700 dark:text-red-300">
                                Search unavailable
                            </p>
                            <p className="text-xs text-red-500 dark:text-red-400">
                                {error}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* No results dropdown */}
            {showSuggestions && noResults && !error && !isLoading && suggestions.length === 0 && (
                <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-zinc-200/80 dark:border-zinc-700/80 overflow-hidden z-dropdown min-w-[300px] animate-in fade-in-0 slide-in-from-top-2"
                >
                    <div className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <SearchX className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                No locations found
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Try a different city or neighborhood name
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
