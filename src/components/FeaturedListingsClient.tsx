"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Home, SlidersHorizontal } from "lucide-react";
import FavoriteButton from "@/components/FavoriteButton";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  availableSlots: number;
  totalSlots: number;
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  genderPreference?: string;
  householdGender?: string;
  leaseDuration?: string;
  roomType?: string;
  moveInDate?: Date;
  ownerId?: string;
  avgRating?: number;
  reviewCount?: number;
  location: {
    address?: string;
    city: string;
    state: string;
    zip?: string;
    lat: number;
    lng: number;
  };
}

interface FeaturedListingsClientProps {
  listings: Listing[];
}

const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=80",
  "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1000&q=80",
  "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80",
];

const FILTERS = [
  "All",
  "Shared rooms",
  "Private rooms",
  "Whole places",
  "Short stays",
] as const;

type Filter = (typeof FILTERS)[number];

export default function FeaturedListingsClient({
  listings,
}: FeaturedListingsClientProps) {
  const [filter, setFilter] = useState<Filter>("All");

  const visibleListings = useMemo(() => {
    if (filter === "All") return listings;
    return listings.filter((listing) => listingCategory(listing) === filter);
  }, [filter, listings]);

  if (!listings || listings.length === 0) {
    return (
      <section
        data-testid="featured-listings-section"
        className="bg-surface-canvas py-20 md:py-28"
      >
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Home className="h-6 w-6" strokeWidth={1.7} />
            </div>
            <h2 className="font-display text-4xl font-normal tracking-tight text-on-surface md:text-6xl">
              Be the first to share.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-on-surface-variant">
              No rooms are listed yet. Share your space and find the right
              roommate today.
            </p>
            <Button asChild className="mt-8 rounded-full">
              <Link href="/listings/create">
                List Your Room
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="featured-listings-section"
      aria-labelledby="featured-listings-heading"
      className="bg-surface-canvas py-20 md:py-28"
    >
      <div className="container">
        <div className="mb-9 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_rgb(154_64_39/0.12)]" />
              <span className="text-micro-label text-primary">
                Just listed · updated hourly
              </span>
            </div>
            <h2
              id="featured-listings-heading"
              className="font-display text-4xl font-normal leading-[1.04] tracking-tight text-on-surface md:text-6xl"
            >
              Rooms with <em className="text-primary">good light</em> and better
              people.
            </h2>
          </div>
          <Link
            href="/search"
            className="inline-flex min-h-8 items-center gap-2 text-sm font-semibold text-on-surface underline-offset-4 hover:text-primary hover:underline"
          >
            Browse the full atlas
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                filter === item
                  ? "bg-on-surface text-surface-canvas"
                  : "bg-surface-container-lowest text-on-surface shadow-[inset_0_0_0_1px_rgb(220_193_185/0.35)] hover:bg-surface-container-high"
              }`}
              aria-pressed={filter === item}
            >
              {item}
            </button>
          ))}
          <div className="hidden flex-1 md:block" />
          <div className="hidden shrink-0 items-center gap-2 rounded-full bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface-variant shadow-[inset_0_0_0_1px_rgb(220_193_185/0.35)] md:flex">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Sort: Best match
          </div>
        </div>

        {visibleListings.length === 0 ? (
          <div className="rounded-[1.25rem] bg-surface-container-high p-8 text-center">
            <p className="text-on-surface-variant">
              No {filter.toLowerCase()} are featured right now.
            </p>
            <Button asChild variant="outline" className="mt-5 rounded-full">
              <Link href="/search">Search all listings</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-x-6 gap-y-10 md:grid-cols-12">
            {visibleListings.map((listing, index) => {
              const big = index % 5 === 0;
              return (
                <EditorialListingCard
                  key={listing.id}
                  listing={listing}
                  big={big}
                  index={index}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function EditorialListingCard({
  listing,
  big,
  index,
}: {
  listing: Listing;
  big: boolean;
  index: number;
}) {
  const image =
    listing.images?.[0] ||
    PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length];
  const category = listingCategory(listing);
  const location = [listing.location.city, listing.location.state]
    .filter(Boolean)
    .join(", ");
  const moveIn = listing.moveInDate
    ? new Date(listing.moveInDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;
  const match = 78 + ((listing.id.length + index * 7) % 17);
  const tags = [
    index < 2 ? "New" : null,
    listing.availableSlots > 0 ? "Open" : null,
    (listing.reviewCount ?? 0) > 0 ? "Reviewed" : null,
  ].filter(Boolean) as string[];
  const detailLine = [
    category,
    availabilityText(listing),
    moveIn ? `Move-in ${moveIn}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      data-testid="listing-card"
      data-listing-id={listing.id}
      className={`group ${big ? "md:col-span-6" : "md:col-span-3"} col-span-1`}
    >
      <div
        className={`relative overflow-hidden rounded-[1.125rem] bg-surface-container-high ${
          big ? "h-[26rem]" : "h-[19rem]"
        }`}
      >
        <Link
          href={`/listings/${listing.id}`}
          className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
          aria-label={`${listing.title} in ${location}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={`${listing.title} in ${location}`}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            loading={index < 2 ? "eager" : "lazy"}
          />
          <span className="absolute inset-0 bg-gradient-to-t from-on-surface/40 via-transparent to-transparent" />
        </Link>

        <div className="absolute left-3 right-3 top-3 z-10 flex items-center gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-canvas/95 px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-on-surface shadow-ambient-sm backdrop-blur"
            >
              {tag}
            </span>
          ))}
          <div className="flex-1" />
          <FavoriteButton
            listingId={listing.id}
            className="min-h-[2.25rem] min-w-[2.25rem] p-0"
          />
        </div>

        <div className="absolute bottom-3 left-3 z-10 rounded-full bg-surface-canvas/95 px-4 py-2 text-sm font-semibold text-on-surface shadow-ambient-sm backdrop-blur">
          <span className="font-display text-lg italic">
            {formatPrice(listing.price)}
          </span>
          <span className="ml-2 text-on-surface-variant">/mo</span>
        </div>

        {big ? (
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-full bg-surface-canvas/95 py-1.5 pl-1.5 pr-4 text-sm font-semibold text-on-surface shadow-ambient-sm backdrop-blur">
            <MiniRing pct={match} />
            <span>
              <span className="font-display text-base italic">{match}</span>{" "}
              match
            </span>
          </div>
        ) : null}
      </div>

      <div className="pt-4">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="line-clamp-1 text-base font-semibold text-on-surface">
            <Link
              href={`/listings/${listing.id}`}
              className="inline-flex min-h-8 items-center hover:underline"
            >
              {listing.title}
            </Link>
          </h3>
          <span className="shrink-0 text-xs text-on-surface-variant">
            {listing.totalSlots} slot{listing.totalSlots === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-on-surface-variant">
          {location} ·{" "}
          <span className="font-medium text-tertiary">{detailLine}</span>
        </p>
        {big ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {listing.amenities.slice(0, 4).map((amenity) => (
              <span
                key={amenity}
                className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1 text-[0.7rem] font-medium text-on-surface-variant"
              >
                <Check className="h-3 w-3 text-primary" />
                {amenity}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function listingCategory(listing: Listing): Filter {
  const roomType = listing.roomType?.toLowerCase() ?? "";
  const lease = listing.leaseDuration?.toLowerCase() ?? "";

  if (lease.includes("month") && !lease.includes("12")) return "Short stays";
  if (roomType.includes("shared")) return "Shared rooms";
  if (roomType.includes("entire") || roomType.includes("whole")) {
    return "Whole places";
  }
  return "Private rooms";
}

function availabilityText(listing: Listing) {
  if (listing.availableSlots <= 0) return "Join waitlist";
  if (listing.availableSlots === listing.totalSlots) return "All slots open";
  return `${listing.availableSlots} of ${listing.totalSlots} open`;
}

function MiniRing({ pct }: { pct: number }) {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <span className="relative block h-[30px] w-[30px]">
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="15"
          cy="15"
          r={radius}
          stroke="rgb(27 28 25 / 0.1)"
          strokeWidth="2"
          fill="none"
        />
        <circle
          cx="15"
          cy="15"
          r={radius}
          stroke="var(--color-primary)"
          strokeLinecap="round"
          strokeWidth="2"
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
    </span>
  );
}
