import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// P1-10 FIX: Development-only test endpoint
export async function GET() {
    // Block access in production
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
