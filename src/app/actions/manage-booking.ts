"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";
import { checkSuspension } from "./suspension";
import { logger } from "@/lib/logger";
import { logBookingAudit } from "@/lib/booking-audit";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  applyInventoryDeltas,
  expireOverlappingExpiredHolds,
  getAvailability,
} from "@/lib/availability";
import { markListingsDirty } from "@/lib/search/search-doc-dirty";
import { waitForTestBarrier } from "@/lib/test-barriers";
import {
  validateTransition,
  isInvalidStateTransitionError,
  type BookingStatus,
} from "@/lib/booking-state-machine";

export type { BookingStatus } from "@/lib/booking-state-machine";

type UpdateBookingStatusSuccessResult = {
  success: true;
  error?: undefined;
  code?: undefined;
};
type UpdateBookingStatusErrorResult = {
  success: false;
  error: string;
  code?: string;
};

export type UpdateBookingStatusResult =
  | UpdateBookingStatusSuccessResult
  | UpdateBookingStatusErrorResult;

const INVENTORY_DELTA_CONFLICT_RESULT: UpdateBookingStatusErrorResult = {
  success: false,
  error:
    "This booking could not be updated because availability changed. Please refresh and try again.",
  code: "INVENTORY_DELTA_CONFLICT",
};

const HOST_MANAGED_BOOKING_FORBIDDEN_RESULT: UpdateBookingStatusErrorResult = {
  success: false,
  error:
    "This listing now uses host-managed availability. Contact the host instead.",
  code: "HOST_MANAGED_BOOKING_FORBIDDEN",
};

