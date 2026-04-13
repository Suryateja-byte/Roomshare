"use client";

/**
 * NearbyPlacesSection Component
 *
 * Main section component that combines NearbyPlacesPanel and NearbyPlacesMap.
 * Rendered inline on listing detail pages after the Amenities section.
 *
 * Design: Premium glass card container with refined minimalist aesthetic.
 * Features: Mobile list/map toggle, taller container, view mode switching.
 */

import { useEffect, useRef, useState } from "react";
import { MapPin, Map as MapIcon, List as ListIcon } from "lucide-react";
import NearbyPlacesPanel from "./NearbyPlacesPanel";
import NearbyPlacesMap from "./NearbyPlacesMap";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { NearbyPlace } from "@/types/nearby";

interface NearbyPlacesSectionProps {
  listingLat: number;
  listingLng: number;
}

export default function NearbyPlacesSection({
  listingLat,
  listingLng,
}: NearbyPlacesSectionProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLDivElement>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [mobileCardHeight, setMobileCardHeight] = useState<number | null>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isResolved = isDesktop !== undefined;
  const isMobileViewport = isDesktop === false;
  const isListPaneInteractive = !isMobileViewport || viewMode === "list";
  const isMapPaneInteractive = !isMobileViewport || viewMode === "map";

  useEffect(() => {
    if (isDesktop !== false) {
      setMobileCardHeight(null);
      return;
    }

    const updateMobileCardHeight = () => {
      const card = cardRef.current;
      if (!card) return;

      const wrapperTop = card.getBoundingClientRect().top;
      const availableHeight = window.innerHeight - wrapperTop - 24;
      const nextHeight = Math.min(Math.max(availableHeight, 360), 560);

      setMobileCardHeight(Math.round(nextHeight));
    };

    updateMobileCardHeight();
    window.addEventListener("resize", updateMobileCardHeight);
    window.addEventListener("orientationchange", updateMobileCardHeight);

    return () => {
      window.removeEventListener("resize", updateMobileCardHeight);
      window.removeEventListener("orientationchange", updateMobileCardHeight);
    };
  }, [isDesktop]);

  return (
    <section
      id="nearby-places"
      className="mt-12 pt-8 border-t border-outline-variant/20"
    >
      {/* Minimal Section Header */}
      <div className="flex items-center justify-between mb-6 px-1 sm:px-0">
        <div>
          <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Nearby Places
          </h2>
          <p className="text-on-surface-variant mt-1">
            Discover convenience at your doorstep
          </p>
        </div>
      </div>

      {/* Main Container - Clean Border */}
      <div
        ref={cardRef}
        className="
          relative w-full
          h-[60vh] sm:h-[550px] lg:h-[600px]
          bg-surface-container-lowest
          rounded-2xl
          border border-outline-variant/20/80
          shadow-ghost
          overflow-hidden
          lg:flex lg:flex-row
        "
        style={mobileCardHeight !== null ? { height: `${mobileCardHeight}px` } : undefined}
      >
        {/* Left Panel: Search & List */}
        <div
          aria-hidden={isResolved && !isListPaneInteractive ? true : undefined}
          {...(isResolved && !isListPaneInteractive ? { inert: true } : {})}
          className={`
            w-full h-full
            absolute inset-0 z-30
            lg:static lg:z-auto lg:w-[400px]
            flex flex-col
            border-b lg:border-b-0 lg:border-r border-outline-variant/20
            bg-surface-container-lowest
            transition-all duration-300 ease-out
            ${
              viewMode === "list"
                ? "translate-y-0 opacity-100 pointer-events-auto"
                : "translate-y-4 opacity-0 pointer-events-none lg:translate-y-0 lg:opacity-100 lg:pointer-events-auto"
            }
          `}
        >
          <NearbyPlacesPanel
            listingLat={listingLat}
            listingLng={listingLng}
            onPlacesChange={setPlaces}
            onPlaceHover={setHoveredPlaceId}
            isPaneInteractive={isListPaneInteractive}
          />
        </div>

        {/* Right Panel: Map */}
        <div
          aria-hidden={isResolved && !isMapPaneInteractive ? true : undefined}
          {...(isResolved && !isMapPaneInteractive ? { inert: true } : {})}
          className={`
            w-full h-full
            absolute inset-0 z-10
            lg:static lg:flex-1
            bg-surface-canvas
            transition-all duration-300 ease-out
            ${
              isMapPaneInteractive
                ? "opacity-100 visible"
                : "opacity-0 invisible pointer-events-none lg:opacity-100 lg:visible lg:pointer-events-auto"
            }
          `}
        >
          <NearbyPlacesMap
            listingLat={listingLat}
            listingLng={listingLng}
            places={places}
            highlightedPlaceId={hoveredPlaceId}
            className="h-full"
            isPaneInteractive={isMapPaneInteractive}
            externalBottomOverlayRef={mobileToggleRef}
          />
        </div>

        {/* Mobile Floating Toggle Button — rendered at container level for correct z-index stacking */}
        <div
          ref={mobileToggleRef}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 lg:hidden"
        >
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "list" ? "map" : "list")}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-on-surface px-5 py-3 text-sm font-semibold text-white shadow-ambient-lg shadow-on-surface/20 transform transition-transform active:scale-95 hover:scale-105"
          >
            <span>{viewMode === "list" ? "Map" : "List"}</span>
            {viewMode === "list" ? (
              <MapIcon className="w-4 h-4" />
            ) : (
              <ListIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
