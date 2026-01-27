import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { withRateLimit } from '@/lib/with-rate-limit';
import { z } from 'zod';

// P2-4: Zod schema for request validation
const toggleFavoriteSchema = z.object({
    listingId: z.string().min(1, 'listingId is required').max(100),
});

export async function POST(request: Request) {
    // P2-4: Add rate limiting to prevent abuse
    const rateLimitResponse = await withRateLimit(request, { type: 'toggleFavorite' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // P2-4: Zod validation
        const parsed = toggleFavoriteSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { listingId } = parsed.data;

        const userId = session.user.id;

        // Check if already saved
        const existing = await prisma.savedListing.findUnique({
            where: {
                userId_listingId: {
                    userId,
                    listingId
                }
            }
        });

        if (existing) {
            // Delete
            await prisma.savedListing.delete({
                where: {
                    id: existing.id
                }
            });
            // P2-1: User-specific toggle must not be cached
            const response = NextResponse.json({ saved: false });
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
        } else {
            // Create
            await prisma.savedListing.create({
                data: {
                    userId,
                    listingId
                }
            });
            // P2-1: User-specific toggle must not be cached
            const response = NextResponse.json({ saved: true });
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
        }

    } catch (error) {
        console.error('Error toggling favorite:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
