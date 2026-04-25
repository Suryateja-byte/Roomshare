"use client";

import Link from "next/link";
import Image from "next/image";
import { Home, MapPin, Star, X } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import {
  getAvailabilityPresentation,
  type AvailabilityPublicAvailability,
} from "@/lib/search/availability-presentation";
import type { GroupContextPresentation } from "@/lib/search-types";

type PreviewListing = {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  totalSlots?: number;
  images?: string[];
  avgRating?: number;
  reviewCount?: number;
  roomType?: string;
  publicAvailability?: AvailabilityPublicAvailability;
  groupContext?: GroupContextPresentation | null;
  location: {
    city?: string;
    state?: string;
  };
};

interface DesktopListingPreviewCardProps {
  listing: PreviewListing;
  href: string;
  isDarkMode: boolean;
  onClose: () => void;
  cardRef?: Ref<HTMLDivElement>;
  closeButtonRef?: Ref<HTMLButtonElement>;
}

const ROOM_TYPE_LABELS: Record<string, string> = {
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

function formatRoomType(roomType?: string): string | null {
  if (!roomType) return null;
  return ROOM_TYPE_LABELS[roomType] || roomType;
}

function formatLocationLine(location: PreviewListing["location"]): string | null {
  const city = location.city?.trim();
  const state = location.state?.trim();
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return null;
}

export default function DesktopListingPreviewCard({
  listing,
  href,
  isDarkMode,
  onClose,
  cardRef,
  closeButtonRef,
}: DesktopListingPreviewCardProps) {
  const roomTypeLabel = formatRoomType(listing.roomType);
  const locationLine = formatLocationLine(listing.location);
  const availabilityPresentation = getAvailabilityPresentation({
    availableSlots: listing.availableSlots,
    totalSlots: listing.totalSlots,
    publicAvailability: listing.publicAvailability,
    groupContext: listing.groupContext,
  });
  const hasRating =
    Number.isFinite(listing.avgRating) && (listing.reviewCount ?? 0) > 0;

  return (
    <div
      key={listing.id}
      ref={cardRef}
      data-testid="map-popup-card"
      className={`w-[304px] overflow-hidden rounded-2xl border animate-in fade-in slide-in-from-bottom-2 duration-200 ${
        isDarkMode
          ? "border-outline-variant/10 bg-on-surface shadow-[0_18px_48px_-22px_rgba(0,0,0,0.75)]"
          : "border-outline-variant/20 bg-surface-container-lowest shadow-[0_20px_50px_-24px_rgba(15,23,42,0.28)]"
      }`}
    >
      <div
        className={`relative aspect-[16/10] overflow-hidden ${
          isDarkMode ? "bg-surface-container-high" : "bg-surface-container-high"
        }`}
      >
        {listing.images?.[0] ? (
          <Image
            src={listing.images[0]}
            alt={listing.title}
            fill
            sizes="304px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Home className="h-9 w-9 text-on-surface-variant" />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          data-testid="map-popup-close"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-on-surface/60 text-white backdrop-blur-sm transition-colors hover:bg-on-surface/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Close listing preview"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
          {roomTypeLabel ? (
            <span className="inline-flex rounded-full bg-surface-container-lowest/92 px-2.5 py-1 text-[11px] font-semibold text-on-surface shadow-ambient-sm">
              {roomTypeLabel}
            </span>
          ) : null}
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-ambient-sm ${
              availabilityPresentation.state === "available" ||
              availabilityPresentation.state === "partial"
                ? "bg-emerald-500 text-white"
                : "bg-on-surface text-white"
            }`}
          >
            {availabilityPresentation.primaryLabel}
          </span>
        </div>
      </div>

        <div className="space-y-3 p-4">
        <div className="space-y-1.5">
          {hasRating ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
              <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
              <span className={isDarkMode ? "text-white" : "text-on-surface"}>
                {listing.avgRating!.toFixed(1)}
              </span>
              <span>{`(${listing.reviewCount})`}</span>
            </div>
          ) : null}

          <h3
            className={`line-clamp-2 text-[15px] font-semibold leading-tight ${
              isDarkMode ? "text-white" : "text-on-surface"
            }`}
          >
            {listing.title}
          </h3>

          {locationLine ? (
            <p className="flex items-center gap-1.5 text-sm text-on-surface-variant">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-1">{locationLine}</span>
            </p>
          ) : null}
          {availabilityPresentation.secondaryGroupLabel ? (
            <p className="text-xs font-medium text-on-surface-variant">
              {availabilityPresentation.secondaryGroupLabel}
            </p>
          ) : null}
        </div>

        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-xl font-bold ${
              isDarkMode ? "text-white" : "text-on-surface"
            }`}
          >
            {formatPrice(listing.price)}
          </span>
          <span className="text-sm text-on-surface-variant">/month</span>
        </div>

        <Link href={href} className="block">
          <Button
            size="sm"
            data-testid="map-popup-view-details"
            className={`h-10 w-full rounded-xl text-sm font-medium ${
              isDarkMode
                ? "bg-surface-container-lowest text-on-surface hover:bg-surface-container-high"
                : "bg-on-surface text-white hover:bg-on-surface"
            }`}
          >
            View details
          </Button>
        </Link>
      </div>
    </div>
  );
}
