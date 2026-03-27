"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";
import { createBookingSchema, createHoldSchema } from "@/lib/schemas";
import { z } from "zod";
import { checkSuspension, checkEmailVerified } from "./suspension";
import { logger } from "@/lib/logger";
import { withIdempotency } from "@/lib/idempotency";
import {
  checkRateLimit,
  getClientIPFromHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { headers } from "next/headers";
import { HOLD_TTL_MINUTES, MAX_HOLDS_PER_USER } from "@/lib/hold-constants";
import { logBookingAudit } from "@/lib/booking-audit";

// Booking result type for structured error handling
export type BookingResult = {
  success: boolean;
  bookingId?: string;
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
  currentPrice?: number;
  heldUntil?: string; // Phase 4: ISO timestamp for hold expiry (powers countdown timer)
  holdTtlMinutes?: number; // Phase 4: TTL in minutes for hold
};

// Internal result type with side effect data (not exposed to callers)
type InternalBookingResult =
  | {
      success: false;
      error: string;
      code?: string;
      fieldErrors?: Record<string, string>;
      currentPrice?: number;
    }
  | {
      success: true;
      bookingId: string;
      listingId: string;
      listingTitle: string;
      listingOwnerId: string;
      ownerEmail: string | null;
      ownerName: string | null;
      tenantName: string | null;
    };

// Prisma transaction client type for withIdempotency
type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

/**
 * Core booking logic that runs inside a transaction.
 * Returns InternalBookingResult with all data needed for side effects.
 */
async function executeBookingTransaction(
  tx: TransactionClient,
  userId: string,
  listingId: string,
  startDate: Date,
  endDate: Date,
  clientPricePerMonth: number,
  slotsRequested: number
): Promise<InternalBookingResult> {
  // Check for existing duplicate booking (same tenant, listing, dates)
  // This serves as server-side idempotency - if same booking already exists, treat as duplicate
  // Phase 4: Include HELD in duplicate check to prevent booking when hold exists
  const existingDuplicate = await tx.booking.findFirst({
    where: {
      tenantId: userId,
      listingId,
      startDate,
      endDate,
      status: { in: ["PENDING", "ACCEPTED", "HELD"] },
    },
  });

  if (existingDuplicate) {
    return {
      success: false,
      error: "You already have a booking request for these exact dates.",
    };
  }

  // Get the listing with FOR UPDATE lock to prevent concurrent booking race conditions
  // This locks the row until the transaction completes, ensuring atomic check-and-create
  const [listing] = await tx.$queryRaw<
    Array<{
      id: string;
      title: string;
      ownerId: string;
      totalSlots: number;
      availableSlots: number;
      status: string;
      price: number;
      bookingMode: string;
    }>
  >`
        SELECT "id", "title", "ownerId", "totalSlots", "availableSlots", "status", "price", "booking_mode" as "bookingMode"
        FROM "Listing"
        WHERE "id" = ${listingId}
        FOR UPDATE
    `;

  if (!listing) {
    return { success: false, error: "Listing not found" };
  }

  // P1 FIX: Validate client-provided price against authoritative DB price
  // Reject if mismatch (tolerance $0.01 for floating-point rounding)
  // Note: listing.price may be Prisma.Decimal after Float→Decimal migration
  const listingPrice = Number(listing.price);
  if (Math.abs(clientPricePerMonth - listingPrice) > 0.01) {
    return {
      success: false,
      error:
        "The listing price has changed. Please review the updated price and try again.",
      code: "PRICE_CHANGED",
      currentPrice: listingPrice,
    };
  }

  // Fetch owner details separately (no lock needed, read-only)
  const owner = await tx.user.findUnique({
    where: { id: listing.ownerId },
    select: { id: true, name: true, email: true },
  });

  if (!owner) {
    return { success: false, error: "Listing owner not found" };
  }

  // Prevent owners from booking their own listings
  if (listing.ownerId === userId) {
    return {
      success: false,
      error: "You cannot book your own listing.",
    };
  }

  // Check for blocks between tenant and host
  const { checkBlockBeforeAction } = await import("./block");
  const blockCheck = await checkBlockBeforeAction(owner.id);
  if (!blockCheck.allowed) {
    return {
      success: false,
      error: blockCheck.message || "Unable to book this listing",
    };
  }

  // Check if listing is available for booking
  if (listing.status !== "ACTIVE") {
    return {
      success: false,
      error: "This listing is not currently available for booking.",
    };
  }

  // Phase 3: For WHOLE_UNIT, force slotsRequested = totalSlots
  // NO feature flag check — once listing IS WHOLE_UNIT in DB, always enforce.
  // The flag only gates CREATING/CHANGING to WHOLE_UNIT (listing routes).
  const effectiveSlotsRequested =
    listing.bookingMode === "WHOLE_UNIT" ? listing.totalSlots : slotsRequested;

  // Phase 2: Sum slotsRequested for accurate capacity check
  // Count ACCEPTED bookings AND active HELD bookings (not yet expired)
  const overlappingAcceptedSlots = await tx.$queryRaw<[{ total: bigint }]>`
        SELECT COALESCE(SUM("slotsRequested"), 0) AS total
        FROM "Booking"
        WHERE "listingId" = ${listingId}
        AND ("status" = 'ACCEPTED' OR ("status" = 'HELD' AND "heldUntil" > NOW()))
        AND "startDate" <= ${endDate}
        AND "endDate" >= ${startDate}
    `;
  const usedSlots = Number(overlappingAcceptedSlots[0].total);

  if (usedSlots + effectiveSlotsRequested > listing.totalSlots) {
    return {
      success: false,
      error: `Not enough available slots. ${listing.totalSlots - usedSlots} of ${listing.totalSlots} slots available.`,
      fieldErrors: {
        startDate: "Insufficient capacity",
        endDate: "Insufficient capacity",
      },
    };
  }

  // Check if the current user already has a pending/accepted/held booking for overlapping dates
  // Phase 4: Include HELD in overlap check
  const userExistingBooking = await tx.booking.findFirst({
    where: {
      listingId,
      tenantId: userId,
      status: { in: ["PENDING", "ACCEPTED", "HELD"] },
      AND: [{ startDate: { lte: endDate } }, { endDate: { gte: startDate } }],
    },
  });

  if (userExistingBooking) {
    return {
      success: false,
      error: "You already have a booking request for overlapping dates.",
      fieldErrors: {
        startDate: "Existing booking",
        endDate: "Existing booking",
      },
    };
  }

  // Get tenant info
  const tenant = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  // P1 FIX: Calculate total price from authoritative DB price (not client value)
  // Note: listingPrice already converted via Number() above (Decimal→number)
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const pricePerDay = listingPrice / 30;
  const totalPrice = Math.round(diffDays * pricePerDay * 100) / 100;

  // Create the booking within the transaction
  const booking = await tx.booking.create({
    data: {
      listingId,
      tenantId: userId,
      startDate,
      endDate,
      totalPrice,
      status: "PENDING",
      slotsRequested: effectiveSlotsRequested,
    },
  });

  await logBookingAudit(tx, {
    bookingId: booking.id,
    action: "CREATED",
    previousStatus: null,
    newStatus: "PENDING",
    actorId: userId,
    actorType: "USER",
    details: { slotsRequested: booking.slotsRequested, listingId },
  });

  return {
    success: true,
    bookingId: booking.id,
    listingId: listing.id,
    listingTitle: listing.title,
    listingOwnerId: listing.ownerId,
    ownerEmail: owner.email,
    ownerName: owner.name,
    tenantName: tenant?.name || null,
  };
}

/**
 * Run side effects (notifications, email, revalidation) after successful booking.
 * Only called when booking is newly created (not from cache).
 */
async function runBookingSideEffects(
  result: Extract<InternalBookingResult, { success: true }>,
  startDate: Date,
  endDate: Date
): Promise<void> {
  // Create in-app notification for host
  await createInternalNotification({
    userId: result.listingOwnerId,
    type: "BOOKING_REQUEST",
    title: "New Booking Request",
    message: `${result.tenantName || "Someone"} requested to book "${result.listingTitle}"`,
    link: "/bookings",
  });

  // Send email notification to host (respecting preferences)
  if (result.ownerEmail) {
    await sendNotificationEmailWithPreference(
      "bookingRequest",
      result.listingOwnerId,
      result.ownerEmail,
      {
        hostName: result.ownerName || "Host",
        tenantName: result.tenantName || "A user",
        listingTitle: result.listingTitle,
        startDate: startDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        endDate: endDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        listingId: result.listingId,
      }
    );
  }

  revalidatePath(`/listings/${result.listingId}`);
  revalidatePath("/bookings");
}

/**
 * Convert InternalBookingResult to BookingResult (strips side effect data).
 */
function toBookingResult(result: InternalBookingResult): BookingResult {
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      code: result.code,
      fieldErrors: result.fieldErrors,
      currentPrice: result.currentPrice,
    };
  }
  return { success: true, bookingId: result.bookingId };
}

