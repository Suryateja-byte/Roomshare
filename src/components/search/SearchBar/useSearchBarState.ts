"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getPriceParam } from "@/lib/search-params";
import { dispatchMapFlyTo } from "@/lib/search/map-fly-to";
import {
  readSearchIntentState,
  type SearchLocationSelection,
} from "@/lib/search/search-intent";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import type { LocationSearchFallbackItem } from "@/components/LocationSearchInput";

export interface SearchBarExternalBudget {
  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
}

export interface UseSearchBarStateOptions {
  /**
   * Home passes its useBatchedFilters-backed budget so the FilterModal price
   * slider and the bar's Min/Max inputs share one source of truth. When
   * omitted the hook owns budget state and syncs it from the URL.
   */
  externalBudget?: SearchBarExternalBudget;
}

export interface SearchBarState {
  formRef: RefObject<HTMLFormElement | null>;
  searchParamsString: string;

  location: string;
  setLocation: (value: string) => void;
  /** Input onChange handler — sets the typing guard and clears the selection. */
  onLocationChange: (value: string) => void;
  locationInputRef: RefObject<HTMLInputElement | null>;
  locationInputFocused: boolean;
  setLocationInputFocused: (focused: boolean) => void;
  /** Typed >2 chars without a dropdown selection — drives the passive warning. */
  showLocationWarning: boolean;

  what: string;
  setWhat: (value: string) => void;
  semanticSearchEnabled: boolean;

  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
  minPriceInputRef: RefObject<HTMLInputElement | null>;
  maxPriceInputRef: RefObject<HTMLInputElement | null>;

  selectedLocation: SearchLocationSelection | null;
  setSelectedLocation: (selection: SearchLocationSelection | null) => void;

  isUserTypingLocationRef: RefObject<boolean>;
  /**
   * Set right before an auto-submit whose fly-to was already dispatched at
   * selection time; the submit pipeline consumes it to avoid double dispatch.
   */
  skipNextSubmitFlyToRef: RefObject<boolean>;

  /** Dropdown selection: commit coords, fly the map, auto-submit the form. */
  handleLocationSelect: (location: {
    name: string;
    lat: number;
    lng: number;
    bbox?: [number, number, number, number];
  }) => void;
  handleUseMyLocation: () => void;
  geoLoading: boolean;

  recentFallbackItems: LocationSearchFallbackItem[];
  clearRecentSearches: () => void;
  saveRecentSearch: ReturnType<typeof useRecentSearches>["saveRecentSearch"];
}

function priceFromParams(
  searchParamsString: string,
  kind: "min" | "max"
): string {
  const parsed = getPriceParam(new URLSearchParams(searchParamsString), kind);
  return parsed !== undefined ? String(parsed) : "";
}

