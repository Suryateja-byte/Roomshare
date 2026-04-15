"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { formatPrice } from "@/lib/format";
import {
  useListingFocusState,
  useListingFocusActions,
} from "@/contexts/ListingFocusContext";
import type { SplitStayPair } from "@/lib/search/split-stay";
import {
  buildListingDetailHref,
  type ListingDetailDateParamSource,
} from "@/lib/search/listing-detail-link";
import { cn } from "@/lib/utils";

interface SplitStayCardProps {
  pair: SplitStayPair;
  showTotalPrice?: boolean;
  estimatedMonths?: number;
  listingDetailDateParams?: ListingDetailDateParamSource;
}

/**
 * SplitStayCard — Shows two listings side-by-side for split-stay trips.
 * Used when a single listing can't cover the full requested duration.
 */
export function SplitStayCard({
  pair,
  showTotalPrice,
  estimatedMonths,
  listingDetailDateParams,
}: SplitStayCardProps) {
  const { first, second, combinedPrice, splitLabel } = pair;

  // Parse the split label to get individual durations (e.g., "3 mo + 4 mo" → [3, 4])
  const durationMatch = splitLabel.match(/(\d+)\s*mo\s*\+\s*(\d+)\s*mo/);
  const firstMonths = durationMatch
    ? parseInt(durationMatch[1], 10)
    : estimatedMonths
      ? Math.floor(estimatedMonths / 2)
      : 0;
  const secondMonths = durationMatch
    ? parseInt(durationMatch[2], 10)
    : estimatedMonths
      ? estimatedMonths - firstMonths
      : 0;

  return (
    <div className="rounded-xl border border-outline-variant/20/60 bg-surface-container-lowest overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-outline-variant/20 bg-surface-canvas">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
          Split Stay · {splitLabel}
        </p>
      </div>

      {/* Two listings side by side */}
      <div className="grid grid-cols-2 divide-outline-variant/20">
        <SplitStayHalf
          listing={first}
          href={buildListingDetailHref(first.id, listingDetailDateParams ?? {})}
          label="First stay"
          months={firstMonths}
          showTotalPrice={showTotalPrice}
        />
        <SplitStayHalf
          listing={second}
          href={buildListingDetailHref(
            second.id,
            listingDetailDateParams ?? {}
          )}
          label="Then"
          months={secondMonths}
          showTotalPrice={showTotalPrice}
        />
      </div>

      {/* Connecting arc visual */}
      <div className="flex items-center justify-center py-1 -mt-1">
        <svg
          width="60"
          height="16"
          viewBox="0 0 60 16"
          className="text-on-surface-variant"
          aria-hidden="true"
        >
          <path
            d="M5 8 C20 0, 40 0, 55 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
          <circle cx="5" cy="8" r="2.5" fill="currentColor" />
          <circle cx="55" cy="8" r="2.5" fill="currentColor" />
        </svg>
      </div>

      {/* Combined price footer */}
      <div className="px-4 py-3 border-outline-variant/20 flex items-baseline justify-between">
        <span className="text-sm text-on-surface-variant">Combined total</span>
        <span className="font-bold text-lg text-on-surface">
          {formatPrice(combinedPrice)}
        </span>
      </div>
    </div>
  );
}

function SplitStayHalf({
  listing,
  href,
  label,
  months,
  showTotalPrice,
}: {
  listing: SplitStayPair["first"];
  href: string;
  label: string;
  months: number;
  showTotalPrice?: boolean;
}) {
  const image = listing.images?.[0];
  // HIGH-2 FIX: Use split contexts instead of combined useListingFocus().
  // useListingFocusState() subscribes to state-only context (re-renders on hover/active changes).
  // useListingFocusActions() subscribes to actions-only context (stable, never triggers re-renders).
  // This prevents SplitStayHalf from re-rendering on unrelated context changes (scrollRequest, etc.).
  const { hoveredId, activeId } = useListingFocusState();
  const { setHovered, setActive, focusSourceRef } = useListingFocusActions();
  const isHovered = hoveredId === listing.id;
  const isActive = activeId === listing.id;

  return (
    <div
      className={cn(
        "relative transition-shadow",
        isActive && "ring-2 ring-primary ring-inset",
        isHovered && !isActive && "ring-1 ring-primary/20 ring-inset"
      )}
      onMouseEnter={() => {
        if (focusSourceRef.current === "map") return;
        setHovered(listing.id, "list");
      }}
      onMouseLeave={() => setHovered(null)}
      onFocus={() => {
        if (focusSourceRef.current === "map") return;
        setHovered(listing.id, "list");
      }}
      onBlur={() => setHovered(null)}
    >
      <Link
        href={href}
        className="block p-3 hover:bg-surface-canvas transition-colors"
      >
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wide">
            {label}
          </p>
          {/* Show on map button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActive(listing.id);
            }}
            data-show-on-map-id={listing.id}
            className="p-1 rounded-md text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
            aria-label={`Show ${listing.title} on map`}
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
        </div>
        {image && (
          <div className="relative aspect-[4/3] rounded-lg overflow-hidden mb-2">
            <Image
              src={image}
              alt={listing.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, 25vw"
            />
          </div>
        )}
        <h4 className="text-sm font-medium text-on-surface line-clamp-1">
          {listing.title}
        </h4>
        <p className="text-xs text-on-surface-variant mt-0.5">
          {showTotalPrice && months > 1 ? (
            <>
              {formatPrice(listing.price * months)}
              <span className="text-on-surface-variant">
                {" "}
                total ({months} mo)
              </span>
            </>
          ) : (
            <>{formatPrice(listing.price)}/mo</>
          )}
        </p>
      </Link>
    </div>
  );
}

export default SplitStayCard;