function toHoldBookingResult(result: InternalHoldResult): BookingResult {
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      code: result.code,
      fieldErrors: result.fieldErrors,
      currentPrice: result.currentPrice,
    };
  }
  return {
    success: true,
    bookingId: result.bookingId,
    heldUntil: result.heldUntil.toISOString(),
    holdTtlMinutes: result.holdTtlMinutes,
  };
}

export async function createBooking(
  listingId: string,
  startDate: Date,
  endDate: Date,
  pricePerMonth: number,
  slotsRequested: number = 1,
  idempotencyKey?: string
): Promise<BookingResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      success: false,
      error: "You must be logged in to book",
      code: "SESSION_EXPIRED",
    };
  }

  const suspension = await checkSuspension();
  if (suspension.suspended) {
    return { success: false, error: suspension.error || "Account suspended" };
  }

  const emailCheck = await checkEmailVerified();
  if (!emailCheck.verified) {
    return {
      success: false,
      error: emailCheck.error || "Please verify your email to book",
    };
  }

  const userId = session.user.id;

  // C4 FIX: Rate limit booking creation (per-user + per-IP, outside transaction)
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const userRl = await checkRateLimit(
    userId,
    "createBooking",
    RATE_LIMITS.createBooking
  );
  if (!userRl.success) {
    return {
      success: false,
      error: "Too many booking requests. Please wait before trying again.",
      code: "RATE_LIMITED",
    };
  }
  const ipRl = await checkRateLimit(
    ip,
    "createBookingByIp",
    RATE_LIMITS.createBookingByIp
  );
  if (!ipRl.success) {
    return {
      success: false,
      error: "Too many booking requests. Please wait before trying again.",
      code: "RATE_LIMITED",
    };
  }

  // Validate input with Zod schema
  try {
    createBookingSchema.parse({
      listingId,
      startDate,
      endDate,
      pricePerMonth,
      slotsRequested,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      error.issues.forEach((err) => {
        const path = err.path.join(".");
        fieldErrors[path] = err.message;
      });
      return {
        success: false,
        error: error.issues[0]?.message || "Validation failed",
        fieldErrors,
      };
    }
    return { success: false, error: "Invalid booking data" };
  }

  // Phase 2: Feature flag gate — reject multi-slot when flag is OFF
  if (slotsRequested > 1) {
    const { features } = await import("@/lib/env");
    if (!features.multiSlotBooking) {
      return {
        success: false,
        error: "Multi-slot booking is not currently available.",
        code: "FEATURE_DISABLED",
      };
    }
  }

  // Request body for idempotency hash (deterministic across retries)
  // Note: pricePerMonth is included as client assertion; actual price comes from DB inside transaction
  const requestBody = {
    listingId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    pricePerMonth,
    slotsRequested,
  };

  // P0-04 FIX: Use withIdempotency wrapper for atomic idempotency handling
  // This ensures idempotency key is claimed BEFORE transaction runs, not after
  if (idempotencyKey) {
    let idempotencyResult: Awaited<ReturnType<typeof withIdempotency<InternalBookingResult>>>;
    try {
      idempotencyResult = await withIdempotency<InternalBookingResult>(
        idempotencyKey,
        userId,
        "createBooking",
        requestBody,
        async (tx) =>
          executeBookingTransaction(
            tx,
            userId,
            listingId,
            startDate,
            endDate,
            pricePerMonth,
            slotsRequested
          )
      );
    } catch (error) {
      // BUG-001 FIX: withIdempotency throws on serialization exhaustion or
      // non-retryable DB errors. Catch and return gracefully instead of
      // letting it propagate as a 500 Internal Server Error.
      const isSerialization =
        error &&
        typeof error === "object" &&
        (("code" in error && error.code === "P2034") ||
          ("message" in error &&
            typeof (error as { message?: string }).message === "string" &&
            (error as { message: string }).message.includes("40001")));
      logger.sync.error("Booking idempotency transaction failed", {
        action: "createBooking",
        error: error instanceof Error ? error.message : "Unknown error",
        listingId,
        userId,
        isSerialization,
      });
      if (isSerialization) {
        return {
          success: false,
          error:
            "Booking could not be completed due to high demand. Please try again.",
          code: "CONFLICT",
        };
      }
      return {
        success: false,
        error: "Something went wrong while processing your booking. Please try again.",
        code: "SERVER_ERROR",
      };
    }

    // Handle idempotency wrapper errors (400 for hash mismatch, 500 for lock failure)
    if (!idempotencyResult.success) {
      logger.sync.warn("Idempotency check failed", {
        action: "createBooking",
        status: idempotencyResult.status,
        error: idempotencyResult.error,
      });
      return {
        success: false,
        error: idempotencyResult.error,
        code:
          idempotencyResult.status === 400
            ? "IDEMPOTENCY_MISMATCH"
            : "IDEMPOTENCY_ERROR",
      };
    }

    // Run side effects only for NEW bookings (not cached responses)
    if (!idempotencyResult.cached && idempotencyResult.result.success) {
      try {
        await runBookingSideEffects(
          idempotencyResult.result,
          startDate,
          endDate
        );
      } catch (sideEffectError) {
        // Side effect failures should not fail the booking
        logger.sync.error("Side effect failed after booking", {
          action: "createBooking",
          bookingId: idempotencyResult.result.bookingId,
          error:
            sideEffectError instanceof Error
              ? sideEffectError.message
              : "Unknown error",
        });
      }
    }

    return toBookingResult(idempotencyResult.result);
  }

  // Fallback: No idempotency key provided - use direct transaction with retry
  // This maintains backwards compatibility for clients not using idempotency
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 50;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) =>
          executeBookingTransaction(
            tx,
            userId,
            listingId,
            startDate,
            endDate,
            pricePerMonth,
            slotsRequested
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      // Run side effects for successful booking
      if (result.success) {
        try {
          await runBookingSideEffects(result, startDate, endDate);
        } catch (sideEffectError) {
          logger.sync.error("Side effect failed after booking", {
            action: "createBooking",
            bookingId: result.bookingId,
            error:
              sideEffectError instanceof Error
                ? sideEffectError.message
                : "Unknown error",
          });
        }
      }

      return toBookingResult(result);
    } catch (error: unknown) {
      // P1-16 FIX: Use type guard for Prisma error checking
      const isPrismaError = (err: unknown): err is { code: string } => {
        return (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          typeof (err as { code: unknown }).code === "string"
        );
      };

      // Check for serialization failure (P2034) - retry with exponential backoff
      if (
        isPrismaError(error) &&
        error.code === "P2034" &&
        attempt < MAX_RETRIES
      ) {
        logger.sync.debug("Booking serialization conflict, retrying", {
          action: "createBooking",
          attempt,
          maxRetries: MAX_RETRIES,
        });
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * attempt)
        );
        continue;
      }

      logger.sync.error("Failed to create booking", {
        action: "createBooking",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return {
        success: false,
        error: "Failed to create booking. Please try again.",
      };
    }
  }

  // This should never be reached, but TypeScript needs a return
  return {
    success: false,
    error: "Failed to create booking after multiple attempts.",
  };
}