export function useSearchBarState(
  options: UseSearchBarStateOptions = {}
): SearchBarState {
  const { externalBudget } = options;
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const formRef = useRef<HTMLFormElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const minPriceInputRef = useRef<HTMLInputElement | null>(null);
  const maxPriceInputRef = useRef<HTMLInputElement | null>(null);
  const isUserTypingLocationRef = useRef(false);
  const skipNextSubmitFlyToRef = useRef(false);
  const typingResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const initialIntentState = useMemo(
    () => readSearchIntentState(new URLSearchParams(searchParamsString)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial values only
    []
  );

  const [location, setLocation] = useState(initialIntentState.locationInput);
  const [what, setWhat] = useState(initialIntentState.vibeInput);
  const [selectedLocation, setSelectedLocation] =
    useState<SearchLocationSelection | null>(
      initialIntentState.selectedLocation
    );
  const [locationInputFocused, setLocationInputFocused] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [internalMinPrice, setInternalMinPrice] = useState(() =>
    priceFromParams(searchParamsString, "min")
  );
  const [internalMaxPrice, setInternalMaxPrice] = useState(() =>
    priceFromParams(searchParamsString, "max")
  );

  // The "What" field is gated identically on every surface: env flag, or the
  // field was previously used (a `what` param is in the URL).
  const semanticSearchEnabled =
    process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH === "true" ||
    !!searchParams.get("what");

  // Sync non-filter state with the URL when it changes. The typing guard
  // prevents map-move URL writes from clobbering in-progress location text
  // (typing → warning render → header resize → map moveEnd → URL change).
  useEffect(() => {
    const nextIntentState = readSearchIntentState(
      new URLSearchParams(searchParamsString)
    );
    setSelectedLocation(nextIntentState.selectedLocation);
    if (!isUserTypingLocationRef.current) {
      setLocation(nextIntentState.locationInput);
    }
    setWhat(nextIntentState.vibeInput);
    if (!externalBudget) {
      setInternalMinPrice(priceFromParams(searchParamsString, "min"));
      setInternalMaxPrice(priceFromParams(searchParamsString, "max"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- externalBudget identity is irrelevant; URL is the trigger
  }, [searchParamsString]);

  useEffect(() => {
    return () => {
      if (typingResetTimeoutRef.current) {
        clearTimeout(typingResetTimeoutRef.current);
      }
    };
  }, []);

  const onLocationChange = useCallback((value: string) => {
    isUserTypingLocationRef.current = true;
    setLocation(value);
    setSelectedLocation(null);
  }, []);

  const handleLocationSelect = useCallback(
    (locationData: {
      name: string;
      lat: number;
      lng: number;
      bbox?: [number, number, number, number];
    }) => {
      isUserTypingLocationRef.current = false;
      // flushSync ensures the selection is committed before requestSubmit reads it
      flushSync(() => {
        setLocation(locationData.name);
        setSelectedLocation({
          lat: locationData.lat,
          lng: locationData.lng,
          bounds: locationData.bbox,
        });
      });

      dispatchMapFlyTo({
        lat: locationData.lat,
        lng: locationData.lng,
        bbox: locationData.bbox,
        zoom: 13,
      });

      // Auto-submit on selection (audited UX decision, all surfaces).
      skipNextSubmitFlyToRef.current = true;
      formRef.current?.requestSubmit();
    },
    []
  );

  // Stale closure note: geoLoading is captured at callback creation time, but
  // the `disabled={geoLoading}` prop on the button prevents re-entry while
  // a geolocation request is in flight, so stale geoLoading is safe here.
  const handleUseMyLocation = useCallback(() => {
    if (geoLoading) return;
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        flushSync(() => {
          setLocation("");
          setSelectedLocation({ lat, lng });
        });
        dispatchMapFlyTo({ lat, lng, zoom: 13 });
        setGeoLoading(false);
        skipNextSubmitFlyToRef.current = true;
        formRef.current?.requestSubmit();
      },
      (error) => {
        setGeoLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error(
              "Location permission denied. Enable it in browser settings."
            );
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Unable to determine your location.");
            break;
          case error.TIMEOUT:
            toast.error("Location request timed out. Try again.");
            break;
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geoLoading is read-only within callback; including it would cause re-creation on every state change
  }, []);

  const { recentSearches, saveRecentSearch, clearRecentSearches } =
    useRecentSearches();

  // Recent searches surface inside LocationSearchInput's accessible combobox
  // (shown on empty focus). Selecting one fills location + coords without
  // auto-submitting — the user confirms with Enter/Search (e2e-pinned).
  const recentFallbackItems = useMemo(
    () =>
      recentSearches
        .filter((search) => search.coords)
        .map((search) => ({
          id: search.id,
          primaryText: search.location,
          secondaryText: "Recent search",
          onSelect: () => {
            isUserTypingLocationRef.current = false;
            setLocation(search.location);
            setSelectedLocation({
              lat: search.coords!.lat,
              lng: search.coords!.lng,
              bounds: search.coords!.bounds,
            });
          },
        })),
    [recentSearches]
  );

  const setLocationInputFocusedStable = useCallback(
    (focused: boolean) => {
      setLocationInputFocused(focused);
      if (!focused) {
        // Allow pending URL syncs to settle before re-enabling location sync
        if (typingResetTimeoutRef.current) {
          clearTimeout(typingResetTimeoutRef.current);
        }
        typingResetTimeoutRef.current = setTimeout(() => {
          isUserTypingLocationRef.current = false;
        }, 500);
      }
    },
    []
  );

  const showLocationWarning =
    location.trim().length > 2 && !selectedLocation;

  return {
    formRef,
    searchParamsString,
    location,
    setLocation,
    onLocationChange,
    locationInputRef,
    locationInputFocused,
    setLocationInputFocused: setLocationInputFocusedStable,
    showLocationWarning,
    what,
    setWhat,
    semanticSearchEnabled,
    minPrice: externalBudget ? externalBudget.minPrice : internalMinPrice,
    maxPrice: externalBudget ? externalBudget.maxPrice : internalMaxPrice,
    onMinPriceChange: externalBudget
      ? externalBudget.onMinPriceChange
      : setInternalMinPrice,
    onMaxPriceChange: externalBudget
      ? externalBudget.onMaxPriceChange
      : setInternalMaxPrice,
    minPriceInputRef,
    maxPriceInputRef,
    selectedLocation,
    setSelectedLocation,
    isUserTypingLocationRef,
    skipNextSubmitFlyToRef,
    handleLocationSelect,
    handleUseMyLocation,
    geoLoading,
    recentFallbackItems,
    clearRecentSearches,
    saveRecentSearch,
  };
}
