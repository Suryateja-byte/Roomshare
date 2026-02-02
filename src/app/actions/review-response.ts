'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { sendNotificationEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

export async function createReviewResponse(reviewId: string, content: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        // Get the review with listing info
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        ownerId: true
                    }
                },
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        if (!review) {
            return { error: 'Review not found' };
        }

        // Check if user is the listing owner
        if (!review.listing || review.listing.ownerId !== session.user.id) {
            return { error: 'Only the listing owner can respond to reviews' };
        }

        // Check if response already exists
        const existingResponse = await prisma.reviewResponse.findUnique({
            where: { reviewId }
        });

        if (existingResponse) {
            return { error: 'A response already exists for this review' };
        }

        // Create the response
        const response = await prisma.reviewResponse.create({
            data: {
                reviewId,
                content
            }
        });

        // Get host name for email
        const host = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { name: true }
        });

        // Notify the review author
        if (review.author.email) {
            await sendNotificationEmail('reviewResponse', review.author.email, {
                reviewerName: review.author.name || 'User',
                hostName: host?.name || 'Host',
                listingTitle: review.listing.title,
                responsePreview: content,
                listingId: review.listing.id
            });
        }

        revalidatePath(`/listings/${review.listing.id}`);

        return { success: true, responseId: response.id };
    } catch (error) {
        logger.sync.error('Failed to create review response', {
            action: 'createReviewResponse',
            reviewId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to create response' };
    }
}

export async function updateReviewResponse(responseId: string, content: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        // Get the response with review and listing info
        const response = await prisma.reviewResponse.findUnique({
            where: { id: responseId },
            include: {
                review: {
                    include: {
                        listing: {
                            select: {
                                id: true,
                                ownerId: true
                            }
                        }
                    }
                }
            }
        });

        if (!response) {
            return { error: 'Response not found' };
        }

        // Check if user is the listing owner
        if (!response.review.listing || response.review.listing.ownerId !== session.user.id) {
            return { error: 'Only the listing owner can edit this response' };
        }

        // Update the response
        await prisma.reviewResponse.update({
            where: { id: responseId },
            data: {
                content,
                updatedAt: new Date()
            }
        });

        revalidatePath(`/listings/${response.review.listing.id}`);

        return { success: true };
    } catch (error) {
        logger.sync.error('Failed to update review response', {
            action: 'updateReviewResponse',
            responseId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to update response' };
    }
}

export async function deleteReviewResponse(responseId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    try {
        // Get the response with listing info
        const response = await prisma.reviewResponse.findUnique({
            where: { id: responseId },
            include: {
                review: {
                    include: {
                        listing: {
                            select: {
                                id: true,
                                ownerId: true
                            }
                        }
                    }
                }
            }
        });

        if (!response) {
            return { error: 'Response not found' };
        }

        // Check if user is the listing owner
        if (!response.review.listing || response.review.listing.ownerId !== session.user.id) {
            return { error: 'Only the listing owner can delete this response' };
        }

        await prisma.reviewResponse.delete({
            where: { id: responseId }
        });

        revalidatePath(`/listings/${response.review.listing.id}`);

        return { success: true };
    } catch (error) {
        logger.sync.error('Failed to delete review response', {
            action: 'deleteReviewResponse',
            responseId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to delete response' };
    }
}
