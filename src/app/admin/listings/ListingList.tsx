"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  updateListingStatus,
  deleteListing,
  unsuppressListing,
} from "@/app/actions/admin";
import { formatPrice } from "@/lib/format";
import {
  Search,
  Loader2,
  Eye,
  EyeOff,
  MapPin,
  DollarSign,
  Flag,
  Trash2,
  Play,
  Pause,
  CheckCircle,
  MoreVertical,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

type ListingStatus = "ACTIVE" | "PAUSED" | "RENTED";

interface Listing {
  id: string;
  title: string;
  price: number;
  status: ListingStatus;
  statusReason: string | null;
  version: number;
  images: string[];
  viewCount: number;
  createdAt: Date;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
  };
  location: {
    city: string;
    state: string;
  } | null;
  _count: {
    reports: number;
  };
}

interface ListingListProps {
  initialListings: Listing[];
  totalListings: number;
  searchQuery: string;
  currentStatus: "all" | ListingStatus;
  currentPage: number;
  totalPages: number;
}

const statusConfig = {
  ACTIVE: { label: "Active", color: "bg-green-100 text-green-700", icon: Play },
  PAUSED: {
    label: "Paused",
    color: "bg-amber-100 text-amber-700",
    icon: Pause,
  },
  RENTED: {
    label: "Rented",
    color: "bg-blue-100 text-blue-700",
    icon: CheckCircle,
  },
};

const moderationLockedReasons = new Set(["ADMIN_PAUSED", "SUPPRESSED"]);
const statusReasonLabels: Record<string, string> = {
  ADMIN_PAUSED: "Admin paused",
  SUPPRESSED: "Suppressed",
};

