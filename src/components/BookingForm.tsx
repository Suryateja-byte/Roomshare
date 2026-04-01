"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { FocusTrap } from "@/components/ui/FocusTrap";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  createBooking,
  createHold,
  BookingResult,
} from "@/app/actions/booking";
import { useRouter } from "next/navigation";
import {
  Loader2,
  LogIn,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle,
  WifiOff,
  Calendar,
  Info,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { parseLocalDate, parseISODateAsLocal } from "@/lib/utils";
import { SlotSelector } from "@/components/SlotSelector";

type ListingStatus = "ACTIVE" | "PAUSED" | "RENTED";

type ErrorType =
  | "validation"
  | "server"
  | "network"
  | "blocked"
  | "auth"
  | "rate_limit"
  | null;

interface BookedDateRange {
  startDate: string;
  endDate: string;
}

interface BookingFormProps {
  listingId: string;
  price: number;
  ownerId: string;
  isOwner: boolean;
  isLoggedIn: boolean;
  status?: ListingStatus;
  bookedDates?: BookedDateRange[];
  holdEnabled?: boolean;
  totalSlots?: number;
  availableSlots?: number;
  bookingMode?: string;
  holdTtlMinutes?: number;
}

const MIN_BOOKING_DAYS = 30; // Industry standard minimum stay

const availabilityConfig: Record<
  ListingStatus,
  { label: string; colorClass: string; dotClass: string; pulse: boolean }
> = {
  ACTIVE: {
    label: "Available now",
    colorClass: "text-green-600",
    dotClass: "bg-green-500",
    pulse: true,
  },
  PAUSED: {
    label: "Temporarily unavailable",
    colorClass: "text-amber-600",
    dotClass: "bg-amber-500",
    pulse: false,
  },
  RENTED: {
    label: "Currently rented",
    colorClass: "text-red-600",
    dotClass: "bg-red-500",
    pulse: false,
  },
};

export default function BookingForm({
  listingId,
  price,
  isOwner,
  isLoggedIn,
  status = "ACTIVE",
  bookedDates = [],
  holdEnabled = false,
  totalSlots,
  availableSlots,
  bookingMode,
  holdTtlMinutes,
}: BookingFormProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Slot selector state: only show for multi-slot PER_SLOT listings
  const showSlotSelector =
    (totalSlots ?? 1) > 1 && bookingMode !== "WHOLE_UNIT";
  const [slotsRequested, setSlotsRequested] = useState(1);
  const effectiveSlots =
    bookingMode === "WHOLE_UNIT" ? (totalSlots ?? 1) : slotsRequested;
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [hasSubmittedSuccessfully, setHasSubmittedSuccessfully] =
    useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const router = useRouter();
  const { isOffline } = useNetworkStatus();

  // Ref to prevent concurrent submissions (debounce protection)
  const isSubmittingRef = useRef(false);
  const lastSubmissionRef = useRef<number>(0);
  const DEBOUNCE_MS = 1000; // Minimum time between submissions

  // Generate idempotency key on mount to prevent duplicate submissions on refresh
  const idempotencyKeyRef = useRef<string>("");

  // On mount, check for pending submission key (page was refreshed during submission)
  // or generate a new one if no pending submission
  useEffect(() => {
    const pendingKey = sessionStorage.getItem(
      `booking_pending_key_${listingId}`
    );
    if (pendingKey) {
      // Recover the pending key - this will be used if user resubmits
      idempotencyKeyRef.current = pendingKey;
      // Recovered pending idempotency key for retry
    } else {
      // Generate a new key for this session
      idempotencyKeyRef.current = `booking_${listingId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
  }, [listingId]);

  // Check for previous successful submission (browser back navigation)
  useEffect(() => {
    const submittedKey = `booking_submitted_${listingId}`;
    const previousSubmission = sessionStorage.getItem(submittedKey);
    if (previousSubmission) {
      setHasSubmittedSuccessfully(true);
      setMessage(
        "You have already submitted a booking request for this listing."
      );
    }
  }, [listingId]);

  // Warn user when navigating away during active submission
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLoading) {
        e.preventDefault();
        // Modern browsers require returnValue to be set
        e.returnValue =
          "Your booking request is still being processed. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isLoading]);

  // Handle Escape key for modal - allow closing even during submission
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showConfirmModal) {
        setShowConfirmModal(false);
        if (isLoading) {
          // In-flight request continues; inform user
          toast("Your booking may still be processing. Check your bookings page for status.", { duration: 5000 });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfirmModal, isLoading]);

  // Calculate booking duration and validate client-side
  const bookingInfo = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    const diffDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const totalPrice = Math.round((price / 30) * diffDays * 100) / 100;
    return {
      diffDays,
      totalPrice,
      isValid: diffDays >= MIN_BOOKING_DAYS && end > start,
    };
  }, [startDate, endDate, price]);

  // Check if a date range overlaps with any booked dates
  const checkDateOverlap = useCallback(
    (
      start: Date,
      end: Date
    ): { overlaps: boolean; conflictingBooking?: BookedDateRange } => {
      for (const booking of bookedDates) {
        const bookedStart = parseISODateAsLocal(booking.startDate);
        const bookedEnd = parseISODateAsLocal(booking.endDate);
        // Check if ranges overlap
        if (start < bookedEnd && end > bookedStart) {
          return { overlaps: true, conflictingBooking: booking };
        }
      }
      return { overlaps: false };
    },
    [bookedDates]
  );

  // Check if selected dates have any conflicts
  const dateConflict = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    return checkDateOverlap(start, end);
  }, [startDate, endDate, checkDateOverlap]);

  // Determine error type from error message/code
  const categorizeError = (result: BookingResult): ErrorType => {
    if (result.code === "SESSION_EXPIRED") return "auth";
    if (result.code === "PRICE_CHANGED") return "validation";
    if (result.code === "CONFLICT") return "server";
    if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0)
      return "validation";

    const errorMsg = result.error?.toLowerCase() || "";
    if (
      errorMsg.includes("too many requests") ||
      errorMsg.includes("rate limit")
    )
      return "rate_limit";
    if (errorMsg.includes("blocked")) return "blocked";
    if (errorMsg.includes("network") || errorMsg.includes("fetch"))
      return "network";
    if (
      errorMsg.includes("server") ||
      errorMsg.includes("internal") ||
      errorMsg.includes("failed")
    )
      return "server";

    return "validation"; // Default to validation for user-facing errors
  };

  // Opens confirmation modal after validating form inputs
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // Prevent resubmission after successful submit (browser back)
      if (hasSubmittedSuccessfully) {
        setMessage(
          "You have already submitted a booking request. Go to your bookings to see the status."
        );
        return;
      }

      // Block submission when offline
      if (isOffline) {
        setMessage(
          "You are currently offline. Please check your internet connection."
        );
        setErrorType("network");
        return;
      }

      setFieldErrors({});
      setErrorType(null);

      if (!startDate || !endDate) {
        setMessage("Please select both check-in and check-out dates");
        setErrorType("validation");
        return;
      }

      // Client-side validation
      const start = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (start < today) {
        setFieldErrors({ startDate: "Start date cannot be in the past" });
        setMessage("Start date cannot be in the past");
        setErrorType("validation");
        return;
      }

      if (end <= start) {
        setFieldErrors({ endDate: "End date must be after start date" });
        setMessage("End date must be after start date");
        setErrorType("validation");
        return;
      }

      if (bookingInfo && bookingInfo.diffDays < MIN_BOOKING_DAYS) {
        setFieldErrors({
          endDate: `Minimum booking is ${MIN_BOOKING_DAYS} days`,
        });
        setMessage(`Minimum booking duration is ${MIN_BOOKING_DAYS} days`);
        setErrorType("validation");
        return;
      }

      // Check for date conflicts with existing bookings
      if (dateConflict?.overlaps && dateConflict.conflictingBooking) {
        const conflictStart = new Date(
          dateConflict.conflictingBooking.startDate
        ).toLocaleDateString();
        const conflictEnd = new Date(
          dateConflict.conflictingBooking.endDate
        ).toLocaleDateString();
        setMessage(
          `Selected dates overlap with an existing booking (${conflictStart} - ${conflictEnd})`
        );
        setErrorType("validation");
        return;
      }

      // Generate and store idempotency key BEFORE showing modal
      // This ensures the key survives page refresh during confirmation or submission
      const newKey = `booking_${listingId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      idempotencyKeyRef.current = newKey;
      sessionStorage.setItem(`booking_pending_key_${listingId}`, newKey);

      // Show confirmation modal
      setShowConfirmModal(true);
    },
    [
      startDate,
      endDate,
      bookingInfo,
      hasSubmittedSuccessfully,
      isOffline,
      dateConflict,
      listingId,
    ]
  );

  // Actual submission after user confirms
  const confirmSubmit = useCallback(async () => {
    // Close the modal
    setShowConfirmModal(false);

    // Debounce protection: prevent rapid submissions
    const now = Date.now();
    if (
      isSubmittingRef.current ||
      now - lastSubmissionRef.current < DEBOUNCE_MS
    ) {
      return;
    }

    // Set submission guards
    isSubmittingRef.current = true;
    lastSubmissionRef.current = now;
    setIsLoading(true);
    setMessage("");
    setErrorType(null);

    try {
      // Check if this idempotency key was already processed
      const processedKey = sessionStorage.getItem(
        `booking_key_${idempotencyKeyRef.current}`
      );
      if (processedKey) {
        setMessage(
          "This booking request was already submitted. Redirecting..."
        );
        setHasSubmittedSuccessfully(true);
        setTimeout(() => router.push("/bookings"), 1500);
        return;
      }

      const result: BookingResult = await createBooking(
        listingId,
        parseLocalDate(startDate),
        parseLocalDate(endDate),
        price,
        effectiveSlots,
        idempotencyKeyRef.current
      );

      if (result.success) {
        // Mark this idempotency key as processed
        sessionStorage.setItem(
          `booking_key_${idempotencyKeyRef.current}`,
          "processed"
        );
        // Clear the pending key since submission succeeded
        sessionStorage.removeItem(`booking_pending_key_${listingId}`);
        setMessage("Request sent successfully!");
        setErrorType(null);
        setHasSubmittedSuccessfully(true);
        // Mark as submitted to prevent browser back resubmission
        sessionStorage.setItem(`booking_submitted_${listingId}`, "true");
        setStartDate("");
        setEndDate("");
        setTimeout(() => {
          router.push("/bookings");
        }, 1500);
      } else {
        const errType = categorizeError(result);
        setErrorType(errType);

        // Set user-friendly messages based on error type
        if (result.code === "PRICE_CHANGED" && result.currentPrice != null) {
          setMessage(
            `The listing price has changed to $${result.currentPrice}/month. Please review and try again.`
          );
        } else if (result.code === "CONFLICT") {
          setMessage(
            result.error ||
              "Could not be completed due to high demand. Please try again."
          );
        } else if (errType === "rate_limit") {
          setMessage(
            "Too many booking requests. Please wait a minute and try again."
          );
        } else if (errType === "auth") {
          setMessage("Your session has expired. Please sign in again.");
        } else if (errType === "server") {
          setMessage("Something went wrong on our end. Please try again.");
        } else if (errType === "network") {
          setMessage(
            "Unable to connect. Please check your internet connection."
          );
        } else if (errType === "blocked") {
          setMessage(result.error || "Unable to book this listing");
        } else {
          setMessage(result.error || "Failed to send request");
        }

        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      }
    } catch (_error) {
      // Catch unexpected errors (network failures, etc.)
      // Booking submission error caught — user sees generic message below
      setErrorType("server");
      setMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
      // Reset submission guard after a delay to allow retry if needed
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 2000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional dependency omission to prevent infinite loops
  }, [startDate, endDate, listingId, price, router]);

  const handleRetry = useCallback(() => {
    // Reset error state and allow immediate retry
    setMessage("");
    setErrorType(null);
    isSubmittingRef.current = false;
    lastSubmissionRef.current = 0;
  }, []);

  if (isOwner) {
    return null; // Or show some owner-specific view
  }

  // Render error banner with retry option for server/network errors
  const renderErrorBanner = () => {
    if (!message || message.includes("success")) return null;

    const isRetryable = errorType === "server" || errorType === "network" || errorType === "rate_limit";
    const isAuthError = errorType === "auth";

    return (
      <div
        role="alert"
        className={`rounded-xl p-4 animate-error-in ${
          errorType === "server" || errorType === "network" || errorType === "rate_limit"
            ? "bg-amber-50 border border-amber-200"
            : "bg-red-50 border border-red-200"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              errorType === "server" || errorType === "network" || errorType === "rate_limit"
                ? "bg-amber-100"
                : "bg-red-100"
            }`}
          >
            {errorType === "server" || errorType === "network" || errorType === "rate_limit" ? (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium ${
                errorType === "server" || errorType === "network" || errorType === "rate_limit"
                  ? "text-amber-800"
                  : "text-red-800"
              }`}
            >
              {message}
            </p>

            {/* Retry button for server/network errors */}
            {isRetryable && (
              <button
                type="button"
                onClick={handleRetry}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
              >
                <RefreshCw className="w-3 h-3" />
                Try Again
              </button>
            )}

            {/* Sign in link for auth errors */}
            {isAuthError && (
              <Link
                href="/login"
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors"
              >
                <LogIn className="w-3 h-3" />
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render success message with celebration
  const renderSuccessMessage = () => {
    if (!message.includes("success")) return null;

    return (
      <div className="rounded-xl p-4 bg-green-50 border border-green-200">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0 w-8 h-8">
            <div className="absolute inset-0 rounded-full animate-[booking-glow_600ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none" />
            <div className="relative w-8 h-8 rounded-full bg-green-100 flex items-center justify-center animate-[booking-icon-spring_400ms_cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:animate-none">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <div className="flex-1 animate-[fadeUp_500ms_cubic-bezier(0.16,1,0.3,1)_200ms_both] motion-reduce:animate-none">
            <p className="text-sm font-medium text-green-800">
              {message}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              Redirecting to your bookings...
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-surface-container-lowest rounded-3xl shadow-xl p-6 sticky top-24">
      <div className="flex justify-between items-end mb-6">
        <div>
          <span className="text-3xl font-bold text-on-surface">
            ${price}
          </span>
          <span className="text-on-surface-variant"> / month</span>
        </div>
        <div
          className={`flex items-center gap-1 text-sm font-medium ${availabilityConfig[status].colorClass}`}
        >
          <div
            className={`w-2 h-2 rounded-full ${availabilityConfig[status].dotClass} ${availabilityConfig[status].pulse ? "animate-pulse" : ""}`}
          />
          {availabilityConfig[status].label}
        </div>
      </div>

      {/* Booked Dates Display */}
      {bookedDates.length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-surface-canvas border border-outline-variant/20">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-on-surface-variant" />
            <h4 className="text-sm font-semibold text-on-surface-variant">
              Booked Periods
            </h4>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {bookedDates.map((booking, index) => {
              const start = parseISODateAsLocal(booking.startDate);
              const end = parseISODateAsLocal(booking.endDate);
              return (
                <div
                  key={index}
                  className="flex items-center justify-between text-xs px-3 py-2 bg-red-50 rounded-lg border border-red-100"
                >
                  <span className="text-red-700 font-medium">
                    {start.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    —{" "}
                    {end.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span className="text-red-500 text-xs uppercase font-bold">
                    Booked
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-on-surface-variant mt-2 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Select dates that don&apos;t overlap with booked periods
          </p>
        </div>
      )}

      {/* Offline Banner */}
      {isOffline && (
        <div className="mb-4 p-4 rounded-xl bg-surface-container-high flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-on-surface-variant flex-shrink-0" />
          <p className="text-sm text-on-surface-variant">
            You&apos;re offline. Please check your connection to book.
          </p>
        </div>
      )}

      {status !== "ACTIVE" && (
        <div className="mb-4 p-4 rounded-xl bg-surface-container-high text-center">
          <p className="text-sm text-on-surface-variant">
            {status === "PAUSED"
              ? "This listing is temporarily unavailable. Check back later!"
              : "This room is currently rented out."}
          </p>
        </div>
      )}

      {/* Login Gate for logged-out users */}
      {!isLoggedIn && status === "ACTIVE" && (
        <div className="mb-4 p-6 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
            <LogIn className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-on-surface mb-2">
            Sign in to book this room
          </h3>
          <p className="text-sm text-on-surface-variant mb-4">
            Create an account or sign in to request a booking
          </p>
          <Link href="/login">
            <Button className="w-full h-11 font-semibold">
              <LogIn className="w-4 h-4 mr-2" />
              Sign in to continue
            </Button>
          </Link>
        </div>
      )}

      {isLoggedIn && (
        <form
          onSubmit={handleSubmit}
          className={`space-y-4 ${status !== "ACTIVE" ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label
                htmlFor="booking-start-date"
                className="text-xs font-semibold text-on-surface-variant uppercase"
              >
                Check-in
              </label>
              <DatePicker
                id="booking-start-date"
                value={startDate}
                onChange={(date) => {
                  setStartDate(date);
                  setFieldErrors((prev) => ({ ...prev, startDate: "" }));
                  if (errorType === "validation") {
                    setMessage("");
                    setErrorType(null);
                  }
                }}
                placeholder="Start date"
                minDate={new Date().toISOString().split("T")[0]}
                className={`p-2 text-sm ${fieldErrors.startDate ? "border-red-500 ring-1 ring-red-500" : ""}`}
                aria-describedby={
                  fieldErrors.startDate ? "startDate-error" : undefined
                }
                aria-invalid={!!fieldErrors.startDate}
              />
              {fieldErrors.startDate && (
                <p
                  id="startDate-error"
                  role="alert"
                  className="text-xs text-red-500 animate-error-in"
                >
                  {fieldErrors.startDate}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label
                htmlFor="booking-end-date"
                className="text-xs font-semibold text-on-surface-variant uppercase"
              >
                Check-out
              </label>
              <DatePicker
                id="booking-end-date"
                value={endDate}
                onChange={(date) => {
                  setEndDate(date);
                  setFieldErrors((prev) => ({ ...prev, endDate: "" }));
                  if (errorType === "validation") {
                    setMessage("");
                    setErrorType(null);
                  }
                }}
                placeholder="End date"
                minDate={startDate || new Date().toISOString().split("T")[0]}
                className={`p-2 text-sm ${fieldErrors.endDate ? "border-red-500 ring-1 ring-red-500" : ""}`}
                aria-describedby={
                  fieldErrors.endDate ? "endDate-error" : undefined
                }
                aria-invalid={!!fieldErrors.endDate}
              />
              {fieldErrors.endDate && (
                <p
                  id="endDate-error"
                  role="alert"
                  className="text-xs text-red-500 animate-error-in"
                >
                  {fieldErrors.endDate}
                </p>
              )}
            </div>
          </div>

          {/* Minimum stay tooltip - hover to see */}
          <div
            className="flex items-center justify-center gap-1 group cursor-help"
            title={`Minimum stay: ${MIN_BOOKING_DAYS} days`}
          >
            <Info className="w-3.5 h-3.5 text-on-surface-variant group-hover:text-on-surface-variant transition-colors" />
            <span className="text-xs text-on-surface-variant group-hover:text-on-surface-variant transition-colors">
              {MIN_BOOKING_DAYS} day minimum
            </span>
          </div>

          {/* Date Conflict Warning */}
          {dateConflict?.overlaps && (
            <div
              role="alert"
              className="rounded-xl p-3 bg-red-50 border border-red-200"
            >
              <p className="text-xs text-red-700 font-medium">
                ⚠️ Selected dates overlap with an existing booking
              </p>
            </div>
          )}

          {/* Slot selector for multi-slot PER_SLOT listings */}
          {showSlotSelector && (
            <SlotSelector
              value={slotsRequested}
              onChange={setSlotsRequested}
              max={availableSlots ?? 1}
              disabled={isLoading || hasSubmittedSuccessfully}
            />
          )}

          {/* Duration indicator */}
          {bookingInfo && (
            <div
              className={`text-sm text-center p-2 rounded-lg ${
                bookingInfo.isValid
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {bookingInfo.diffDays} days selected
              {!bookingInfo.isValid &&
                bookingInfo.diffDays > 0 &&
                bookingInfo.diffDays < MIN_BOOKING_DAYS && (
                  <span className="block text-xs">
                    Need {MIN_BOOKING_DAYS - bookingInfo.diffDays} more days
                  </span>
                )}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full rounded-xl"
            disabled={
              isLoading ||
              isOffline ||
              hasSubmittedSuccessfully ||
              (bookingInfo !== null && !bookingInfo.isValid) ||
              (dateConflict?.overlaps ?? false)
            }
            aria-busy={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Processing...
              </span>
            ) : (
              "Request to Book"
            )}
          </Button>

          {holdEnabled && (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full rounded-xl"
              disabled={
                isLoading ||
                isOffline ||
                hasSubmittedSuccessfully ||
                (bookingInfo !== null && !bookingInfo.isValid) ||
                (dateConflict?.overlaps ?? false)
              }
              onClick={async () => {
                if (!startDate || !endDate || !bookingInfo?.isValid) return;
                setIsLoading(true);
                setMessage("");
                setErrorType(null);
                try {
                  const result: BookingResult = await createHold(
                    listingId,
                    parseLocalDate(startDate),
                    parseLocalDate(endDate),
                    price,
                    effectiveSlots
                  );
                  if (result.success) {
                    setMessage("Hold placed successfully!");
                    setErrorType(null);
                    setHasSubmittedSuccessfully(true);
                    setTimeout(() => router.push("/bookings"), 1500);
                  } else {
                    setErrorType(categorizeError(result));
                    setMessage(result.error || "Failed to place hold");
                  }
                } catch {
                  setErrorType("server");
                  setMessage("An unexpected error occurred. Please try again.");
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              Place Hold ({holdTtlMinutes ?? 15} min)
            </Button>
          )}

          {/* Error/Success Messages */}
          {message &&
            (message.includes("success")
              ? renderSuccessMessage()
              : renderErrorBanner())}

          <p className="text-center text-xs text-on-surface-variant">
            You won&apos;t be charged yet
          </p>
        </form>
      )}

      {isLoggedIn && (
        <div className="mt-6 pt-6 space-y-3">
          <h4 className="text-sm font-semibold text-on-surface mb-3">
            Price breakdown
          </h4>

          {/* Daily rate calculation when dates are selected */}
          {bookingInfo && bookingInfo.diffDays > 0 ? (
            <>
              <div className="flex justify-between text-on-surface-variant text-sm">
                <span className="flex items-center gap-1">
                  ${(price / 30).toFixed(2)}/day
                  <span className="text-on-surface-variant">×</span>
                  {bookingInfo.diffDays} days
                </span>
                <span>${bookingInfo.totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant text-sm">
                <span>Service fee</span>
                <span className="text-green-600">Free</span>
              </div>
              <div className="flex justify-between text-on-surface-variant text-xs">
                <span>Security deposit</span>
                <span>Handled separately</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-on-surface-variant text-sm">
                <span>Monthly rent</span>
                <span>${price}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant text-sm">
                <span>Daily rate</span>
                <span>${(price / 30).toFixed(2)}/day</span>
              </div>
              <div className="flex justify-between text-on-surface-variant text-sm">
                <span>Service fee</span>
                <span className="text-green-600">Free</span>
              </div>
            </>
          )}

          <div className="h-px bg-surface-container-high my-2" />

          <div className="flex justify-between font-bold text-lg text-on-surface">
            <span>Total</span>
            <span>${bookingInfo?.totalPrice.toFixed(2) || price}</span>
          </div>

          {bookingInfo && bookingInfo.diffDays > 0 && (
            <p className="text-xs text-on-surface-variant text-center">
              {Math.ceil(bookingInfo.diffDays / 30)} month
              {Math.ceil(bookingInfo.diffDays / 30) !== 1 ? "s" : ""} stay
            </p>
          )}
        </div>
      )}

      {/* Confirmation Modal - Using Portal to escape sticky container stacking context */}
      {showConfirmModal &&
        bookingInfo &&
        typeof document !== "undefined" &&
        createPortal(
          <FocusTrap active={showConfirmModal}>
            <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm cursor-pointer"
                onClick={() => {
                  setShowConfirmModal(false);
                  if (isLoading) {
                    toast("Your booking may still be processing. Check your bookings page for status.", { duration: 5000 });
                  }
                }}
              />

              {/* Modal Content */}
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-confirm-title"
                className="relative bg-surface-container-lowest rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 fade-in duration-200"
              >
                <h3
                  id="booking-confirm-title"
                  className="text-xl font-bold text-on-surface mb-4"
                >
                  Confirm Your Booking Request
                </h3>

                <div className="space-y-4">
                  {/* Dates Summary */}
                  <div className="bg-surface-canvas rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-on-surface-variant">
                        Check-in
                      </span>
                      <span className="text-sm font-semibold text-on-surface">
                        {parseLocalDate(startDate).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-on-surface-variant">
                        Check-out
                      </span>
                      <span className="text-sm font-semibold text-on-surface">
                        {parseLocalDate(endDate).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="h-px bg-surface-container-high" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-on-surface-variant">
                        Duration
                      </span>
                      <span className="text-sm font-semibold text-on-surface">
                        {bookingInfo.diffDays} days (
                        {Math.ceil(bookingInfo.diffDays / 30)} month
                        {Math.ceil(bookingInfo.diffDays / 30) !== 1 ? "s" : ""})
                      </span>
                    </div>
                  </div>

                  {/* Price Summary */}
                  <div className="bg-primary/5 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-on-surface-variant">
                        ${(price / 30).toFixed(2)}/day × {bookingInfo.diffDays}{" "}
                        days
                      </span>
                      <span className="text-on-surface">
                        ${bookingInfo.totalPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-on-surface-variant">
                        Service fee
                      </span>
                      <span className="text-green-600">
                        Free
                      </span>
                    </div>
                    <div className="h-px bg-primary/20" />
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-on-surface">
                        Total
                      </span>
                      <span className="text-xl font-bold text-primary">
                        ${bookingInfo.totalPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Notice */}
                  <p className="text-xs text-on-surface-variant text-center">
                    By confirming, you&apos;re sending a booking request to the
                    host. You won&apos;t be charged until the host accepts.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={() => {
                      setShowConfirmModal(false);
                      if (isLoading) {
                        toast("Your booking may still be processing. Check your bookings page for status.", { duration: 5000 });
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 h-11 font-semibold"
                    onClick={confirmSubmit}
                    disabled={isLoading}
                    aria-busy={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2
                          className="w-4 h-4 mr-2 animate-spin"
                          aria-hidden="true"
                        />
                        Securing your booking...
                      </>
                    ) : (
                      "Confirm Booking"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </FocusTrap>,
          document.body
        )}
    </div>
  );
}
