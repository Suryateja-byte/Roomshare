"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  ShieldCheck,
  Maximize2,
  Bed,
  ChevronRight,
  Star,
  Zap,
  Pencil,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getAmenityIcon } from "@/lib/amenityIcons";
import { getLanguageName } from "@/lib/languages";
import ListingCard from "@/components/listings/ListingCard";
import type { Listing } from "@/components/listings/ListingCard";

// Import existing functional components
import ImageGallery from "@/components/ImageGallery";
import BookingForm from "@/components/BookingForm";
import ReviewForm from "@/components/ReviewForm";
import ReviewList from "@/components/ReviewList";
import ContactHostButton from "@/components/ContactHostButton";
import DeleteListingButton from "@/components/DeleteListingButton";
import ReportButton from "@/components/ReportButton";
import ShareListingButton from "@/components/ShareListingButton";
import SaveListingButton from "@/components/SaveListingButton";
import ListingStatusToggle from "@/components/ListingStatusToggle";
import ListingFreshnessCheck from "@/components/ListingFreshnessCheck";
import UserAvatar from "@/components/UserAvatar";
import RoomPlaceholder from "@/components/listings/RoomPlaceholder";
import { SlotBadge } from "@/components/listings/SlotBadge";
import { Badge } from "@/components/ui/badge";
import { useSession } from "next-auth/react";
import ListingViewTracker from "./ListingViewTracker";

// Lazy-load NeighborhoodChat to avoid loading framer-motion + AI SDK on initial page load
// This defers ~200KB+ of JS until after the page is interactive
const NeighborhoodChat = dynamic(
  () => import("@/components/NeighborhoodChat"),
  {
    ssr: false,
    loading: () => null, // Chat widget appears after load, no placeholder needed
  }
);

// Lazy-load NearbyPlacesSection (MapLibre GL + Radar) to avoid loading ~150KB+ on initial page load
const NearbyPlacesSection = dynamic(
  () => import("@/components/nearby/NearbyPlacesSection"),
  {
    ssr: false,
    loading: () => (
      <div className="mt-8 pt-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-surface-container-high rounded-lg w-40" />
          <div className="h-[400px] bg-surface-canvas rounded-lg" />
        </div>
      </div>
    ),
  }
);

// Types
interface Review {
  id: string;
  rating: number;
  comment: string;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  response?: {
    id: string;
    content: string;
  } | null;
}

interface BookedDateRange {
  startDate: string;
  endDate: string;
}

interface ListingPageClientProps {
  listing: {
    id: string;
    title: string;
    description: string;
    price: number;
    images: string[];
    amenities: string[];
    householdLanguages: string[];
    totalSlots: number;
    availableSlots: number;
    bookingMode: string;
    holdTtlMinutes: number;
    status: string;
    viewCount: number;
    genderPreference: string | null;
    householdGender: string | null;
    location: {
      city: string;
      state: string;
    } | null;
    owner: {
      id: string;
      name: string | null;
      image: string | null;
      bio: string | null;
      isVerified: boolean;
      createdAt: Date;
    };
    ownerId: string;
  };
  reviews: Review[];
  isOwner: boolean;
  isLoggedIn: boolean;
  userHasBooking: boolean;
  userExistingReview: {
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
  } | null;
  bookedDates: BookedDateRange[];
  holdEnabled?: boolean;
  coordinates: { lat: number; lng: number } | null;
  similarListings?: Listing[];
  viewToken?: string;
}

