"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Map as MapIcon } from "lucide-react";
import MobileBottomSheet from "./search/MobileBottomSheet";
import FloatingMapButton from "./search/FloatingMapButton";
import { useListingFocus } from "@/contexts/ListingFocusContext";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import { useSearchMapUI } from "@/contexts/SearchMapUIContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

const MOBILE_SNAP_MAP = 0;
const MOBILE_SNAP_PEEK = 1;
const MOBILE_SNAP_LIST = 2;

interface SearchViewToggleProps {
  children: React.ReactNode;
  mapComponent: React.ReactNode;
  /** Whether the map should be visible */
  shouldShowMap: boolean;
  /** Result count text for mobile bottom sheet header */
  resultHeaderText?: string;
}

function DesktopMapVisibilityButton({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-lowest/95 px-4 text-sm font-medium text-on-surface shadow-sm backdrop-blur-md transition-all hover:bg-surface-container-lowest hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
    >
      <MapIcon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export default function SearchViewToggle({
  children,
  mapComponent,
  shouldShowMap,
  resultHeaderText,
}: SearchViewToggleProps) {
  const mobileListRef = useRef<HTMLDivElement>(null);
  const desktopListScrollRef = useRef<HTMLDivElement>(null);
  const desktopListContentRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [hasMounted, setHasMounted] = useState(false);
  const [mobileSnap, setMobileSnap] = useState(MOBILE_SNAP_PEEK);
  const [showDesktopTopFade, setShowDesktopTopFade] = useState(false);
  const [showDesktopBottomFade, setShowDesktopBottomFade] = useState(false);
  const { activeId } = useListingFocus();
  const { toggleMap, hideMap } = useSearchMapUI();
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
  // During SSR (isDesktop === undefined), default to desktop container
  // since `hidden md:flex` handles CSS visibility correctly.
  const renderMapInMobile = isDesktop === false;
  const renderMapInDesktop = isDesktop !== false && shouldShowMap;

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
    isDesktop,
    searchParamsKey,
    shouldShowMap,
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
        className="hidden md:flex flex-1 overflow-hidden"
      >
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

            {isDesktop === true && !shouldShowMap ? (
              <div className="pointer-events-none absolute right-4 top-4 z-20">
                <div className="pointer-events-auto">
                  <DesktopMapVisibilityButton
                    label="Show map"
                    onClick={toggleMap}
                    testId="desktop-show-map-button"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right Panel: Map View (45%) */}
        {renderMapInDesktop && (
          <div className="relative w-[40%] lg:w-[45%] h-full min-h-0 flex-shrink-0 overflow-hidden border-l border-outline-variant/10 bg-surface-container-highest/45">
            <div className="absolute left-4 top-4 z-[55]" data-map-avoid>
              <DesktopMapVisibilityButton
                label="Hide map"
                onClick={hideMap}
                testId="desktop-hide-map-button"
              />
            </div>
            {mapComponent}
          </div>
        )}
      </div>
    </>
  );
}
