"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { MapPin, Loader2, X, AlertCircle, SearchX } from "lucide-react";
import { useDebounce } from "use-debounce";
import {
  getCachedResults,
  setCachedResults,
  type GeocodingResult,
} from "@/lib/geocoding-cache";
import { searchPhoton, PHOTON_QUERY_MAX_LENGTH } from "@/lib/geocoding/photon";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";

const MIN_QUERY_LENGTH = 2;

/**
 * Sanitizes user input for safe API requests
 * - Trims whitespace
 * - Removes control characters
 * - Enforces max length
 */
function sanitizeQuery(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
    .slice(0, PHOTON_QUERY_MAX_LENGTH);
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
  id,
}: LocationSearchInputProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [noResults, setNoResults] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const isComposingRef = useRef(false);
  const justSelectedRef = useRef(false);

  const listboxId = useId();

  // Portal positioning: track the input's bounding rect so the dropdown
  // can be rendered at document.body with correct coordinates.
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  const updateDropdownPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 8, // 8px gap (mt-2)
      left: rect.left,
      width: Math.max(rect.width, 300), // min 300px
    });
  }, []);

  const [debouncedValue] = useDebounce(value, 300);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // Fetch suggestions from Photon geocoding API
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
    const cached = await getCachedResults(sanitized);
    if (cached) {
      setSuggestions(cached as LocationSuggestion[]);
      setSelectedIndex(-1);
      setShowSuggestions(true);
      if (cached.length === 0 && sanitized.length >= 3) {
        setNoResults(true);
      }
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
      const results = await searchPhoton(sanitized, {
        signal: controller.signal,
      });

      // Stale response check
      if (requestId !== requestIdRef.current) return;

      const features = results as LocationSuggestion[];

      // Cache the results (fire-and-forget; don't block rendering)
      void setCachedResults(sanitized, features as GeocodingResult[]);

      setSuggestions(features);
      setSelectedIndex(-1);
      setShowSuggestions(true);

      // Set noResults if query was long enough but no results found
      if (sanitized.length >= 3 && features.length === 0) {
        setNoResults(true);
      }
    } catch (err) {
      // Handle AbortError silently (intentional cancellation)
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      // Handle network errors
      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.error("Network error fetching location suggestions:", err);
        if (requestId === requestIdRef.current) {
          setSuggestions([]);
          setError("Network error. Check your connection.");
          setShowSuggestions(true); // Show error in dropdown
        }
        return;
      }

      // Handle timeout errors with user-friendly message
      if (err instanceof FetchTimeoutError) {
        console.warn("Location search timed out:", err.url);
        if (requestId === requestIdRef.current) {
          setSuggestions([]);
          setError("Location search timed out. Please try again.");
          setShowSuggestions(true);
        }
        return;
      }

      console.error("Error fetching location suggestions:", err);
      if (requestId === requestIdRef.current) {
        setSuggestions([]);
        setError(
          err instanceof Error ? err.message : "Unable to search locations"
        );
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
  }, []);

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

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // IME composition handlers for CJK input support
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposingRef.current = false;
      // Trigger search with final composed value
      const finalValue = e.currentTarget.value;
      fetchSuggestions(finalValue);
    },
    [fetchSuggestions]
  );

  // Handle keyboard navigation (WAI-ARIA combobox pattern)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (!showSuggestions && suggestions.length > 0) {
            // Open dropdown on ArrowDown when closed but has suggestions
            setShowSuggestions(true);
            setSelectedIndex(0);
          } else if (showSuggestions && suggestions.length > 0) {
            setSelectedIndex((prev) =>
              prev < suggestions.length - 1 ? prev + 1 : prev
            );
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (showSuggestions && suggestions.length > 0) {
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          }
          break;

        case "Enter":
          if (
            showSuggestions &&
            selectedIndex >= 0 &&
            selectedIndex < suggestions.length
          ) {
            e.preventDefault();
            handleSelectSuggestion(suggestions[selectedIndex]);
          }
          break;

        case "Tab":
          // Select highlighted option and close (don't prevent default - allow focus to move)
          if (
            showSuggestions &&
            selectedIndex >= 0 &&
            selectedIndex < suggestions.length
          ) {
            handleSelectSuggestion(suggestions[selectedIndex]);
          }
          setShowSuggestions(false);
          setSelectedIndex(-1);
          break;

        case "Escape":
          e.preventDefault();
          setShowSuggestions(false);
          setSelectedIndex(-1);
          break;
      }
       
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSelectSuggestion defined after this hook; stable via useCallback
    [showSuggestions, suggestions, selectedIndex]
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: LocationSuggestion) => {
      justSelectedRef.current = true;
      const [lng, lat] = suggestion.center;
      onChange(suggestion.place_name);
      setShowSuggestions(false);
      setSuggestions([]);
      setSelectedIndex(-1);
      // Reset flag after React's event cycle completes
      requestAnimationFrame(() => {
        justSelectedRef.current = false;
      });

      if (onLocationSelect) {
        onLocationSelect({
          name: suggestion.place_name,
          lat,
          lng,
          bbox: suggestion.bbox,
        });
      }
    },
    [onChange, onLocationSelect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      if (!justSelectedRef.current) {
        setShowSuggestions(true);
      }
      // Note: actual fetch is triggered by debouncedValue effect
      // unless IME composition is in progress
    },
    [onChange]
  );

  const handleClear = () => {
    onChange("");
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
    if (placeTypes.includes("neighborhood")) return "text-orange-500";
    if (placeTypes.includes("locality")) return "text-blue-500";
    if (placeTypes.includes("place")) return "text-green-500";
    if (placeTypes.includes("region")) return "text-purple-500";
    return "text-on-surface-variant";
  };

  // Show "type more" hint when user has typed but not enough characters
  const sanitizedValue = sanitizeQuery(value);
  const showTypeMoreHint =
    sanitizedValue.length > 0 &&
    sanitizedValue.length < MIN_QUERY_LENGTH &&
    !isComposingRef.current;

  // Compute whether any popup is visible for aria-expanded
  const isPopupOpen =
    showSuggestions &&
    (suggestions.length > 0 ||
      (error && !isLoading) ||
      (noResults && !error && !isLoading) ||
      showTypeMoreHint);

  // Recalculate portal position when popup opens or on scroll/resize
  useEffect(() => {
    if (!isPopupOpen) return;
    updateDropdownPosition();
    const handleUpdate = () => updateDropdownPosition();
    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);
    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [isPopupOpen, updateDropdownPosition]);

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
          className="w-full bg-transparent border-none p-0 text-on-surface placeholder:text-on-surface-variant focus:ring-0 focus:outline-none text-base md:text-sm truncate pr-8"
          autoComplete="off"
          // ARIA combobox attributes for screen reader accessibility
          role="combobox"
          aria-expanded={isPopupOpen}
          aria-controls={isPopupOpen ? `${listboxId}-listbox` : undefined}
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
            <Loader2
              className="w-4 h-4 text-on-surface-variant animate-spin"
              aria-hidden="true"
            />
          ) : value ? (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container-high rounded-full transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3 h-3 text-on-surface-variant" />
            </button>
          ) : null}
        </div>
      </div>

      {/* All dropdown variants rendered via portal to escape header stacking context */}
      {isMounted && dropdownPos && isPopupOpen && createPortal(
        <>
          {/* Type more hint */}
          {showSuggestions && showTypeMoreHint && !isLoading && (
            <div
              ref={suggestionsRef}
              role="status"
              aria-live="polite"
              className="fixed bg-surface-container-lowest backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in-0 slide-in-from-top-2"
              style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
            >
              <div className="px-4 py-3 text-sm text-on-surface-variant">
                Type at least {MIN_QUERY_LENGTH} characters to search
              </div>
            </div>
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && !showTypeMoreHint && (
            <div
              ref={suggestionsRef}
              className="fixed bg-surface-container-lowest backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in-0 slide-in-from-top-2"
              style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
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
                      className={`w-full px-3 py-2.5 flex items-start gap-3 rounded-xl transition-colors duration-150 text-left ${
                        index === selectedIndex
                          ? "bg-surface-container-high"
                          : "hover:bg-surface-container-high/80"
                      }`}
                      tabIndex={-1}
                    >
                      <MapPin
                        className={`w-5 h-5 mt-0.5 flex-shrink-0 ${getPlaceTypeIcon(suggestion.place_type)}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">
                          {suggestion.place_name.split(",")[0]}
                        </p>
                        <p className="text-xs text-on-surface-variant truncate">
                          {suggestion.place_name
                            .split(",")
                            .slice(1)
                            .join(",")
                            .trim()}
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
              className="fixed bg-surface-container-lowest backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in-0 slide-in-from-top-2"
              style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
            >
              <div className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-100">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-red-700">
                    Search unavailable
                  </p>
                  <p className="text-xs text-red-500 animate-error-in">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* No results dropdown */}
          {showSuggestions &&
            noResults &&
            !error &&
            !isLoading &&
            suggestions.length === 0 &&
            !showTypeMoreHint && (
              <div
                ref={suggestionsRef}
                role="status"
                aria-live="polite"
                className="fixed bg-surface-container-lowest backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in-0 slide-in-from-top-2"
                style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
              >
                <div className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-full bg-surface-container-high">
                    <SearchX className="w-5 h-5 text-on-surface-variant" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-on-surface-variant">
                      No locations found
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Try a different city or neighborhood name
                    </p>
                  </div>
                </div>
              </div>
            )}
        </>,
        document.body
      )}
    </div>
  );
}
