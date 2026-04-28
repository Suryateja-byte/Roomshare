"use client";

import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Home, MapPin } from "lucide-react";
import FavoriteButton from "../FavoriteButton";
import { ImageCarousel } from "./ImageCarousel";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import {
  getAvailabilityPresentation,
  type AvailabilityPublicAvailability,
} from "@/lib/search/availability-presentation";
import {
  useListingFocusActions,
  useIsListingFocused,
} from "@/contexts/ListingFocusContext";
import { SlotBadge } from "./SlotBadge";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type {
  GroupContextPresentation,
  GroupSummary,
} from "@/lib/search-types";
import { buildListingDetailHref } from "@/lib/search/listing-detail-link";
import GroupDatesPanel from "./GroupDatesPanel";
import GroupDatesModal from "./GroupDatesModal";

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
  roomType?: string;
  moveInDate?: Date | string;
  leaseDuration?: string;
  /**
   * Normalized availability contract (CFM-202/404). When present,
   * slot/availability labels are derived from this rather than the legacy
   * availableSlots/totalSlots fields, and the card uses availableFrom /
   * publicStatus / freshnessBucket to render freshness-aware strings.
   */
  publicAvailability?: AvailabilityPublicAvailability;
  groupKey?: string | null;
  groupSummary?: GroupSummary | null;
  groupContext?: GroupContextPresentation | null;
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

