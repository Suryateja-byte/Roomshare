"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  useMemo,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  MapPin,
  Loader2,
  X,
  SearchX,
  History,
  RotateCw,
  WifiOff,
} from "lucide-react";
import { useDebounce } from "use-debounce";
import { cn } from "@/lib/utils";
import { FetchTimeoutError, fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  LOCATION_AUTOCOMPLETE_DEFAULT_LIMIT,
  LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH,
  sanitizeAutocompleteQuery,
  type LocationAutocompleteErrorCode,
  type LocationAutocompleteErrorResponse,
  type LocationAutocompleteSuccessResponse,
} from "@/lib/geocoding/autocomplete";

const AUTOCOMPLETE_TIMEOUT_MS = 9000;

interface LocationSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  place_type: string[];
  bbox?: [number, number, number, number];
}

export interface LocationSearchFallbackItem {
  id: string;
  primaryText: string;
  secondaryText?: string;
  onSelect: () => void;
}

interface LocationSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect?: (location: {
    name: string;
    lat: number;
    lng: number;
    bbox?: [number, number, number, number];
  }) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  autoFocus?: boolean;
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  fallbackItems?: LocationSearchFallbackItem[];
  fallbackTitle?: string;
}

class AutocompleteUnavailableError extends Error {
  constructor(public readonly code: LocationAutocompleteErrorCode) {
    super(code);
    this.name = "AutocompleteUnavailableError";
  }
}

interface PhotonFeatureProperties {
  osm_id?: number;
  osm_type?: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  district?: string;
  extent?: [number, number, number, number];
  type?: string;
}

type PhotonLikeResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: PhotonFeatureProperties;
  }>;
};

function buildPlaceName(props?: PhotonFeatureProperties) {
  if (!props) return "Unknown location";

  const parts: string[] = [];
  if (props.name) parts.push(props.name);
  if (props.city && props.city !== props.name) {
    parts.push(props.city);
  } else if (props.district && props.district !== props.name) {
    parts.push(props.district);
  }
  if (props.state) parts.push(props.state);
  if (props.country) parts.push(props.country);

  return parts.join(", ") || "Unknown location";
}

function inferPlaceType(type?: string): string[] {
  if (!type) return ["place"];

  switch (type) {
    case "city":
    case "town":
    case "village":
      return ["place"];
    case "district":
    case "suburb":
    case "neighbourhood":
      return ["neighborhood"];
    case "street":
    case "house":
      return ["address"];
    case "state":
    case "county":
      return ["region"];
    case "country":
      return ["country"];
    case "locality":
      return ["locality"];
    default:
      return ["place"];
  }
}

function normalizeLegacyPhotonResponse(
  data: PhotonLikeResponse
): LocationSuggestion[] {
  return (data.features || []).map((feature) => {
    const props = feature.properties ?? {};

    return {
      id: `${props.osm_type || "N"}:${props.osm_id || 0}`,
      place_name: buildPlaceName(props),
      center: feature.geometry?.coordinates ?? [0, 0],
      place_type: inferPlaceType(props.type),
      bbox: props.extent,
    };
  });
}

function normalizeAutocompleteResults(
  payload: LocationAutocompleteSuccessResponse | PhotonLikeResponse
): LocationSuggestion[] {
  if (Array.isArray((payload as LocationAutocompleteSuccessResponse).results)) {
    return (payload as LocationAutocompleteSuccessResponse)
      .results as LocationSuggestion[];
  }

  return normalizeLegacyPhotonResponse(payload as PhotonLikeResponse);
}

