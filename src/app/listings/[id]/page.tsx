import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getReviews } from '@/lib/data';
import { Metadata } from 'next';
import { auth } from '@/auth';
import { logger, sanitizeErrorMessage } from '@/lib/logger';
import { sanitizeUnicode } from '@/lib/schemas';
import { features } from '@/lib/env';
import ListingPageClient from './ListingPageClient';

const getListingWithLocation = cache(async (id: string) => {
    return prisma.listing.findUnique({
        where: { id },
        include: {
            owner: {
                select: { id: true, name: true, image: true, isVerified: true, bio: true, createdAt: true }
            },
            location: true,
        },
    });
});

interface PageProps {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const listing = await getListingWithLocation(id);

    if (!listing || listing.status !== 'ACTIVE') {
        return { title: 'Listing Not Found' };
    }

    // Use listing's first image if available, otherwise use default
    const ogImage: string = (listing.images && listing.images.length > 0)
        ? listing.images[0]
        : 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80';

    return {
        title: `Rent this ${sanitizeUnicode(listing.title)} in ${listing.location?.city || 'City'} | RoomShare`,
        description: sanitizeUnicode(listing.description).substring(0, 160),
        openGraph: {
            images: [ogImage],
        },
    };
}

export default async function ListingPage({ params }: PageProps) {
    const { id } = await params;
    const listing = await getListingWithLocation(id);

    if (!listing) {
        notFound();
    }

    let session = null;
    let isOwner = false;
    let isAdmin = false;

    if (listing.status !== 'ACTIVE') {
        session = await auth();
        isOwner = session?.user?.id === listing.ownerId;
        isAdmin = session?.user?.isAdmin === true;
        if (!isOwner && !isAdmin) {
            notFound();
        }
    }

    const [coordinates, acceptedBookings, reviews] = await Promise.all([
        (async () => {
            if (!listing.location) {
                return null;
            }

            try {
                const coordsResult = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
                    SELECT
                        ST_Y(coords::geometry) as lat,
                        ST_X(coords::geometry) as lng
                    FROM "Location"
                    WHERE "listingId" = ${listing.id}
                    AND coords IS NOT NULL
                `;
                if (coordsResult.length > 0 && coordsResult[0].lat && coordsResult[0].lng) {
                    return {
                        lat: Number(coordsResult[0].lat),
                        lng: Number(coordsResult[0].lng),
                    };
                }
            } catch (error) {
                logger.sync.error('Failed to fetch coordinates', {
                    listingId: listing.id,
                    error: sanitizeErrorMessage(error),
                });
            }

            return null;
        })(),
        prisma.booking.findMany({
            where: {
                listingId: id,
                status: { in: ['ACCEPTED', 'HELD'] },
                endDate: {
                    gte: new Date(),
                },
            },
            select: {
                startDate: true,
                endDate: true,
            },
            orderBy: {
                startDate: 'asc',
            },
        }),
        getReviews(listing.id),
    ]);

    // Format booked dates for client - using YYYY-MM-DD to avoid timezone issues
    const bookedDates = acceptedBookings.map(b => ({
        startDate: b.startDate.toISOString().split('T')[0],
        endDate: b.endDate.toISOString().split('T')[0],
    }));

    return (
        <ListingPageClient
            listing={{
                id: listing.id,
                title: listing.title,
                description: listing.description,
                price: Number(listing.price),
                images: listing.images,
                amenities: listing.amenities,
                householdLanguages: listing.householdLanguages,
                totalSlots: listing.totalSlots,
                availableSlots: listing.availableSlots,
                bookingMode: listing.bookingMode ?? 'SHARED',
                status: listing.status,
                viewCount: listing.viewCount,
                genderPreference: listing.genderPreference,
                householdGender: listing.householdGender,
                location: listing.location ? {
                    city: listing.location.city,
                    state: listing.location.state,
                } : null,
                owner: {
                    id: listing.owner.id,
                    name: listing.owner.name,
                    image: listing.owner.image,
                    bio: listing.owner.bio,
                    isVerified: listing.owner.isVerified,
                    createdAt: listing.owner.createdAt,
                },
                holdTtlMinutes: listing.holdTtlMinutes ?? 15,
                ownerId: listing.ownerId,
            }}
            reviews={reviews}
            isOwner={isOwner}
            isLoggedIn={!!session?.user}
            userHasBooking={false}
            userExistingReview={null}
            bookedDates={bookedDates}
            holdEnabled={features.softHoldsEnabled}
            coordinates={coordinates}
        />
    );
}
