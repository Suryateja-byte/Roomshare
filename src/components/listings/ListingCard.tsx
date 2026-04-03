"use client";

import { memo, useState, useCallback } from "react";
import Link from "next/link";
import { Star, Home, Globe, MapPin } from "lucide-react";
import FavoriteButton from "../FavoriteButton";
import { ImageCarousel } from "./ImageCarousel";
import { cn } from "@/lib/utils";
import { getLanguageName } from "@/lib/languages";
import { formatPrice } from "@/lib/format";
import {
  useListingFocusActions,
  useIsListingFocused,
} from "@/contexts/ListingFocusContext";
import { TrustBadge } from "@/components/ui/TrustBadge";
import { SlotBadge } from "./SlotBadge";

export interface Listing {
  id: string;
  title: string;
  price: number;
  description: string;
  location: {
    city: string;
    state: string;
  };
  amenities: string[];
  householdLanguages?: string[];
  availableSlots: number;
  totalSlots: number;
  images?: string[];
  avgRating?: number;
  reviewCount?: number;
}

// State abbreviation map
const STATE_ABBREVIATIONS: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

// Format location to avoid redundancy (e.g., "Irving, TX" not "Irving, TX, TX")
function formatLocation(city: string, state: string): string {
  // Convert state to abbreviation if it's a full name
  const stateAbbr =
    state.length === 2
      ? state.toUpperCase()
      : STATE_ABBREVIATIONS[state] || state;

  // Clean city - remove any trailing state abbreviation if it matches
  let cleanCity = city.trim();

  // Check if city already ends with the state abbreviation (e.g., "Irving, TX")
  const cityParts = cleanCity.split(",").map((p) => p.trim());
  if (cityParts.length > 1) {
    const lastPart = cityParts[cityParts.length - 1].toUpperCase();
    // If the last part is the same as state or its abbreviation, remove it
    if (
      lastPart === stateAbbr ||
      lastPart === state.toUpperCase() ||
      STATE_ABBREVIATIONS[lastPart] === stateAbbr
    ) {
      cleanCity = cityParts.slice(0, -1).join(", ");
    }
  }

  return `${cleanCity}, ${stateAbbr}`;
}

// Placeholder images for when listing has no images
const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1484154218962-a1c002085d2f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1502005229766-528352261b79?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80",
];

interface ListingCardProps {
  listing: Listing;
  isSaved?: boolean;
  className?: string;
  /** Search feed-specific mobile hierarchy. Desktop remains unchanged. */
  mobileVariant?: "default" | "feed";
  /** Priority loading for LCP optimization - use for above-fold images */
  priority?: boolean;
  /** When true, show total price (price × estimatedMonths) instead of per-month */
  showTotalPrice?: boolean;
  /** Number of months for total price calculation */
  estimatedMonths?: number;
}

function arePropsEqual(
  prev: ListingCardProps,
  next: ListingCardProps
): boolean {
  const pl = prev.listing;
  const nl = next.listing;
  return (
    pl.id === nl.id &&
    pl.price === nl.price &&
    pl.title === nl.title &&
    pl.availableSlots === nl.availableSlots &&
    pl.totalSlots === nl.totalSlots &&
    pl.avgRating === nl.avgRating &&
    pl.reviewCount === nl.reviewCount &&
    pl.images === nl.images &&
    pl.amenities === nl.amenities &&
    pl.householdLanguages === nl.householdLanguages &&
    pl.location.city === nl.location.city &&
    pl.location.state === nl.location.state &&
    prev.isSaved === next.isSaved &&
    prev.className === next.className &&
    prev.mobileVariant === next.mobileVariant &&
    prev.priority === next.priority &&
    prev.showTotalPrice === next.showTotalPrice &&
    prev.estimatedMonths === next.estimatedMonths
  );
}