// Format move-in date for card display
function formatMoveInDate(date?: Date | string): string | null {
  if (!date) return null;
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return null;
    // Use UTC to avoid timezone offset issues with date-only strings
    return `Available ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  } catch {
    return null;
  }
}

// Map lease duration values to display labels
const LEASE_DURATION_LABELS: Record<string, string> = {
  month_to_month: "Month-to-month",
  "1_month": "1 mo",
  "3_months": "3 mo lease",
  "6_months": "6 mo lease",
  "9_months": "9 mo lease",
  "12_months": "12 mo lease",
  "1_year": "12 mo lease",
};

function formatLeaseDuration(duration?: string): string | null {
  if (!duration) return null;
  return LEASE_DURATION_LABELS[duration] || duration;
}

// Format room type for display
function formatRoomType(roomType?: string): string | null {
  if (!roomType) return null;
  // Handle common DB values
  const labels: Record<string, string> = {
    private: "Private Room",
    private_room: "Private Room",
    "Private Room": "Private Room",
    shared: "Shared Room",
    shared_room: "Shared Room",
    "Shared Room": "Shared Room",
    entire: "Entire Place",
    entire_place: "Entire Place",
    "Entire Place": "Entire Place",
  };
  return labels[roomType] || roomType;
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
  href?: string;
  isSaved?: boolean;
  className?: string;
  mobileVariant?: "default" | "feed";
  desktopVariant?: "grid" | "row";
  priority?: boolean;
  showTotalPrice?: boolean;
  estimatedMonths?: number;
  queryHashPrefix8?: string;
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
    pl.roomType === nl.roomType &&
    pl.leaseDuration === nl.leaseDuration &&
    String(pl.moveInDate) === String(nl.moveInDate) &&
    pl.location.city === nl.location.city &&
    pl.location.state === nl.location.state &&
    pl.publicAvailability?.openSlots === nl.publicAvailability?.openSlots &&
    pl.publicAvailability?.totalSlots === nl.publicAvailability?.totalSlots &&
    pl.publicAvailability?.publicStatus ===
      nl.publicAvailability?.publicStatus &&
    pl.publicAvailability?.freshnessBucket ===
      nl.publicAvailability?.freshnessBucket &&
    pl.publicAvailability?.availableFrom ===
      nl.publicAvailability?.availableFrom &&
    pl.groupKey === nl.groupKey &&
    pl.groupContext?.contextKey === nl.groupContext?.contextKey &&
    pl.groupSummary?.groupKey === nl.groupSummary?.groupKey &&
    (pl.groupSummary?.members ?? [])
      .map((member) =>
        [
          member.listingId,
          member.availableFrom,
          member.availableUntil ?? "",
          member.startDate ?? "",
          member.endDate ?? "",
          member.openSlots,
          member.totalSlots,
          member.isCanonical ? "1" : "0",
        ].join(":")
      )
      .join(",") ===
      (nl.groupSummary?.members ?? [])
        .map((member) =>
          [
            member.listingId,
            member.availableFrom,
            member.availableUntil ?? "",
            member.startDate ?? "",
            member.endDate ?? "",
            member.openSlots,
            member.totalSlots,
            member.isCanonical ? "1" : "0",
          ].join(":")
        )
        .join(",") &&
    prev.href === next.href &&
    prev.isSaved === next.isSaved &&
    prev.className === next.className &&
    prev.mobileVariant === next.mobileVariant &&
    prev.desktopVariant === next.desktopVariant &&
    prev.priority === next.priority &&
    prev.showTotalPrice === next.showTotalPrice &&
    prev.estimatedMonths === next.estimatedMonths &&
    prev.queryHashPrefix8 === next.queryHashPrefix8
  );
}

function ListingCardInner({
  listing,
  href,
  isSaved,
  className,
  mobileVariant = "default",
  desktopVariant = "grid",
  priority = false,
  showTotalPrice = false,
  estimatedMonths = 1,
  queryHashPrefix8,
}: ListingCardProps) {
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isGroupDatesOpen, setIsGroupDatesOpen] = useState(false);
  const { setHovered, setActive, hasProvider, focusSourceRef } =
    useListingFocusActions();
  const { isHovered, isActive } = useIsListingFocused(listing.id);
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 767px)") === true;
  const groupTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  const groupSummary = listing.groupSummary ?? null;
  const groupContext = listing.groupContext ?? null;
  const hasGroupDates =
    (groupSummary?.members?.length ?? 0) > 1 &&
    groupContext?.completeness === "complete";
  const effectiveOpenSlots =
    listing.publicAvailability?.openSlots ?? listing.availableSlots;
  const effectiveTotalSlots =
    listing.publicAvailability?.totalSlots ?? listing.totalSlots;
  const panelId = `group-dates-panel-${listing.id}`;
  const triggerId = `${panelId}-trigger`;
  const availabilityPresentation = getAvailabilityPresentation({
    availableSlots: listing.availableSlots,
    totalSlots: listing.totalSlots,
    publicAvailability: listing.publicAvailability,
    groupContext,
  });
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
  const listingHref = href ?? `/listings/${listing.id}`;
  const extraDateCount = Math.max((groupSummary?.members?.length ?? 0) - 1, 0);
  const isDesktopRow = desktopVariant === "row";

  const displayRoomType = formatRoomType(listing.roomType);
  const displayMoveIn = formatMoveInDate(
    listing.publicAvailability?.availableFrom ?? listing.moveInDate
  );
  const displayLease = formatLeaseDuration(listing.leaseDuration);
  const groupTriggerLabel = useMemo(() => {
    if (!hasGroupDates) return null;
    return `+${extraDateCount} more date${extraDateCount === 1 ? "" : "s"}`;
  }, [extraDateCount, hasGroupDates]);

  useEffect(() => {
    setIsGroupDatesOpen(false);
  }, [isMobile, listing.id]);

  const focusTrigger = useCallback(() => {
    requestAnimationFrame(() => {
      groupTriggerRef.current?.focus();
    });
  }, []);

  const closeGroupDates = useCallback(
    (returnFocus = true) => {
      setIsGroupDatesOpen(false);
      if (returnFocus) {
        focusTrigger();
      }
    },
    [focusTrigger]
  );

  const handleGroupDatesTrigger = useCallback(() => {
    setIsGroupDatesOpen((previousOpen) => {
      if (previousOpen) {
        return false;
      }
      return true;
    });
  }, []);

  const handleGroupMemberClick = useCallback(
    (member: NonNullable<GroupSummary["members"]>[number]) => {
      closeGroupDates(false);
      router.push(
        buildListingDetailHref(member.listingId, {
          startDate: member.startDate,
          endDate: member.endDate,
        })
      );
    },
    [closeGroupDates, router]
  );

  const handleGroupOverflowClick = useCallback(() => {
    closeGroupDates(false);
    router.push(listingHref);
  }, [closeGroupDates, listingHref, router]);

  const srParts: string[] = [];
  srParts.push(
    listing.price === 0 ? "Free" : `${formatPrice(listing.price)} per month`
  );
  if (displayRoomType) srParts.push(displayRoomType);
  if (isTopRated) srParts.push("top rated");
  if (hasRating) srParts.push(`rated ${avgRating!.toFixed(1)} out of 5`);
  else srParts.push("new listing");

  srParts.push(availabilityPresentation.ariaLabel);
  if (availabilityPresentation.secondaryGroupLabel) {
    srParts.push(availabilityPresentation.secondaryGroupLabel);
  }
  srParts.push(formattedLocation);
  if (displayMoveIn) srParts.push(displayMoveIn);
  if (displayLease) srParts.push(displayLease);
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
        "group relative mb-4 flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ambient-sm transition-all duration-500",
        isDesktopRow &&
          "md:mb-2 md:overflow-visible md:bg-transparent md:p-2 md:shadow-none",
        !isActive &&
          !isDesktopRow &&
          "hover:-translate-y-1 hover:shadow-ambient-lg",
        !isActive &&
          isDesktopRow &&
          "md:hover:bg-surface-container-lowest md:hover:shadow-[inset_0_0_0_1px_rgba(220,193,185,0.38)]",
        isActive &&
          (isDesktopRow
            ? "bg-surface-container-lowest shadow-[inset_0_0_0_1px_rgba(154,64,39,0.32)] md:-translate-y-0"
            : "ring-2 ring-primary ring-offset-2 -translate-y-0.5 shadow-ambient-lg"),
        isHovered &&
          !isActive &&
          (isDesktopRow
            ? "md:bg-surface-container-lowest md:shadow-[inset_0_0_0_1px_rgba(154,64,39,0.24)]"
            : "ring-2 ring-primary/50 shadow-ambient"),
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
            data-show-on-map-id={listing.id}
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
        href={listingHref}
        onClick={isDragging ? (e) => e.preventDefault() : undefined}
        data-testid="listing-card-link"
        className={cn(
          "block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 flex flex-1 flex-col",
          isDesktopRow &&
            "md:grid md:grid-cols-[168px_minmax(0,1fr)] md:items-stretch md:gap-4",
          isDragging && "pointer-events-none"
        )}
      >
        <div
          className={cn(
            "relative aspect-[4/3] overflow-hidden bg-surface-canvas",
            isDesktopRow && "md:h-full md:min-h-[132px] md:rounded-xl"
          )}
        >
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
              <Home
                className="w-8 h-8 text-on-surface-variant mb-2"
                strokeWidth={1}
              />
              <span className="text-xs text-on-surface-variant font-medium uppercase tracking-[0.2em]">
                No Photos
              </span>
            </div>
          )}

          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
            <SlotBadge
              availableSlots={effectiveOpenSlots}
              totalSlots={effectiveTotalSlots}
              publicAvailability={listing.publicAvailability}
              overlay
            />
            {isTopRated ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] uppercase tracking-wider font-bold bg-surface-container-lowest/90 text-on-surface shadow-ambient-sm backdrop-blur-md">
                Top Rated
              </span>
            ) : !hasRating ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] uppercase tracking-wider font-bold bg-amber-300 text-amber-950 shadow-ambient-sm backdrop-blur-md">
                New
              </span>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "flex flex-1 flex-col p-4",
            isDesktopRow && "md:min-w-0 md:p-1 md:py-1.5"
          )}
        >
          {displayRoomType ? (
            <span className="sr-only" data-testid="listing-title-text">
              {displayTitle}
            </span>
          ) : null}

          {/* Row 1: Price + Rating */}
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <div className="flex items-baseline gap-1">
              <span
                data-testid="listing-price"
                className={cn(
                  "font-display text-xl font-medium italic text-on-surface",
                  isDesktopRow && "md:text-[1.45rem]"
                )}
              >
                {showTotalPrice && estimatedMonths > 1
                  ? formatPrice(listing.price * estimatedMonths)
                  : formatPrice(listing.price)}
              </span>
              <span className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">
                {showTotalPrice && estimatedMonths > 1 ? "total" : "/mo"}
              </span>
            </div>
            {hasRating && (
              <div
                className="flex items-center gap-1 text-sm text-on-surface-variant flex-shrink-0"
                aria-label={`Rating ${avgRating!.toFixed(1)} out of 5`}
              >
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>{avgRating!.toFixed(1)}</span>
                {(listing.reviewCount ?? 0) > 0 && (
                  <span className="text-xs">({listing.reviewCount})</span>
                )}
              </div>
            )}
          </div>

          {/* Row 2: Room Type / Title + Location */}
          <h3
            className={cn(
              "mb-0.5 line-clamp-1 text-[0.95rem] font-medium leading-tight text-on-surface",
              isDesktopRow && "md:text-base md:font-semibold"
            )}
            title={displayTitle}
          >
            {displayRoomType
              ? `${displayRoomType} · ${formattedLocation}`
              : displayTitle}
          </h3>

          {/* Row 3: Location (when no roomType) or Availability */}
          <p className="truncate text-sm font-medium text-on-surface-variant">
            {displayRoomType
              ? [displayMoveIn, displayLease].filter(Boolean).join(" · ") ||
                formattedLocation
              : [formattedLocation, displayMoveIn, displayLease]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
          {availabilityPresentation.secondaryGroupLabel ? (
            <p className="mt-2 text-xs font-medium text-on-surface-variant">
              {availabilityPresentation.secondaryGroupLabel}
            </p>
          ) : null}
        </div>
      </Link>
      {hasGroupDates && groupSummary ? (
        <>
          <div className="px-4 pb-4">
            <button
              ref={groupTriggerRef}
              id={triggerId}
              type="button"
              role="button"
              tabIndex={0}
              data-testid="group-dates-trigger"
              aria-controls={panelId}
              aria-expanded={isGroupDatesOpen}
              aria-haspopup={isMobile ? "dialog" : undefined}
              className="inline-flex min-h-[32px] items-center rounded-full px-1 py-1 text-sm font-medium text-primary transition-colors hover:text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
              onClick={handleGroupDatesTrigger}
            >
              {groupTriggerLabel}
            </button>
          </div>
          {isGroupDatesOpen && !isMobile ? (
            <GroupDatesPanel
              canonical={listing}
              summary={groupSummary}
              queryHashPrefix8={queryHashPrefix8}
              panelId={panelId}
              triggerId={triggerId}
              onMemberClick={handleGroupMemberClick}
              onOverflowClick={handleGroupOverflowClick}
              onClose={() => closeGroupDates(true)}
            />
          ) : null}
          <GroupDatesModal
            canonical={listing}
            summary={groupSummary}
            queryHashPrefix8={queryHashPrefix8}
            panelId={panelId}
            open={isMobile && isGroupDatesOpen}
            onClose={() => closeGroupDates(true)}
            onMemberClick={handleGroupMemberClick}
            onOverflowClick={handleGroupOverflowClick}
          />
        </>
      ) : null}
    </article>
  );
}

export default memo(ListingCardInner, arePropsEqual);
