"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Map } from "lucide-react";
import MobileBottomSheet from "./search/MobileBottomSheet";
import FloatingMapButton from "./search/FloatingMapButton";
import { useListingFocus } from "@/contexts/ListingFocusContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

interface SearchViewToggleProps {
  children: React.ReactNode;
  mapComponent: React.ReactNode;
  /** Whether the map should be visible */
  shouldShowMap: boolean;
  /** Toggle map visibility callback */
  onToggle: () => void;
  /** Whether the preference is still loading (hydrating from localStorage) */
  isLoading: boolean;
  /** Result count text for mobile bottom sheet header */
  resultHeaderText?: string;
}

export default function SearchViewToggle({
  children,
  mapComponent,
  shouldShowMap,
  onToggle,
  isLoading,
  resultHeaderText,
}: SearchViewToggleProps) {
  const mobileListRef = useRef<HTMLDivElement>(null);
  const desktopListScrollRef = useRef<HTMLDivElement>(null);
  const desktopListContentRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [hasMounted, setHasMounted] = useState(false);
  const [mobileSnap, setMobileSnap] = useState(1); // 0=collapsed, 1=expanded
  const [showDesktopTopFade, setShowDesktopTopFade] = useState(false);
  const [showDesktopBottomFade, setShowDesktopBottomFade] = useState(false);
  const { activeId } = useListingFocus();
  const searchParams = useSearchParams();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Compute a key from filter/sort/query params only — excludes geographic bounds.
  // Same pattern as SearchResultsLoadingWrapper.tsx:33-48.
  const filterParamsKey = useMemo(() => {
    const filterOnly = new URLSearchParams(searchParams.toString());
    for (const k of [
      "minLat",
      "maxLat",
      "minLng",
      "maxLng",
      "lat",
      "lng",
      "zoom",
    ]) {
      filterOnly.delete(k);
    }
    filterOnly.sort();
    return filterOnly.toString();
  }, [searchParams]);

  // Reset bottom sheet to expanded when search results change (filter/sort/query).
  // Prevents the sheet staying collapsed after the user navigates to a new search.
  // Skips initial mount (mobileSnap is already 1) and bounds-only changes (map pans).
  const isInitialFilterKey = useRef(true);
  useEffect(() => {
    if (isInitialFilterKey.current) {
      isInitialFilterKey.current = false;
      return;
    }
    setMobileSnap(1);
  }, [filterParamsKey]);

  // When a map pin is tapped (activeId changes) on mobile, collapse the sheet
  // so the map and preview card are visible. When map background is tapped,
  // keep the sheet collapsed.
  useEffect(() => {
    if (isDesktop === false && hasMounted) {
      setMobileSnap(0);
    }
  }, [activeId, isDesktop, hasMounted]);

  const handleFloatingToggle = useCallback(() => {
    // If sheet is showing list (expanded), collapse to show map
    // If collapsed, expand to show list
    setMobileSnap((prev) => (prev > 0 ? 0 : 1));
  }, []);

  // Prevent dual Mapbox mount: render map in exactly one container.
  // During SSR (isDesktop === undefined), default to desktop container
  // since `hidden md:flex` handles CSS visibility correctly.
  const renderMapInMobile = isDesktop === false;
  const renderMapInDesktop = isDesktop !== false && shouldShowMap;

  // Render children in BOTH containers before mount so SSR HTML matches
  // client hydration regardless of viewport (CSS md:hidden / hidden md:flex
  // hides the inactive one). After mount, render in exactly one container.
  const showChildrenInMobile = !hasMounted || isDesktop === false;
  const showChildrenInDesktop = !hasMounted || isDesktop !== false;
  const desktopScrollInsetClass = shouldShowMap
    ? "right-3 lg:right-4"
    : "right-2 lg:right-3";

  const updateDesktopOverflowState = useCallback(() => {
    const scrollContainer = desktopListScrollRef.current;
    if (!scrollContainer || isDesktop !== true) {
      setShowDesktopTopFade(false);
      setShowDesktopBottomFade(false);
      return;
    }

    const { scrollTop, clientHeight, scrollHeight } = scrollContainer;
    const hasOverflow = scrollHeight - clientHeight > 12;

    setShowDesktopTopFade(hasOverflow && scrollTop > 8);
    setShowDesktopBottomFade(
      hasOverflow && scrollTop + clientHeight < scrollHeight - 8
    );
  }, [isDesktop]);

  useEffect(() => {
    if (isDesktop !== true) {
      setShowDesktopTopFade(false);
      setShowDesktopBottomFade(false);
      return;
    }

    const scrollContainer = desktopListScrollRef.current;
    const contentContainer = desktopListContentRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      updateDesktopOverflowState();
    };

    handleScroll();
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(handleScroll);
      window.addEventListener("resize", handleScroll);
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(handleScroll);

    resizeObserver?.observe(scrollContainer);
    if (contentContainer) {
      resizeObserver?.observe(contentContainer);
    }

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", handleScroll);
      }
      resizeObserver?.disconnect();
    };
  }, [
    filterParamsKey,
    isDesktop,
    shouldShowMap,
    showChildrenInDesktop,
    updateDesktopOverflowState,
  ]);

  return (
    <>
      {/* Mobile: Map always visible with bottom sheet overlay */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden relative">
        {/* Map fills the background */}
        {renderMapInMobile && (
          <div className="absolute inset-0">{mapComponent}</div>
        )}

        {/* Bottom sheet with list results */}
        <MobileBottomSheet
          headerText={resultHeaderText}
          snapIndex={mobileSnap}
          onSnapChange={setMobileSnap}
        >
          {showChildrenInMobile && (
            <div
              ref={mobileListRef}
              data-testid="mobile-search-results-container"
            >
              {children}
            </div>
          )}
        </MobileBottomSheet>

        {/* Floating toggle pill */}
        <FloatingMapButton
          isListMode={mobileSnap > 0}
          onToggle={handleFloatingToggle}
        />
      </div>

      {/* Desktop Split View */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Left Panel: List View - Adjusts width based on map visibility */}
        <div
          data-testid="search-results-container"
          className={`relative h-full min-h-0 overflow-hidden bg-surface-canvas transition-all duration-300 ${
            shouldShowMap ? "w-[60%] lg:w-[55%]" : "w-full"
          }`}
        >
          <div
            className={cn(
              "relative h-full min-h-0",
              shouldShowMap ? "pr-3 lg:pr-4" : "pr-2 lg:pr-3"
            )}
          >
            <div
              ref={desktopListScrollRef}
              data-testid="desktop-search-results-scroll-area"
              data-search-results-scroll-region="desktop"
              className="desktop-search-results-scroll h-full min-h-0 overflow-y-auto overscroll-contain scroll-smooth"
            >
              <div ref={desktopListContentRef} className="min-h-full">
                {showChildrenInDesktop && children}
              </div>
            </div>

            {showDesktopTopFade && (
              <div
                data-testid="desktop-results-top-fade"
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute left-0 top-0 h-10 bg-gradient-to-b from-surface-canvas via-surface-canvas/95 to-transparent",
                  desktopScrollInsetClass
                )}
              />
            )}

            {showDesktopBottomFade && (
              <div
                data-testid="desktop-results-bottom-fade"
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute bottom-0 left-0 h-12 bg-gradient-to-t from-surface-canvas via-surface-canvas/95 to-transparent",
                  desktopScrollInsetClass
                )}
              />
            )}
          </div>
        </div>

        {/* Right Panel: Map View (45%) */}
        {renderMapInDesktop && (
          <div className="relative w-[40%] lg:w-[45%] h-full min-h-0 flex-shrink-0 overflow-hidden border-l border-outline-variant/20 bg-surface-container-highest">
            {mapComponent}
          </div>
        )}

        {/* Desktop Show Map Button - Only visible when map is hidden */}
        {!shouldShowMap && (
          <button
            onClick={onToggle}
            disabled={isLoading}
            className="fixed top-[100px] right-6 z-[50] h-10 inline-flex items-center gap-2 px-4 bg-surface-container-lowest/90 backdrop-blur-md text-on-surface rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.12)] border border-outline-variant/30 hover:bg-surface-container-lowest hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
            aria-label="Show map"
          >
            <Map className="w-4 h-4" />
            <span className="text-sm font-semibold">Show map</span>
          </button>
        )}
      </div>
    </>
  );
}
