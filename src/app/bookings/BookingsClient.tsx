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
  Loader2,
  WifiOff,
  Filter,
  AlertTriangle,
  Bell,
  PauseCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  updateBookingStatus,
  BookingStatus,
} from "@/app/actions/manage-booking";
import UserAvatar from "@/components/UserAvatar";
import BookingCalendar from "@/components/BookingCalendar";
import HoldCountdown from "@/components/bookings/HoldCountdown";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { parseISODateAsLocal } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
    color:
      "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: Clock,
    label: "Pending",
  },
  ACCEPTED: {
    color:
      "bg-green-100 text-green-700 border-green-200",
    icon: CheckCircle2,
    label: "Accepted",
  },
  REJECTED: {
    color:
      "bg-red-100 text-red-700 border-red-200",
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
    color:
      "bg-blue-100 text-blue-700 border-blue-200",
    icon: PauseCircle,
    label: "Held",
  },
  EXPIRED: {
    color:
      "bg-orange-100 text-orange-700 border-orange-200",
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
  onStatusUpdate,
  isOffline,
}: {
  booking: Booking;
  type: "sent" | "received";
  onStatusUpdate: (
    bookingId: string,
    status: BookingStatus,
    rejectionReason?: string
  ) => Promise<void>;
  isOffline: boolean;
}) {
  const [updatingStatus, setUpdatingStatus] = useState<BookingStatus | null>(
    null
  );
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleStatusUpdate = async (status: BookingStatus, reason?: string) => {
    if (isOffline) {
      toast.error("You're offline", {
        description:
          "Please check your internet connection to update booking status.",
      });
      return;
    }
    setUpdatingStatus(status);
    await onStatusUpdate(booking.id, status, reason);
    setUpdatingStatus(null);
  };

  const isUpdating = updatingStatus !== null;

  const locationText = booking.listing.location
    ? `${booking.listing.location.city}, ${booking.listing.location.state}`
    : "Location not specified";

  const showActions =
    type === "received" && ["PENDING", "HELD"].includes(booking.status);
  const showCancelButton =
    type === "sent" && ["PENDING", "ACCEPTED", "HELD"].includes(booking.status);

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
            <StatusBadge status={booking.status} />
            {booking.status === "HELD" && booking.heldUntil && (
              <HoldCountdown
                heldUntil={
                  typeof booking.heldUntil === "string"
                    ? booking.heldUntil
                    : booking.heldUntil.toISOString()
                }
                onExpired={() => window.location.reload()}
              />
            )}
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

        {(showActions || showCancelButton) && (
          <div className="flex gap-3 mt-4">
            {showActions && (
              <>
                <Button
                  onClick={() => handleStatusUpdate("ACCEPTED")}
                  disabled={isUpdating}
                  className="flex-1"
                >
                  {updatingStatus === "ACCEPTED" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    "Accept"
                  )}
                </Button>
                <Button
                  onClick={() => setShowRejectDialog(true)}
                  disabled={isUpdating}
                  variant="outline"
                  className="flex-1"
                >
                  {updatingStatus === "REJECTED" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    "Reject"
                  )}
                </Button>
              </>
            )}
            {showCancelButton && (
              <Button
                onClick={() => setShowCancelDialog(true)}
                disabled={isUpdating}
                variant="destructive"
                className="flex-1"
              >
                {updatingStatus === "CANCELLED" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  "Cancel Booking"
                )}
              </Button>
            )}
          </div>
        )}

        {/* Cancel Confirmation Dialog */}
        <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-left">
                <span className="block mb-2">
                  You&apos;re about to cancel your booking for:
                </span>
                <span className="block font-semibold text-on-surface">
                  {booking.listing.title}
                </span>
                <span className="block text-sm mt-1">
                  {formatDate(booking.startDate)} —{" "}
                  {formatDate(booking.endDate)}
                </span>
                <span className="block text-sm mt-3 text-red-600">
                  This action cannot be undone.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isUpdating}>
                Keep Booking
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowCancelDialog(false);
                  handleStatusUpdate("CANCELLED");
                }}
                disabled={isUpdating}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isUpdating ? "Cancelling..." : "Yes, Cancel Booking"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reject Booking Dialog */}
        <AlertDialog
          open={showRejectDialog}
          onOpenChange={(open) => {
            setShowRejectDialog(open);
            if (!open) setRejectionReason("");
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-amber-600" />
                </div>
                <AlertDialogTitle>
                  Reject this booking request?
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-left">
                <span className="block mb-2">
                  You&apos;re about to reject the booking request from:
                </span>
                <span className="block font-semibold text-on-surface">
                  {booking.tenant?.name || "Tenant"}
                </span>
                <span className="block text-sm mt-1">
                  For: {booking.listing.title}
                </span>
                <span className="block text-sm">
                  {formatDate(booking.startDate)} —{" "}
                  {formatDate(booking.endDate)}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="py-2">
              <label
                htmlFor="rejection-reason"
                className="block text-sm font-medium text-on-surface-variant mb-2"
              >
                Reason for rejection (optional)
              </label>
              <textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Let the tenant know why you're declining their request..."
                className="w-full px-3 py-2 text-sm border border-outline-variant/20 rounded-lg bg-surface-container-lowest text-on-surface placeholder-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                rows={3}
                maxLength={500}
                disabled={isUpdating}
              />
              <p className="text-xs text-on-surface-variant mt-1 text-right">
                {rejectionReason.length}/500
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isUpdating}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const reason = rejectionReason.trim() || undefined;
                  setShowRejectDialog(false);
                  setRejectionReason("");
                  handleStatusUpdate("REJECTED", reason);
                }}
                disabled={isUpdating}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isUpdating ? "Rejecting..." : "Reject Booking"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <p className="text-xs text-on-surface-variant mt-4">
          Requested on {formatDate(booking.createdAt)}
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
  const [bookings, setBookings] = useState({
    sent: sentBookings,
    received: receivedBookings,
  });
  const { isOffline } = useNetworkStatus();

  const handleStatusUpdate = async (
    bookingId: string,
    status: BookingStatus,
    rejectionReason?: string
  ) => {
    // Store previous state for rollback
    const previousBookings = { ...bookings };

    // Optimistically update local state immediately
    setBookings((prev) => ({
      sent: prev.sent.map((b) => (b.id === bookingId ? { ...b, status } : b)),
      received: prev.received.map((b) =>
        b.id === bookingId ? { ...b, status } : b
      ),
    }));

    // Then make the API call
    const result = await updateBookingStatus(
      bookingId,
      status,
      rejectionReason
    );

    if (result.error) {
      // Revert to previous state on error
      setBookings(previousBookings);
      toast.error(result.error);
      return;
    }

    // Show success feedback
    toast.success(`Booking ${status.toLowerCase()}`);
  };

  const allBookings = activeTab === "sent" ? bookings.sent : bookings.received;
  const currentBookings =
    statusFilter === "ALL"
      ? allBookings
      : allBookings.filter((b) => b.status === statusFilter);
  const pendingReceivedCount = bookings.received.filter(
    (b) => b.status === "PENDING" || b.status === "HELD"
  ).length;

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
    <div className="min-h-screen bg-surface-canvas pt-20 pb-20">
      <div className="container mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-on-surface tracking-tight">
              My Bookings
            </h1>
            <p className="text-on-surface-variant mt-2">
              Manage your booking requests and reservations
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

        {/* Offline Banner */}
        {isOffline && (
          <div className="mb-6 p-4 rounded-xl bg-surface-container-high flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-on-surface-variant flex-shrink-0" />
            <p className="text-sm text-on-surface-variant">
              You&apos;re offline. Booking actions are disabled until you
              reconnect.
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
                {pendingReceivedCount > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {pendingReceivedCount}
                  </span>
                )}
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
              bookings={bookings.received.map((b) => ({
                id: b.id,
                startDate: b.startDate, // BookingCalendar now handles Date | string
                endDate: b.endDate, // BookingCalendar now handles Date | string
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
                    ? "No booking requests yet"
                    : "No bookings made yet"}
                </h3>
                <p className="text-on-surface-variant mb-6">
                  {activeTab === "received"
                    ? "When tenants request to book your listings, they will appear here."
                    : "When you request to book a room, it will appear here."}
                </p>
                <Link href="/search">
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
                    onStatusUpdate={handleStatusUpdate}
                    isOffline={isOffline}
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
