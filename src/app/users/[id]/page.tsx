import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import UserProfileClient from './UserProfileClient';
import { getAverageRating, getReviews } from '@/lib/data';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const user = await prisma.user.findUnique({
        where: { id },
        select: { name: true }
    });

    if (!user) {
        return { title: 'User Not Found' };
    }

    return {
        title: `${user.name || 'User'} | RoomShare`,
        description: `View ${user.name || 'User'}'s profile on RoomShare`
    };
}

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    const currentUserId = session?.user?.id;

    // Fetch the user with their listings
    const user = await prisma.user.findUnique({
        where: { id },
        include: {
            listings: {
                include: {
                    location: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            },
            reviewsReceived: {
                include: {
                    author: {
                        select: { id: true, name: true, image: true }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 10
            }
        },
    });

    if (!user) {
        notFound();
    }

    // Get user's average rating
    const avgRating = await getAverageRating(undefined, id);

    // Check if this is the current user's own profile
    const isOwnProfile = currentUserId === id;

    // Convert Prisma Decimal price fields to plain numbers at the query boundary
    const userWithNumberPrices = {
        ...user,
        listings: user.listings.map(l => ({ ...l, price: Number(l.price) })),
    };

    return (
        <UserProfileClient
            user={userWithNumberPrices}
            isOwnProfile={isOwnProfile}
            averageRating={avgRating}
            currentUserId={currentUserId}
        />
    );
}
