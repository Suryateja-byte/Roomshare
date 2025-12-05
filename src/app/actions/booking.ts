'use server';

import { prisma } from '@/lib/prisma';
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
    pricePerMonth: number
): Promise<BookingResult> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'You must be logged in to book', code: 'SESSION_EXPIRED' };
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

    try {
        // Use transaction to make conflict check and creation atomic
        // This prevents race conditions where two rapid submissions could both pass the check
        const result = await prisma.$transaction(async (tx) => {
            // Check for existing duplicate booking (same tenant, listing, dates)
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

            // Get the listing first to check capacity
            const listing = await tx.listing.findUnique({
                where: { id: listingId },
                include: {
                    owner: {
                        select: { id: true, name: true, email: true }
                    }
                }
            });

            if (!listing) {
                return { success: false as const, error: 'Listing not found' };
            }

            // Check for blocks between tenant and host
            const { checkBlockBeforeAction } = await import('./block');
            const blockCheck = await checkBlockBeforeAction(listing.owner.id);
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
                tenant
            };
        });

        // If transaction failed with an error, return it
        if (!result.success) {
            return result;
        }

        const { booking, listing, tenant } = result;

        // Create in-app notification for host
        await createNotification({
            userId: listing.ownerId,
            type: 'BOOKING_REQUEST',
            title: 'New Booking Request',
            message: `${tenant?.name || 'Someone'} requested to book "${listing.title}"`,
            link: '/bookings'
        });

        // Send email notification to host (respecting preferences)
        if (listing.owner.email) {
            await sendNotificationEmailWithPreference('bookingRequest', listing.ownerId, listing.owner.email, {
                hostName: listing.owner.name || 'Host',
                tenantName: tenant?.name || 'A user',
                listingTitle: listing.title,
                startDate: startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                endDate: endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                listingId: listing.id
            });
        }

        revalidatePath(`/listings/${listingId}`);
        revalidatePath('/bookings');
        return { success: true, bookingId: booking.id };
    } catch (error) {
        console.error('Error creating booking:', error);
        return { success: false, error: 'Failed to create booking. Please try again.' };
    }
}
