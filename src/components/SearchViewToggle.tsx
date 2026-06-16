"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Map } from "lucide-react";
import MobileBottomSheet from "./search/MobileBottomSheet";
import FloatingMapButton from "./search/FloatingMapButton";
import { useListingFocus } from "@/contexts/ListingFocusContext";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SEARCH_SPLIT_VIEW_MEDIA_QUERY } from "@/lib/search-layout";
import { cn } from "@/lib/utils";

const MOBILE_SNAP_MAP = 0;
const MOBILE_SNAP_PEEK = 1;
const MOBILE_SNAP_LIST = 2;

interface SearchViewToggleProps {
  children: React.ReactNode;
  mapComponent: React.ReactNode;
  /** Whether the map should be visible */
  shouldShowMap: boolean;
  /** Whether the current viewport can display an inline map pane */
  canShowMap: boolean;
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
  canShowMap,
  onToggle,
  isLoading,
  resultHeaderText,
}: SearchViewToggleProps) {
  const mobileListRef = useRef<HTMLDivElement>(null);
  const desktopListScrollRef = useRef<HTMLDivElement>(null);
  const desktopListContentRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isSplitViewport = useMediaQuery(SEARCH_SPLIT_VIEW_MEDIA_QUERY);
  const [hasMounted, setHasMounted] = useState(false);
  const [mobileSnap, setMobileSnap] = useState(MOBILE_SNAP_PEEK);
  const [showDesktopTopFade, setShowDesktopTopFade] = useState(false);
  const [showDesktopBottomFade, setShowDesktopBottomFade] = useState(false);
  const { activeId } = useListingFocus();
  const {
    searchResultsLabel,
    mobileSheetOverrideLabel,
    mobileMapOverlayActive,
    mobileResultsViewPreference,
    setMobileResultsView,
  } = useMobileSearch();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const mobileHeaderText =
    resultHeaderText ?? mobileSheetOverrideLabel ?? searchResultsLabel;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // When a map pin is tapped (activeId changes to a non-null value) on mobile,
  // collapse the sheet so the map and preview card are visible.
  // Uses a ref to skip the initial mount and only react to actual marker selection.
  const prevActiveIdRef = useRef(activeId);
  useEffect(() => {
    if (
      isDesktop === false &&
      activeId != null &&
      activeId !== prevActiveIdRef.current
    ) {
      setMobileSnap(MOBILE_SNAP_MAP);
    }
    prevActiveIdRef.current = activeId;
  }, [activeId, isDesktop]);

  useEffect(() => {
    if (isDesktop !== false || mobileResultsViewPreference == null) return;

    const preferredSnap =
      mobileResultsViewPreference === "map"
        ? MOBILE_SNAP_MAP
        : mobileResultsViewPreference === "peek"
          ? MOBILE_SNAP_PEEK
          : MOBILE_SNAP_LIST;

    if (mobileSnap !== preferredSnap) {
      setMobileSnap(preferredSnap);
    }
  }, [isDesktop, mobileResultsViewPreference, mobileSnap]);

  useEffect(() => {
    if (isDesktop === false) {
      setMobileResultsView(
        mobileSnap === MOBILE_SNAP_MAP
          ? "map"
          : mobileSnap === MOBILE_SNAP_PEEK
            ? "peek"
            : "list"
      );
      return;
    }

    if (isDesktop === true) {
      setMobileResultsView("list");
    }
  }, [isDesktop, mobileSnap, setMobileResultsView]);

  const handleFloatingToggle = useCallback(() => {
    setMobileSnap((prev) =>
      prev === MOBILE_SNAP_MAP ? MOBILE_SNAP_PEEK : MOBILE_SNAP_MAP
    );
  }, []);

  // Prevent dual Mapbox mount: render map in exactly one container.
  const renderMapInMobile = isDesktop === false;
  const renderMapInDesktop =
    isDesktop === true &&
    isSplitViewport === true &&
    canShowMap &&
    shouldShowMap;

  // Whether the user has explicitly hidden the desktop map (preference = list-only).
  // Default to "map visible" until we KNOW otherwise (isLoading guards the
  // pre-hydration window). This lets the split layout below be reserved purely via
  // CSS (xl:) on the first paint, so the common case never reflows when hydration
  // resolves. Only a hydrated list-only preference collapses the list to full width.
  const desktopMapHidden = !isLoading && canShowMap && !shouldShowMap;

  // Render children in BOTH containers before mount so SSR HTML matches
  // client hydration regardless of viewport (CSS md:hidden / hidden md:flex
  // hides the inactive one). After mount, render in exactly one container.
  // The inactive container gets aria-hidden + inert to prevent duplicate
  // selectors in E2E tests and assistive tech from seeing both copies.
  //
  // IMPORTANT: isDesktop is undefined until useMediaQuery resolves. We must
  // wait for it to be a definitive boolean before applying inert, otherwise
  // there's a race window where hasMounted=true but isDesktop=undefined
  // causes inert to be applied to the mobile container on mobile viewports.
  const isResolved = isDesktop !== undefined;
  const isMobileActive = isDesktop === false;
  const showChildrenInMobile = !hasMounted || isMobileActive;
  const showChildrenInDesktop = !hasMounted || !isMobileActive;
  const desktopScrollInsetClass = desktopMapHidden
    ? "right-2 lg:right-3"
    : "right-2 lg:right-3 xl:right-4";

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
    isDesktop,
    searchParamsKey,
    renderMapInDesktop,
    desktopMapHidden,
    showChildrenInDesktop,
    updateDesktopOverflowState,
  ]);

  return (
    <>
      {/* Mobile: Map always visible with bottom sheet overlay */}
      <div
        aria-hidden={isResolved && !isMobileActive ? true : undefined}
        {...(isResolved && !isMobileActive ? { inert: true } : {})}
        className="md:hidden flex-1 flex flex-col overflow-hidden relative"
      >
        {/* Map fills the background */}
        {renderMapInMobile && (
          <div className="absolute inset-0">{mapComponent}</div>
        )}

        {/* Bottom sheet with list results */}
        <MobileBottomSheet
          headerText={mobileHeaderText}
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
        {!mobileMapOverlayActive ? (
          <FloatingMapButton
            isListMode={mobileSnap !== MOBILE_SNAP_MAP}
            onToggle={handleFloatingToggle}
          />
        ) : null}
      </div>

      {/* Desktop Split View */}
      <div
        aria-hidden={isResolved && isMobileActive ? true : undefined}
        {...(isResolved && isMobileActive ? { inert: true } : {})}
        className="hidden flex-1 overflow-hidden bg-surface-canvas md:flex"
      >
        {/* Left Panel: List View - Adjusts width based on map visibility */}
        <div
          data-testid="search-results-container"
          className={cn(
            "relative h-full min-h-0 overflow-hidden bg-surface-canvas transition-all duration-300",
            // Reserve the split width via CSS at the xl breakpoint so the first paint
            // already matches the hydrated split layout (no JS-driven reflow). Only a
            // hydrated list-only preference forces the list back to full width.
            desktopMapHidden
              ? "w-full"
              : "w-full xl:w-[55%] xl:min-w-[42rem] xl:max-w-[58rem] 2xl:w-[52%] 2xl:max-w-[66rem]"
          )}
        >
          <div
            className={cn(
              "relative h-full min-h-0",
              desktopMapHidden ? "pr-2 lg:pr-3" : "pr-2 lg:pr-3 xl:pr-5"
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

        {/* Right Panel: Map View — the pane (its layout space) is reserved purely
            via CSS at the xl split breakpoint so the split is correct on the first
            paint and never reflows. The expensive map CONTENT still mounts only when
            ready (renderMapInDesktop), filling the already-sized pane; until then the
            styled surface below acts as the placeholder. The pane is removed entirely
            only when the user has hidden the map (desktopMapHidden). */}
        {!desktopMapHidden && (
          <div
            data-testid="desktop-search-map-panel"
            className="relative hidden h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-surface-container-high/35 p-2 pl-0 xl:block lg:p-3 lg:pl-0"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-3 left-0 z-[1] w-5 rounded-l-[1.5rem] bg-gradient-to-r from-surface-canvas via-surface-container-high/45 to-transparent lg:w-6"
            />
            <div className="relative h-full overflow-hidden rounded-[1.25rem] bg-surface-container shadow-[inset_0_0_0_1px_rgba(220,193,185,0.18),0_18px_48px_-34px_rgba(27,28,25,0.42)]">
              {renderMapInDesktop && mapComponent}
            </div>
          </div>
        )}

        {/* Desktop Show Map Button - Only visible when map is hidden */}
        {canShowMap && isSplitViewport === true && !shouldShowMap && (
          <button
            onClick={onToggle}
            disabled={isLoading}
            className="fixed top-[100px] right-6 z-[50] inline-flex h-11 items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-lowest/95 px-4 text-on-surface shadow-[0_12px_32px_-18px_rgba(27,28,25,0.42),0_4px_16px_rgba(27,28,25,0.08)] backdrop-blur-md transition-all duration-200 hover:border-on-surface-variant/35 hover:bg-surface-container-lowest hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
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
