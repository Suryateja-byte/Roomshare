import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public endpoint - no auth required
// Used by ListingFreshnessCheck to verify listing availability for all viewers
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
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
        console.error('Error checking listing status:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
