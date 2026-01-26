'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { createNotification } from './notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';
import { createBookingSchema } from '@/lib/schemas';
import { z } from 'zod';
import { checkSuspension, checkEmailVerified } from './suspension';
import { logger } from '@/lib/logger';
import { withIdempotency } from '@/lib/idempotency';

// Booking result type for structured error handling
export type BookingResult = {
    success: boolean;
    bookingId?: string;
    error?: string;
    code?: string;
    fieldErrors?: Record<string, string>;
};

// Internal result type with side effect data (not exposed to callers)
type InternalBookingResult =
    | { success: false; error: string; code?: string; fieldErrors?: Record<string, string> }
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
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
    totalPrice: number
): Promise<InternalBookingResult> {
    // Check for existing duplicate booking (same tenant, listing, dates)
    // This serves as server-side idempotency - if same booking already exists, treat as duplicate
    const existingDuplicate = await tx.booking.findFirst({
        where: {
            tenantId: userId,
            listingId,
            startDate,
            endDate,
            status: { in: ['PENDING', 'ACCEPTED'] }
        }
    });

    if (existingDuplicate) {
        return {
            success: false,
            error: 'You already have a booking request for these exact dates.'
        };
    }

    // Get the listing with FOR UPDATE lock to prevent concurrent booking race conditions
    // This locks the row until the transaction completes, ensuring atomic check-and-create
    const [listing] = await tx.$queryRaw<Array<{
        id: string;
        title: string;
        ownerId: string;
        totalSlots: number;
        availableSlots: number;
        status: string;
    }>>`
        SELECT "id", "title", "ownerId", "totalSlots", "availableSlots", "status"
        FROM "Listing"
        WHERE "id" = ${listingId}
        FOR UPDATE
    `;

    if (!listing) {
        return { success: false, error: 'Listing not found' };
    }

    // Fetch owner details separately (no lock needed, read-only)
    const owner = await tx.user.findUnique({
        where: { id: listing.ownerId },
        select: { id: true, name: true, email: true }
    });

    if (!owner) {
        return { success: false, error: 'Listing owner not found' };
    }

    // Prevent owners from booking their own listings
    if (listing.ownerId === userId) {
        return {
            success: false,
            error: 'You cannot book your own listing.'
        };
    }

    // Check for blocks between tenant and host
    const { checkBlockBeforeAction } = await import('./block');
    const blockCheck = await checkBlockBeforeAction(owner.id);
    if (!blockCheck.allowed) {
        return {
            success: false,
            error: blockCheck.message || 'Unable to book this listing'
        };
    }

    // Check if listing is available for booking
    if (listing.status !== 'ACTIVE') {
        return {
            success: false,
            error: 'This listing is not currently available for booking.'
        };
    }

    // Count overlapping ACCEPTED bookings for capacity check
    // PENDING bookings don't occupy slots yet - only ACCEPTED ones do
    const overlappingAcceptedBookings = await tx.booking.count({
        where: {
            listingId,
            status: 'ACCEPTED',
            AND: [
                { startDate: { lte: endDate } },
                { endDate: { gte: startDate } }
            ]
        }
    });

    // Check if there's capacity available
    if (overlappingAcceptedBookings >= listing.totalSlots) {
        return {
            success: false,
            error: 'No available slots for these dates. All rooms are booked.',
            fieldErrors: { startDate: 'No availability', endDate: 'No availability' }
        };
    }

    // Check if the current user already has a pending/accepted booking for overlapping dates
    const userExistingBooking = await tx.booking.findFirst({
        where: {
            listingId,
            tenantId: userId,
            status: { in: ['PENDING', 'ACCEPTED'] },
            AND: [
                { startDate: { lte: endDate } },
                { endDate: { gte: startDate } }
            ]
        }
    });

    if (userExistingBooking) {
        return {
            success: false,
            error: 'You already have a booking request for overlapping dates.',
            fieldErrors: { startDate: 'Existing booking', endDate: 'Existing booking' }
        };
    }

    // Get tenant info
    const tenant = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true }
    });

    // Create the booking within the transaction
    const booking = await tx.booking.create({
        data: {
            listingId,
            tenantId: userId,
            startDate,
            endDate,
            totalPrice,
            status: 'PENDING'
        }
    });

    return {
        success: true,
        bookingId: booking.id,
        listingId: listing.id,
        listingTitle: listing.title,
        listingOwnerId: listing.ownerId,
        ownerEmail: owner.email,
        ownerName: owner.name,
        tenantName: tenant?.name || null
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
    await createNotification({
        userId: result.listingOwnerId,
        type: 'BOOKING_REQUEST',
        title: 'New Booking Request',
        message: `${result.tenantName || 'Someone'} requested to book "${result.listingTitle}"`,
        link: '/bookings'
    });

    // Send email notification to host (respecting preferences)
    if (result.ownerEmail) {
        await sendNotificationEmailWithPreference('bookingRequest', result.listingOwnerId, result.ownerEmail, {
            hostName: result.ownerName || 'Host',
            tenantName: result.tenantName || 'A user',
            listingTitle: result.listingTitle,
            startDate: startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            endDate: endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            listingId: result.listingId
        });
    }

    revalidatePath(`/listings/${result.listingId}`);
    revalidatePath('/bookings');
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
            fieldErrors: result.fieldErrors
        };
    }
    return { success: true, bookingId: result.bookingId };
}