// Status badge with pulse animation
function StatusBadge({ status }: { status: string }) {
  const config = {
    ACTIVE: {
      bg: "bg-green-50",
      border: "border-green-100",
      text: "text-green-700",
      dot: "bg-green-600",
      label: "Active Listing",
    },
    PAUSED: {
      bg: "bg-yellow-50",
      border: "border-yellow-100",
      text: "text-yellow-700",
      dot: "bg-yellow-600",
      label: "Paused",
    },
    RENTED: {
      bg: "bg-blue-50",
      border: "border-blue-100",
      text: "text-blue-700",
      dot: "bg-blue-600",
      label: "Rented",
    },
  }[status] || {
    bg: "bg-surface-canvas",
    border: "border-outline-variant/20",
    text: "text-on-surface-variant",
    dot: "bg-on-surface-variant",
    label: status,
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border",
        config.bg,
        config.border,
        config.text
      )}
    >
      <span
        className={cn("w-1.5 h-1.5 rounded-full animate-pulse", config.dot)}
      />
      {config.label}
    </div>
  );
}

// Simple info stat item for the stats bar
function InfoStat({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center text-on-surface-variant font-medium text-sm">
      <Icon className="w-4 h-4 mr-2 text-on-surface-variant" />
      {children}
    </div>
  );
}

// Stat card for management sidebar
function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-surface-canvas p-3 rounded-xl border border-outline-variant/20 text-center">
      <span className="block text-2xl font-bold text-on-surface">
        {value}
      </span>
      <span className="text-xs text-on-surface-variant font-medium">
        {label}
      </span>
    </div>
  );
}

