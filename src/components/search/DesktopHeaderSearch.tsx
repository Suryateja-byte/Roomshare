"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import LocationSearchInput from "@/components/LocationSearchInput";
import { Button } from "@/components/ui/button";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { getPriceParam } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import {
  buildSearchIntentParams,
  readSearchIntentState,
  type SearchLocationSelection,
} from "@/lib/search/search-intent";
import {
  applySearchQueryChange,
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";
import {
  MAP_FLY_TO_EVENT,
  type MapFlyToEventDetail,
} from "@/components/SearchForm";

export interface DesktopHeaderSearchHandle {
  openAndFocus: (field?: "where" | "vibe") => void;
}

interface DesktopHeaderSearchProps {
  collapsed: boolean;
}

const LOCATION_INPUT_ID = "desktop-header-search-location";
const VIBE_INPUT_ID = "desktop-header-search-vibe";
const MIN_BUDGET_INPUT_ID = "search-budget-min";
const MAX_BUDGET_INPUT_ID = "search-budget-max";

function validateMoveInDate(value: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "";

  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return "";

  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 2);
  if (date > maxDate) return "";

  return trimmed;
}

function focusInput(field: "where" | "vibe") {
  const element = document.getElementById(
    field === "where" ? LOCATION_INPUT_ID : VIBE_INPUT_ID
  );
  if (element instanceof HTMLElement) {
    element.focus();
  }
}

export const DesktopHeaderSearch = forwardRef<
  DesktopHeaderSearchHandle,
  DesktopHeaderSearchProps
