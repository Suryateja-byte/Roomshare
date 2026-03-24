"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Star,
  ShieldCheck,
  CheckCircle2,
  LogOut,
  Edit2,
  Languages,
  MapPin,
  ChevronRight,
  Loader2,
  Home,
} from "lucide-react";
import { signOut } from "next-auth/react";
import UserAvatar from "@/components/UserAvatar";

// --- Types ---
type UserWithListings = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  bio: string | null;
  countryOfOrigin: string | null;
  languages: string[];
  isVerified: boolean;
  createdAt: Date;
  listings: Array<{
    id: string;
    title: string;
    description: string;
    price: number;
    availableSlots: number;
    images: string[];
    location: {
      city: string;
      state: string;
    } | null;
  }>;
};

// --- Components ---
interface BadgeProps {
  icon?: React.ComponentType<{ className?: string }>;
  text: string;
  variant?: "default" | "verified";
}

const Badge = ({ icon: Icon, text, variant = "default" }: BadgeProps) => {
  const styles =
    variant === "verified"
      ? "bg-green-50 text-green-700 border-green-200"
      : "bg-surface-canvas text-on-surface-variant border-outline-variant/20";

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${styles}`}
    >
      {Icon && <Icon className="w-3 h-3 flex-shrink-0" />}
      {text}
    </div>
  );
};

// Placeholder images for fallback when listing images fail to load
const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1484154218962-a1c002085d2f?auto=format&fit=crop&w=800&q=80",
];

const ListingCard = ({
  listing,
}: {
  listing: UserWithListings["listings"][0];
}) => {
  const [imageError, setImageError] = useState(false);

  const hasImages =
    listing.images && listing.images.length > 0 && listing.images[0];
  // Use a deterministic placeholder based on listing ID
  const placeholderIndex =
    listing.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    PLACEHOLDER_IMAGES.length;
  const imageUrl =
    hasImages && !imageError
      ? listing.images[0]
      : PLACEHOLDER_IMAGES[placeholderIndex];
  const showPlaceholder = !hasImages || imageError;

  const locationText = listing.location
    ? `${listing.location.city}, ${listing.location.state}`
    : "Location not specified";

  return (
    <Link href={`/listings/${listing.id}`}>
      <div className="group relative flex flex-col gap-3 p-3 rounded-2xl bg-surface-container-lowest border border-outline-variant/20 hover:border-outline-variant/40 shadow-ambient-sm hover:shadow-ambient transition-all cursor-pointer">
        <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-surface-container-high">
          <Image
            src={imageUrl}
            alt={listing.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            onError={() => setImageError(true)}
            loading="lazy"
          />
          {/* Show placeholder overlay when no images or image error */}
          {showPlaceholder && (
            <div className="absolute inset-0 bg-gradient-to-br from-surface-container-high to-surface-container-high/80 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-surface-container-high flex items-center justify-center mb-2">
                <Home
                  className="w-6 h-6 text-on-surface-variant"
                  strokeWidth={1.5}
                  fill="currentColor"
                  fillOpacity={0.1}
                />
              </div>
              <span className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
                No Photos
              </span>
            </div>
          )}
          <div className="absolute top-2 right-2 px-2 py-1 bg-surface-container-lowest/90 backdrop-blur-sm rounded-lg text-2xs font-bold uppercase tracking-wide text-green-600">
            {listing.availableSlots > 0 ? "Active" : "Full"}
          </div>
        </div>
        <div className="px-1">
          <h4 className="font-semibold text-on-surface leading-tight mb-1">
            {listing.title}
          </h4>
          <p className="text-xs text-on-surface-variant flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {locationText}
          </p>
          <p className="text-sm font-bold text-on-surface mt-2">
            ${listing.price}
            <span className="text-on-surface-variant font-normal">
              /mo
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
};

// --- Main Component ---
export default function ProfileClient({ user }: { user: UserWithListings }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleEdit = () => {
    window.location.href = "/profile/edit";
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await signOut({ callbackUrl: "/" });
  };

  // Loading skeleton when user data is incomplete
  if (!user || !user.id) {
    return (
      <div className="min-h-screen bg-surface-canvas font-sans pb-20 pt-20">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-10">
          <div className="bg-surface-container-lowest rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-8 md:p-12 shadow-ambient-sm border border-outline-variant/20 mb-8">
            <div className="flex flex-col md:flex-row gap-6 md:gap-8 md:items-start animate-pulse">
              {/* Avatar skeleton */}
              <div className="w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-surface-container-high mx-auto md:mx-0" />
              {/* Info skeleton */}
              <div className="flex-1 pt-0 md:pt-2 text-center md:text-left space-y-4">
                <div className="h-8 bg-surface-container-high rounded-lg w-48 mx-auto md:mx-0" />
                <div className="h-4 bg-surface-canvas rounded w-32 mx-auto md:mx-0" />
                <div className="h-8 bg-surface-canvas rounded-full w-36 mx-auto md:mx-0" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-8">
              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-ambient-sm border border-outline-variant/20 animate-pulse">
                <div className="h-6 bg-surface-container-high rounded w-24 mb-6" />
                <div className="space-y-4">
                  <div className="h-4 bg-surface-canvas rounded w-full" />
                  <div className="h-4 bg-surface-canvas rounded w-full" />
                  <div className="h-4 bg-surface-canvas rounded w-3/4" />
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-ambient-sm border border-outline-variant/20 animate-pulse">
                <div className="h-6 bg-surface-container-high rounded w-32 mb-4" />
                <div className="space-y-2">
                  <div className="h-4 bg-surface-canvas rounded w-full" />
                  <div className="h-4 bg-surface-canvas rounded w-5/6" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Format join date
  const joinedDate = new Date(user.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      data-testid="profile-page"
      className="min-h-screen bg-surface-canvas font-sans selection:bg-on-surface selection:text-white pb-20 pt-16"
    >
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6">
        {/* Profile Header */}
        <div className="bg-surface-container-lowest rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-8 md:p-12 shadow-ambient border border-outline-variant/20 mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-surface-canvas rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>

          <div className="relative z-10 flex flex-col md:flex-row gap-6 md:gap-8 md:items-start">
            {/* Avatar */}
            <div className="relative shrink-0 mx-auto md:mx-0">
              <div className="w-40 h-40 rounded-full ring-4 ring-surface-container-lowest shadow-ambient-lg">
                <UserAvatar image={user.image} name={user.name} size="2xl" />
              </div>
              {user.isVerified && (
                <div className="absolute bottom-2 right-2 bg-green-500 w-6 h-6 rounded-full border-4 border-surface-container-lowest flex items-center justify-center shadow-ambient-sm">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 pt-0 md:pt-2 text-center md:text-left">
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                <div>
                  <h1
                    data-testid="profile-name"
                    className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-on-surface tracking-tight mb-2"
                  >
                    {user.name || "User"}
                  </h1>
                  <p className="text-on-surface-variant font-medium mb-4">
                    {user.listings.length > 0 ? "Host" : "Tenant"}
                    {user.countryOfOrigin && ` • ${user.countryOfOrigin}`}
                  </p>

                  <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                    {user.isVerified ? (
                      <Badge
                        icon={ShieldCheck}
                        text="Identity Verified"
                        variant="verified"
                      />
                    ) : (
                      <Badge icon={ShieldCheck} text="Not Verified" />
                    )}
                  </div>
                </div>

                <div className="flex gap-3 justify-center md:justify-start">
                  <button
                    data-testid="edit-profile-link"
                    onClick={handleEdit}
                    className="h-10 px-6 rounded-full border border-outline-variant/20 text-sm font-bold text-on-surface hover:bg-surface-canvas transition-colors flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" /> Edit Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Sidebar - Info */}
          <div className="lg:col-span-1 space-y-8">
            {/* Trust & Verification */}
            <div className="bg-surface-container-lowest rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-ambient-sm border border-outline-variant/20">
              <h3 className="font-display text-lg font-bold text-on-surface mb-6 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 flex-shrink-0" /> Trust
              </h3>
              <ul className="space-y-4">
                <li className="flex items-center justify-between text-sm">
                  <span className="text-on-surface-variant">
                    Identity
                  </span>
                  {user.isVerified ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <span className="text-on-surface-variant/50">
                      Pending
                    </span>
                  )}
                </li>
                <li className="flex items-center justify-between text-sm">
                  <span className="text-on-surface-variant">
                    Email address
                  </span>
                  {user.emailVerified ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <span className="text-on-surface-variant/50">
                      Pending
                    </span>
                  )}
                </li>
                <li
                  role="separator"
                  aria-hidden="true"
                  className="py-2"
                />
                <li className="flex items-center justify-between text-sm">
                  <span className="text-on-surface font-medium">
                    Joined
                  </span>
                  <span className="text-on-surface-variant">
                    {joinedDate}
                  </span>
                </li>
              </ul>
            </div>

            {/* Details */}
            {(user.countryOfOrigin || user.languages.length > 0) && (
              <div className="bg-surface-container-lowest rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-ambient-sm border border-outline-variant/20">
                <h3 className="font-display text-lg font-bold text-on-surface mb-6">
                  About
                </h3>
                <ul className="space-y-5">
                  {user.countryOfOrigin && (
                    <li className="flex items-start gap-3 text-sm">
                      <MapPin className="w-5 h-5 text-on-surface-variant mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="block text-on-surface font-medium">
                          Country
                        </span>
                        <span className="text-on-surface-variant">
                          {user.countryOfOrigin}
                        </span>
                      </div>
                    </li>
                  )}
                  {user.languages.length > 0 && (
                    <li className="flex items-start gap-3 text-sm">
                      <Languages className="w-5 h-5 text-on-surface-variant mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="block text-on-surface font-medium">
                          Languages
                        </span>
                        <span className="text-on-surface-variant">
                          {user.languages.join(", ")}
                        </span>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Reviews About You */}
            <Link
              href={`/users/${user.id}#reviews`}
              className="block bg-surface-container-lowest rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-ambient-sm border border-outline-variant/20 hover:border-outline-variant/40 hover:shadow-ambient transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <Star className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-on-surface">
                      Reviews About You
                    </h3>
                    <p className="text-sm text-on-surface-variant">
                      See what others are saying
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-1 transition-all" />
              </div>
            </Link>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full py-4 text-sm font-bold text-red-500 hover:bg-red-50 rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoggingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              {isLoggingOut ? "Logging out..." : "Log Out"}
            </button>
          </div>

          {/* Right Content - Main */}
          <div className="lg:col-span-2 space-y-8">
            {/* Bio */}
            {user.bio && (
              <div className="bg-surface-container-lowest rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-ambient-sm border border-outline-variant/20">
                <h3 className="font-display text-lg font-bold text-on-surface mb-4">
                  About {user.name?.split(" ")[0]}
                </h3>
                <p
                  data-testid="profile-bio"
                  className="text-on-surface-variant leading-relaxed font-light text-base sm:text-lg"
                >
                  {user.bio}
                </p>
              </div>
            )}

            {/* Listings */}
            <div>
              <h3 className="font-display text-lg font-bold text-on-surface mb-6 px-2">
                {user.name?.split(" ")[0]}&apos;s Listings
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {user.listings.length > 0 ? (
                  user.listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))
                ) : (
                  <div className="col-span-2 bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-ambient-sm p-8 text-center">
                    <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mx-auto mb-4">
                      <MapPin className="w-8 h-8 text-on-surface-variant/50" />
                    </div>
                    <h4 className="font-display font-semibold text-on-surface mb-2">
                      No listings yet
                    </h4>
                    <p className="text-on-surface-variant text-sm mb-6 max-w-xs mx-auto">
                      Have a room to share? List your first space and start
                      earning as a host.
                    </p>
                    <Link
                      href="/listings/create"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-full font-medium hover:bg-primary/90 transition-colors"
                    >
                      Create your first listing
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}

                {/* Add New Listing Placeholder - only show when user has some listings */}
                {user.listings.length > 0 && (
                  <Link
                    href="/listings/create"
                    className="group flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-outline-variant/20 hover:border-outline-variant/40 hover:bg-surface-canvas transition-all cursor-pointer min-h-[200px]"
                  >
                    <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="text-2xl text-on-surface-variant font-light">
                        +
                      </span>
                    </div>
                    <span className="text-sm font-bold text-on-surface-variant">
                      List a new room
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
