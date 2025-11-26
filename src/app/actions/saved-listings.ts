'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function toggleSaveListing(listingId: string) {
    const session = await auth();

    if (!session?.user?.id) {
        return { error: 'You must be logged in to save listings', saved: false };
    }

    try {
        // Check if already saved
        const existing = await prisma.savedListing.findUnique({
            where: {
                userId_listingId: {
                    userId: session.user.id,
                    listingId
                }
            }
        });

        if (existing) {
            // Unsave
            await prisma.savedListing.delete({
                where: { id: existing.id }
            });
            revalidatePath(`/listings/${listingId}`);
            revalidatePath('/saved');
            return { saved: false };
        } else {
            // Save
            await prisma.savedListing.create({
                data: {
                    userId: session.user.id,
                    listingId
                }
            });
            revalidatePath(`/listings/${listingId}`);
            revalidatePath('/saved');
            return { saved: true };
        }
    } catch (error) {
        console.error('Error toggling saved listing:', error);
        return { error: 'Failed to save listing', saved: false };
    }
}

export async function isListingSaved(listingId: string) {
    const session = await auth();

    if (!session?.user?.id) {
        return { saved: false };
    }

    try {
        const existing = await prisma.savedListing.findUnique({
            where: {
                userId_listingId: {
                    userId: session.user.id,
                    listingId
                }
            }
        });

        return { saved: !!existing };
    } catch (error) {
        return { saved: false };
    }
}

export async function getSavedListings() {
    const session = await auth();

    if (!session?.user?.id) {
        return [];
    }

    try {
        const saved = await prisma.savedListing.findMany({
            where: { userId: session.user.id },
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

        return saved.map(s => ({
            ...s.listing,
            savedAt: s.createdAt
        }));
    } catch (error) {
        console.error('Error getting saved listings:', error);
        return [];
    }
}

export async function removeSavedListing(listingId: string) {
    const session = await auth();

    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        await prisma.savedListing.delete({
            where: {
                userId_listingId: {
                    userId: session.user.id,
                    listingId
                }
            }
        });

        revalidatePath('/saved');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to remove listing' };
    }
}
