'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { createNotification } from './notifications';
import { sendNotificationEmail } from '@/lib/email';

export type BookingStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export async function updateBookingStatus(bookingId: string, status: BookingStatus) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
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

        // If accepting, check if there are available slots
        if (status === 'ACCEPTED' && booking.listing.availableSlots <= 0) {
            return { error: 'No available slots for this listing' };
        }

        // Update booking status
        await prisma.booking.update({
            where: { id: bookingId },
            data: { status }
        });

        // If accepted, decrement available slots and notify
        if (status === 'ACCEPTED') {
            await prisma.listing.update({
                where: { id: booking.listing.id },
                data: { availableSlots: { decrement: 1 } }
            });

            // Notify tenant of acceptance
            await createNotification({
                userId: booking.tenant.id,
                type: 'BOOKING_ACCEPTED',
                title: 'Booking Accepted!',
                message: `Your booking for "${booking.listing.title}" has been accepted`,
                link: '/bookings'
            });

            // Send email to tenant
            if (booking.tenant.email) {
                await sendNotificationEmail('bookingAccepted', booking.tenant.email, {
                    tenantName: booking.tenant.name || 'User',
                    listingTitle: booking.listing.title,
                    hostName: booking.listing.owner.name || 'Host',
                    startDate: booking.startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                    listingId: booking.listing.id
                });
            }
        }

        // If rejected, notify tenant
        if (status === 'REJECTED') {
            await createNotification({
                userId: booking.tenant.id,
                type: 'BOOKING_REJECTED',
                title: 'Booking Not Accepted',
                message: `Your booking for "${booking.listing.title}" was not accepted`,
                link: '/bookings'
            });

            // Send email to tenant
            if (booking.tenant.email) {
                await sendNotificationEmail('bookingRejected', booking.tenant.email, {
                    tenantName: booking.tenant.name || 'User',
                    listingTitle: booking.listing.title,
                    hostName: booking.listing.owner.name || 'Host'
                });
            }
        }

        // If a previously accepted booking is cancelled, increment available slots
        if (status === 'CANCELLED' && booking.status === 'ACCEPTED') {
            await prisma.listing.update({
                where: { id: booking.listing.id },
                data: { availableSlots: { increment: 1 } }
            });

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
        return { error: 'Unauthorized', bookings: [] };
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