async function fetchAutocompleteSuggestions(
  query: string,
  signal: AbortSignal
): Promise<LocationSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(LOCATION_AUTOCOMPLETE_DEFAULT_LIMIT),
  });
  const url = `/api/geocoding/autocomplete?${params.toString()}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      signal,
      timeout: AUTOCOMPLETE_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      throw new AutocompleteUnavailableError("TIMEOUT");
    }
    throw error;
  }

  if (!response.ok) {
    const payload =
      (await response
        .json()
        .catch(() => null)) as LocationAutocompleteErrorResponse | null;

    if (payload?.code === "INVALID_QUERY") {
      return [];
    }

    if (payload?.code === "TIMEOUT" || payload?.code === "UNAVAILABLE") {
      throw new AutocompleteUnavailableError(payload.code);
    }

    throw new AutocompleteUnavailableError("UNAVAILABLE");
  }

  const data =
    (await response.json()) as
      | LocationAutocompleteSuccessResponse
      | PhotonLikeResponse;

  return normalizeAutocompleteResults(data);
}

export default function LocationSearchInput({
  value,
  onChange,
  onLocationSelect,
  onFocus,
  onBlur,
  placeholder = "City, neighborhood...",
  className = "",
  inputClassName = "",
  id,
  autoFocus = false,
  inputRef: forwardedInputRef,
  fallbackItems = [],
  fallbackTitle = "Recent locations",
}: LocationSearchInputProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [noResults, setNoResults] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const showSuggestionsRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const isComposingRef = useRef(false);
  const justSelectedRef = useRef(false);
  const lastSelectedValueRef = useRef<string | null>(null);

  const listboxId = useId();
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [debouncedValue] = useDebounce(value, 300);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    showSuggestionsRef.current = showSuggestions;
  }, [showSuggestions]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const updateDropdownPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: Math.max(rect.width, 300),
    });
  }, []);

  const sanitizedValue = sanitizeAutocompleteQuery(value);
  const showTypeMoreHint =
    sanitizedValue.length > 0 &&
    sanitizedValue.length < LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH &&
    !isComposingRef.current;

  const visibleFallbackItems = useMemo(() => {
    if (fallbackItems.length === 0) {
      return [];
    }

    const normalizedQuery = sanitizedValue.toLowerCase();
    if (!normalizedQuery) {
      return fallbackItems;
    }

    const matches = fallbackItems.filter((item) => {
      const haystack = `${item.primaryText} ${item.secondaryText || ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    return matches.length > 0 ? matches : fallbackItems;
  }, [fallbackItems, sanitizedValue]);

  const showFallbackOptions = serviceUnavailable && visibleFallbackItems.length > 0;
  const availableOptionCount = showFallbackOptions
    ? visibleFallbackItems.length
    : suggestions.length;

  const clearTransientState = useCallback(() => {
    setNoResults(false);
    setServiceUnavailable(false);
  }, []);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      const sanitized = sanitizeAutocompleteQuery(query);

      clearTransientState();

      if (
        !sanitized ||
        sanitized.length < LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH
      ) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      if (pendingQueryRef.current === sanitized) {
        return;
      }

      const requestId = ++requestIdRef.current;
      pendingQueryRef.current = sanitized;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);

      try {
        const results = await fetchAutocompleteSuggestions(
          sanitized,
          controller.signal
        );
        const shouldRevealSuggestions =
          showSuggestionsRef.current || document.activeElement === inputRef.current;

        if (requestId !== requestIdRef.current) return;

        setSuggestions(results);
        setSelectedIndex(-1);
        if (shouldRevealSuggestions) {
          setShowSuggestions(true);
        }

        if (sanitized.length >= 3 && results.length === 0) {
          setNoResults(true);
        }
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          return;
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (
          error instanceof AutocompleteUnavailableError ||
          error instanceof TypeError ||
          error instanceof FetchTimeoutError
        ) {
          const shouldRevealSuggestions =
            showSuggestionsRef.current ||
            document.activeElement === inputRef.current;
          setSuggestions([]);
          setServiceUnavailable(true);
          if (shouldRevealSuggestions) {
            setShowSuggestions(true);
          }
          setSelectedIndex(-1);
          return;
        }

        const shouldRevealSuggestions =
          showSuggestionsRef.current || document.activeElement === inputRef.current;
        setSuggestions([]);
        setServiceUnavailable(true);
        if (shouldRevealSuggestions) {
          setShowSuggestions(true);
        }
        setSelectedIndex(-1);
      } finally {
        if (pendingQueryRef.current === sanitized) {
          pendingQueryRef.current = null;
        }
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [clearTransientState]
  );

  useEffect(() => {
    if (
      !isComposingRef.current &&
      lastSelectedValueRef.current !== debouncedValue
    ) {
      void fetchSuggestions(debouncedValue);
    }
  }, [debouncedValue, fetchSuggestions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (suggestionsRef.current?.contains(target)) {
        return;
      }

      if (inputRef.current?.contains(target)) {
        return;
      }

      setShowSuggestions(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (event: React.CompositionEvent<HTMLInputElement>) => {
      isComposingRef.current = false;
      void fetchSuggestions(event.currentTarget.value);
    },
    [fetchSuggestions]
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: LocationSuggestion) => {
      justSelectedRef.current = true;
      lastSelectedValueRef.current = suggestion.place_name;
      const [lng, lat] = suggestion.center;
      onChange(suggestion.place_name);
      setShowSuggestions(false);
      setSuggestions([]);
      setSelectedIndex(-1);
      clearTransientState();

      requestAnimationFrame(() => {
        justSelectedRef.current = false;
      });

      onLocationSelect?.({
        name: suggestion.place_name,
        lat,
        lng,
        bbox: suggestion.bbox,
      });
    },
    [clearTransientState, onChange, onLocationSelect]
  );

  const handleSelectFallback = useCallback(
    (item: LocationSearchFallbackItem) => {
      item.onSelect();
      setShowSuggestions(false);
      setSelectedIndex(-1);
      clearTransientState();
    },
    [clearTransientState]
  );

  const handleRetry = useCallback(() => {
    if (!sanitizedValue) {
      return;
    }

    setShowSuggestions(true);
    setSelectedIndex(-1);
    void fetchSuggestions(sanitizedValue);
  }, [fetchSuggestions, sanitizedValue]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          if (!showSuggestions && availableOptionCount > 0) {
            setShowSuggestions(true);
            setSelectedIndex(0);
          } else if (showSuggestions && availableOptionCount > 0) {
            setSelectedIndex((prev) =>
              prev < availableOptionCount - 1 ? prev + 1 : prev
            );
          }
          break;

        case "ArrowUp":
          event.preventDefault();
          if (showSuggestions && availableOptionCount > 0) {
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          }
          break;

        case "Enter":
          if (
            showSuggestions &&
            selectedIndex >= 0 &&
            selectedIndex < availableOptionCount
          ) {
            event.preventDefault();
            if (showFallbackOptions) {
              handleSelectFallback(visibleFallbackItems[selectedIndex]);
            } else {
              handleSelectSuggestion(suggestions[selectedIndex]);
            }
          }
          break;

        case "Tab":
          if (
            showSuggestions &&
            selectedIndex >= 0 &&
            selectedIndex < availableOptionCount
          ) {
            if (showFallbackOptions) {
              handleSelectFallback(visibleFallbackItems[selectedIndex]);
            } else {
              handleSelectSuggestion(suggestions[selectedIndex]);
            }
          }
          setShowSuggestions(false);
          setSelectedIndex(-1);
          break;

        case "Escape":
          event.preventDefault();
          setShowSuggestions(false);
          setSelectedIndex(-1);
          break;
      }
    },
    [
      availableOptionCount,
      handleSelectFallback,
      handleSelectSuggestion,
      showFallbackOptions,
      showSuggestions,
      selectedIndex,
      suggestions,
      visibleFallbackItems,
    ]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      clearTransientState();
      onChange(newValue);
      lastSelectedValueRef.current = null;
      if (!justSelectedRef.current) {
        setShowSuggestions(true);
      }
    },
    [clearTransientState, onChange]
  );

  const handleClear = useCallback(() => {
    onChange("");
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    clearTransientState();
    lastSelectedValueRef.current = null;
    inputRef.current?.focus();
  }, [clearTransientState, onChange]);

  const handleInputFocus = useCallback(() => {
    if (
      suggestions.length > 0 ||
      serviceUnavailable ||
      value.length >= LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH
    ) {
      setShowSuggestions(true);
    }
    onFocus?.();
  }, [onFocus, serviceUnavailable, suggestions.length, value.length]);

  const handleInputClick = useCallback(() => {
    if (
      (suggestions.length > 0 ||
        serviceUnavailable ||
        value.length >= LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH) &&
      !showSuggestions
    ) {
      setShowSuggestions(true);
    }
  }, [serviceUnavailable, showSuggestions, suggestions.length, value.length]);

  const handleInputBlur = useCallback(() => {
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
      }
    }, 150);
    onBlur?.();
  }, [onBlur]);

  const getPlaceTypeIcon = (placeTypes: string[]) => {
    if (placeTypes.includes("neighborhood")) return "text-orange-500";
    if (placeTypes.includes("locality")) return "text-blue-500";
    if (placeTypes.includes("place")) return "text-green-500";
    if (placeTypes.includes("region")) return "text-purple-500";
    return "text-on-surface-variant";
  };

  const isPopupOpen =
    showSuggestions &&
    (suggestions.length > 0 ||
      serviceUnavailable ||
      (noResults && !isLoading) ||
      showTypeMoreHint);

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
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative h-full">
        <input
          ref={(node) => {
            inputRef.current = node;
            if (forwardedInputRef) {
              forwardedInputRef.current = node;
            }
          }}
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
          className={cn(
            "h-full w-full min-w-0 bg-transparent border-none p-0 pr-8 text-base text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-0 md:text-sm truncate",
            inputClassName
          )}
          autoFocus={autoFocus}
          autoComplete="off"
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

        <div className="absolute inset-y-0 right-0 flex items-center">
          {isLoading ? (
            <Loader2
              className="h-4 w-4 animate-spin text-on-surface-variant"
              aria-hidden="true"
            />
          ) : value ? (
            <button
              type="button"
              onClick={handleClear}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-container-high"
              aria-label="Clear search"
            >
              <X className="h-3 w-3 text-on-surface-variant" />
            </button>
          ) : null}
        </div>
      </div>

      {isMounted &&
        dropdownPos &&
        isPopupOpen &&
        createPortal(
          <>
            {showSuggestions && showTypeMoreHint && !isLoading && (
              <div
                ref={suggestionsRef}
                role="status"
                aria-live="polite"
                data-location-search-popup="true"
                className="fixed z-[9999] overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ghost backdrop-blur-xl animate-in fade-in-0 slide-in-from-top-2"
                style={{
                  top: dropdownPos.top,
                  left: dropdownPos.left,
                  width: dropdownPos.width,
                }}
              >
                <div className="px-4 py-3 text-sm text-on-surface-variant">
                  Type at least {LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH} characters to search
                </div>
              </div>
            )}

            {showSuggestions && suggestions.length > 0 && !showTypeMoreHint && (
              <div
                ref={suggestionsRef}
                data-location-search-popup="true"
                className="fixed z-[9999] overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ghost backdrop-blur-xl animate-in fade-in-0 slide-in-from-top-2"
                style={{
                  top: dropdownPos.top,
                  left: dropdownPos.left,
                  width: dropdownPos.width,
                }}
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
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
                          index === selectedIndex
                            ? "bg-surface-container-high"
                            : "hover:bg-surface-container-high/80"
                        )}
                        tabIndex={-1}
                      >
                        <MapPin
                          className={cn(
                            "mt-0.5 h-5 w-5 flex-shrink-0",
                            getPlaceTypeIcon(suggestion.place_type)
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-on-surface">
                            {suggestion.place_name.split(",")[0]}
                          </p>
                          <p className="truncate text-xs text-on-surface-variant">
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

            {showSuggestions &&
              serviceUnavailable &&
              !isLoading &&
              !showTypeMoreHint && (
                <div
                  ref={suggestionsRef}
                  role="status"
                  aria-live="polite"
                  data-location-search-popup="true"
                  data-location-search-unavailable="true"
                  className="fixed z-[9999] overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ghost backdrop-blur-xl animate-in fade-in-0 slide-in-from-top-2"
                  style={{
                    top: dropdownPos.top,
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                  }}
                >
                  <div className="mx-2 mt-2 flex items-start gap-3 rounded-[1.25rem] bg-surface-container-high/50 px-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
                      <WifiOff className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-on-surface">
                        Live suggestions unavailable
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {showFallbackOptions
                          ? "Pick a recent location below or retry."
                          : "Try again in a moment."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-outline-variant/20 px-3 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container-high"
                      data-location-search-retry="true"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      Retry
                    </button>
                  </div>

                  {showFallbackOptions && (
                    <>
                      <div className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
                        {fallbackTitle}
                      </div>
                      <ul
                        className="p-2"
                        role="listbox"
                        id={`${listboxId}-listbox`}
                        aria-label={fallbackTitle}
                      >
                        {visibleFallbackItems.map((item, index) => (
                          <li
                            key={item.id}
                            role="option"
                            id={`${listboxId}-option-${index}`}
                            aria-selected={index === selectedIndex}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectFallback(item)}
                              className={cn(
                                "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
                                index === selectedIndex
                                  ? "bg-surface-container-high"
                                  : "hover:bg-surface-container-high/80"
                              )}
                              tabIndex={-1}
                            >
                              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
                                <History className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-on-surface">
                                  {item.primaryText}
                                </p>
                                {item.secondaryText ? (
                                  <p className="truncate text-xs text-on-surface-variant">
                                    {item.secondaryText}
                                  </p>
                                ) : null}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

            {showSuggestions &&
              noResults &&
              !serviceUnavailable &&
              !isLoading &&
              suggestions.length === 0 &&
              !showTypeMoreHint && (
                <div
                  ref={suggestionsRef}
                  role="status"
                  aria-live="polite"
                  data-location-search-popup="true"
                  className="fixed z-[9999] overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ghost backdrop-blur-xl animate-in fade-in-0 slide-in-from-top-2"
                  style={{
                    top: dropdownPos.top,
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                  }}
                >
                  <div className="flex items-center gap-3 p-4">
                    <div className="rounded-full bg-surface-container-high p-2">
                      <SearchX className="h-5 w-5 text-on-surface-variant" />
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
