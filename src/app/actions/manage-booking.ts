'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { createNotification } from './notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';
import { checkSuspension } from './suspension';

export type BookingStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export async function updateBookingStatus(bookingId: string, status: BookingStatus) {
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

                    // Atomically update booking status and decrement slots
                    await tx.booking.update({
                        where: { id: bookingId },
                        data: { status: 'ACCEPTED' }
                    });

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
            await prisma.booking.update({
                where: { id: bookingId },
                data: { status }
            });

            // Notify tenant of rejection
            await createNotification({
                userId: booking.tenant.id,
                type: 'BOOKING_REJECTED',
                title: 'Booking Not Accepted',
                message: `Your booking for "${booking.listing.title}" was not accepted`,
                link: '/bookings'
            });

            // Send email to tenant (respecting preferences)
            if (booking.tenant.email) {
                await sendNotificationEmailWithPreference('bookingRejected', booking.tenant.id, booking.tenant.email, {
                    tenantName: booking.tenant.name || 'User',
                    listingTitle: booking.listing.title,
                    hostName: booking.listing.owner.name || 'Host'
                });
            }
        }

        // Handle CANCELLED status - wrap in transaction for data integrity
        if (status === 'CANCELLED') {
            if (booking.status === 'ACCEPTED') {
                // Atomically update booking and increment slots
                await prisma.$transaction(async (tx) => {
                    await tx.booking.update({
                        where: { id: bookingId },
                        data: { status: 'CANCELLED' }
                    });
                    await tx.listing.update({
                        where: { id: booking.listing.id },
                        data: { availableSlots: { increment: 1 } }
                    });
                });
            } else {
                // Just update the booking status for non-accepted bookings
                await prisma.booking.update({
                    where: { id: bookingId },
                    data: { status: 'CANCELLED' }
                });
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
    } catch (error) {
        console.error('Error updating booking status:', error);
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
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return { error: 'Failed to fetch bookings', sentBookings: [], receivedBookings: [] };
    }
}
