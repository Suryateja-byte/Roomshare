'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { createNotification } from './notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';
import { createBookingSchema } from '@/lib/schemas';
import { z } from 'zod';

// Booking result type for structured error handling
export type BookingResult = {
    success: boolean;
    bookingId?: string;
    error?: string;
    code?: string;
    fieldErrors?: Record<string, string>;
};

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

    const userId = session.user.id;

    // Check for existing idempotency key and return cached result if valid
    // This prevents duplicate bookings on page refresh during submission
    if (idempotencyKey) {
        try {
            const existingKey = await prisma.idempotencyKey.findUnique({
                where: { key: idempotencyKey }
            });

            if (existingKey && existingKey.expiresAt > new Date()) {
                // Return cached result - this is a duplicate request
                console.log(`Returning cached result for idempotency key: ${idempotencyKey}`);
                return existingKey.resultData as BookingResult;
            }

            // If key exists but expired, delete it to allow reuse
            if (existingKey && existingKey.expiresAt <= new Date()) {
                await prisma.idempotencyKey.delete({
                    where: { key: idempotencyKey }
                });
            }
        } catch (error) {
            // Log but don't fail - idempotency is a safety net, not critical path
            console.error('Idempotency key check failed:', error);
        }
    }

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

    // Retry configuration for serialization failures
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 50;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Use transaction with SERIALIZABLE isolation level to make conflict check and creation atomic
            // This prevents race conditions where two rapid submissions could both pass the check
            // Combined with FOR UPDATE lock on the listing row for defense-in-depth
            const result = await prisma.$transaction(async (tx) => {
                // Note: idempotencyKey is used for client-side duplicate prevention via sessionStorage
                // Server-side duplicate prevention uses tenant+listing+dates check below

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
                        success: false as const,
                        error: 'You already have a booking request for these exact dates.'
                    };
                }

                // Check for booking date conflicts (overlapping dates)
                // For listings with multiple slots, we need to count overlapping ACCEPTED bookings
                // and compare against available capacity

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
                    return { success: false as const, error: 'Listing not found' };
                }

                // Fetch owner details separately (no lock needed, read-only)
                const owner = await tx.user.findUnique({
                    where: { id: listing.ownerId },
                    select: { id: true, name: true, email: true }
                });

                if (!owner) {
                    return { success: false as const, error: 'Listing owner not found' };
                }

                // Prevent owners from booking their own listings
                if (listing.ownerId === userId) {
                    return {
                        success: false as const,
                        error: 'You cannot book your own listing.'
                    };
                }

                // Check for blocks between tenant and host
                const { checkBlockBeforeAction } = await import('./block');
                const blockCheck = await checkBlockBeforeAction(owner.id);
                if (!blockCheck.allowed) {
                    return {
                        success: false as const,
                        error: blockCheck.message || 'Unable to book this listing'
                    };
                }

                // Check if listing is available for booking
                if (listing.status !== 'ACTIVE') {
                    return {
                        success: false as const,
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
                // availableSlots represents current available capacity
                // We compare overlapping accepted bookings against total slots
                if (overlappingAcceptedBookings >= listing.totalSlots) {
                    return {
                        success: false as const,
                        error: 'No available slots for these dates. All rooms are booked.',
                        fieldErrors: { startDate: 'No availability', endDate: 'No availability' }
                    };
                }

                // Also check if there are too many pending bookings that might fill up slots
                // This is a soft warning - hosts can still accept/reject
                const overlappingPendingBookings = await tx.booking.count({
                    where: {
                        listingId,
                        status: 'PENDING',
                        AND: [
                            { startDate: { lte: endDate } },
                            { endDate: { gte: startDate } }
                        ]
                    }
                });

                // If accepted + pending would exceed capacity, still allow but we're tracking demand
                const totalOverlapping = overlappingAcceptedBookings + overlappingPendingBookings;

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
                        success: false as const,
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
                    success: true as const,
                    booking,
                    listing,
                    owner,
                    tenant
                };
            }, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            });

            // If transaction failed with an error, return it
            if (!result.success) {
                return result;
            }

            const { booking, listing, owner, tenant } = result;

            // Create in-app notification for host
            await createNotification({
                userId: listing.ownerId,
                type: 'BOOKING_REQUEST',
                title: 'New Booking Request',
                message: `${tenant?.name || 'Someone'} requested to book "${listing.title}"`,
                link: '/bookings'
            });

            // Send email notification to host (respecting preferences)
            if (owner.email) {
                await sendNotificationEmailWithPreference('bookingRequest', listing.ownerId, owner.email, {
                    hostName: owner.name || 'Host',
                    tenantName: tenant?.name || 'A user',
                    listingTitle: listing.title,
                    startDate: startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                    endDate: endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                    listingId: listing.id
                });
            }

            revalidatePath(`/listings/${listingId}`);
            revalidatePath('/bookings');

            const successResult: BookingResult = { success: true, bookingId: booking.id };

            // Store idempotency key with result for duplicate detection
            if (idempotencyKey) {
                try {
                    await prisma.idempotencyKey.create({
                        data: {
                            key: idempotencyKey,
                            userId,
                            endpoint: 'createBooking',
                            resultData: successResult,
                            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                        }
                    });
                } catch (keyError) {
                    // If key already exists (race condition), that's fine - result is already stored
                    console.log('Idempotency key storage skipped (may already exist):', keyError);
                }
            }

            return successResult;
        } catch (error) {
            // Check for serialization failure (P2034) - retry with exponential backoff
            const prismaError = error as { code?: string };
            if (prismaError.code === 'P2034' && attempt < MAX_RETRIES) {
                console.log(`Booking serialization conflict, retrying (attempt ${attempt}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
                continue; // Retry the transaction
            }

            console.error('Error creating booking:', error);
            return { success: false, error: 'Failed to create booking. Please try again.' };
        }
    }

    // This should never be reached, but TypeScript needs a return
    return { success: false, error: 'Failed to create booking after multiple attempts.' };
}
