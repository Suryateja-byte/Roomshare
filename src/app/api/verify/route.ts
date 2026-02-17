import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { captureApiError } from '@/lib/api-error-handler';

// P1-10 FIX: Development-only test endpoint
export async function GET() {
    // Block access in production
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const internalKey = process.env.NEXTAUTH_SECRET;
    const headersList = await headers();
    const providedKey = headersList.get('x-dev-verify-key');

    if (!internalKey) {
        return NextResponse.json({ error: 'Verify endpoint not configured' }, { status: 503 });
    }

    if (providedKey !== internalKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const listing = await prisma.listing.findFirst({
            where: { title: 'Test Room' },
            include: { location: true }
        });

        if (!listing) {
            return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
        }

        return NextResponse.json({
            listing
        });
    } catch (error) {
        return captureApiError(error, { route: '/api/verify', method: 'GET' });
    }
}
