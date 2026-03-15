import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getReviews } from '@/lib/data';
import { trackListingView } from '@/app/actions/listing-status';
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

/** Row shape returned by get_similar_listings SQL function */
interface SimilarListingRow {
    id: string;
    title: string;
    description: string;
    price: number;
    images: string[];
    city: string;
    state: string;
    room_type: string | null;
    available_slots: number;
    total_slots: number;
    amenities: string[];
    household_languages: string[];
    avg_rating: number;
    review_count: number;
    similarity: number;
}

/** Fetch similar listings using vector similarity. Non-critical — returns [] on failure. */
const getSimilarListings = cache(async function getSimilarListings(listingId: string): Promise<SimilarListingRow[]> {
    if (!features.semanticSearch) return [];
    try {
        const rows = await prisma.$queryRaw<SimilarListingRow[]>`SELECT * FROM get_similar_listings(${listingId}, 4, 0.3)`;
        return rows;
    } catch (err) {
        logger.sync.error('Failed to fetch similar listings', {
            listingId,
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
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
    const session = await auth();
    const listing = await getListingWithLocation(id);

    if (!listing) {
        notFound();
    }

    // Start similar listings fetch early (runs in parallel with remaining queries)
    const similarListingsPromise = getSimilarListings(id);

    const isOwner = session?.user?.id === listing.ownerId;
    const isAdmin = session?.user?.isAdmin === true;
    if (listing.status !== 'ACTIVE' && !isOwner && !isAdmin) {
        notFound();
    }

    // Fetch coordinates from PostGIS for the Neighborhood AI Agent
    let coordinates: { lat: number; lng: number } | null = null;
    if (listing.location) {
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
                coordinates = {
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
    }

    // Fetch accepted bookings for availability display
    const acceptedBookings = await prisma.booking.findMany({
        where: {
            listingId: id,
            status: { in: ['ACCEPTED', 'HELD'] },
            endDate: {
                gte: new Date(), // Only future bookings
            },
        },
        select: {
            startDate: true,
            endDate: true,
        },
        orderBy: {
            startDate: 'asc',
        },
    });

    const reviews = await getReviews(listing.id);

    // Check if logged-in user has already reviewed this listing
    let userExistingReview = null;
    let userHasBooking = false;
    if (session?.user?.id && !isOwner) {
        const existingReview = await prisma.review.findFirst({
            where: {
                listingId: listing.id,
                authorId: session.user.id,
            },
            select: {
                id: true,
                rating: true,
                comment: true,
                createdAt: true,
            },
        });

        if (existingReview) {
            userExistingReview = {
                id: existingReview.id,
                rating: existingReview.rating,
                comment: existingReview.comment,
                createdAt: existingReview.createdAt.toISOString(),
            };
        }

        // Check if user has any booking history with this listing (required for reviews)
        const bookingExists = await prisma.booking.findFirst({
            where: {
                listingId: listing.id,
                tenantId: session.user.id,
            },
        });
        userHasBooking = !!bookingExists;
    }

    // Track view if user is not the owner (works for both logged-in and anonymous users)
    if (!isOwner) {
        await trackListingView(listing.id);
    }

    const similarListingsRaw = await similarListingsPromise;

    // Format booked dates for client - using YYYY-MM-DD to avoid timezone issues
    const bookedDates = acceptedBookings.map(b => ({
        startDate: b.startDate.toISOString().split('T')[0],
        endDate: b.endDate.toISOString().split('T')[0],
    }));

    const similarListings = similarListingsRaw.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        price: row.price,
        images: row.images,
        location: { city: row.city, state: row.state },
        amenities: row.amenities,
        householdLanguages: row.household_languages,
        availableSlots: row.available_slots,
        totalSlots: row.total_slots,
        avgRating: row.avg_rating,
        reviewCount: row.review_count,
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
            userHasBooking={userHasBooking}
            userExistingReview={userExistingReview}
            bookedDates={bookedDates}
            holdEnabled={features.softHoldsEnabled}
            coordinates={coordinates}
            similarListings={similarListings}
        />
    );
}