// ============================================================
// Phase 4: Soft Holds — createHold server action
// ============================================================

// Internal result type for hold creation (includes side effect data)
type InternalHoldResult =
  | {
      success: false;
      error: string;
      code?: string;
      fieldErrors?: Record<string, string>;
      currentPrice?: number;
    }
  | {
      success: true;
      bookingId: string;
      listingId: string;
      listingTitle: string;
      listingOwnerId: string;
      ownerEmail: string | null;
      ownerName: string | null;
      tenantName: string | null;
      holdTtlMinutes: number;
      heldUntil: Date;
    };

/**
 * Core hold logic that runs inside a transaction.
 * HELD bookings consume slots immediately (unlike PENDING).
 */
async function executeHoldTransaction(
  tx: TransactionClient,
  userId: string,
  listingId: string,
  startDate: Date,
  endDate: Date,
  clientPricePerMonth: number,
  slotsRequested: number
): Promise<InternalHoldResult> {
  // Max holds check: COUNT active holds for this user
  const [holdCount] = await tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM "Booking"
        WHERE "tenantId" = ${userId}
        AND "status" = 'HELD'
        AND "heldUntil" > NOW()
    `;
  if (Number(holdCount.count) >= MAX_HOLDS_PER_USER) {
    return {
      success: false,
      error: `You can have at most ${MAX_HOLDS_PER_USER} active holds at a time.`,
      code: "MAX_HOLDS_EXCEEDED",
    };
  }

  // Get the listing with FOR UPDATE lock
  const [listing] = await tx.$queryRaw<
    Array<{
      id: string;
      title: string;
      ownerId: string;
      totalSlots: number;
      availableSlots: number;
      status: string;
      price: number;
      bookingMode: string;
      holdTtlMinutes: number;
    }>
  >`
        SELECT "id", "title", "ownerId", "totalSlots", "availableSlots", "status", "price",
               "booking_mode" as "bookingMode", "hold_ttl_minutes" as "holdTtlMinutes"
        FROM "Listing"
        WHERE "id" = ${listingId}
        FOR UPDATE
    `;

  if (!listing) {
    return { success: false, error: "Listing not found" };
  }

  // Price validation
  const listingPrice = Number(listing.price);
  if (Math.abs(clientPricePerMonth - listingPrice) > 0.01) {
    return {
      success: false,
      error:
        "The listing price has changed. Please review the updated price and try again.",
      code: "PRICE_CHANGED",
      currentPrice: listingPrice,
    };
  }

  // Fetch owner details
  const owner = await tx.user.findUnique({
    where: { id: listing.ownerId },
    select: { id: true, name: true, email: true },
  });
  if (!owner) {
    return { success: false, error: "Listing owner not found" };
  }

  // Prevent owners from holding their own listings
  if (listing.ownerId === userId) {
    return { success: false, error: "You cannot hold your own listing." };
  }

  // Check for blocks
  const { checkBlockBeforeAction } = await import("./block");
  const blockCheck = await checkBlockBeforeAction(owner.id);
  if (!blockCheck.allowed) {
    return {
      success: false,
      error: blockCheck.message || "Unable to hold this listing",
    };
  }

  if (listing.status !== "ACTIVE") {
    return {
      success: false,
      error: "This listing is not currently available.",
    };
  }

  // WHOLE_UNIT override
  const effectiveSlotsRequested =
    listing.bookingMode === "WHOLE_UNIT" ? listing.totalSlots : slotsRequested;

  // Capacity check: include BOTH ACCEPTED and active HELD (D2)
  const overlappingSlots = await tx.$queryRaw<[{ total: bigint }]>`
        SELECT COALESCE(SUM("slotsRequested"), 0) AS total
        FROM "Booking"
        WHERE "listingId" = ${listingId}
        AND (
            "status" = 'ACCEPTED'
            OR ("status" = 'HELD' AND "heldUntil" > NOW())
        )
        AND "startDate" <= ${endDate}
        AND "endDate" >= ${startDate}
    `;
  const usedSlots = Number(overlappingSlots[0].total);

  if (usedSlots + effectiveSlotsRequested > listing.totalSlots) {
    return {
      success: false,
      error: `Not enough available slots. ${listing.totalSlots - usedSlots} of ${listing.totalSlots} slots available.`,
      fieldErrors: {
        startDate: "Insufficient capacity",
        endDate: "Insufficient capacity",
      },
    };
  }

  // Simple guard: check availableSlots (defense-in-depth)
  if (listing.availableSlots < effectiveSlotsRequested) {
    return { success: false, error: "No available slots for this listing." };
  }

  // Duplicate booking/hold check: same user, same listing, overlapping dates, any active status
  const existingBooking = await tx.booking.findFirst({
    where: {
      tenantId: userId,
      listingId,
      status: { in: ["PENDING", "HELD", "ACCEPTED"] },
      AND: [
        { startDate: { lte: endDate } },
        { endDate: { gte: startDate } },
        // For HELD, also check it hasn't expired (PENDING/ACCEPTED don't have heldUntil)
        {
          OR: [{ status: { not: "HELD" } }, { heldUntil: { gt: new Date() } }],
        },
      ],
    },
  });
  if (existingBooking) {
    const statusLabel = existingBooking.status === "HELD" ? "hold" : "booking";
    return {
      success: false,
      error: `You already have an active ${statusLabel} for overlapping dates on this listing.`,
      code: "DUPLICATE_HOLD",
    };
  }

  // Decrement availableSlots (conditional UPDATE — hard error if insufficient)
  const decrementResult = await tx.$executeRaw`
        UPDATE "Listing"
        SET "availableSlots" = "availableSlots" - ${effectiveSlotsRequested}
        WHERE "id" = ${listingId}
        AND "availableSlots" >= ${effectiveSlotsRequested}
    `;
  if (decrementResult === 0) {
    return { success: false, error: "No available slots for this listing." };
  }

  // Get tenant info
  const tenant = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  // Calculate total price from authoritative DB price
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const pricePerDay = listingPrice / 30;
  const totalPrice = Math.round(diffDays * pricePerDay * 100) / 100;

  // Use per-listing TTL with fallback to global default
  const ttlMinutes = listing.holdTtlMinutes ?? HOLD_TTL_MINUTES;
  const heldUntil = new Date(Date.now() + ttlMinutes * 60 * 1000);

  // Create the booking with HELD status
  const booking = await tx.booking.create({
    data: {
      listingId,
      tenantId: userId,
      startDate,
      endDate,
      totalPrice,
      status: "HELD",
      slotsRequested: effectiveSlotsRequested,
      heldUntil,
      heldAt: new Date(),
    },
  });

  await logBookingAudit(tx, {
    bookingId: booking.id,
    action: "HELD",
    previousStatus: null,
    newStatus: "HELD",
    actorId: userId,
    actorType: "USER",
    details: { slotsRequested: effectiveSlotsRequested, listingId, heldUntil },
  });

  return {
    success: true,
    bookingId: booking.id,
    listingId: listing.id,
    listingTitle: listing.title,
    listingOwnerId: listing.ownerId,
    ownerEmail: owner.email,
    ownerName: owner.name,
    tenantName: tenant?.name || null,
    holdTtlMinutes: ttlMinutes,
    heldUntil,
  };
}

/**
 * Run side effects after successful hold creation.
 */
async function runHoldSideEffects(
  result: Extract<InternalHoldResult, { success: true }>,
  startDate: Date,
  endDate: Date
): Promise<void> {
  await createInternalNotification({
    userId: result.listingOwnerId,
    type: "BOOKING_HOLD_REQUEST",
    title: "New Hold Request",
    message: `${result.tenantName || "Someone"} placed a hold on "${result.listingTitle}"`,
    link: "/bookings",
  });

  if (result.ownerEmail) {
    await sendNotificationEmailWithPreference(
      "bookingHoldRequest",
      result.listingOwnerId,
      result.ownerEmail,
      {
        hostName: result.ownerName || "Host",
        tenantName: result.tenantName || "A user",
        listingTitle: result.listingTitle,
        startDate: startDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        endDate: endDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        listingId: result.listingId,
      }
    );
  }

  revalidatePath(`/listings/${result.listingId}`);
  revalidatePath("/bookings");
}

/**
 * Create a soft hold (time-limited slot reservation).
 * HELD bookings consume slots immediately and auto-expire via sweeper cron.
 * Separate from createBooking because slot logic differs (D3).
 */
export async function createHold(
  listingId: string,
  startDate: Date,
  endDate: Date,
  pricePerMonth: number,
  slotsRequested: number = 1,
  idempotencyKey?: string
): Promise<BookingResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      success: false,
      error: "You must be logged in to place a hold",
      code: "SESSION_EXPIRED",
    };
  }

  // Rate limit
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const userRl = await checkRateLimit(
    session.user.id,
    "createHold",
    RATE_LIMITS.createHold
  );
  if (!userRl.success) {
    return {
      success: false,
      error: "Too many hold requests. Please wait before trying again.",
      code: "RATE_LIMITED",
    };
  }
  const ipRl = await checkRateLimit(
    ip,
    "createHoldByIp",
    RATE_LIMITS.createHoldByIp
  );
  if (!ipRl.success) {
    return {
      success: false,
      error: "Too many hold requests. Please wait before trying again.",
      code: "RATE_LIMITED",
    };
  }

  // Per-listing rate limit: prevents hold-cycling attack (hold → expire → re-apply on 1-slot listings)
  const perListingRl = await checkRateLimit(
    `${session.user.id}:${listingId}`,
    "createHoldPerListing",
    RATE_LIMITS.createHoldPerListing
  );
  if (!perListingRl.success) {
    return {
      success: false,
      error: "Too many hold attempts on this listing. Please wait.",
      code: "RATE_LIMITED",
    };
  }

  const suspension = await checkSuspension();
  if (suspension.suspended) {
    return { success: false, error: suspension.error || "Account suspended" };
  }

  const emailCheck = await checkEmailVerified();
  if (!emailCheck.verified) {
    return {
      success: false,
      error: emailCheck.error || "Please verify your email to place a hold",
    };
  }

  // Feature flag gate: must be ON (not DRAIN — drain blocks new holds)
  const { features } = await import("@/lib/env");
  if (!features.softHoldsEnabled) {
    return {
      success: false,
      error: "Hold feature is not currently available.",
      code: "FEATURE_DISABLED",
    };
  }

  const userId = session.user.id;

  // Validate input
  try {
    createHoldSchema.parse({
      listingId,
      startDate,
      endDate,
      pricePerMonth,
      slotsRequested,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      error.issues.forEach((err) => {
        const path = err.path.join(".");
        fieldErrors[path] = err.message;
      });
      return {
        success: false,
        error: error.issues[0]?.message || "Validation failed",
        fieldErrors,
      };
    }
    return { success: false, error: "Invalid hold data" };
  }

  // Feature flag gate for multi-slot
  if (slotsRequested > 1) {
    const { features: feats } = await import("@/lib/env");
    if (!feats.multiSlotBooking) {
      return {
        success: false,
        error: "Multi-slot holds are not currently available.",
        code: "FEATURE_DISABLED",
      };
    }
  }

  const requestBody = {
    listingId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    pricePerMonth,
    slotsRequested,
  };

  // Idempotency path
  if (idempotencyKey) {
    let idempotencyResult: Awaited<ReturnType<typeof withIdempotency<InternalHoldResult>>>;
    try {
      idempotencyResult = await withIdempotency<InternalHoldResult>(
        idempotencyKey,
        userId,
        "createHold",
        requestBody,
        async (tx) =>
          executeHoldTransaction(
            tx,
            userId,
            listingId,
            startDate,
            endDate,
            pricePerMonth,
            slotsRequested
          )
      );
    } catch (error) {
      // BUG-001 FIX: withIdempotency throws on serialization exhaustion or
      // non-retryable DB errors. Catch and return gracefully instead of
      // letting it propagate as a 500 Internal Server Error.
      const isSerialization =
        error &&
        typeof error === "object" &&
        (("code" in error && error.code === "P2034") ||
          ("message" in error &&
            typeof (error as { message?: string }).message === "string" &&
            (error as { message: string }).message.includes("40001")));
      logger.sync.error("Hold idempotency transaction failed", {
        action: "createHold",
        error: error instanceof Error ? error.message : "Unknown error",
        listingId,
        userId,
        isSerialization,
      });
      if (isSerialization) {
        return {
          success: false,
          error:
            "Hold could not be placed due to high demand. Please try again.",
          code: "CONFLICT",
        };
      }
      return {
        success: false,
        error: "Something went wrong while placing your hold. Please try again.",
        code: "SERVER_ERROR",
      };
    }

    if (!idempotencyResult.success) {
      logger.sync.warn("Idempotency check failed", {
        action: "createHold",
        status: idempotencyResult.status,
        error: idempotencyResult.error,
      });
      return {
        success: false,
        error: idempotencyResult.error,
        code:
          idempotencyResult.status === 400
            ? "IDEMPOTENCY_MISMATCH"
            : "IDEMPOTENCY_ERROR",
      };
    }

    if (!idempotencyResult.cached && idempotencyResult.result.success) {
      try {
        await runHoldSideEffects(idempotencyResult.result, startDate, endDate);
      } catch (sideEffectError) {
        logger.sync.error("Side effect failed after hold", {
          action: "createHold",
          bookingId: idempotencyResult.result.bookingId,
          error:
            sideEffectError instanceof Error
              ? sideEffectError.message
              : "Unknown error",
        });
      }
    }

    return toHoldBookingResult(idempotencyResult.result);
  }

  // Non-idempotency fallback with retry for serialization conflicts
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 50;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) =>
          executeHoldTransaction(
            tx,
            userId,
            listingId,
            startDate,
            endDate,
            pricePerMonth,
            slotsRequested
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      if (result.success) {
        try {
          await runHoldSideEffects(result, startDate, endDate);
        } catch (sideEffectError) {
          logger.sync.error("Side effect failed after hold", {
            action: "createHold",
            bookingId: result.bookingId,
            error:
              sideEffectError instanceof Error
                ? sideEffectError.message
                : "Unknown error",
          });
        }
      }

      return toHoldBookingResult(result);
    } catch (error: unknown) {
      const isPrismaError = (err: unknown): err is { code: string } => {
        return (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          typeof (err as { code: unknown }).code === "string"
        );
      };

      if (
        isPrismaError(error) &&
        error.code === "P2034" &&
        attempt < MAX_RETRIES
      ) {
        logger.sync.debug("Hold serialization conflict, retrying", {
          action: "createHold",
          attempt,
          maxRetries: MAX_RETRIES,
        });
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * attempt)
        );
        continue;
      }

      // Phase 3: Handle DB trigger exception for WHOLE_UNIT overlap
      if (
        error instanceof Error &&
        error.message.includes("WHOLE_UNIT_OVERLAP")
      ) {
        return {
          success: false,
          error:
            "Cannot place hold: overlapping booking exists for this whole-unit listing",
        };
      }

      logger.sync.error("Failed to create hold", {
        action: "createHold",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return {
        success: false,
        error: "Failed to create hold. Please try again.",
      };
    }
  }

  return {
    success: false,
    error: "Failed to create hold after multiple attempts.",
  };
}