function ListingCardInner({
  listing,
  isSaved,
  className,
  mobileVariant = "default",
  priority = false,
  showTotalPrice = false,
  estimatedMonths = 1,
}: ListingCardProps) {
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const { setHovered, setActive, hasProvider, focusSourceRef } =
    useListingFocusActions();
  const { isHovered, isActive } = useIsListingFocused(listing.id);
  const isFeedCard = mobileVariant === "feed";

  // Track image errors by index
  const handleImageError = useCallback((index: number) => {
    setImageErrors((prev) => new Set(prev).add(index));
  }, []);

  // Get valid images (filter out errored ones)
  const validImages = (listing.images || []).filter(
    (_, i) => !imageErrors.has(i)
  );
  const hasValidImages = validImages.length > 0;

  // Fallback to placeholder if no valid images
  const placeholderIndex =
    listing.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    PLACEHOLDER_IMAGES.length;
  const displayImages = hasValidImages
    ? validImages
    : [PLACEHOLDER_IMAGES[placeholderIndex]];
  const showImagePlaceholder = !hasValidImages;

  const isAvailable = listing.availableSlots > 0;
  const avgRating = Number.isFinite(listing.avgRating)
    ? listing.avgRating
    : null;
  const hasRating = (listing.reviewCount ?? 0) > 0 && avgRating !== null;
  const isGuestFavorite =
    (listing.reviewCount ?? 0) >= 5 && (avgRating ?? 0) >= 4.9;
  const isTopRated =
    !isGuestFavorite && (avgRating ?? 0) >= 4.5 && (listing.reviewCount ?? 0) >= 3;

  // Fallback for empty/null titles
  const displayTitle = listing.title?.trim() || "Untitled Listing";
  const formattedLocation = formatLocation(
    listing.location.city,
    listing.location.state
  );
  const imageAlt = `${displayTitle} in ${formattedLocation}`;

  // Build screen reader label: Price → Rating → Room Type → Location → Badges
  const srParts: string[] = [];
  srParts.push(
    listing.price === 0 ? "Free" : `${formatPrice(listing.price)} per month`
  );
  if (isTopRated) {
    srParts.push("top rated");
  }
  if (hasRating) {
    srParts.push(`rated ${avgRating!.toFixed(1)} out of 5`);
  } else {
    srParts.push("new listing");
  }
  if (listing.totalSlots > 1) {
    srParts.push(
      isAvailable
        ? `${listing.availableSlots} of ${listing.totalSlots} spots available`
        : "currently filled"
    );
  } else {
    srParts.push(
      isAvailable
        ? `${listing.availableSlots} spot${listing.availableSlots !== 1 ? "s" : ""} available`
        : "currently filled"
    );
  }
  srParts.push(formattedLocation);
  if (listing.amenities.length > 0) {
    srParts.push(listing.amenities.slice(0, 3).join(", "));
  }
  const ariaLabel = `${displayTitle}: ${srParts.join(", ")}`;

  return (
    <article
      aria-label={ariaLabel}
      data-testid="listing-card"
      data-listing-card-id={listing.id}
      data-listing-id={listing.id}
      data-mobile-variant={mobileVariant}
      data-focus-state={isActive ? "active" : isHovered ? "hovered" : "none"}
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
      className={cn(
        "relative transition-all duration-300 scroll-mt-4 lg:scroll-mt-6",
        isFeedCard ? "rounded-[1.25rem] lg:rounded-lg" : "rounded-lg",
        isActive &&
          (isFeedCard
            ? "ring-2 ring-primary ring-offset-2 shadow-ambient-lg shadow-primary/10 -translate-y-0.5"
            : "ring-2 ring-primary ring-offset-2"),
        isHovered && !isActive && "shadow-ambient ring-1 ring-primary/20",
        className
      )}
    >
      <div
        className={cn(
          "absolute z-20 flex items-center gap-1.5",
          isFeedCard ? "top-2.5 right-2.5 lg:top-3 lg:right-3" : "top-3 right-3"
        )}
      >
        {hasProvider && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActive(listing.id);
            }}
            className="relative p-1.5 rounded-full bg-surface-container-lowest/80 backdrop-blur-sm shadow-ambient-sm hover:bg-surface-container-lowest transition-colors before:absolute before:inset-0 before:-m-[10px] before:content-['']"
            aria-label="Show on map"
            title="Show on map"
          >
            <MapPin className="w-3.5 h-3.5 text-on-surface-variant" />
          </button>
        )}
        <FavoriteButton listingId={listing.id} initialIsSaved={isSaved} />
      </div>
      <Link
        href={`/listings/${listing.id}`}
        onClick={isDragging ? (e) => e.preventDefault() : undefined}
        className={cn(
          "block group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
          isFeedCard ? "rounded-[1.25rem] lg:rounded-lg" : "rounded-lg",
          isDragging && "pointer-events-none"
        )}
      >
        <div
          className={cn(
            "relative flex flex-col overflow-hidden bg-surface-container-lowest transition-lift shadow-ambient-sm group-hover:shadow-ambient-lg group-hover:shadow-on-surface/10 motion-safe:group-hover:-translate-y-1",
            isFeedCard ? "rounded-[1.25rem] lg:rounded-lg" : "rounded-lg"
          )}
        >
          {/* Image Area */}
          <div
            className={cn(
              "relative overflow-hidden bg-surface-canvas",
              isFeedCard
                ? "aspect-[16/10] sm:aspect-[4/3]"
                : "aspect-[16/9] sm:aspect-[4/3]"
            )}
          >
            {/* Image Carousel or single image */}
            <ImageCarousel
              images={displayImages}
              alt={imageAlt}
              priority={priority}
              className="h-full w-full motion-safe:group-hover:scale-[1.05] motion-safe:transition-transform motion-safe:duration-[600ms] ease-[cubic-bezier(0.25,0.1,0.25,1.0)]"
              onImageError={handleImageError}
              onDragStateChange={setIsDragging}
            />

            {/* Gradient Overlay for better text readability and depth */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

            {/* Empty state overlay - Intentional waiting state */}
            {showImagePlaceholder && (
              <div className="absolute inset-0 bg-surface-canvas flex flex-col items-center justify-center pointer-events-none">
                <Home
                  className="w-8 h-8 text-on-surface-variant mb-2"
                  strokeWidth={1}
                />
                <span className="text-xs text-on-surface-variant font-medium uppercase tracking-[0.2em]">
                  No Photos
                </span>
              </div>
            )}

            {/* Badges — top-left stack */}
            <div
              className={cn(
                "absolute top-4 left-4 z-20 flex flex-col",
                isFeedCard ? "gap-1.5" : "gap-2"
              )}
            >
              {isFeedCard ? (
                <>
                  {isGuestFavorite && (
                    <TrustBadge
                      avgRating={listing.avgRating}
                      reviewCount={listing.reviewCount}
                    />
                  )}
                  <SlotBadge
                    availableSlots={listing.availableSlots}
                    totalSlots={listing.totalSlots}
                    overlay
                  />
                  {!isGuestFavorite &&
                    (isTopRated ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 shadow-ambient-sm backdrop-blur-sm">
                        Top Rated
                      </span>
                    ) : hasRating ? (
                      <div
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-surface-container-lowest/90 text-on-surface shadow-ambient-sm backdrop-blur-md"
                        aria-label={`Rating ${avgRating!.toFixed(1)} out of 5`}
                      >
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>{avgRating!.toFixed(1)}</span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center font-medium px-2.5 py-1 text-xs bg-surface-container-lowest/90 backdrop-blur-sm shadow-ambient-sm rounded-lg text-primary">
                        New
                      </span>
                    ))}
                </>
              ) : (
                <>
                  <TrustBadge
                    avgRating={listing.avgRating}
                    reviewCount={listing.reviewCount}
                  />
                  <SlotBadge
                    availableSlots={listing.availableSlots}
                    totalSlots={listing.totalSlots}
                    overlay
                  />
                  {listing.totalSlots > 1 && (
                    <span className="inline-flex items-center font-medium px-2.5 py-1 text-xs bg-surface-container-lowest/90 backdrop-blur-sm shadow-ambient-sm rounded-lg text-primary">
                      Multi-Room
                    </span>
                  )}
                  {isTopRated ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 shadow-ambient-sm backdrop-blur-sm">
                      Top Rated
                    </span>
                  ) : hasRating ? (
                    <div
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-surface-container-lowest/90 text-on-surface shadow-ambient-sm backdrop-blur-md"
                      aria-label={`Rating ${avgRating!.toFixed(1)} out of 5`}
                    >
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span>{avgRating!.toFixed(1)}</span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center font-medium px-2.5 py-1 text-xs bg-surface-container-lowest/90 backdrop-blur-sm shadow-ambient-sm rounded-lg text-primary">
                      New
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div
            className={cn(
              "flex flex-col flex-1",
              isFeedCard ? "p-4 sm:p-5 lg:p-6" : "p-5 sm:p-6"
            )}
          >
            {isFeedCard ? (
              <>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    {isActive && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary mb-2">
                        Selected on map
                      </span>
                    )}
                    <p className="text-[15px] font-semibold text-on-surface truncate">
                      {formattedLocation}
                    </p>
                    <h3
                      className="mt-1 text-sm text-on-surface-variant line-clamp-1 lg:text-base lg:text-on-surface lg:line-clamp-2 lg:leading-tight lg:tracking-tight lg:font-semibold"
                      title={displayTitle}
                    >
                      {displayTitle}
                    </h3>
                  </div>

                  {hasRating ? (
                    <div
                      className="hidden lg:inline-flex items-center gap-1 text-sm font-medium text-on-surface flex-shrink-0"
                      aria-label={`Rating ${avgRating!.toFixed(1)} out of 5`}
                    >
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span>{avgRating!.toFixed(1)}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <div className="flex items-baseline min-w-0">
                    {showTotalPrice && estimatedMonths > 1 ? (
                      <>
                        <span
                          data-testid="listing-price"
                          className="font-display font-semibold text-xl text-on-surface tracking-tight"
                        >
                          {formatPrice(listing.price * estimatedMonths)}
                        </span>
                        <span className="text-on-surface-variant text-[11px] ml-1 uppercase tracking-wider font-medium">
                          total
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          data-testid="listing-price"
                          className="font-display font-semibold text-xl text-on-surface tracking-tight"
                        >
                          {formatPrice(listing.price)}
                        </span>
                        {listing.price > 0 && (
                          <span className="text-on-surface-variant text-[11px] ml-1 tracking-wider font-medium">
                            /mo
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {!hasRating && (
                    <span className="hidden lg:inline-flex items-center rounded-full bg-surface-container-high px-2 py-1 text-[11px] font-medium text-on-surface-variant">
                      New listing
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 mt-auto">
                  <div className="flex items-center gap-1.5 overflow-hidden min-w-0 flex-1">
                    {listing.amenities.slice(0, 2).map((amenity, i) => (
                      <span
                        key={amenity}
                        className={cn(
                          "text-xs font-medium text-on-surface-variant truncate",
                          i > 0 && "hidden sm:inline"
                        )}
                      >
                        • {amenity}
                      </span>
                    ))}
                  </div>

                  {listing.householdLanguages &&
                    listing.householdLanguages.length > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                        <Globe className="w-3 h-3 text-on-surface-variant" />
                        <span className="text-xs font-medium text-on-surface-variant">
                          {getLanguageName(listing.householdLanguages[0])}
                          {listing.householdLanguages.length > 1 &&
                            ` +${Math.min(listing.householdLanguages.length - 1, 4)}`}
                        </span>
                      </div>
                    )}
                </div>
              </>
            ) : (
              <>
                {/* Title and Rating Row */}
                <div className="mb-1">
                  <h3
                    className="font-semibold text-base text-on-surface line-clamp-2 leading-tight tracking-tight"
                    title={displayTitle}
                  >
                    {displayTitle}
                  </h3>
                </div>

                {/* Location */}
                <p className="text-sm text-on-surface-variant mb-4 font-light">
                  {formatLocation(listing.location.city, listing.location.state)}
                </p>

                {/* Price — Large and prominent */}
                <div className="flex items-baseline mb-5">
                  {showTotalPrice && estimatedMonths > 1 ? (
                    <>
                      <span
                        data-testid="listing-price"
                        className="font-display font-semibold text-xl text-on-surface tracking-tight"
                      >
                        {formatPrice(listing.price * estimatedMonths)}
                      </span>
                      <span className="text-on-surface-variant text-xs ml-1 uppercase tracking-wider font-medium">
                        total
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        data-testid="listing-price"
                        className="font-display font-semibold text-xl text-on-surface tracking-tight"
                      >
                        {formatPrice(listing.price)}
                      </span>
                      {listing.price > 0 && (
                        <span className="text-on-surface-variant text-xs ml-1 tracking-wider font-medium">
                          /mo
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Amenities & Languages - Simplified */}
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <div className="flex items-center gap-1.5 overflow-hidden min-w-0 flex-1">
                    {listing.amenities.slice(0, 2).map((amenity, i) => (
                      <span
                        key={amenity}
                        className={cn(
                          "text-xs font-medium text-on-surface-variant truncate",
                          i > 0 && "hidden sm:inline"
                        )}
                      >
                        • {amenity}
                      </span>
                    ))}
                  </div>

                  {listing.householdLanguages &&
                    listing.householdLanguages.length > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                        <Globe className="w-3 h-3 text-on-surface-variant" />
                        <span className="text-xs font-medium text-on-surface-variant">
                          {getLanguageName(listing.householdLanguages[0])}
                          {listing.householdLanguages.length > 1 &&
                            ` +${Math.min(listing.householdLanguages.length - 1, 4)}`}
                        </span>
                      </div>
                    )}
                </div>
              </>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

export default memo(ListingCardInner, arePropsEqual);
