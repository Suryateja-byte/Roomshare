'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { createNotification } from './notifications';
import { sendNotificationEmail } from '@/lib/email';

export async function createBooking(listingId: string, startDate: Date, endDate: Date, pricePerMonth: number) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error('Unauthorized');
    }

    const userId = session.user.id;

    // Calculate total price based on days
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    // Approximate monthly price to daily
    const pricePerDay = pricePerMonth / 30;
    const totalPrice = Math.round(diffDays * pricePerDay * 100) / 100;

    try {
        // Get listing with owner info for notification
        const listing = await prisma.listing.findUnique({
            where: { id: listingId },
            include: {
                owner: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        if (!listing) {
            throw new Error('Listing not found');
        }

        // Get tenant info
        const tenant = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
        });

        const booking = await prisma.booking.create({
            data: {
                listingId,
                tenantId: userId,
                startDate,
                endDate,
                totalPrice,
                status: 'PENDING'
            }
        });

        // Create in-app notification for host
        await createNotification({
            userId: listing.ownerId,
            type: 'BOOKING_REQUEST',
            title: 'New Booking Request',
            message: `${tenant?.name || 'Someone'} requested to book "${listing.title}"`,
            link: '/bookings'
        });

        // Send email notification to host
        if (listing.owner.email) {
            await sendNotificationEmail('bookingRequest', listing.owner.email, {
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
        throw new Error('Failed to create booking');
    }
}
