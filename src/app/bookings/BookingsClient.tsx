"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CalendarDays,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  User,
  Home,
  DollarSign,
  List,
  Filter,
  Bell,
  PauseCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import BookingCalendar from "@/components/BookingCalendar";
import { parseISODateAsLocal } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type AvailabilitySource = "LEGACY_BOOKING" | "HOST_MANAGED";
type BookingStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | "HELD"
  | "EXPIRED";

type Booking = {
  id: string;
  startDate: Date | string; // Can be Date or ISO string from server
  endDate: Date | string; // Can be Date or ISO string from server
  status: BookingStatus;
  totalPrice: number;
  createdAt: Date | string; // Can be Date or ISO string from server
  heldUntil?: Date | string | null; // Phase 4: Hold expiry time
  slotsRequested?: number; // Phase 4: Number of slots held
  listing: {
    id: string;
    title: string;
    price: number;
    availabilitySource?: AvailabilitySource;
    location: {
      city: string;
      state: string;
    } | null;
    owner?: {
      id: string;
      name: string | null;
      image: string | null;
    };
  };
  tenant?: {
    id: string;
    name: string | null;
    image: string | null;
  };
};

interface BookingsClientProps {
  sentBookings: Booking[];
  receivedBookings: Booking[];
}

const statusConfig = {
  PENDING: {
    color: "bg-yellow-100 text-yellow-700 border-outline-variant/20",
    icon: Clock,
    label: "Pending",
  },
  ACCEPTED: {
    color: "bg-green-100 text-green-700 border-green-200",
    icon: CheckCircle2,
    label: "Accepted",
  },
  REJECTED: {
    color: "bg-red-100 text-red-700 border-outline-variant/20",
    icon: XCircle,
    label: "Rejected",
  },
  CANCELLED: {
    color:
      "bg-surface-container-high text-on-surface-variant border-outline-variant/20",
    icon: AlertCircle,
    label: "Cancelled",
  },
  HELD: {
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: PauseCircle,
    label: "Held",
  },
  EXPIRED: {
    color: "bg-orange-100 text-orange-700 border-orange-200",
    icon: AlertCircle,
    label: "Expired",
  },
};