>(function DesktopHeaderSearch({ collapsed }, ref) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const transitionContext = useSearchTransitionSafe();
  const { recentSearches } = useRecentSearches();
  const containerRef = useRef<HTMLDivElement>(null);
  const minPriceInputRef = useRef<HTMLInputElement | null>(null);
  const maxPriceInputRef = useRef<HTMLInputElement | null>(null);
  const searchParamsString = searchParams.toString();
  const intentState = useMemo(
    () => readSearchIntentState(new URLSearchParams(searchParamsString)),
    [searchParamsString]
  );

  const [isEditingCollapsedState, setIsEditingCollapsedState] = useState(false);
  const [location, setLocation] = useState(intentState.locationInput);
  const [vibe, setVibe] = useState(intentState.vibeInput);
  const [selectedLocation, setSelectedLocation] =
    useState<SearchLocationSelection | null>(intentState.selectedLocation);
  const [minPrice, setMinPrice] = useState(() => {
    const parsed = getPriceParam(
      new URLSearchParams(searchParamsString),
      "min"
    );
    return parsed !== undefined ? String(parsed) : "";
  });
  const [maxPrice, setMaxPrice] = useState(() => {
    const parsed = getPriceParam(
      new URLSearchParams(searchParamsString),
      "max"
    );
    return parsed !== undefined ? String(parsed) : "";
  });

  const handleMinPriceValueChange = useCallback((value: string) => {
    flushSync(() => {
      setMinPrice(value);
    });
  }, []);

  const handleMaxPriceValueChange = useCallback((value: string) => {
    flushSync(() => {
      setMaxPrice(value);
    });
  }, []);

  const locationFallbackItems = useMemo(
    () =>
      recentSearches
        .filter((search) => search.coords)
        .map((search) => ({
          id: search.id,
          primaryText: search.location,
          secondaryText: "Recent search",
          onSelect: () => {
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

  const isInlineEditorVisible = !collapsed || isEditingCollapsedState;

  const syncFromSearchParams = useCallback(() => {
    const nextState = readSearchIntentState(
      new URLSearchParams(searchParamsString)
    );
    setLocation(nextState.locationInput);
    setVibe(nextState.vibeInput);
    setSelectedLocation(nextState.selectedLocation);
    setMinPrice(
      getPriceParam(new URLSearchParams(searchParamsString), "min") !==
        undefined
        ? String(getPriceParam(new URLSearchParams(searchParamsString), "min"))
        : ""
    );
    setMaxPrice(
      getPriceParam(new URLSearchParams(searchParamsString), "max") !==
        undefined
        ? String(getPriceParam(new URLSearchParams(searchParamsString), "max"))
        : ""
    );
  }, [searchParamsString]);

  useEffect(() => {
    syncFromSearchParams();
  }, [syncFromSearchParams]);

  useEffect(() => {
    const rawMoveInDate = searchParams.get("moveInDate");
    const validated = validateMoveInDate(rawMoveInDate);

    if (rawMoveInDate && !validated) {
      const params = new URLSearchParams(searchParamsString);
      params.delete("moveInDate");
      const qs = params.toString();
      router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, {
        scroll: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!collapsed) {
      setIsEditingCollapsedState(false);
    }
  }, [collapsed]);

  const collapseEditor = useCallback(() => {
    if (!collapsed) return;
    syncFromSearchParams();
    setIsEditingCollapsedState(false);
  }, [collapsed, syncFromSearchParams]);

  useEffect(() => {
    if (!collapsed || !isEditingCollapsedState) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-location-search-popup='true']")) {
        return;
      }
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        collapseEditor();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        collapseEditor();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [collapseEditor, collapsed, isEditingCollapsedState]);

  const openAndFocus = useCallback((field: "where" | "vibe" = "where") => {
    setIsEditingCollapsedState(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusInput(field));
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      openAndFocus,
    }),
    [openAndFocus]
  );

  const handleSummaryClick = useCallback(() => {
    openAndFocus("where");
  }, [openAndFocus]);

  const handleLocationChange = useCallback((value: string) => {
    setLocation(value);
    setSelectedLocation(null);
  }, []);

  const handleLocationSelect = useCallback(
    (nextLocation: {
      name: string;
      lat: number;
      lng: number;
      bbox?: [number, number, number, number];
    }) => {
      setLocation(nextLocation.name);
      setSelectedLocation({
        lat: nextLocation.lat,
        lng: nextLocation.lng,
        bounds: nextLocation.bbox,
      });
    },
    []
  );

  const navigateToSearch = useCallback(
    (searchUrl: string) => {
      if (transitionContext) {
        transitionContext.navigateWithTransition(searchUrl);
      } else {
        router.push(searchUrl);
      }
    },
    [router, transitionContext]
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();

      if (location.trim().length > 2 && !selectedLocation) {
        toast.error("Select a location from the dropdown suggestions.");
        focusInput("where");
        return;
      }

      const searchUrlParams = buildSearchIntentParams(
        new URLSearchParams(searchParamsString),
        {
          location,
          vibe,
          selectedLocation,
        }
      );

      const liveMinPrice = minPriceInputRef.current?.value ?? minPrice;
      const liveMaxPrice = maxPriceInputRef.current?.value ?? maxPrice;

      let finalMinPrice = liveMinPrice ? parseFloat(liveMinPrice) : null;
      let finalMaxPrice = liveMaxPrice ? parseFloat(liveMaxPrice) : null;

      if (finalMinPrice !== null && !Number.isFinite(finalMinPrice)) {
        finalMinPrice = null;
      }
      if (finalMaxPrice !== null && !Number.isFinite(finalMaxPrice)) {
        finalMaxPrice = null;
      }
      if (finalMinPrice !== null && finalMinPrice < 0) {
        finalMinPrice = 0;
      }
      if (finalMaxPrice !== null && finalMaxPrice < 0) {
        finalMaxPrice = 0;
      }
      if (
        finalMinPrice !== null &&
        finalMaxPrice !== null &&
        finalMinPrice > finalMaxPrice
      ) {
        [finalMinPrice, finalMaxPrice] = [finalMaxPrice, finalMinPrice];
      }
      const searchUrl = buildCanonicalSearchUrl(
        applySearchQueryChange(
          normalizeSearchQuery(searchUrlParams),
          "filter",
          {
            minPrice: finalMinPrice ?? undefined,
            maxPrice: finalMaxPrice ?? undefined,
          }
        )
      );

      if (selectedLocation) {
        window.dispatchEvent(
          new CustomEvent<MapFlyToEventDetail>(MAP_FLY_TO_EVENT, {
            detail: {
              lat: selectedLocation.lat,
              lng: selectedLocation.lng,
              bbox: selectedLocation.bounds,
              zoom: 13,
            },
          })
        );
      }

      if (collapsed) {
        setIsEditingCollapsedState(false);
      }

      navigateToSearch(searchUrl);
    },
    [
      collapsed,
      location,
      maxPrice,
      minPrice,
      navigateToSearch,
      searchParamsString,
      selectedLocation,
      vibe,
    ]
  );

  if (!isInlineEditorVisible) {
    return (
      <button
        type="button"
        onClick={handleSummaryClick}
        data-testid="desktop-header-search-summary"
        className="mx-auto flex h-[56px] w-full max-w-lg items-center rounded-full border border-outline-variant/20 bg-surface-container-lowest p-2 shadow-sm transition-all duration-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
      >
        <div className="flex flex-1 items-center divide-x divide-outline-variant/20 px-4 text-left">
          <div className="min-w-0 flex-1 pr-4">
            <p className="mb-0.5 text-xs font-bold uppercase tracking-wider text-on-surface">
              Where
            </p>
            <p className="truncate text-sm text-on-surface-variant">
              {intentState.locationSummary}
            </p>
          </div>
          <div className="min-w-0 flex-1 pl-4">
            <p className="mb-0.5 text-xs font-bold uppercase tracking-wider text-on-surface">
              Vibe
            </p>
            <p className="truncate text-sm text-on-surface-variant">
              {intentState.vibeSummary}
            </p>
          </div>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-surface-canvas">
          <Search className="h-4 w-4 text-surface-canvas" />
        </div>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-3xl">
      <form
        onSubmit={handleSubmit}
        data-testid="desktop-header-search-form"
        className={cn(
          "flex w-full items-center border border-outline-variant/20 bg-surface-container-lowest shadow-sm transition-all duration-300 hover:shadow-md focus-within:shadow-md",
          collapsed ? "rounded-full p-2" : "rounded-[2rem] p-3"
        )}
        role="search"
        aria-label="Search listings"
      >
        <div className="flex flex-1 items-center divide-x divide-outline-variant/20 px-4">
          <div className="min-w-0 flex-1 pr-4">
            <label
              htmlFor={LOCATION_INPUT_ID}
              className="mb-0.5 block text-xs font-bold uppercase tracking-wider text-on-surface"
            >
              Where
            </label>
            <LocationSearchInput
              id={LOCATION_INPUT_ID}
              value={location}
              onChange={handleLocationChange}
              onLocationSelect={handleLocationSelect}
              fallbackItems={locationFallbackItems}
              placeholder={
                selectedLocation && location.length === 0
                  ? "Selected area"
                  : "Search destinations"
              }
              className="w-full"
              inputClassName="text-sm text-on-surface placeholder:text-on-surface-variant"
            />
          </div>

          <div className="min-w-0 flex-1 pl-4">
            <label
              htmlFor={VIBE_INPUT_ID}
              className="mb-0.5 block text-xs font-bold uppercase tracking-wider text-on-surface"
            >
              Vibe
            </label>
            <input
              id={VIBE_INPUT_ID}
              type="text"
              value={vibe}
              onChange={(event) => setVibe(event.target.value)}
              placeholder="Any vibe"
              className="w-full bg-transparent border-none p-0 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-0"
              autoComplete="off"
            />
          </div>

          <div className="min-w-0 w-[220px] pl-4 pr-4">
            <label
              htmlFor={MIN_BUDGET_INPUT_ID}
              className="mb-0.5 block text-xs font-bold uppercase tracking-wider text-on-surface"
            >
              Budget
            </label>
            <div className="flex items-center gap-2 text-sm">
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-surface-container-high px-3 py-2">
                <span className="text-on-surface-variant">$</span>
                <input
                  ref={minPriceInputRef}
                  id={MIN_BUDGET_INPUT_ID}
                  aria-label="Minimum budget"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="50"
                  value={minPrice}
                  onChange={(event) =>
                    handleMinPriceValueChange(event.currentTarget.value)
                  }
                  onInput={(event) =>
                    handleMinPriceValueChange(event.currentTarget.value)
                  }
                  onBlur={(event) =>
                    handleMinPriceValueChange(event.currentTarget.value)
                  }
                  placeholder="Min"
                  className="w-full bg-transparent border-none p-0 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
              <span className="text-on-surface-variant">-</span>
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-surface-container-high px-3 py-2">
                <span className="text-on-surface-variant">$</span>
                <input
                  ref={maxPriceInputRef}
                  id={MAX_BUDGET_INPUT_ID}
                  aria-label="Maximum budget"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="50"
                  value={maxPrice}
                  onChange={(event) =>
                    handleMaxPriceValueChange(event.currentTarget.value)
                  }
                  onInput={(event) =>
                    handleMaxPriceValueChange(event.currentTarget.value)
                  }
                  onBlur={(event) =>
                    handleMaxPriceValueChange(event.currentTarget.value)
                  }
                  placeholder="Max"
                  className="w-full bg-transparent border-none p-0 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          size="icon"
          className={cn(
            "shrink-0 rounded-full bg-primary text-surface-canvas shadow-ambient shadow-primary/20",
            collapsed ? "h-10 w-10" : "h-12 w-12"
          )}
          aria-label="Search"
        >
          <Search className={cn(collapsed ? "h-4 w-4" : "h-5 w-5")} />
        </Button>

      </form>
    </div>
  );
});

export default DesktopHeaderSearch;
