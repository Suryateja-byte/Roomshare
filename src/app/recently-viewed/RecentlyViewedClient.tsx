"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, Search, MapPin, Home } from "lucide-react";
import { formatPrice } from "@/lib/format";

// Placeholder images for when listing has no images
const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1484154218962-a1c002085d2f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1502005229766-528352261b79?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80",
];

interface RecentListing {
  id: string;
  title: string | null;
  description: string;
  price: number | null;
  images: string[];
  viewedAt: Date;
  location?: {
    city: string;
    state: string;
  } | null;
}

interface RecentlyViewedClientProps {
  initialListings: RecentListing[];
}

export default function RecentlyViewedClient({
  initialListings,
}: RecentlyViewedClientProps) {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-svh bg-surface-canvas pt-4 pb-20">
      <div className="container mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-on-surface tracking-tight">
              Recently Viewed
            </h1>
            <p className="text-on-surface-variant mt-1">
              {initialListings.length}{" "}
              {initialListings.length === 1 ? "listing" : "listings"} viewed
              recently
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Search className="w-4 h-4" />
            Find more
          </Link>
        </div>

        {initialListings.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-ambient-sm p-12 text-center">
            <Clock className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
            <h3 className="font-display text-lg font-semibold text-on-surface mb-2">
              No recent activity
            </h3>
            <p className="text-on-surface-variant max-w-sm mx-auto mb-6">
              Listings you view will appear here so you can easily find them
              again.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-full font-medium hover:bg-primary/90 transition-colors"
            >
              <Search className="w-4 h-4" />
              Start exploring
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {initialListings.map((listing) => (
              <Link
                key={listing.id}
                href={`/listings/${listing.id}`}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-ambient-sm overflow-hidden group hover:shadow-ambient transition-all"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] bg-surface-container-high overflow-hidden">
                  {(() => {
                    const hasImage =
                      listing.images &&
                      listing.images.length > 0 &&
                      listing.images[0];
                    const hasError = imageErrors[listing.id];
                    const placeholderIndex =
                      listing.id
                        .split("")
                        .reduce((acc, char) => acc + char.charCodeAt(0), 0) %
                      PLACEHOLDER_IMAGES.length;
                    const imageUrl =
                      hasImage && !hasError
                        ? listing.images[0]
                        : PLACEHOLDER_IMAGES[placeholderIndex];
                    const showPlaceholder = !hasImage || hasError;

                    return (
                      <>
                        <Image
                          src={imageUrl}
                          alt={listing.title ?? "Untitled listing"}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          onError={() =>
                            setImageErrors((prev) => ({
                              ...prev,
                              [listing.id]: true,
                            }))
                          }
                        />
                        {showPlaceholder && (
                          <div className="absolute inset-0 bg-gradient-to-br from-surface-container-high to-surface-container-high/80 flex flex-col items-center justify-center">
                            <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center mb-2">
                              <Home
                                className="w-7 h-7 text-on-surface-variant"
                                strokeWidth={1.5}
                              />
                            </div>
                            <span className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
                              No Photos
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="absolute top-3 right-3 px-2 py-1 bg-surface-container-lowest/90 backdrop-blur-sm rounded-full text-xs text-on-surface-variant flex items-center gap-1 z-10">
                    <Clock className="w-3 h-3" />
                    {formatTimeAgo(listing.viewedAt)}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-on-surface line-clamp-1 group-hover:underline">
                    {listing.title ?? "Untitled listing"}
                  </h3>
                  {listing.location && (
                    <p className="text-sm text-on-surface-variant flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {listing.location.city}, {listing.location.state}
                    </p>
                  )}
                  <p className="font-semibold text-on-surface mt-2">
                    {formatPrice(listing.price ?? 0)}
                    <span className="text-on-surface-variant font-normal text-sm">
                      /mo
                    </span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
