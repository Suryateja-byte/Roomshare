import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { createNotification } from '@/app/actions/notifications';
import { sendNotificationEmail } from '@/lib/email';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { listingId, targetUserId, rating, comment } = body;

        if (!rating || !comment) {
            return NextResponse.json({ error: 'Missing rating or comment' }, { status: 400 });
        }

        if (!listingId && !targetUserId) {
            return NextResponse.json({ error: 'Must specify listingId or targetUserId' }, { status: 400 });
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

        // Send notification to listing owner
        if (listingId) {
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

                // Send email
                if (listing.owner.email) {
                    await sendNotificationEmail('newReview', listing.owner.email, {
                        hostName: listing.owner.name || 'Host',
                        reviewerName: review.author.name || 'A user',
                        listingTitle: listing.title,
                        rating,
                        listingId
                    });
                }
            }
        }

        return NextResponse.json(review);
    } catch (error) {
        console.error('Error creating review:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get('listingId');
    const userId = searchParams.get('userId');

    if (!listingId && !userId) {
        return NextResponse.json({ error: 'Must specify listingId or userId' }, { status: 400 });
    }

    try {
        const reviews = await prisma.review.findMany({
            where: {
                ...(listingId ? { listingId } : {}),
                ...(userId ? { targetUserId: userId } : {})
            },
            include: {
                author: {
                    select: {
                        name: true,
                        image: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json(reviews);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