export default function ListingPageClient({
  listing,
  reviews,
  isOwner,
  isLoggedIn,
  userHasBooking,
  userExistingReview,
  bookedDates,
  holdEnabled,
  coordinates,
  similarListings,
  viewToken,
}: ListingPageClientProps) {
  const { data: session, status: sessionStatus } = useSession();
  const hasImages = listing.images && listing.images.length > 0;
  const resolvedUserId = session?.user?.id ?? null;
  const resolvedIsOwner = isOwner || resolvedUserId === listing.ownerId;
  const resolvedIsLoggedIn = isLoggedIn || sessionStatus === "authenticated";
  const viewerReady = isOwner || sessionStatus !== "loading";
  const canRenderGuestControls = viewerReady && !resolvedIsOwner;
  const [viewerState, setViewerState] = useState({
    hasBookingHistory: userHasBooking,
    existingReview: userExistingReview,
    loaded: true,
  });

  // Format gender preference for display
  const formatGenderPreference = (pref: string | null) => {
    if (!pref) return null;
    switch (pref) {
      case "MALE_ONLY":
        return "Male Identifying Only";
      case "FEMALE_ONLY":
        return "Female Identifying Only";
      case "NO_PREFERENCE":
        return "Any Gender / All Welcome";
      default:
        return pref;
    }
  };

  // Format household gender for display
  const formatHouseholdGender = (gender: string | null) => {
    if (!gender) return null;
    switch (gender) {
      case "ALL_MALE":
        return "All Male";
      case "ALL_FEMALE":
        return "All Female";
      case "MIXED":
        return "Mixed (Co-ed)";
      default:
        return gender;
    }
  };

  useEffect(() => {
    if (resolvedIsOwner) {
      setViewerState({
        hasBookingHistory: false,
        existingReview: null,
        loaded: true,
      });
      return;
    }

    if (sessionStatus === "loading") {
      return;
    }

    if (!resolvedIsLoggedIn) {
      setViewerState({
        hasBookingHistory: false,
        existingReview: null,
        loaded: true,
      });
      return;
    }

    const controller = new AbortController();
    setViewerState((current) => ({ ...current, loaded: false }));

    void (async () => {
      try {
        const response = await fetch(
          `/api/listings/${listing.id}/viewer-state`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load listing viewer state");
        }

        const data = (await response.json()) as {
          hasBookingHistory?: boolean;
          existingReview?: ListingPageClientProps["userExistingReview"];
        };

        setViewerState({
          hasBookingHistory: data.hasBookingHistory === true,
          existingReview: data.existingReview ?? null,
          loaded: true,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setViewerState({
          hasBookingHistory: false,
          existingReview: null,
          loaded: true,
        });
      }
    })();

    return () => controller.abort();
  }, [listing.id, resolvedIsLoggedIn, resolvedIsOwner, sessionStatus]);

  return (
    <div className="min-h-screen bg-surface-canvas pb-20">
      <ListingViewTracker listingId={listing.id} ownerId={listing.ownerId} viewToken={viewToken} />

      {/* Real-time freshness check for non-owners */}
      {canRenderGuestControls && (
        <ListingFreshnessCheck listingId={listing.id} />
      )}

      <div className="pt-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs & Title Header */}
          <div className="flex justify-between items-end mb-6">
            <div className="flex flex-col gap-1">
              {/* Breadcrumb */}
              <nav aria-label="Breadcrumb" className="mb-1">
                <ol className="flex items-center gap-1.5 text-sm text-on-surface-variant font-medium">
                  <li><Link href="/" className="hover:text-on-surface transition-colors">Home</Link></li>
                  <li aria-hidden="true"><ChevronRight className="w-3 h-3" /></li>
                  <li><Link href="/search" className="hover:text-on-surface transition-colors">Search</Link></li>
                  <li aria-hidden="true"><ChevronRight className="w-3 h-3" /></li>
                  <li aria-current="page" className="text-on-surface font-semibold truncate max-w-[200px]">{listing.title}</li>
                </ol>
              </nav>
              {/* Title */}
              <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight text-on-surface">
                {listing.title}
              </h1>
            </div>
            {/* Action buttons */}
            <div className="flex gap-2">
              <ShareListingButton
                listingId={listing.id}
                title={listing.title}
              />
              {canRenderGuestControls && resolvedIsLoggedIn && (
                <SaveListingButton listingId={listing.id} />
              )}
              {canRenderGuestControls && (
                <ReportButton listingId={listing.id} />
              )}
            </div>
          </div>

          {/* Hero Gallery */}
          <div className="mb-12">
            {hasImages ? (
              <div className="relative group/gallery">
                <ImageGallery images={listing.images} title={listing.title} />
                <div className="absolute bottom-6 right-6 px-4 py-2 bg-surface-container-lowest/90 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-on-surface shadow-ambient flex items-center gap-2 pointer-events-none opacity-0 group-hover/gallery:opacity-100 transition-opacity">
                  <Maximize2 className="w-3 h-3" /> Click to enlarge
                </div>
              </div>
            ) : (
              <RoomPlaceholder />
            )}
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Left Column: Details */}
            <div className="lg:col-span-2 space-y-12">
              {/* Quick Stats Bar */}
              <div className="flex flex-wrap items-center gap-6 pb-8">
                {viewerReady && resolvedIsOwner && (
                  <>
                    <ListingStatusToggle
                      listingId={listing.id}
                      currentStatus={
                        listing.status as "ACTIVE" | "PAUSED" | "RENTED"
                      }
                    />
                    <div className="h-4 w-[1px] bg-outline-variant/20" />
                  </>
                )}
                {(!viewerReady || !resolvedIsOwner) && (
                  <>
                    <StatusBadge status={listing.status} />
                    <div className="h-4 w-[1px] bg-outline-variant/20" />
                  </>
                )}
                <InfoStat icon={MapPin}>
                  {listing.location?.city}, {listing.location?.state}
                </InfoStat>
                <SlotBadge
                  availableSlots={listing.availableSlots}
                  totalSlots={listing.totalSlots}
                />
                {listing.bookingMode === "WHOLE_UNIT" && (
                  <Badge variant="purple">Whole Unit</Badge>
                )}
                <div className="h-4 w-[1px] bg-outline-variant/20" />
                <InfoStat icon={Bed}>Furnished</InfoStat>
              </div>

              {/* About */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold font-display text-on-surface">
                  About this place
                </h2>
                <p className="text-on-surface-variant leading-relaxed text-lg font-light whitespace-pre-line">
                  {listing.description}
                </p>
              </div>

              {/* Amenities */}
              {listing.amenities.length > 0 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold font-display text-on-surface">
                    What this place offers
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                    {listing.amenities.map((amenity, i) => {
                      const AmenityIcon = getAmenityIcon(amenity);
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-4 p-4 rounded-2xl bg-surface-canvas/50 hover:bg-surface-container-lowest hover:shadow-ambient transition-all duration-300"
                        >
                          <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            {AmenityIcon ? (
                              <AmenityIcon
                                className="w-5 h-5"
                                strokeWidth={1.5}
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-surface-container-high" />
                            )}
                          </div>
                          <span className="text-on-surface-variant font-medium">
                            {amenity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nearby Places Section (Radar + MapLibre) */}
              {process.env.NEXT_PUBLIC_NEARBY_ENABLED === "true" &&
                coordinates && (
                  <NearbyPlacesSection
                    listingLat={coordinates.lat}
                    listingLng={coordinates.lng}
                  />
                )}

              {/* Household Details */}
              {(listing.householdLanguages.length > 0 ||
                listing.genderPreference ||
                listing.householdGender) && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold font-display text-on-surface">
                    Household Details
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {listing.genderPreference && (
                      <div className="p-5 rounded-2xl bg-surface-container-lowest shadow-ambient-sm">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                          Gender Preference
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          <span className="text-lg font-semibold text-on-surface">
                            {formatGenderPreference(listing.genderPreference)}
                          </span>
                        </div>
                      </div>
                    )}
                    {listing.householdGender && (
                      <div className="p-5 rounded-2xl bg-surface-container-lowest shadow-ambient-sm">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                          Current Household
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-tertiary" />
                          <span className="text-lg font-semibold text-on-surface">
                            {formatHouseholdGender(listing.householdGender)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  {listing.householdLanguages.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                        Languages Spoken
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {listing.householdLanguages.map((lang, i) => (
                          <span
                            key={i}
                            className="px-4 py-1.5 bg-surface-container-high text-on-surface-variant rounded-full text-sm font-medium"
                          >
                            {getLanguageName(lang)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Host Section */}
              <div className="pt-8">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-surface-container-high flex-shrink-0 border-2 border-surface-container-lowest shadow-ambient">
                    <UserAvatar
                      image={listing.owner.image}
                      name={listing.owner.name}
                      size="xl"
                      className="w-full h-full"
                    />
                  </div>
                  <div className="flex-1">
                    <Link
                      href={`/users/${listing.ownerId}`}
                      className="hover:underline"
                    >
                      <h3 className="text-lg font-bold font-display text-on-surface">
                        Hosted by {listing.owner.name || "User"}
                      </h3>
                    </Link>
                    <p className="text-on-surface-variant text-sm mb-2">
                      Joined in{" "}
                      {new Date(listing.owner.createdAt).getFullYear()}
                      {listing.owner.bio &&
                        ` • ${listing.owner.bio.slice(0, 50)}${listing.owner.bio.length > 50 ? "..." : ""}`}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {listing.owner.isVerified && (
                        <div className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                          Identity verified
                        </div>
                      )}
                      {listing.owner.isVerified && reviews.length >= 5 && (
                        <>
                          <span className="text-outline-variant/20">
                            •
                          </span>
                          <div className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
                            <Star className="w-3.5 h-3.5 text-primary" />
                            Superhost
                          </div>
                        </>
                      )}
                    </div>
                    {canRenderGuestControls && (
                      <div className="mt-4">
                        <ContactHostButton listingId={listing.id} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Reviews Section */}
              <div className="space-y-6">
                <h2 className="text-xl font-bold font-display flex items-center gap-2 text-on-surface">
                  Reviews
                  <span className="text-lg font-normal text-on-surface-variant">
                    ({reviews.length})
                  </span>
                </h2>

                <div className="mb-8">
                  <ReviewList reviews={reviews} isOwner={resolvedIsOwner} />
                </div>

                {canRenderGuestControls && viewerState.loaded && (
                  <ReviewForm
                    listingId={listing.id}
                    isLoggedIn={resolvedIsLoggedIn}
                    hasExistingReview={!!viewerState.existingReview}
                    hasBookingHistory={viewerState.hasBookingHistory}
                    existingReview={viewerState.existingReview || undefined}
                  />
                )}
              </div>

              {/* Similar Listings Section */}
              {similarListings && similarListings.length > 0 && (
                <div className="pt-8">
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold font-display text-on-surface">
                      Similar listings
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {similarListings.map((similarListing) => (
                        <ListingCard
                          key={similarListing.id}
                          listing={similarListing}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Sticky Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Owner Management Card */}
                {resolvedIsOwner && (
                  <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-ambient-lg">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-bold font-display text-on-surface">
                        Manage Listing
                      </h3>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    </div>

                    {/* Status Toggle */}
                    <div className="mb-6">
                      <ListingStatusToggle
                        listingId={listing.id}
                        currentStatus={
                          listing.status as "ACTIVE" | "PAUSED" | "RENTED"
                        }
                      />
                    </div>

                    {/* Price */}
                    <div className="mb-6 text-center">
                      <span className="text-2xl font-bold font-display text-on-surface">
                        ${listing.price?.toLocaleString()}
                      </span>
                      <span className="text-sm text-on-surface-variant">
                        /mo
                      </span>
                    </div>

                    {/* Stats Preview */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <StatCard label="Views" value={listing.viewCount} />
                      <StatCard label="Reviews" value={reviews.length} />
                    </div>

                    <div className="space-y-3">
                      <Link
                        href={`/listings/${listing.id}/edit`}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-primary to-primary-container hover:opacity-90 text-white font-medium py-3.5 px-4 rounded-xl transition-all shadow-ambient active:scale-[0.98]"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit Listing
                      </Link>
                      <DeleteListingButton listingId={listing.id} />
                    </div>

                    <div className="mt-6 pt-6 text-center">
                      <button
                        onClick={() =>
                          window.open(
                            `/listings/${listing.id}?preview=true`,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                        className="text-xs text-on-surface-variant hover:text-on-surface underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View listing as guest
                      </button>
                    </div>
                  </div>
                )}

                {/* Boost Visibility Card (Owner only) */}
                {resolvedIsOwner && (
                  <div className="bg-surface-container-high rounded-2xl p-5 border border-outline-variant/20">
                    <div className="flex gap-3">
                      <div className="p-2 bg-on-surface-variant/10 text-on-surface-variant rounded-lg h-fit">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-on-surface text-sm mb-1">
                          Boost Visibility
                        </h4>
                        <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
                          Get up to 3x more views by promoting this listing.
                        </p>
                        <button
                          disabled
                          className="text-xs font-semibold text-on-surface-variant/60 cursor-not-allowed"
                        >
                          Coming Q3 2026
                        </button>
                        <p className="text-xs text-on-surface-variant mt-1">
                          <Link href="/notifications" className="underline underline-offset-2 hover:text-on-surface">
                            Get notified
                          </Link>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Guest Booking Card */}
                {canRenderGuestControls && (
                  <>
                    <BookingForm
                      listingId={listing.id}
                      price={listing.price}
                      ownerId={listing.ownerId}
                      isOwner={resolvedIsOwner}
                      isLoggedIn={resolvedIsLoggedIn}
                      status={listing.status as "ACTIVE" | "PAUSED" | "RENTED"}
                      bookedDates={bookedDates}
                      holdEnabled={holdEnabled}
                      totalSlots={listing.totalSlots}
                      availableSlots={listing.availableSlots}
                      bookingMode={listing.bookingMode}
                      holdTtlMinutes={listing.holdTtlMinutes}
                    />
                    <div className="[&>button]:bg-transparent [&>button]:border [&>button]:border-outline-variant/30 [&>button]:text-on-surface [&>button]:hover:bg-surface-container-high [&>button]:shadow-none">
                      <ContactHostButton listingId={listing.id} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Neighborhood AI Chat Widget */}
      {coordinates && (
        <NeighborhoodChat
          listingId={listing.id}
          latitude={coordinates.lat}
          longitude={coordinates.lng}
        />
      )}
    </div>
  );
}
