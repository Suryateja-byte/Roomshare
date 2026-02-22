import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { logger, sanitizeErrorMessage } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Check if listing exists and user is the owner
        const listing = await prisma.listing.findUnique({
            where: { id },
            select: { ownerId: true }
        });

        if (!listing) {
            return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
        }

        if (listing.ownerId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Count active ACCEPTED bookings (blocks deletion)
        const activeBookings = await prisma.booking.count({
            where: {
                listingId: id,
                status: 'ACCEPTED',
                endDate: { gte: new Date() }
            }
        });

        // Count pending bookings (warning - will be cancelled)
        const pendingBookings = await prisma.booking.count({
            where: {
                listingId: id,
                status: 'PENDING'
            }
        });

        // Count active conversations (warning - will be deleted)
        const activeConversations = await prisma.conversation.count({
            where: {
                listingId: id
            }
        });

        return NextResponse.json({
            canDelete: activeBookings === 0,
            activeBookings,
            pendingBookings,
            activeConversations
        });
    } catch (error) {
        logger.sync.error('Error checking deletability', {
            error: sanitizeErrorMessage(error),
            route: '/api/listings/[id]/can-delete',
        });
        Sentry.captureException(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
