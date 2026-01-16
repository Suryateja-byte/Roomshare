"use client";

/**
 * StackedListingPopup - Popup for showing multiple listings at the same location
 *
 * When multiple listings share the same coordinates, clicking the stacked marker
 * opens this popup showing all listings at that location in a scrollable list.
 */

import { Popup } from "react-map-gl";
import Link from "next/link";
import Image from "next/image";
import { X, Home, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListingFocus } from "@/contexts/ListingFocusContext";
import type { ListingGroup } from "@/lib/maps/marker-utils";

interface StackedListingPopupProps {
  /** Group of listings at this location */
  group: ListingGroup;
  /** Callback when popup should close */
  onClose: () => void;
  /** Whether dark mode is active */
  isDarkMode: boolean;
}

export function StackedListingPopup({
  group,
  onClose,
  isDarkMode,
}: StackedListingPopupProps) {
  const { setHovered, setActive, requestScrollTo } = useListingFocus();

  // NOTE: ESC key handling is centralized in Map.tsx to coordinate with selection clearing

  return (
    <Popup
      longitude={group.lng}
      latitude={group.lat}
      anchor="top"
      onClose={onClose}
      closeOnClick={false}
      maxWidth="320px"
      className={`z-50 [&_.mapboxgl-popup-content]:rounded-xl [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:!bg-transparent [&_.mapboxgl-popup-content]:!shadow-none [&_.mapboxgl-popup-close-button]:hidden ${
        isDarkMode
          ? "[&_.mapboxgl-popup-tip]:border-t-zinc-900"
          : "[&_.mapboxgl-popup-tip]:border-t-white"
      }`}
    >
      <div
        data-testid="stacked-popup"
        className={`w-[300px] overflow-hidden rounded-xl ${
          isDarkMode
            ? "bg-zinc-900 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]"
            : "bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)]"
        }`}
      >
        {/* Header with count and close button */}
        <div
          className={`px-3 py-2.5 flex items-center justify-between border-b ${
            isDarkMode ? "border-zinc-800" : "border-zinc-100"
          }`}
        >
          <span
            className={`text-sm font-medium ${
              isDarkMode ? "text-zinc-300" : "text-zinc-600"
            }`}
          >
            {group.listings.length} listings at this location
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={`w-7 h-7 rounded-full ${
              isDarkMode
                ? "hover:bg-zinc-800 text-zinc-400 hover:text-white"
                : "hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900"
            }`}
            aria-label="Close popup"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable listing cards */}
        <div className="max-h-64 overflow-y-auto">
          {group.listings.map((listing) => (
            <div
              key={listing.id}
              data-testid={`stacked-popup-item-${listing.id}`}
              role="button"
              tabIndex={0}
              onMouseEnter={() => setHovered(listing.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(listing.id)}
              onBlur={() => setHovered(null)}
              onClick={() => {
                setActive(listing.id);
                requestScrollTo(listing.id);
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActive(listing.id);
                  requestScrollTo(listing.id);
                  onClose();
                }
              }}
              className={`flex gap-3 p-3 transition-colors cursor-pointer ${
                isDarkMode
                  ? "hover:bg-zinc-800 border-b border-zinc-800 last:border-b-0"
                  : "hover:bg-zinc-50 border-b border-zinc-100 last:border-b-0"
              }`}
            >
              {/* Thumbnail */}
              <div
                className={`relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 ${
                  isDarkMode ? "bg-zinc-800" : "bg-zinc-100"
                }`}
              >
                {listing.images?.[0] ? (
                  <Image
                    src={listing.images[0]}
                    alt={listing.title}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Home
                      className={`w-6 h-6 ${
                        isDarkMode ? "text-zinc-600" : "text-zinc-300"
                      }`}
                    />
                  </div>
                )}
              </div>

              {/* Listing info */}
              <div className="flex-1 min-w-0">
                <h4
                  className={`font-medium text-sm truncate ${
                    isDarkMode ? "text-white" : "text-zinc-900"
                  }`}
                >
                  {listing.title}
                </h4>
                <p className="mt-0.5">
                  <span
                    className={`font-bold ${
                      isDarkMode ? "text-white" : "text-zinc-900"
                    }`}
                  >
                    ${listing.price}
                  </span>
                  <span
                    className={`text-sm ${
                      isDarkMode ? "text-zinc-400" : "text-zinc-500"
                    }`}
                  >
                    /mo
                  </span>
                </p>
                <span
                  className={`text-xs ${
                    isDarkMode ? "text-zinc-500" : "text-zinc-400"
                  }`}
                >
                  {listing.availableSlots}{" "}
                  {listing.availableSlots === 1 ? "spot" : "spots"} available
                </span>
              </div>

              {/* Arrow icon for navigation (stops propagation) */}
              <Link
                href={`/listings/${listing.id}`}
                data-testid={`stacked-popup-open-${listing.id}`}
                onClick={(e) => e.stopPropagation()}
                className={`flex-shrink-0 self-center p-1.5 rounded-full transition-colors ${
                  isDarkMode
                    ? "hover:bg-zinc-700 text-zinc-400 hover:text-white"
                    : "hover:bg-zinc-200 text-zinc-400 hover:text-zinc-900"
                }`}
                aria-label={`Open ${listing.title} details`}
              >
                <ChevronRight className="w-5 h-5" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </Popup>
  );
}
