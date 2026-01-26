import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { createNotification } from '@/app/actions/notifications';
import { sendNotificationEmailWithPreference } from '@/lib/email';
import { checkSuspension } from '@/app/actions/suspension';
import { withRateLimit } from '@/lib/with-rate-limit';
import {
    parsePaginationParams,
    buildPaginationResponse,
    buildPrismaQueryOptions,
} from '@/lib/pagination-schema';

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

        const body = await request.json();
        const { listingId, targetUserId, rating, comment } = body;

        if (!rating || !comment) {
            return NextResponse.json({ error: 'Missing rating or comment' }, { status: 400 });
        }

        // P1-04: Max comment length validation (5000 chars)
        const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
        if (trimmedComment.length === 0) {
            return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
        }
        if (trimmedComment.length > 5000) {
            return NextResponse.json(
                { error: 'Comment must not exceed 5000 characters' },
                { status: 400 }
            );
        }

        if (!listingId && !targetUserId) {
            return NextResponse.json({ error: 'Must specify listingId or targetUserId' }, { status: 400 });
        }

        // Rating validation: must be integer between 1-5
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return NextResponse.json(
                { error: 'Rating must be an integer between 1 and 5' },
                { status: 400 }
            );
        }

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
                        await createNotification({
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
                    console.error('Failed to send review notification:', notificationError);
                }
            })();
        }

        return NextResponse.json(review, { status: 201 });
    } catch (error) {
        console.error('Error creating review:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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
        console.error('Error fetching reviews:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// Update a review (only the author can update their own review)
export async function PUT(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { reviewId, rating, comment } = body;

        if (!reviewId) {
            return NextResponse.json({ error: 'Review ID is required' }, { status: 400 });
        }

        if (!rating || !comment) {
            return NextResponse.json({ error: 'Missing rating or comment' }, { status: 400 });
        }

        // Rating validation: must be integer between 1-5
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return NextResponse.json(
                { error: 'Rating must be an integer between 1 and 5' },
                { status: 400 }
            );
        }

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

        return NextResponse.json(updatedReview);
    } catch (error) {
        console.error('Error updating review:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// Delete a review (only the author can delete their own review)
export async function DELETE(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

        return NextResponse.json({ success: true, message: 'Review deleted successfully' });
    } catch (error) {
        console.error('Error deleting review:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
