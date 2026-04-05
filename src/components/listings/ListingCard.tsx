"use client";

import { memo, useState, useCallback } from "react";
import Link from "next/link";
import { Star, Home, MapPin } from "lucide-react";
import FavoriteButton from "../FavoriteButton";
import { ImageCarousel } from "./ImageCarousel";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import {
  useListingFocusActions,
  useIsListingFocused,
} from "@/contexts/ListingFocusContext";
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

// Format location to avoid redundancy
function formatLocation(city: string, state: string): string {
  const stateAbbr =
    state.length === 2
      ? state.toUpperCase()
      : STATE_ABBREVIATIONS[state] || state;
  let cleanCity = city.trim();
  const cityParts = cleanCity.split(",").map((p) => p.trim());
  if (cityParts.length > 1) {
    const lastPart = cityParts[cityParts.length - 1].toUpperCase();
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
  mobileVariant?: "default" | "feed";
  priority?: boolean;
  showTotalPrice?: boolean;
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

  const handleImageError = useCallback((index: number) => {
    setImageErrors((prev) => new Set(prev).add(index));
  }, []);

  const validImages = (listing.images || []).filter(
    (_, i) => !imageErrors.has(i)
  );
  const hasValidImages = validImages.length > 0;

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
    !isGuestFavorite &&
    (avgRating ?? 0) >= 4.5 &&
    (listing.reviewCount ?? 0) >= 3;

  const displayTitle = listing.title?.trim() || "Untitled Listing";
  const formattedLocation = formatLocation(
    listing.location.city,
    listing.location.state
  );
  const imageAlt = `${displayTitle} in ${formattedLocation}`;

  const srParts: string[] = [];
  srParts.push(
    listing.price === 0 ? "Free" : `${formatPrice(listing.price)} per month`
  );
  if (isTopRated) srParts.push("top rated");
  if (hasRating) srParts.push(`rated ${avgRating!.toFixed(1)} out of 5`);
  else srParts.push("new listing");
  
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
        "group relative flex flex-col rounded-2xl bg-surface-container-lowest mb-4 shadow-sm transition-all duration-500 overflow-hidden",
        !isActive && "hover:shadow-xl hover:-translate-y-1",
        isActive && "ring-2 ring-primary ring-offset-2 -translate-y-0.5 shadow-xl",
        isHovered && !isActive && "ring-1 ring-primary/20",
        className
      )}
    >
      <div className="absolute z-20 top-3 right-3 flex items-center gap-1.5">
        {hasProvider && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActive(listing.id);
            }}
            className="relative p-1.5 rounded-full bg-surface-container-lowest/80 backdrop-blur-sm shadow-sm hover:bg-surface-container-lowest transition-colors before:absolute before:inset-0 before:-m-[10px] before:content-['']"
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
          "block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 flex-1 flex flex-col",
          isDragging && "pointer-events-none"
        )}
      >
        <div className="relative overflow-hidden aspect-[4/3] bg-surface-canvas">
          <ImageCarousel
            images={displayImages}
            alt={imageAlt}
            priority={priority}
            className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
            onImageError={handleImageError}
            onDragStateChange={setIsDragging}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

          {showImagePlaceholder && (
            <div className="absolute inset-0 bg-surface-canvas flex flex-col items-center justify-center pointer-events-none">
              <Home className="w-8 h-8 text-on-surface-variant mb-2" strokeWidth={1} />
              <span className="text-xs text-on-surface-variant font-medium uppercase tracking-[0.2em]">
                No Photos
              </span>
            </div>
          )}

          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
            <SlotBadge
              availableSlots={listing.availableSlots}
              totalSlots={listing.totalSlots}
              overlay
            />
            {isTopRated ? (
              <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-surface-container-lowest/80 text-on-surface shadow-sm backdrop-blur-md">
                Top Rated
              </span>
            ) : !hasRating ? (
              <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-surface-container-lowest/80 text-on-surface shadow-sm backdrop-blur-md">
                New
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-4 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3
              className="font-medium text-[1.05rem] leading-tight text-on-surface line-clamp-1 flex-1"
              title={displayTitle}
            >
              {displayTitle}
            </h3>
            {hasRating && (
              <div
                className="flex items-center gap-1 text-sm font-medium text-on-surface flex-shrink-0"
                aria-label={`Rating ${avgRating!.toFixed(1)} out of 5`}
              >
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span>{avgRating!.toFixed(1)}</span>
              </div>
            )}
          </div>

          <p className="text-on-surface-variant text-sm mb-1 truncate">
            {formattedLocation} • {listing.amenities.slice(0, 2).join(" • ")}
          </p>

          <div className="mt-auto pt-2 flex items-baseline gap-1">
            <span
              data-testid="listing-price"
              className="font-display italic text-2xl font-medium text-on-surface"
            >
              {showTotalPrice && estimatedMonths > 1 
                ? formatPrice(listing.price * estimatedMonths) 
                : formatPrice(listing.price)}
            </span>
            <span className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">
              {showTotalPrice && estimatedMonths > 1 ? "total" : "/mo"}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export default memo(ListingCardInner, arePropsEqual);