export async function createBooking(
    listingId: string,
    startDate: Date,
    endDate: Date,
    pricePerMonth: number,
    idempotencyKey?: string
): Promise<BookingResult> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'You must be logged in to book', code: 'SESSION_EXPIRED' };
    }

    const suspension = await checkSuspension();
    if (suspension.suspended) {
        return { success: false, error: suspension.error || 'Account suspended' };
    }

    const emailCheck = await checkEmailVerified();
    if (!emailCheck.verified) {
        return { success: false, error: emailCheck.error || 'Please verify your email to book' };
    }

    const userId = session.user.id;

    // Validate input with Zod schema
    try {
        createBookingSchema.parse({
            listingId,
            startDate,
            endDate,
            pricePerMonth
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldErrors: Record<string, string> = {};
            error.issues.forEach((err) => {
                const path = err.path.join('.');
                fieldErrors[path] = err.message;
            });
            return {
                success: false,
                error: error.issues[0]?.message || 'Validation failed',
                fieldErrors
            };
        }
        return { success: false, error: 'Invalid booking data' };
    }

    // Calculate total price based on actual days
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    // Approximate monthly price to daily
    const pricePerDay = pricePerMonth / 30;
    const totalPrice = Math.round(diffDays * pricePerDay * 100) / 100;

    // Request body for idempotency hash (deterministic across retries)
    const requestBody = { listingId, startDate: startDate.toISOString(), endDate: endDate.toISOString(), pricePerMonth };

    // P0-04 FIX: Use withIdempotency wrapper for atomic idempotency handling
    // This ensures idempotency key is claimed BEFORE transaction runs, not after
    if (idempotencyKey) {
        const idempotencyResult = await withIdempotency<InternalBookingResult>(
            idempotencyKey,
            userId,
            'createBooking',
            requestBody,
            async (tx) => executeBookingTransaction(tx, userId, listingId, startDate, endDate, totalPrice)
        );

        // Handle idempotency wrapper errors (400 for hash mismatch, 500 for lock failure)
        if (!idempotencyResult.success) {
            logger.sync.warn('Idempotency check failed', {
                action: 'createBooking',
                status: idempotencyResult.status,
                error: idempotencyResult.error,
            });
            return {
                success: false,
                error: idempotencyResult.error,
                code: idempotencyResult.status === 400 ? 'IDEMPOTENCY_MISMATCH' : 'IDEMPOTENCY_ERROR'
            };
        }

        // Run side effects only for NEW bookings (not cached responses)
        if (!idempotencyResult.cached && idempotencyResult.result.success) {
            try {
                await runBookingSideEffects(idempotencyResult.result, startDate, endDate);
            } catch (sideEffectError) {
                // Side effect failures should not fail the booking
                logger.sync.error('Side effect failed after booking', {
                    action: 'createBooking',
                    bookingId: idempotencyResult.result.bookingId,
                    error: sideEffectError instanceof Error ? sideEffectError.message : 'Unknown error',
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
                async (tx) => executeBookingTransaction(tx, userId, listingId, startDate, endDate, totalPrice),
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
            );

            // Run side effects for successful booking
            if (result.success) {
                try {
                    await runBookingSideEffects(result, startDate, endDate);
                } catch (sideEffectError) {
                    logger.sync.error('Side effect failed after booking', {
                        action: 'createBooking',
                        bookingId: result.bookingId,
                        error: sideEffectError instanceof Error ? sideEffectError.message : 'Unknown error',
                    });
                }
            }

            return toBookingResult(result);
        } catch (error: unknown) {
            // P1-16 FIX: Use type guard for Prisma error checking
            const isPrismaError = (err: unknown): err is { code: string } => {
                return typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'string';
            };

            // Check for serialization failure (P2034) - retry with exponential backoff
            if (isPrismaError(error) && error.code === 'P2034' && attempt < MAX_RETRIES) {
                logger.sync.debug('Booking serialization conflict, retrying', {
                    action: 'createBooking',
                    attempt,
                    maxRetries: MAX_RETRIES,
                });
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
                continue;
            }

            logger.sync.error('Failed to create booking', {
                action: 'createBooking',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return { success: false, error: 'Failed to create booking. Please try again.' };
        }
    }

    // This should never be reached, but TypeScript needs a return
    return { success: false, error: 'Failed to create booking after multiple attempts.' };
}
