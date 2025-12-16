import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getReviews } from '@/lib/data';
import { trackListingView } from '@/app/actions/listing-status';
import { Metadata } from 'next';
import { auth } from '@/auth';
import ListingPageClient from './ListingPageClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id },
        include: { location: true },
    });

    if (!listing) {
        return { title: 'Listing Not Found' };
    }

    // Use listing's first image if available, otherwise use default
    const ogImage: string = (listing.images && listing.images.length > 0)
        ? listing.images[0]
        : 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80';

    return {
        title: `Rent this ${listing.title} in ${listing.location?.city || 'City'} | RoomShare`,
        description: listing.description.substring(0, 160),
        openGraph: {
            images: [ogImage],
        },
    };
}

export default async function ListingPage({ params }: PageProps) {
    const { id } = await params;
    const session = await auth();
    const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
            owner: true,
            location: true,
        },
    });

    if (!listing) {
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
            console.error('Failed to fetch coordinates:', error);
        }
    }

    // Fetch accepted bookings for availability display
    const acceptedBookings = await prisma.booking.findMany({
        where: {
            listingId: id,
            status: 'ACCEPTED',
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
    const isOwner = session?.user?.id === listing.ownerId;

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
                price: listing.price,
                images: listing.images,
                amenities: listing.amenities,
                languages: listing.languages,
                totalSlots: listing.totalSlots,
                availableSlots: listing.availableSlots,
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
                ownerId: listing.ownerId,
            }}
            reviews={reviews}
            isOwner={isOwner}
            isLoggedIn={!!session?.user}
            userHasBooking={userHasBooking}
            userExistingReview={userExistingReview}
            bookedDates={bookedDates}
            coordinates={coordinates}
        />
    );
}
