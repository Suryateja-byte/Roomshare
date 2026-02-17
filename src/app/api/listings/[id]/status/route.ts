import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit } from '@/lib/with-rate-limit';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';

// Public endpoint - no auth required
// Used by ListingFreshnessCheck to verify listing availability for all viewers
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    // Rate limit to prevent polling abuse
    const rateLimitResponse = await withRateLimit(request, { type: 'listingStatus' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { id } = await params;

        const listing = await prisma.listing.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                updatedAt: true
            }
        });

        if (!listing) {
            return NextResponse.json(
                { error: 'Listing not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            id: listing.id,
            status: listing.status,
            updatedAt: listing.updatedAt
        });
    } catch (error) {
        logger.sync.error('Error checking listing status', {
            error: error instanceof Error ? error.message : String(error),
            route: '/api/listings/[id]/status',
        });
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
