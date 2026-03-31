"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, Trash2, Search, MapPin, ArrowUpDown, Home } from "lucide-react";
import { removeSavedListing } from "@/app/actions/saved-listings";
import { toast } from "sonner";

// Placeholder images for when listing has no images
const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1484154218962-a1c002085d2f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1502005229766-528352261b79?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80",
];

type SortOption =
  | "date_saved_desc"
  | "date_saved_asc"
  | "price_asc"
  | "price_desc";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "date_saved_desc", label: "Recently saved" },
  { value: "date_saved_asc", label: "Oldest saved" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

interface SavedListing {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  savedAt: Date;
  location?: {
    city: string;
    state: string;
  } | null;
}

interface SavedListingsClientProps {
  initialListings: SavedListing[];
}

export default function SavedListingsClient({
  initialListings,
}: SavedListingsClientProps) {
  const [listings, setListings] = useState<SavedListing[]>(initialListings);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("date_saved_desc");
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const sortedListings = useMemo(() => {
    return [...listings].sort((a, b) => {
      switch (sortOption) {
        case "price_asc":
          return a.price - b.price;
        case "price_desc":
          return b.price - a.price;
        case "date_saved_asc":
          return new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime();
        case "date_saved_desc":
        default:
          return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
      }
    });
  }, [listings, sortOption]);

  const handleRemove = async (listingId: string) => {
    setRemovingId(listingId);
    try {
      const result = await removeSavedListing(listingId);
      if (result.error) {
        toast.error("Failed to remove listing", {
          description: result.error,
        });
      } else {
        setListings((prev) => prev.filter((l) => l.id !== listingId));
        toast.success("Listing removed from saved");
      }
    } catch (_error) {
      toast.error("Failed to remove listing", {
        description: "Please try again later.",
      });
    } finally {
      setRemovingId(null);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-surface-canvas pt-4 pb-20">
      <div className="container mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-on-surface tracking-tight">
              Saved Listings
            </h1>
            <p className="text-on-surface-variant mt-1">
              {listings.length} {listings.length === 1 ? "place" : "places"}{" "}
              saved
            </p>
          </div>
          <div className="flex items-center gap-3">
            {listings.length > 1 && (
              <div className="relative">
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="appearance-none pl-3 pr-8 py-2 bg-surface-container-lowest border border-outline-variant/20 rounded-full text-sm font-medium text-on-surface-variant hover:border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ArrowUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
              </div>
            )}
            <Link
              href="/search"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Search className="w-4 h-4" />
              Find more
            </Link>
          </div>
        </div>

        {listings.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-ambient-sm p-12 text-center">
            <Heart className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
            <h3 className="font-display text-lg font-semibold text-on-surface mb-2">
              No saved listings yet
            </h3>
            <p className="text-on-surface-variant max-w-sm mx-auto mb-6">
              When you find a place you like, tap the heart icon to save it here
              for later.
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
            {sortedListings.map((listing) => (
              <div
                key={listing.id}
                className={`bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-ambient-sm overflow-hidden group transition-all ${
                  removingId === listing.id ? "opacity-50 scale-95" : ""
                }`}
              >
                {/* Image */}
                <Link href={`/listings/${listing.id}`}>
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
                            alt={listing.title}
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>

                {/* Content */}
                <div className="p-4">
                  <Link href={`/listings/${listing.id}`}>
                    <h3 className="font-semibold text-on-surface line-clamp-1 hover:underline">
                      {listing.title}
                    </h3>
                  </Link>
                  {listing.location && (
                    <p className="text-sm text-on-surface-variant flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {listing.location.city}, {listing.location.state}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <p className="font-semibold text-on-surface">
                      ${listing.price.toLocaleString()}
                      <span className="text-on-surface-variant font-normal text-sm">
                        /mo
                      </span>
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Saved {formatDate(listing.savedAt)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-4 pt-4">
                    <Link
                      href={`/listings/${listing.id}`}
                      className="flex-1 text-center py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-canvas rounded-lg transition-colors"
                    >
                      View details
                    </Link>
                    <button
                      onClick={() => handleRemove(listing.id)}
                      disabled={removingId === listing.id}
                      className="p-2 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60"
                      title="Remove from saved"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