function StatusBadge({ status }: { status: BookingStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${config.color}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function formatDate(date: Date | string) {
  return parseISODateAsLocal(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function BookingCard({
  booking,
  type,
}: {
  booking: Booking;
  type: "sent" | "received";
}) {
  const locationText = booking.listing.location
    ? `${booking.listing.location.city}, ${booking.listing.location.state}`
    : "Location not specified";
  const isLegacyRow = booking.listing.availabilitySource === "HOST_MANAGED";

  return (
    <div
      data-testid="booking-item"
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-ambient-sm overflow-hidden hover:shadow-ambient transition-shadow"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <Link
              href={`/listings/${booking.listing.id}`}
              className="text-lg font-bold text-on-surface hover:text-on-surface-variant transition-colors"
            >
              {booking.listing.title}
            </Link>
            <p className="text-sm text-on-surface-variant flex items-center gap-1 mt-1">
              <MapPin className="w-3.5 h-3.5" />
              {locationText}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-2">
              <StatusBadge status={booking.status} />
              {isLegacyRow && (
                <Badge
                  variant="outline"
                  size="sm"
                  aria-label="Listing has migrated to host-managed — this is a legacy booking"
                  className="border-outline-variant/30 bg-surface-container-high text-on-surface-variant"
                >
                  Legacy booking
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 py-4">
          <div>
            <p className="text-xs text-on-surface-variant uppercase font-medium mb-1">
              Check-in
            </p>
            <p className="text-sm font-semibold text-on-surface flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-on-surface-variant" />
              {formatDate(booking.startDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant uppercase font-medium mb-1">
              Check-out
            </p>
            <p className="text-sm font-semibold text-on-surface flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-on-surface-variant" />
              {formatDate(booking.endDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant uppercase font-medium mb-1">
              Total Price
            </p>
            <p className="text-sm font-semibold text-on-surface flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-on-surface-variant" />$
              {booking.totalPrice.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant uppercase font-medium mb-1">
              {type === "sent" ? "Host" : "Tenant"}
            </p>
            {type === "sent" && booking.listing.owner ? (
              <Link
                href={`/users/${booking.listing.owner.id}`}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <UserAvatar
                  image={booking.listing.owner.image}
                  name={booking.listing.owner.name}
                  className="w-6 h-6"
                />
                <span className="text-sm font-medium text-on-surface">
                  {booking.listing.owner.name || "Host"}
                </span>
              </Link>
            ) : type === "received" && booking.tenant ? (
              <Link
                href={`/users/${booking.tenant.id}`}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <UserAvatar
                  image={booking.tenant.image}
                  name={booking.tenant.name}
                  className="w-6 h-6"
                />
                <span className="text-sm font-medium text-on-surface">
                  {booking.tenant.name || "Tenant"}
                </span>
              </Link>
            ) : (
              <span className="text-sm text-on-surface-variant">N/A</span>
            )}
          </div>
        </div>
        <p className="text-xs text-on-surface-variant mt-4">
          Recorded on {formatDate(booking.createdAt)}
        </p>
      </div>
    </div>
  );
}

export default function BookingsClient({
  sentBookings,
  receivedBookings,
}: BookingsClientProps) {
  const [activeTab, setActiveTab] = useState<"sent" | "received">("received");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "ALL">(
    "ALL"
  );
  const allBookings = activeTab === "sent" ? sentBookings : receivedBookings;
  const currentBookings =
    statusFilter === "ALL"
      ? allBookings
      : allBookings.filter((b) => b.status === statusFilter);
  const hasLegacyBookings = [...sentBookings, ...receivedBookings].some(
    (booking) => booking.listing.availabilitySource === "HOST_MANAGED"
  );

  // Status filter options with counts
  const statusOptions: {
    value: BookingStatus | "ALL";
    label: string;
    count: number;
  }[] = [
    { value: "ALL", label: "All", count: allBookings.length },
    {
      value: "PENDING",
      label: "Pending",
      count: allBookings.filter((b) => b.status === "PENDING").length,
    },
    {
      value: "ACCEPTED",
      label: "Accepted",
      count: allBookings.filter((b) => b.status === "ACCEPTED").length,
    },
    {
      value: "REJECTED",
      label: "Rejected",
      count: allBookings.filter((b) => b.status === "REJECTED").length,
    },
    {
      value: "CANCELLED",
      label: "Cancelled",
      count: allBookings.filter((b) => b.status === "CANCELLED").length,
    },
    {
      value: "HELD",
      label: "Held",
      count: allBookings.filter((b) => b.status === "HELD").length,
    },
    {
      value: "EXPIRED",
      label: "Expired",
      count: allBookings.filter((b) => b.status === "EXPIRED").length,
    },
  ];

  return (
    <div className="min-h-screen bg-surface-canvas pt-4 pb-20">
      <div className="container mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-on-surface tracking-tight">
              My Bookings
            </h1>
            <p className="text-on-surface-variant mt-2">
              Your booking history.
            </p>
          </div>
          <Link
            href="/notifications"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface bg-surface-container-lowest border border-outline-variant/20 rounded-lg hover:bg-surface-canvas transition-colors"
          >
            <Bell className="w-4 h-4" />
            Manage notifications
          </Link>
        </div>

        {hasLegacyBookings && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">
              This page shows your booking history. To start a new
              conversation with a host, use Messages.
            </p>
          </div>
        )}

        {/* Tabs and View Toggle */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex gap-2 bg-surface-container-lowest p-1.5 rounded-xl border border-outline-variant/20 shadow-ambient-sm">
            <button
              onClick={() => setActiveTab("received")}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "received"
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-canvas"
              }`}
            >
              <span className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Received
              </span>
            </button>
            <button
              onClick={() => setActiveTab("sent")}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "sent"
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-canvas"
              }`}
            >
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Sent
              </span>
            </button>
          </div>

          {/* View Mode Toggle */}
          {activeTab === "received" && (
            <div className="flex gap-1 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/20 shadow-ambient-sm">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === "list"
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-surface-canvas"
                }`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === "calendar"
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-surface-canvas"
                }`}
                title="Calendar view"
              >
                <CalendarDays className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Status Filter Chips */}
        {allBookings.length > 0 && viewMode === "list" && (
          <div className="flex flex-wrap gap-2 mb-6">
            <div className="flex items-center gap-1 mr-2 text-on-surface-variant">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium">Filter:</span>
            </div>
            {statusOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setStatusFilter(option.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  statusFilter === option.value
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-canvas"
                }`}
              >
                {option.label}
                {option.count > 0 && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                      statusFilter === option.value
                        ? "bg-white/20"
                        : "bg-surface-container-high"
                    }`}
                  >
                    {option.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Calendar View for Received Bookings */}
        {activeTab === "received" && viewMode === "calendar" && (
          <div
            key="calendar"
            className="animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <BookingCalendar
              bookings={receivedBookings.map((b) => ({
                id: b.id,
                startDate: b.startDate,
                endDate: b.endDate,
                status: b.status,
                tenant: {
                  id: b.tenant?.id || "",
                  name: b.tenant?.name || null,
                  image: b.tenant?.image || null,
                },
                listing: {
                  id: b.listing.id,
                  title: b.listing.title,
                },
              }))}
            />
          </div>
        )}

        {/* List View */}
        {(activeTab === "sent" || viewMode === "list") && (
          <div
            key={activeTab}
            className="animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            {currentBookings.length === 0 ? (
              <div
                data-testid="empty-state"
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-ambient-sm p-12 text-center"
              >
                <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mx-auto mb-4">
                  {activeTab === "received" ? (
                    <Home className="w-8 h-8 text-on-surface-variant" />
                  ) : (
                    <Calendar className="w-8 h-8 text-on-surface-variant" />
                  )}
                </div>
                <h3 className="text-lg font-semibold text-on-surface mb-2">
                  {activeTab === "received"
                    ? "No hosted stays yet"
                    : "No booking history yet"}
                </h3>
                <p className="text-on-surface-variant mb-6">
                  {activeTab === "received"
                    ? "Guest stay history for your listings will appear here."
                    : "Past stay history and legacy booking records will appear here."}
                </p>
                <Link
                  href={activeTab === "received" ? "/listings/create" : "/search"}
                >
                  <Button>
                    {activeTab === "received" ? "List a Room" : "Find a Room"}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {currentBookings.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    type={activeTab}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
