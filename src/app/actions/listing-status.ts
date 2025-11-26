'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export type ListingStatus = 'ACTIVE' | 'PAUSED' | 'RENTED';

export async function updateListingStatus(listingId: string, status: ListingStatus) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        // Verify ownership
        const listing = await prisma.listing.findUnique({
            where: { id: listingId },
            select: { ownerId: true }
        });

        if (!listing) {
            return { error: 'Listing not found' };
        }

        if (listing.ownerId !== session.user.id) {
            return { error: 'You can only update your own listings' };
        }

        await prisma.listing.update({
            where: { id: listingId },
            data: { status }
        });

        revalidatePath(`/listings/${listingId}`);
        revalidatePath('/profile');
        revalidatePath('/search');

        return { success: true };
    } catch (error) {
        console.error('Error updating listing status:', error);
        return { error: 'Failed to update listing status' };
    }
}

export async function incrementViewCount(listingId: string) {
    try {
        await prisma.listing.update({
            where: { id: listingId },
            data: { viewCount: { increment: 1 } }
        });
        return { success: true };
    } catch (error) {
        console.error('Error incrementing view count:', error);
        return { error: 'Failed to increment view count' };
    }
}

export async function trackListingView(listingId: string) {
    const session = await auth();

    // Increment view count regardless of authentication
    await incrementViewCount(listingId);

    // Track recently viewed for authenticated users
    if (session?.user?.id) {
        await trackRecentlyViewed(listingId);
    }

    return { success: true };
}

export async function trackRecentlyViewed(listingId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    try {
        // Upsert recently viewed record
        await prisma.recentlyViewed.upsert({
            where: {
                userId_listingId: {
                    userId: session.user.id,
                    listingId
                }
            },
            update: {
                viewedAt: new Date()
            },
            create: {
                userId: session.user.id,
                listingId,
                viewedAt: new Date()
            }
        });

        // Keep only last 20 viewed listings per user
        const viewedListings = await prisma.recentlyViewed.findMany({
            where: { userId: session.user.id },
            orderBy: { viewedAt: 'desc' },
            skip: 20
        });

        if (viewedListings.length > 0) {
            await prisma.recentlyViewed.deleteMany({
                where: {
                    id: { in: viewedListings.map(v => v.id) }
                }
            });
        }

        return { success: true };
    } catch (error) {
        console.error('Error tracking recently viewed:', error);
        return { error: 'Failed to track recently viewed' };
    }
}

export async function getRecentlyViewed(limit: number = 10) {
    const session = await auth();
    if (!session?.user?.id) {
        return [];
    }

    try {
        const recentlyViewed = await prisma.recentlyViewed.findMany({
            where: { userId: session.user.id },
            orderBy: { viewedAt: 'desc' },
            take: limit,
            include: {
                listing: {
                    include: {
                        location: true,
                        owner: {
                            select: { id: true, name: true, image: true, isVerified: true }
                        }
                    }
                }
            }
        });

        return recentlyViewed
            .filter(rv => rv.listing.status === 'ACTIVE')
            .map(rv => ({
                ...rv.listing,
                viewedAt: rv.viewedAt
            }));
    } catch (error) {
        console.error('Error fetching recently viewed:', error);
        return [];
    }
}
