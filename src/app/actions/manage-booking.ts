'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { createNotification } from './notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';
import { checkSuspension } from './suspension';
import { logger } from '@/lib/logger';
import {
    validateTransition,
    isInvalidStateTransitionError,
    type BookingStatus,
} from '@/lib/booking-state-machine';

export type { BookingStatus } from '@/lib/booking-state-machine';

export async function updateBookingStatus(
    bookingId: string,
    status: BookingStatus,
    rejectionReason?: string
) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    const suspension = await checkSuspension();
    if (suspension.suspended) {
        return { error: suspension.error || 'Account suspended' };
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
                        id: true,
                        title: true,
                        owner: {
                            select: { name: true }
                        }
                    }
                },
                tenant: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        if (!booking) {
            return { error: 'Booking not found' };
        }

        // Only listing owner can accept/reject, or tenant can cancel their own booking
        const isOwner = booking.listing.ownerId === session.user.id;
        const isTenant = booking.tenantId === session.user.id;

        if (status === 'CANCELLED' && !isTenant) {
            return { error: 'Only the tenant can cancel a booking' };
        }

        if ((status === 'ACCEPTED' || status === 'REJECTED') && !isOwner) {
            return { error: 'Only the listing owner can accept or reject bookings' };
        }

        // P0-03 FIX: Validate state transition before proceeding
        // Prevents invalid transitions like CANCELLED → ACCEPTED
        try {
            validateTransition(booking.status as BookingStatus, status);
        } catch (error) {
            if (isInvalidStateTransitionError(error)) {
                return {
                    error: `Cannot change booking from ${booking.status} to ${status}`,
                    code: 'INVALID_STATE_TRANSITION'
                };
            }
            throw error;
        }

        // Handle ACCEPTED status with atomic transaction to prevent double-booking
        if (status === 'ACCEPTED') {
            try {
                await prisma.$transaction(async (tx) => {
                    // Lock the listing row with FOR UPDATE to prevent concurrent reads
                    const [listing] = await tx.$queryRaw<Array<{ availableSlots: number; totalSlots: number; id: string }>>`
                        SELECT "availableSlots", "totalSlots", "id" FROM "Listing"
                        WHERE "id" = ${booking.listing.id}
                        FOR UPDATE
                    `;

                    if (listing.availableSlots <= 0) {
                        throw new Error('NO_SLOTS_AVAILABLE');
                    }

                    // Count overlapping ACCEPTED bookings for capacity check
                    // For multi-slot listings, we allow multiple bookings for same dates up to capacity
                    const overlappingAcceptedCount = await tx.booking.count({
                        where: {
                            listingId: booking.listingId,
                            id: { not: bookingId },
                            status: 'ACCEPTED',
                            AND: [
                                { startDate: { lte: booking.endDate } },
                                { endDate: { gte: booking.startDate } }
                            ]
                        }
                    });

                    // Check if accepting this booking would exceed capacity
                    // overlappingAcceptedCount + 1 (this booking) must not exceed totalSlots
                    if (overlappingAcceptedCount + 1 > listing.totalSlots) {
                        throw new Error('CAPACITY_EXCEEDED');
                    }

                    // P0-04 FIX: Atomically update booking status with optimistic locking
                    // If version changed since we read it, another process modified it
                    const updateResult = await tx.booking.updateMany({
                        where: {
                            id: bookingId,
                            version: booking.version, // Optimistic lock check
                        },
                        data: {
                            status: 'ACCEPTED',
                            version: { increment: 1 },
                        }
                    });

                    if (updateResult.count === 0) {
                        throw new Error('CONCURRENT_MODIFICATION');
                    }

                    await tx.listing.update({
                        where: { id: booking.listing.id },
                        data: { availableSlots: { decrement: 1 } }
                    });
                });
                // Transaction succeeded - continue with notifications below
            } catch (error) {
                if (error instanceof Error) {
                    if (error.message === 'NO_SLOTS_AVAILABLE') {
                        return { error: 'No available slots for this listing' };
                    }
                    if (error.message === 'CAPACITY_EXCEEDED') {
                        return { error: 'Cannot accept: all slots for these dates are already booked' };
                    }
                    // P0-04: Handle concurrent modification (optimistic lock failure)
                    if (error.message === 'CONCURRENT_MODIFICATION') {
                        return {
                            error: 'Booking was modified by another request. Please refresh and try again.',
                            code: 'CONCURRENT_MODIFICATION'
                        };
                    }
                }
                throw error; // Re-throw unexpected errors
            }

            // Notify tenant of acceptance (outside transaction for performance)
            await createNotification({
                userId: booking.tenant.id,
                type: 'BOOKING_ACCEPTED',
                title: 'Booking Accepted!',
                message: `Your booking for "${booking.listing.title}" has been accepted`,
                link: '/bookings'
            });

            // Send email to tenant (respecting preferences)
            if (booking.tenant.email) {
                await sendNotificationEmailWithPreference('bookingAccepted', booking.tenant.id, booking.tenant.email, {
                    tenantName: booking.tenant.name || 'User',
                    listingTitle: booking.listing.title,
                    hostName: booking.listing.owner.name || 'Host',
                    startDate: booking.startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                    listingId: booking.listing.id
                });
            }
        }

        // Handle REJECTED status
        if (status === 'REJECTED') {
            // P0-04 FIX: Use optimistic locking to prevent concurrent modifications
            const updateResult = await prisma.booking.updateMany({
                where: {
                    id: bookingId,
                    version: booking.version, // Optimistic lock check
                },
                data: {
                    status: 'REJECTED',
                    rejectionReason: rejectionReason?.trim() || null,
                    version: { increment: 1 },
                }
            });

            if (updateResult.count === 0) {
                return {
                    error: 'Booking was modified by another request. Please refresh and try again.',
                    code: 'CONCURRENT_MODIFICATION'
                };
            }

            // Build rejection message with optional reason
            const reasonText = rejectionReason?.trim()
                ? ` Reason: ${rejectionReason.trim()}`
                : '';

            // Notify tenant of rejection
            await createNotification({
                userId: booking.tenant.id,
                type: 'BOOKING_REJECTED',
                title: 'Booking Not Accepted',
                message: `Your booking for "${booking.listing.title}" was not accepted.${reasonText}`,
                link: '/bookings'
            });

            // Send email to tenant (respecting preferences)
            if (booking.tenant.email) {
                await sendNotificationEmailWithPreference('bookingRejected', booking.tenant.id, booking.tenant.email, {
                    tenantName: booking.tenant.name || 'User',
                    listingTitle: booking.listing.title,
                    hostName: booking.listing.owner.name || 'Host',
                    rejectionReason: rejectionReason?.trim() || undefined
                });
            }
        }

        // Handle CANCELLED status - wrap in transaction for data integrity
        if (status === 'CANCELLED') {
            if (booking.status === 'ACCEPTED') {
                // P0-04 FIX: Atomically update booking with optimistic lock and increment slots
                try {
                    await prisma.$transaction(async (tx) => {
                        const updateResult = await tx.booking.updateMany({
                            where: {
                                id: bookingId,
                                version: booking.version, // Optimistic lock check
                            },
                            data: {
                                status: 'CANCELLED',
                                version: { increment: 1 },
                            }
                        });

                        if (updateResult.count === 0) {
                            throw new Error('CONCURRENT_MODIFICATION');
                        }

                        await tx.listing.update({
                            where: { id: booking.listing.id },
                            data: { availableSlots: { increment: 1 } }
                        });
                    });
                } catch (error) {
                    if (error instanceof Error && error.message === 'CONCURRENT_MODIFICATION') {
                        return {
                            error: 'Booking was modified by another request. Please refresh and try again.',
                            code: 'CONCURRENT_MODIFICATION'
                        };
                    }
                    throw error;
                }
            } else {
                // P0-04 FIX: Use optimistic locking for non-accepted bookings too
                const updateResult = await prisma.booking.updateMany({
                    where: {
                        id: bookingId,
                        version: booking.version, // Optimistic lock check
                    },
                    data: {
                        status: 'CANCELLED',
                        version: { increment: 1 },
                    }
                });

                if (updateResult.count === 0) {
                    return {
                        error: 'Booking was modified by another request. Please refresh and try again.',
                        code: 'CONCURRENT_MODIFICATION'
                    };
                }
            }


            // Notify host of cancellation
            await createNotification({
                userId: booking.listing.ownerId,
                type: 'BOOKING_CANCELLED',
                title: 'Booking Cancelled',
                message: `${booking.tenant.name || 'A tenant'} cancelled their booking for "${booking.listing.title}"`,
                link: '/bookings'
            });
        }

        revalidatePath('/bookings');
        revalidatePath(`/listings/${booking.listing.id}`);

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to update booking status', {
            action: 'updateBookingStatus',
            bookingId,
            targetStatus: status,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to update booking status' };
    }
}

export async function getMyBookings() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED', bookings: [] };
    }

    try {
        // Get bookings where user is the tenant
        const sentBookings = await prisma.booking.findMany({
            where: { tenantId: session.user.id },
            include: {
                listing: {
                    include: {
                        location: true,
                        owner: {
                            select: { id: true, name: true, image: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Get bookings for listings the user owns
        const receivedBookings = await prisma.booking.findMany({
            where: {
                listing: { ownerId: session.user.id }
            },
            include: {
                listing: {
                    include: {
                        location: true
                    }
                },
                tenant: {
                    select: { id: true, name: true, image: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return {
            sentBookings,
            receivedBookings,
            error: null
        };
    } catch (error: unknown) {
        logger.sync.error('Failed to fetch bookings', {
            action: 'getMyBookings',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to fetch bookings', sentBookings: [], receivedBookings: [] };
    }
}