function getInventoryDeltaConflictResult(
  error: unknown
): UpdateBookingStatusErrorResult | null {
  if (
    error instanceof Error &&
    error.message === INVENTORY_DELTA_CONFLICT_RESULT.code
  ) {
    return INVENTORY_DELTA_CONFLICT_RESULT;
  }

  return null;
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
  rejectionReason?: string
): Promise<UpdateBookingStatusResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized", code: "SESSION_EXPIRED" };
  }

  const rl = await checkRateLimit(
    session.user.id,
    "updateBookingStatus",
    RATE_LIMITS.bookingStatus
  );
  if (!rl.success) {
    return { success: false, error: "Too many requests. Please wait." };
  }

  const suspension = await checkSuspension();
  if (suspension.suspended) {
    return { success: false, error: suspension.error || "Account suspended" };
  }

  // Phase 4: Only the sweeper CTE should set EXPIRED — block manual API calls
  if (status === "EXPIRED") {
    return {
      success: false,
      error: "Cannot manually expire bookings",
      code: "INVALID_TARGET_STATUS",
    };
  }

  // Validate rejectionReason length if provided
  if (rejectionReason !== undefined && rejectionReason.trim().length > 1000) {
    return {
      success: false,
      error: "Rejection reason must not exceed 1000 characters",
    };
  }

  try {
    // Get the booking with listing and user info for notifications
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        listing: {
          select: {
            ownerId: true,
            availableSlots: true,
            totalSlots: true,
            availabilitySource: true,
            id: true,
            title: true,
            owner: {
              select: { name: true },
            },
          },
        },
        tenant: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    if (booking.listing.availabilitySource === "HOST_MANAGED") {
      return HOST_MANAGED_BOOKING_FORBIDDEN_RESULT;
    }

    // Only listing owner can accept/reject, or tenant can cancel their own booking
    const isOwner = booking.listing.ownerId === session.user.id;
    const isTenant = booking.tenantId === session.user.id;

    if (status === "CANCELLED" && !isTenant) {
      return { success: false, error: "Only the tenant can cancel a booking" };
    }

    if ((status === "ACCEPTED" || status === "REJECTED") && !isOwner) {
      return {
        success: false,
        error: "Only the listing owner can accept or reject bookings",
      };
    }

    // Design note: All transactions in this file use READ COMMITTED (Prisma default)
    // + FOR UPDATE on the Listing row. FOR UPDATE serializes all booking operations
    // for the same listing. The capacity SUM query runs inside the lock scope, ensuring
    // it always sees the latest committed state. SERIALIZABLE is not needed here
    // (unlike createBooking/createHold which run the duplicate check before acquiring
    // the lock). See booking.ts for the SERIALIZABLE pattern.

    // Phase 4: Check-on-read inline expiry (defense-in-depth, D9)
    // If sweeper lags, reading an expired HELD booking auto-expires it
    if (
      booking.status === "HELD" &&
      booking.heldUntil &&
      new Date(booking.heldUntil) < new Date()
    ) {
      // Best-effort inline expiry — sweeper is the primary mechanism
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM "Listing" WHERE "id" = ${booking.listing.id} FOR UPDATE`;
          await expireOverlappingExpiredHolds(tx, {
            listingId: booking.listing.id,
            startDate: booking.startDate,
            endDate: booking.endDate,
          });
        });
      } catch (err) {
        logger.sync.warn("Inline expiry failed (code: INLINE_EXPIRY_FAILED)", {
          action: "updateBookingStatus",
          bookingId: booking.id,
          listingId: booking.listing.id,
          targetStatus: status,
          heldUntil: booking.heldUntil
            ? new Date(booking.heldUntil).toISOString()
            : null,
          code: "INLINE_EXPIRY_FAILED",
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
      // Always return error regardless of whether expiry succeeded
      return { success: false, error: "This hold has expired." };
    }

    // P0-03 FIX: Validate state transition before proceeding
    // Prevents invalid transitions like CANCELLED → ACCEPTED
    try {
      validateTransition(booking.status, status);
    } catch (error) {
      if (isInvalidStateTransitionError(error)) {
        return {
          success: false,
          error: `Cannot change booking from ${booking.status} to ${status}`,
          code: "INVALID_STATE_TRANSITION",
        };
      }
      throw error;
    }

    let capacityChanged = false;

    // Handle ACCEPTED status with atomic transaction to prevent double-booking
    if (status === "ACCEPTED") {
      // Phase 4: HELD→ACCEPTED path — slots already consumed at hold creation (D4)
      if (booking.status === "HELD") {
        // Verify hold is still active before accepting
        if (
          booking.heldUntil &&
          new Date(booking.heldUntil as Date) < new Date()
        ) {
          return {
            success: false,
            error:
              "This hold has expired. The booking has been automatically released.",
          };
        }

        try {
          await prisma.$transaction(async (tx) => {
            // FOR UPDATE lock for TOCTOU protection
            const [listing] = await tx.$queryRaw<
              Array<{ ownerId: string; status: string }>
            >`
                            SELECT "ownerId", "status" FROM "Listing"
                            WHERE "id" = ${booking.listing.id}
                            FOR UPDATE
                        `;

            if (listing.ownerId !== session.user.id) {
              throw new Error("UNAUTHORIZED_IN_TRANSACTION");
            }

            if (listing.status !== "ACTIVE") {
              throw new Error("LISTING_NOT_ACTIVE");
            }

            await expireOverlappingExpiredHolds(tx, {
              listingId: booking.listing.id,
              startDate: booking.startDate,
              endDate: booking.endDate,
            });

            // Verify booking is still HELD and not expired (atomic check)
            const updateResult = await tx.booking.updateMany({
              where: {
                id: bookingId,
                status: "HELD",
                version: booking.version,
              },
              data: {
                status: "ACCEPTED",
                heldUntil: null, // Clear hold expiry
                version: { increment: 1 },
              },
            });

            if (updateResult.count === 0) {
              throw new Error("HOLD_EXPIRED_OR_MODIFIED");
            }

            await logBookingAudit(tx, {
              bookingId: bookingId,
              action: "ACCEPTED",
              previousStatus: "HELD",
              newStatus: "ACCEPTED",
              actorId: session.user.id,
              actorType: "HOST",
              details: {
                slotsRequested: booking.slotsRequested,
                version: booking.version,
              },
            });

            await applyInventoryDeltas(tx, {
              listingId: booking.listing.id,
              startDate: booking.startDate,
              endDate: booking.endDate,
              totalSlots: booking.listing.totalSlots,
              heldDelta: -booking.slotsRequested,
              acceptedDelta: booking.slotsRequested,
            });
          });
          capacityChanged = true;
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === "UNAUTHORIZED_IN_TRANSACTION") {
              return {
                success: false,
                error: "Only the listing owner can accept or reject bookings",
                code: "UNAUTHORIZED",
              };
            }
            if (error.message === "LISTING_NOT_ACTIVE") {
              return {
                success: false,
                error:
                  "Cannot accept bookings on an inactive listing. The listing must be active.",
                code: "LISTING_NOT_ACTIVE",
              };
            }
            if (error.message === "HOLD_EXPIRED_OR_MODIFIED") {
              return {
                success: false,
                error:
                  "This hold has expired or was modified. Please refresh and try again.",
                code: "CONCURRENT_MODIFICATION",
              };
            }
          }
          const inventoryDeltaConflict = getInventoryDeltaConflictResult(error);
          if (inventoryDeltaConflict) {
            return inventoryDeltaConflict;
          }
          if (
            error instanceof Error &&
            error.message.includes("WHOLE_UNIT_OVERLAP")
          ) {
            return {
              success: false,
              error:
                "Cannot accept: overlapping booking exists for this whole-unit listing",
            };
          }
          throw error;
        }
      } else {
        // PENDING→ACCEPTED path (original logic)
        try {
          await prisma.$transaction(async (tx) => {
            // Lock the listing row with FOR UPDATE to prevent concurrent reads
            const [listing] = await tx.$queryRaw<
              Array<{
                availableSlots: number;
                totalSlots: number;
                id: string;
                ownerId: string;
                bookingMode: string;
                status: string;
              }>
            >`
                            SELECT "availableSlots", "totalSlots", "id", "ownerId", "booking_mode" as "bookingMode", "status" FROM "Listing"
                            WHERE "id" = ${booking.listing.id}
                            FOR UPDATE
                        `;

            // P0-3 FIX: Re-verify ownership under row lock (TOCTOU protection)
            if (listing.ownerId !== session.user.id) {
              throw new Error("UNAUTHORIZED_IN_TRANSACTION");
            }

            if (listing.status !== "ACTIVE") {
              throw new Error("LISTING_NOT_ACTIVE");
            }

            // Phase 3: For WHOLE_UNIT, override slotsNeeded to current totalSlots from the locked row.
            const slotsNeeded =
              listing.bookingMode === "WHOLE_UNIT"
                ? listing.totalSlots
                : booking.slotsRequested;

            await expireOverlappingExpiredHolds(tx, {
              listingId: booking.listing.id,
              startDate: booking.startDate,
              endDate: booking.endDate,
            });
            await waitForTestBarrier(
              "booking:accept:before-availability-check"
            );

            const availability = await getAvailability(booking.listingId, {
              startDate: booking.startDate,
              endDate: booking.endDate,
              tx,
            });

            if (
              !availability ||
              availability.effectiveAvailableSlots < slotsNeeded
            ) {
              throw new Error("CAPACITY_EXCEEDED");
            }

            // P0-04 FIX: Atomically update booking status with optimistic locking
            const updateResult = await tx.booking.updateMany({
              where: {
                id: bookingId,
                version: booking.version,
              },
              data: {
                status: "ACCEPTED",
                version: { increment: 1 },
              },
            });

            if (updateResult.count === 0) {
              throw new Error("CONCURRENT_MODIFICATION");
            }

            // C2 FIX: Conditional UPDATE — hard error if insufficient slots
            // Phase 3: Use slotsNeeded (which accounts for WHOLE_UNIT override)
            const slotsToDecrement = slotsNeeded;
            const decrementResult = await tx.$executeRaw`
                            UPDATE "Listing"
                            SET "availableSlots" = "availableSlots" - ${slotsToDecrement}
                            WHERE "id" = ${booking.listing.id}
                            AND "availableSlots" >= ${slotsToDecrement}
                        `;
            if (decrementResult === 0) {
              throw new Error("SLOT_UNDERFLOW");
            }

            await applyInventoryDeltas(tx, {
              listingId: booking.listing.id,
              startDate: booking.startDate,
              endDate: booking.endDate,
              totalSlots: listing.totalSlots,
              acceptedDelta: slotsNeeded,
            });

            await logBookingAudit(tx, {
              bookingId: bookingId,
              action: "ACCEPTED",
              previousStatus: "PENDING",
              newStatus: "ACCEPTED",
              actorId: session.user.id,
              actorType: "HOST",
              details: {
                slotsRequested: booking.slotsRequested,
                version: booking.version,
              },
            });
          });
          capacityChanged = true;
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === "UNAUTHORIZED_IN_TRANSACTION") {
              return {
                success: false,
                error: "Only the listing owner can accept or reject bookings",
                code: "UNAUTHORIZED",
              };
            }
            if (error.message === "LISTING_NOT_ACTIVE") {
              return {
                success: false,
                error:
                  "Cannot accept bookings on an inactive listing. The listing must be active.",
                code: "LISTING_NOT_ACTIVE",
              };
            }
            if (error.message === "NO_SLOTS_AVAILABLE") {
              return {
                success: false,
                error: "No available slots for this listing",
              };
            }
            if (error.message === "CAPACITY_EXCEEDED") {
              return {
                success: false,
                error:
                  "Cannot accept: all slots for these dates are already booked",
              };
            }
            if (error.message === "SLOT_UNDERFLOW") {
              return {
                success: false,
                error: "No available slots for this listing",
              };
            }
            if (error.message === "CONCURRENT_MODIFICATION") {
              return {
                success: false,
                error:
                  "Booking was modified by another request. Please refresh and try again.",
                code: "CONCURRENT_MODIFICATION",
              };
            }
          }
          const inventoryDeltaConflict = getInventoryDeltaConflictResult(error);
          if (inventoryDeltaConflict) {
            return inventoryDeltaConflict;
          }
          // Phase 3: Handle DB trigger exception for WHOLE_UNIT overlap
          if (
            error instanceof Error &&
            error.message.includes("WHOLE_UNIT_OVERLAP")
          ) {
            return {
              success: false,
              error:
                "Cannot accept: overlapping booking exists for this whole-unit listing",
            };
          }
          throw error;
        }
      }

      // Notify tenant of acceptance (outside transaction for performance)
      // Guard: tenant may be null if they deleted their account (SetNull FK)
      try {
        if (booking.tenant) {
          await createInternalNotification({
            userId: booking.tenant.id,
            type: "BOOKING_ACCEPTED",
            title: "Booking Accepted!",
            message: `Your booking for "${booking.listing.title}" has been accepted`,
            link: "/bookings",
          });
        }

        if (booking.tenant?.email) {
          await sendNotificationEmailWithPreference(
            "bookingAccepted",
            booking.tenant.id,
            booking.tenant.email,
            {
              tenantName: booking.tenant.name || "User",
              listingTitle: booking.listing.title,
              hostName: booking.listing.owner.name || "Host",
              startDate: booking.startDate.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
              listingId: booking.listing.id,
            }
          );
        }
      } catch (notificationError) {
        logger.sync.error("Failed to send acceptance notification", {
          action: "updateBookingStatus",
          bookingId,
          error:
            notificationError instanceof Error
              ? notificationError.message
              : "Unknown error",
        });
      }
    }

    // Handle REJECTED status
    if (status === "REJECTED") {
      // P0-3 FIX: Wrap in transaction with FOR UPDATE to re-verify ownership (TOCTOU protection)
      try {
        await prisma.$transaction(async (tx) => {
          const [listing] = await tx.$queryRaw<Array<{ ownerId: string }>>`
                        SELECT "ownerId" FROM "Listing"
                        WHERE "id" = ${booking.listing.id}
                        FOR UPDATE
                    `;

          if (!listing || listing.ownerId !== session.user.id) {
            throw new Error("UNAUTHORIZED_IN_TRANSACTION");
          }

          const updateResult = await tx.booking.updateMany({
            where: {
              id: bookingId,
              version: booking.version,
            },
            data: {
              status: "REJECTED",
              rejectionReason: rejectionReason?.trim() || null,
              heldUntil: null, // Clear hold expiry if HELD→REJECTED
              version: { increment: 1 },
            },
          });

          if (updateResult.count === 0) {
            throw new Error("CONCURRENT_MODIFICATION");
          }

          // Phase 4 (6c-ii): If was HELD, restore slots (HELD consumed slots at creation)
          if (booking.status === "HELD") {
            const slotsToRestore = booking.slotsRequested;
            await tx.$executeRaw`
                            UPDATE "Listing"
                            SET "availableSlots" = LEAST("availableSlots" + ${slotsToRestore}, "totalSlots")
                            WHERE "id" = ${booking.listing.id}
                        `;

            await applyInventoryDeltas(tx, {
              listingId: booking.listing.id,
              startDate: booking.startDate,
              endDate: booking.endDate,
              totalSlots: booking.listing.totalSlots,
              heldDelta: -slotsToRestore,
            });
          }

          await logBookingAudit(tx, {
            bookingId: booking.id,
            action: "REJECTED",
            previousStatus: booking.status,
            newStatus: "REJECTED",
            actorId: session.user.id,
            actorType: "HOST",
            details: { rejectionReason, version: booking.version },
          });
        });
        if (booking.status === "HELD") {
          capacityChanged = true;
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "UNAUTHORIZED_IN_TRANSACTION") {
            return {
              success: false,
              error: "Only the listing owner can accept or reject bookings",
              code: "UNAUTHORIZED",
            };
          }
          if (error.message === "CONCURRENT_MODIFICATION") {
            return {
              success: false,
              error:
                "Booking was modified by another request. Please refresh and try again.",
              code: "CONCURRENT_MODIFICATION",
            };
          }
        }
        const inventoryDeltaConflict = getInventoryDeltaConflictResult(error);
        if (inventoryDeltaConflict) {
          return inventoryDeltaConflict;
        }
        throw error;
      }

      // Build rejection message with optional reason
      const reasonText = rejectionReason?.trim()
        ? ` Reason: ${rejectionReason.trim()}`
        : "";

      // Notify tenant of rejection (guard: tenant may be null if account deleted)
      try {
        if (booking.tenant) {
          await createInternalNotification({
            userId: booking.tenant.id,
            type: "BOOKING_REJECTED",
            title: "Booking Not Accepted",
            message: `Your booking for "${booking.listing.title}" was not accepted.${reasonText}`,
            link: "/bookings",
          });
        }

        // Send email to tenant (respecting preferences)
        if (booking.tenant?.email) {
          await sendNotificationEmailWithPreference(
            "bookingRejected",
            booking.tenant.id,
            booking.tenant.email,
            {
              tenantName: booking.tenant.name || "User",
              listingTitle: booking.listing.title,
              hostName: booking.listing.owner.name || "Host",
              rejectionReason: rejectionReason?.trim() || undefined,
            }
          );
        }
      } catch (notificationError) {
        logger.sync.error("Failed to send rejection notification", {
          action: "updateBookingStatus",
          bookingId,
          error:
            notificationError instanceof Error
              ? notificationError.message
              : "Unknown error",
        });
      }
    }

    // Handle CANCELLED status - wrap in transaction for data integrity
    // P0-3 NOTE: CANCELLED path TOCTOU is mitigated by optimistic locking (version field)
    // and tenantId immutability on bookings — no ownership re-check needed here
    if (status === "CANCELLED") {
      // Phase 4 (6c): Both ACCEPTED and HELD consume slots — must restore on cancel
      if (booking.status === "ACCEPTED" || booking.status === "HELD") {
        try {
          await prisma.$transaction(async (tx) => {
            // FOR UPDATE lock on Listing to prevent concurrent slot modification
            await tx.$queryRaw`SELECT 1 FROM "Listing" WHERE "id" = ${booking.listing.id} FOR UPDATE`;

            const updateResult = await tx.booking.updateMany({
              where: {
                id: bookingId,
                version: booking.version,
              },
              data: {
                status: "CANCELLED",
                heldUntil: null, // Clear hold expiry if HELD
                version: { increment: 1 },
              },
            });

            if (updateResult.count === 0) {
              throw new Error("CONCURRENT_MODIFICATION");
            }

            // BIZ-07: Clamp availableSlots so it never exceeds totalSlots
            // Phase 2: Restore slotsRequested (not hardcoded 1)
            const slotsToRestore = booking.slotsRequested;
            await tx.$executeRaw`
                            UPDATE "Listing"
                            SET "availableSlots" = LEAST("availableSlots" + ${slotsToRestore}, "totalSlots")
                            WHERE "id" = ${booking.listing.id}
                        `;

            await applyInventoryDeltas(tx, {
              listingId: booking.listing.id,
              startDate: booking.startDate,
              endDate: booking.endDate,
              totalSlots: booking.listing.totalSlots,
              ...(booking.status === "HELD"
                ? { heldDelta: -slotsToRestore }
                : { acceptedDelta: -slotsToRestore }),
            });

            await logBookingAudit(tx, {
              bookingId: bookingId,
              action: "CANCELLED",
              previousStatus: booking.status,
              newStatus: "CANCELLED",
              actorId: session.user.id,
              actorType: "USER",
              details: {
                slotsRequested: booking.slotsRequested,
                previousStatus: booking.status,
              },
            });
          });
          capacityChanged = true;
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "CONCURRENT_MODIFICATION"
          ) {
            return {
              success: false,
              error:
                "Booking was modified by another request. Please refresh and try again.",
              code: "CONCURRENT_MODIFICATION",
            };
          }
          const inventoryDeltaConflict = getInventoryDeltaConflictResult(error);
          if (inventoryDeltaConflict) {
            return inventoryDeltaConflict;
          }
          throw error;
        }
      } else {
        // PENDING — no slots consumed, wrap in TX for audit atomicity
        try {
          await prisma.$transaction(async (tx) => {
            const updateResult = await tx.booking.updateMany({
              where: {
                id: bookingId,
                version: booking.version,
              },
              data: {
                status: "CANCELLED",
                version: { increment: 1 },
              },
            });

            if (updateResult.count === 0) {
              throw new Error("CONCURRENT_MODIFICATION");
            }

            await logBookingAudit(tx, {
              bookingId: bookingId,
              action: "CANCELLED",
              previousStatus: "PENDING",
              newStatus: "CANCELLED",
              actorId: session.user.id,
              actorType: "USER",
              details: { slotsRequested: booking.slotsRequested },
            });
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "CONCURRENT_MODIFICATION"
          ) {
            return {
              success: false,
              error:
                "Booking was modified by another request. Please refresh and try again.",
              code: "CONCURRENT_MODIFICATION",
            };
          }
          throw error;
        }
      }

      // Notify host of cancellation
      try {
        await createInternalNotification({
          userId: booking.listing.ownerId,
          type: "BOOKING_CANCELLED",
          title: "Booking Cancelled",
          message: `${booking.tenant?.name || "A tenant"} cancelled their booking for "${booking.listing.title}"`,
          link: "/bookings",
        });
      } catch (notificationError) {
        logger.sync.error("Failed to send cancellation notification", {
          action: "updateBookingStatus",
          bookingId,
          error:
            notificationError instanceof Error
              ? notificationError.message
              : "Unknown error",
        });
      }
    }

    revalidatePath("/bookings");
    revalidatePath(`/listings/${booking.listing.id}`);
    if (capacityChanged) {
      await markListingsDirty([booking.listing.id], "listing_updated");
    }

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to update booking status", {
      action: "updateBookingStatus",
      bookingId,
      targetStatus: status,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: "Failed to update booking status" };
  }
}

export async function getMyBookings() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", code: "SESSION_EXPIRED", bookings: [] };
  }

  try {
    // Fetch sent and received bookings in parallel (independent queries)
    const [sentBookings, receivedBookings] = await Promise.all([
      // Bookings where user is the tenant
      prisma.booking.findMany({
        where: { tenantId: session.user.id },
        include: {
          listing: {
            include: {
              location: {
                select: { address: true, city: true, state: true, zip: true },
              },
              owner: {
                select: { id: true, name: true, image: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Bookings for listings the user owns
      prisma.booking.findMany({
        where: {
          listing: { ownerId: session.user.id },
        },
        include: {
          listing: {
            include: {
              location: {
                select: { address: true, city: true, state: true, zip: true },
              },
            },
          },
          tenant: {
            select: { id: true, name: true, image: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      sentBookings,
      receivedBookings,
      error: null,
    };
  } catch (error: unknown) {
    logger.sync.error("Failed to fetch bookings", {
      action: "getMyBookings",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      error: "Failed to fetch bookings",
      sentBookings: [],
      receivedBookings: [],
    };
  }
}
