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
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import LocationSearchInput from "@/components/LocationSearchInput";
import { Button } from "@/components/ui/button";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { cn } from "@/lib/utils";
import {
  buildSearchIntentParams,
  readSearchIntentState,
  type SearchLocationSelection,
} from "@/lib/search/search-intent";
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
  }, [searchParamsString]);

  useEffect(() => {
    syncFromSearchParams();
  }, [syncFromSearchParams]);

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
    (queryString: string) => {
      const searchUrl = `/search?${queryString}`;
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

      navigateToSearch(searchUrlParams.toString());
    },
    [
      collapsed,
      location,
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

        {!collapsed && (
          <div className="ml-4 mr-2 hidden items-center gap-1 text-xs font-medium text-on-surface-variant lg:flex">
            <kbd className="rounded-md border border-outline-variant/20 bg-surface-container-highest px-1.5 py-0.5 font-sans shadow-sm">
              ⌘
            </kbd>
            <kbd className="rounded-md border border-outline-variant/20 bg-surface-container-highest px-1.5 py-0.5 font-sans shadow-sm">
              K
            </kbd>
          </div>
        )}
      </form>
    </div>
  );
});

export default DesktopHeaderSearch;