export default function ListingList({
  initialListings,
  totalListings,
  searchQuery,
  currentStatus,
  currentPage,
  totalPages,
}: ListingListProps) {
  const [listings, setListings] = useState(initialListings);
  const [search, setSearch] = useState(searchQuery);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    setListings(initialListings);
    setSearch(searchQuery);
  }, [initialListings, searchQuery]);

  const buildHref = (overrides: {
    q?: string;
    status?: "all" | ListingStatus;
    page?: number;
  }) => {
    const nextQuery = overrides.q ?? searchQuery;
    const nextStatus = overrides.status ?? currentStatus;
    const nextPage = overrides.page ?? currentPage;
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextPage > 1) params.set("page", String(nextPage));
    const queryString = params.toString();
    return `/admin/listings${queryString ? `?${queryString}` : ""}`;
  };

  const handleStatusChange = async (
    listingId: string,
    newStatus: ListingStatus,
    expectedVersion: number
  ) => {
    setProcessingId(listingId);
    try {
      const result = await updateListingStatus(
        listingId,
        newStatus,
        expectedVersion
      );
      if (result.success) {
        setListings((prev) =>
          prev.flatMap((l) => {
            if (l.id !== listingId) return [l];
            const status = result.status ?? newStatus;
            if (currentStatus !== "all" && currentStatus !== status) return [];
            return [
              {
                ...l,
                status,
                statusReason:
                  "statusReason" in result
                    ? (result.statusReason ?? null)
                    : l.statusReason,
                version:
                  typeof result.version === "number"
                    ? result.version
                    : l.version,
              },
            ];
          })
        );
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setProcessingId(null);
      setOpenMenuId(null);
    }
  };

  const handleUnsuppress = async (
    listingId: string,
    expectedVersion: number
  ) => {
    setProcessingId(listingId);
    try {
      const result = await unsuppressListing(listingId, expectedVersion);
      if (result.success) {
        setListings((prev) =>
          prev.flatMap((l) => {
            if (l.id !== listingId) return [l];
            if (currentStatus !== "all" && currentStatus !== "ACTIVE") return [];
            return [
              {
                ...l,
                status: "ACTIVE",
                statusReason: null,
                version:
                  typeof result.version === "number"
                    ? result.version
                    : l.version,
              },
            ];
          })
        );
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Error restoring listing:", error);
    } finally {
      setProcessingId(null);
      setOpenMenuId(null);
    }
  };

  const handleDelete = async (listingId: string) => {
    setProcessingId(listingId);
    try {
      const result = await deleteListing(listingId);
      if (result.success) {
        setListings((prev) =>
          prev.flatMap((l) => {
            if (l.id !== listingId) return [l];
            if (result.action !== "suppressed") return [];
            if (currentStatus !== "all" && currentStatus !== "PAUSED") return [];
            return [
              {
                ...l,
                status: "PAUSED",
                statusReason:
                  "statusReason" in result
                    ? (result.statusReason ?? l.statusReason)
                    : l.statusReason,
                version:
                  typeof result.version === "number" ? result.version : l.version,
              },
            ];
          })
        );
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Error deleting listing:", error);
    } finally {
      setProcessingId(null);
      setDeleteConfirmId(null);
    }
  };

  return (
    <div>
      {/* Search and Filters */}
      <form
        action="/admin/listings"
        className="flex flex-col sm:flex-row gap-4 mb-6"
      >
        {currentStatus !== "all" && (
          <input type="hidden" name="status" value={currentStatus} />
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            name="q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or owner..."
            aria-label="Search listings by title or owner"
            className="w-full pl-10 pr-4 py-2 border border-outline-variant/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-on-surface text-white rounded-lg font-medium text-sm hover:bg-on-surface/90"
        >
          Search
        </button>
        <div className="flex gap-2">
          {(["all", "ACTIVE", "PAUSED", "RENTED"] as const).map((f) => (
            <Link
              key={f}
              href={buildHref({ status: f, page: 1 })}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                currentStatus === f
                  ? "bg-on-surface text-white"
                  : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high/50 border border-outline-variant/20"
              }`}
            >
              {f === "all" ? "All" : statusConfig[f].label}
            </Link>
          ))}
        </div>
      </form>

      {/* Stats */}
      <div className="mb-4 text-sm text-on-surface-variant">
        Showing {listings.length} of {totalListings} listings
      </div>

      {/* Listings Grid */}
      {listings.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-lg shadow-ambient-sm p-12 text-center text-on-surface-variant">
          No listings found matching your criteria
        </div>
      ) : (
        <div className="grid gap-4">
          {listings.map((listing) => {
            const StatusIcon = statusConfig[listing.status].icon;
            const isModerationLocked = moderationLockedReasons.has(
              listing.statusReason ?? ""
            );

            return (
              <div
                key={listing.id}
                className={`bg-surface-container-lowest rounded-lg shadow-ambient-sm overflow-hidden ${
                  listing._count.reports > 0
                    ? "border-outline-variant/20"
                    : "border-outline-variant/20"
                }`}
              >
                <div className="p-4 flex gap-4">
                  {/* Thumbnail */}
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high">
                    {listing.images[0] ? (
                      <Image
                        src={listing.images[0]}
                        alt={listing.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                        No image
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-on-surface truncate">
                            {listing.title}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig[listing.status].color}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig[listing.status].label}
                          </span>
                          {listing._count.reports > 0 && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium flex items-center gap-1">
                              <Flag className="w-3 h-3" />
                              {listing._count.reports} reports
                            </span>
                          )}
                          {isModerationLocked && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                              {statusReasonLabels[listing.statusReason ?? ""] ??
                                "Moderation locked"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-on-surface-variant">
                          {listing.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {listing.location.city}, {listing.location.state}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {formatPrice(Number(listing.price))}/mo
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {listing.viewCount} views
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-1">
                          Owner: {listing.owner.name || "Unknown"} (
                          {listing.owner.email})
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/listings/${listing.id}`}
                          target="_blank"
                          aria-label={`View listing: ${listing.title}`}
                          className="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-on-surface"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>

                        <div className="relative">
                          <button
                            onClick={() =>
                              setOpenMenuId(
                                openMenuId === listing.id ? null : listing.id
                              )
                            }
                            aria-label={`Actions for ${listing.title}`}
                            className="p-2 hover:bg-surface-container-high rounded-lg"
                          >
                            <MoreVertical className="w-5 h-5 text-on-surface-variant" />
                          </button>

                          {openMenuId === listing.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-surface-container-lowest rounded-lg shadow-ambient-lg border border-outline-variant/20 py-1 z-10">
                              {isModerationLocked ? (
                                <button
                                  onClick={() =>
                                    handleUnsuppress(
                                      listing.id,
                                      listing.version
                                    )
                                  }
                                  disabled={processingId === listing.id}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-surface-container-high/50 flex items-center gap-2 disabled:opacity-60"
                                >
                                  {processingId === listing.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Play className="w-4 h-4 text-green-500" />
                                  )}
                                  Unsuppress Listing
                                </button>
                              ) : (
                                <>
                                  {listing.status !== "ACTIVE" && (
                                    <button
                                      onClick={() =>
                                        handleStatusChange(
                                          listing.id,
                                          "ACTIVE",
                                          listing.version
                                        )
                                      }
                                      disabled={processingId === listing.id}
                                      className="w-full px-4 py-2 text-left text-sm hover:bg-surface-container-high/50 flex items-center gap-2 disabled:opacity-60"
                                    >
                                      {processingId === listing.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Play className="w-4 h-4 text-green-500" />
                                      )}
                                      Set Active
                                    </button>
                                  )}
                                  {listing.status !== "PAUSED" && (
                                    <button
                                      onClick={() =>
                                        handleStatusChange(
                                          listing.id,
                                          "PAUSED",
                                          listing.version
                                        )
                                      }
                                      disabled={processingId === listing.id}
                                      className="w-full px-4 py-2 text-left text-sm hover:bg-surface-container-high/50 flex items-center gap-2 disabled:opacity-60"
                                    >
                                      {processingId === listing.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Pause className="w-4 h-4 text-amber-500" />
                                      )}
                                      Set Paused
                                    </button>
                                  )}
                                  {listing.status !== "RENTED" && (
                                    <button
                                      onClick={() =>
                                        handleStatusChange(
                                          listing.id,
                                          "RENTED",
                                          listing.version
                                        )
                                      }
                                      disabled={processingId === listing.id}
                                      className="w-full px-4 py-2 text-left text-sm hover:bg-surface-container-high/50 flex items-center gap-2 disabled:opacity-60"
                                    >
                                      {processingId === listing.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <CheckCircle className="w-4 h-4 text-blue-500" />
                                      )}
                                      Set Rented
                                    </button>
                                  )}
                                </>
                              )}
                              <hr className="my-1" />
                              <button
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDeleteConfirmId(listing.id);
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                              >
                                {listing._count.reports > 0 ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                                {listing._count.reports > 0
                                  ? "Suppress Listing"
                                  : "Delete Listing"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delete Confirmation */}
                {deleteConfirmId === listing.id && (
                  <div className="p-4 bg-red-50 border-t border-red-100">
                    <p className="text-sm text-red-700 mb-3">
                      {listing._count.reports > 0
                        ? "This listing has reports, so it will be suppressed instead of deleted to preserve moderation evidence."
                        : "Are you sure you want to delete this listing? This action cannot be undone."}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(listing.id)}
                        disabled={processingId === listing.id}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
                      >
                        {processingId === listing.id && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        {listing._count.reports > 0
                          ? "Suppress Listing"
                          : "Delete Forever"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-4 py-2 bg-surface-container-lowest text-on-surface rounded-lg text-sm font-medium hover:bg-surface-container-high/50 border border-outline-variant/20"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <Link
            href={buildHref({ page: Math.max(1, currentPage - 1) })}
            className={`px-4 py-2 rounded-lg border border-outline-variant/20 text-sm ${
              currentPage <= 1
                ? "pointer-events-none opacity-50"
                : "hover:bg-surface-container-high"
            }`}
          >
            Previous
          </Link>
          <span className="text-sm text-on-surface-variant">
            Page {currentPage} of {totalPages}
          </span>
          <Link
            href={buildHref({ page: Math.min(totalPages, currentPage + 1) })}
            className={`px-4 py-2 rounded-lg border border-outline-variant/20 text-sm ${
              currentPage >= totalPages
                ? "pointer-events-none opacity-50"
                : "hover:bg-surface-container-high"
            }`}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}
