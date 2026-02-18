import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { createInternalNotification } from '@/lib/notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';
import { checkSuspension } from '@/app/actions/suspension';
import { withRateLimit } from '@/lib/with-rate-limit';
import { logger } from '@/lib/logger';
import { captureApiError } from '@/lib/api-error-handler';
import { z } from 'zod';
import { markListingDirty } from '@/lib/search/search-doc-dirty';
import {
    parsePaginationParams,
    buildPaginationResponse,
    buildPrismaQueryOptions,
} from '@/lib/pagination-schema';

// P2-2: Zod schemas for request validation
const createReviewSchema = z.object({
    listingId: z.string().max(100).optional(),
    targetUserId: z.string().max(100).optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(1).max(5000),
}).refine(data => data.listingId || data.targetUserId, {
    message: 'Must specify listingId or targetUserId',
});

const updateReviewSchema = z.object({
    reviewId: z.string().min(1).max(100),
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(1).max(5000),
});

export async function POST(request: Request) {
    // P1-5 FIX: Add rate limiting to prevent review spam
    const rateLimitResponse = await withRateLimit(request, { type: 'createReview' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const suspension = await checkSuspension();
        if (suspension.suspended) {
            return NextResponse.json({ error: suspension.error || 'Account suspended' }, { status: 403 });
        }

        if (!session.user.emailVerified) {
            return NextResponse.json({ error: 'Email verification required' }, { status: 403 });
        }

        let body;
        try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

        // P2-2: Zod validation
        const parsed = createReviewSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { listingId, targetUserId, rating, comment } = parsed.data;

        // Check for existing review (duplicate prevention)
        if (listingId) {
            // P1-20 FIX: Parallelize independent queries
            const [existingReview, hasBooking] = await Promise.all([
                prisma.review.findFirst({
                    where: {
                        authorId: session.user.id,
                        listingId
                    }
                }),
                prisma.booking.findFirst({
                    where: {
                        listingId,
                        tenantId: session.user.id,
                    },
                })
            ]);

            if (existingReview) {
                return NextResponse.json(
                    { error: 'You have already reviewed this listing' },
                    { status: 409 }
                );
            }

            // Require booking history before allowing review (prevents fake reviews)
            if (!hasBooking) {
                return NextResponse.json(
                    { error: 'You must have a booking to review this listing' },
                    { status: 403 }
                );
            }
        }

        // Check for existing user review (duplicate prevention)
        if (targetUserId) {
            const existingUserReview = await prisma.review.findFirst({
                where: {
                    authorId: session.user.id,
                    targetUserId
                }
            });

            if (existingUserReview) {
                return NextResponse.json(
                    { error: 'You have already reviewed this user' },
                    { status: 409 }
                );
            }
        }

        const review = await prisma.review.create({
            data: {
                authorId: session.user.id,
                listingId,
                targetUserId,
                rating,
                comment
            },
            include: {
                author: {
                    select: {
                        name: true,
                        image: true
                    }
                }
            }
        });

        // Fire-and-forget: mark listing dirty for search doc refresh
        if (listingId) {
            markListingDirty(listingId, 'review_changed').catch((err) => {
                logger.sync.warn("[API] Failed to mark listing dirty", {
                    listingId: listingId,
                    error: err instanceof Error ? err.message : String(err)
                });
            });
        }

        // P1-22 FIX: Send notification in background (non-blocking)
        // Return response immediately, fire-and-forget notifications
        if (listingId) {
            // Async notification - don't await
            (async () => {
                try {
                    const listing = await prisma.listing.findUnique({
                        where: { id: listingId },
                        include: {
                            owner: {
                                select: { id: true, name: true, email: true }
                            }
                        }
                    });

                    if (listing && listing.ownerId !== session.user.id) {
                        // Create in-app notification
                        await createInternalNotification({
                            userId: listing.ownerId,
                            type: 'NEW_REVIEW',
                            title: 'New Review',
                            message: `${review.author.name || 'Someone'} left a ${rating}-star review on "${listing.title}"`,
                            link: `/listings/${listingId}`
                        });

                        // Send email (respecting user preferences)
                        if (listing.owner.email) {
                            await sendNotificationEmailWithPreference('newReview', listing.ownerId, listing.owner.email, {
                                hostName: listing.owner.name || 'Host',
                                reviewerName: review.author.name || 'A user',
                                listingTitle: listing.title,
                                rating,
                                listingId
                            });
                        }
                    }
                } catch (notificationError) {
                    // Log but don't fail - review was already created successfully
                    logger.sync.error('Failed to send review notification', {
                        action: 'reviewNotification',
                        error: notificationError instanceof Error ? notificationError.message : 'Unknown error',
                    });
                }
            })();
        }

        return NextResponse.json(review, { status: 201 });
    } catch (error) {
        return captureApiError(error, { route: '/api/reviews', method: 'POST' });
    }
}

export async function GET(request: Request) {
    // P1-05: Rate limiting for GET reviews (60 per minute)
    const rateLimitResponse = await withRateLimit(request, { type: 'getReviews' });
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get('listingId');
    const userId = searchParams.get('userId');

    if (!listingId && !userId) {
        return NextResponse.json({ error: 'Must specify listingId or userId' }, { status: 400 });
    }

    // P1-02: Parse and validate pagination parameters
    const paginationResult = parsePaginationParams(searchParams);
    if (!paginationResult.success) {
        return NextResponse.json({ error: paginationResult.error }, { status: 400 });
    }
    const { cursor, limit } = paginationResult.data;

    try {
        const whereClause = {
            ...(listingId ? { listingId } : {}),
            ...(userId ? { targetUserId: userId } : {}),
        };

        // P1-02: Get total count and paginated reviews in parallel
        const [total, reviews] = await Promise.all([
            prisma.review.count({ where: whereClause }),
            prisma.review.findMany({
                where: whereClause,
                include: {
                    author: {
                        select: {
                            name: true,
                            image: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                ...buildPrismaQueryOptions({ cursor, limit }),
            }),
        ]);

        // P1-02: Build paginated response
        const paginatedResponse = buildPaginationResponse(reviews, limit, total);

        // Return with rate limit headers
        return NextResponse.json(
            {
                reviews: paginatedResponse.items,
                pagination: paginatedResponse.pagination,
            },
            {
                headers: {
                    'X-RateLimit-Limit': '60',
                    'X-RateLimit-Remaining': '59', // Approximate, actual value from rate limiter
                },
            }
        );
    } catch (error) {
        return captureApiError(error, { route: '/api/reviews', method: 'GET' });
    }
}

// Update a review (only the author can update their own review)
export async function PUT(request: Request) {
    const rateLimitResponse = await withRateLimit(request, { type: 'updateReview' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const suspension = await checkSuspension();
        if (suspension.suspended) {
            return NextResponse.json({ error: suspension.error || 'Account suspended' }, { status: 403 });
        }

        if (!session.user.emailVerified) {
            return NextResponse.json({ error: 'Email verification required' }, { status: 403 });
        }

        let body;
        try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

        // P2-2: Zod validation
        const parsed = updateReviewSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { reviewId, rating, comment } = parsed.data;

        // Check if the review exists and belongs to the current user
        const existingReview = await prisma.review.findUnique({
            where: { id: reviewId }
        });

        if (!existingReview) {
            return NextResponse.json({ error: 'Review not found' }, { status: 404 });
        }

        if (existingReview.authorId !== session.user.id) {
            return NextResponse.json({ error: 'You can only edit your own reviews' }, { status: 403 });
        }

        // Update the review
        const updatedReview = await prisma.review.update({
            where: { id: reviewId },
            data: {
                rating,
                comment
            },
            include: {
                author: {
                    select: {
                        name: true,
                        image: true
                    }
                }
            }
        });

        // Fire-and-forget: mark listing dirty for search doc refresh
        if (existingReview.listingId) {
            markListingDirty(existingReview.listingId, 'review_changed').catch((err) => {
                logger.sync.warn("[API] Failed to mark listing dirty", {
                    listingId: existingReview.listingId,
                    error: err instanceof Error ? err.message : String(err)
                });
            });
        }

        return NextResponse.json(updatedReview);
    } catch (error) {
        return captureApiError(error, { route: '/api/reviews', method: 'PUT' });
    }
}

// Delete a review (only the author can delete their own review)
export async function DELETE(request: Request) {
    const rateLimitResponse = await withRateLimit(request, { type: 'deleteReview' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const suspension = await checkSuspension();
        if (suspension.suspended) {
            return NextResponse.json({ error: suspension.error || 'Account suspended' }, { status: 403 });
        }

        if (!session.user.emailVerified) {
            return NextResponse.json({ error: 'Email verification required' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const reviewId = searchParams.get('reviewId');

        if (!reviewId) {
            return NextResponse.json({ error: 'Review ID is required' }, { status: 400 });
        }

        // Check if the review exists and belongs to the current user
        const existingReview = await prisma.review.findUnique({
            where: { id: reviewId }
        });

        if (!existingReview) {
            return NextResponse.json({ error: 'Review not found' }, { status: 404 });
        }

        if (existingReview.authorId !== session.user.id) {
            return NextResponse.json({ error: 'You can only delete your own reviews' }, { status: 403 });
        }

        // Delete the review
        await prisma.review.delete({
            where: { id: reviewId }
        });

        // Fire-and-forget: mark listing dirty for search doc refresh
        if (existingReview.listingId) {
            markListingDirty(existingReview.listingId, 'review_changed').catch((err) => {
                logger.sync.warn("[API] Failed to mark listing dirty", {
                    listingId: existingReview.listingId,
                    error: err instanceof Error ? err.message : String(err)
                });
            });
        }

        return NextResponse.json({ success: true, message: 'Review deleted successfully' });
    } catch (error) {
        return captureApiError(error, { route: '/api/reviews', method: 'DELETE' });
    }
}
