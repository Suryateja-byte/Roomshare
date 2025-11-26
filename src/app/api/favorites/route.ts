import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { listingId } = body;

        if (!listingId) {
            return NextResponse.json({ error: 'Missing listingId' }, { status: 400 });
        }

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
            return NextResponse.json({ saved: false });
        } else {
            // Create
            await prisma.savedListing.create({
                data: {
                    userId,
                    listingId
                }
            });
            return NextResponse.json({ saved: true });
        }

    } catch (error) {
        console.error('Error toggling favorite:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
