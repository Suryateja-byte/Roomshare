'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { MapPin, Loader2, X, AlertCircle, SearchX } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { getCachedResults, setCachedResults, type GeocodingResult } from '@/lib/geocoding-cache';

// Mapbox API limits
const MAPBOX_QUERY_MAX_LENGTH = 256;
const MIN_QUERY_LENGTH = 2;

/**
 * Sanitizes user input for safe API requests
 * - Trims whitespace
 * - Removes control characters
 * - Enforces max length (Mapbox 256 char limit)
 */
function sanitizeQuery(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .slice(0, MAPBOX_QUERY_MAX_LENGTH);
}

interface LocationSuggestion {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
  place_type: string[];
  bbox?: [number, number, number, number];
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
  /** HTML id for the input element - required for proper label association */
  id?: string;
}

export default function LocationSearchInput({
  value,
  onChange,
  onLocationSelect,
  onFocus,
  onBlur,
  placeholder = "City, neighborhood...",
  className = "",
  id
}: LocationSearchInputProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [noResults, setNoResults] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const rateLimitResetRef = useRef<NodeJS.Timeout | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const isComposingRef = useRef(false);

  const listboxId = useId();

  const [debouncedValue] = useDebounce(value, 300);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rateLimitResetRef.current) {
        clearTimeout(rateLimitResetRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // Fetch suggestions from Mapbox Geocoding API
  const fetchSuggestions = useCallback(async (query: string) => {
    // Sanitize input
    const sanitized = sanitizeQuery(query);

    // Reset states
    setError(null);
    setNoResults(false);

    // Validate minimum length
    if (!sanitized || sanitized.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Request deduplication - skip if same query already pending
    if (pendingQueryRef.current === sanitized) {
      return;
    }

    // Check cache first
    const cached = getCachedResults(sanitized);
    if (cached) {
      setSuggestions(cached as LocationSuggestion[]);
      setSelectedIndex(-1);
      setShowSuggestions(true);
      if (cached.length === 0 && sanitized.length >= 3) {
        setNoResults(true);
      }
      return;
    }

    // Don't fetch if rate limited
    if (isRateLimited) {
      setError('Too many requests. Please wait a moment.');
      return;
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setError('Location search is temporarily unavailable');
      console.error('Mapbox token is missing');
      return;
    }

    // Track this request
    const requestId = ++requestIdRef.current;
    pendingQueryRef.current = sanitized;

    // Cancel previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);

    try {
      const encodedQuery = encodeURIComponent(sanitized);
      // Focus on places, regions, localities, neighborhoods
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${token}&types=place,locality,neighborhood,address,region&limit=5&autocomplete=true`;

      const response = await fetch(url, { signal: controller.signal });

      // Handle rate limiting (429)
      if (response.status === 429) {
        setIsRateLimited(true);
        setError('Rate limit reached. Retrying shortly...');
        setShowSuggestions(true); // Show error in dropdown

        // Auto-retry after 2 seconds
        rateLimitResetRef.current = setTimeout(() => {
          setIsRateLimited(false);
          setError(null);
          // Retry with the current value
          if (pendingQueryRef.current === sanitized) {
            pendingQueryRef.current = null;
            fetchSuggestions(sanitized);
          }
        }, 2000);
        return;
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Location service authentication failed');
        } else if (response.status === 422) {
          throw new Error('Invalid search query');
        } else if (response.status >= 500) {
          throw new Error('Location service is temporarily unavailable');
        }
        throw new Error('Failed to fetch suggestions');
      }

      const data = await response.json();

      // Stale response check
      if (requestId !== requestIdRef.current) return;

      const features = (data.features || []) as LocationSuggestion[];

      // Cache the results
      setCachedResults(sanitized, features as GeocodingResult[]);

      setSuggestions(features);
      setSelectedIndex(-1);
      setShowSuggestions(true);

      // Set noResults if query was long enough but no results found
      if (sanitized.length >= 3 && features.length === 0) {
        setNoResults(true);
      }
    } catch (err) {
      // Handle AbortError silently (intentional cancellation)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      // Handle network errors
      if (err instanceof TypeError && err.message.includes('fetch')) {
        console.error('Network error fetching location suggestions:', err);
        if (requestId === requestIdRef.current) {
          setSuggestions([]);
          setError('Network error. Check your connection.');
          setShowSuggestions(true); // Show error in dropdown
        }
        return;
      }

      console.error('Error fetching location suggestions:', err);
      if (requestId === requestIdRef.current) {
        setSuggestions([]);
        setError(err instanceof Error ? err.message : 'Unable to search locations');
        setShowSuggestions(true); // Show error in dropdown
      }
    } finally {
      if (pendingQueryRef.current === sanitized) {
        pendingQueryRef.current = null;
      }
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [isRateLimited]);

  // Fetch suggestions when debounced value changes (but not during IME composition)
  useEffect(() => {
    if (!isComposingRef.current) {
      fetchSuggestions(debouncedValue);
    }
  }, [debouncedValue, fetchSuggestions]);

  // Handle clicking outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Ignore clicks inside the dropdown (including scrollbar)
      if (suggestionsRef.current?.contains(target)) {
        return;
      }

      // Ignore clicks on the input
      if (inputRef.current?.contains(target)) {
        return;
      }

      setShowSuggestions(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // IME composition handlers for CJK input support
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    // Trigger search with final composed value
    const finalValue = e.currentTarget.value;
    fetchSuggestions(finalValue);
  }, [fetchSuggestions]);

  // Handle keyboard navigation (WAI-ARIA combobox pattern)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!showSuggestions && suggestions.length > 0) {
          // Open dropdown on ArrowDown when closed but has suggestions
          setShowSuggestions(true);
          setSelectedIndex(0);
        } else if (showSuggestions && suggestions.length > 0) {
          setSelectedIndex(prev =>
            prev < suggestions.length - 1 ? prev + 1 : prev
          );
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (showSuggestions && suggestions.length > 0) {
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        }
        break;

      case 'Enter':
        if (showSuggestions && selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;

      case 'Tab':
        // Select highlighted option and close (don't prevent default - allow focus to move)
        if (showSuggestions && selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;

      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  }, [showSuggestions, suggestions, selectedIndex]);

  const handleSelectSuggestion = useCallback((suggestion: LocationSuggestion) => {
    const [lng, lat] = suggestion.center;
    onChange(suggestion.place_name);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedIndex(-1);

    if (onLocationSelect) {
      onLocationSelect({
        name: suggestion.place_name,
        lat,
        lng,
        bbox: suggestion.bbox
      });
    }
  }, [onChange, onLocationSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(true);
    // Note: actual fetch is triggered by debouncedValue effect
    // unless IME composition is in progress
  }, [onChange]);

  const handleClear = () => {
    onChange('');
    setSuggestions([]);
    setShowSuggestions(false);
    setError(null);
    setNoResults(false);
    inputRef.current?.focus();
  };

  const handleInputFocus = useCallback(() => {
    if (suggestions.length > 0 || value.length >= MIN_QUERY_LENGTH) {
      setShowSuggestions(true);
    }
    onFocus?.();
  }, [suggestions.length, value.length, onFocus]);

  // Handle click on input to reopen suggestions when already focused
  const handleInputClick = useCallback(() => {
    if (suggestions.length > 0 && !showSuggestions) {
      setShowSuggestions(true);
    }
  }, [suggestions.length, showSuggestions]);

  const handleInputBlur = useCallback(() => {
    // Small delay to allow click events on suggestions to fire first
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        // Focus moved outside the component
        setShowSuggestions(false);
      }
    }, 150);
    onBlur?.();
  }, [onBlur]);

  const getPlaceTypeIcon = (placeTypes: string[]) => {
    // Return appropriate styling based on place type
    if (placeTypes.includes('neighborhood')) return 'text-orange-500';
    if (placeTypes.includes('locality')) return 'text-blue-500';
    if (placeTypes.includes('place')) return 'text-green-500';
    if (placeTypes.includes('region')) return 'text-purple-500';
    return 'text-zinc-400';
  };

  // Show "type more" hint when user has typed but not enough characters
  const sanitizedValue = sanitizeQuery(value);
  const showTypeMoreHint = sanitizedValue.length > 0 && sanitizedValue.length < MIN_QUERY_LENGTH && !isComposingRef.current;

  // Compute whether any popup is visible for aria-expanded
  const isPopupOpen = showSuggestions && (
    suggestions.length > 0 ||
    (error && !isLoading) ||
    (noResults && !error && !isLoading) ||
    showTypeMoreHint
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onClick={handleInputClick}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          className="w-full bg-transparent border-none p-0 text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300 focus:ring-0 focus:outline-none text-sm truncate pr-8"
          autoComplete="off"
          // ARIA combobox attributes for screen reader accessibility
          role="combobox"
          aria-expanded={isPopupOpen}
          aria-controls={`${listboxId}-listbox`}
          aria-activedescendant={
            showSuggestions && selectedIndex >= 0
              ? `${listboxId}-option-${selectedIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-busy={isLoading}
        />

        {/* Loading/Clear indicator */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" aria-hidden="true" />
          ) : value ? (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3 h-3 text-zinc-400" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Type more hint */}
      {showSuggestions && showTypeMoreHint && !isLoading && (
        <div
          ref={suggestionsRef}
          role="status"
          aria-live="polite"
          className="absolute top-full left-0 right-0 mt-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-zinc-200/80 dark:border-zinc-700/80 overflow-hidden z-dropdown min-w-[300px] animate-in fade-in-0 slide-in-from-top-2"
        >
          <div className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
            Type at least {MIN_QUERY_LENGTH} characters to search
          </div>
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && !showTypeMoreHint && (
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
      {showSuggestions && error && !isLoading && !showTypeMoreHint && (
        <div
          ref={suggestionsRef}
          role="alert"
          aria-live="assertive"
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
      {showSuggestions && noResults && !error && !isLoading && suggestions.length === 0 && !showTypeMoreHint && (
        <div
          ref={suggestionsRef}
          role="status"
          aria-live="polite"
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
