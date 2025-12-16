import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { geocodeAddress } from '@/lib/geocoding';
import { auth } from '@/auth';
import { getListings } from '@/lib/data';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
    const startTime = Date.now();
    try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q') || undefined;

        const listings = await getListings({ query: q });

        await logger.info('Listings fetched', {
            route: '/api/listings',
            method: 'GET',
            query: q,
            count: listings.length,
            durationMs: Date.now() - startTime,
        });

        return NextResponse.json(listings);
    } catch (error) {
        logger.sync.error('Error fetching listings', {
            route: '/api/listings',
            method: 'GET',
            error: error instanceof Error ? error.message : 'Unknown error',
            durationMs: Date.now() - startTime,
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const startTime = Date.now();
    try {
        const body = await request.json();
        // Log only non-sensitive metadata, NOT the full request body
        await logger.info('Create listing request received', {
            route: '/api/listings',
            method: 'POST',
            hasTitle: !!body.title,
            hasAddress: !!body.address,
            imageCount: body.images?.length || 0,
        });

        const { title, description, price, amenities, houseRules, totalSlots, address, city, state, zip, moveInDate, leaseDuration, roomType, images, languages, genderPreference, householdGender } = body;

        // Basic validation
        if (!title || !price || !address || !city || !state || !zip) {
            await logger.warn('Create listing validation failed - missing fields', {
                route: '/api/listings',
                method: 'POST',
            });
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Validate numeric fields
        const priceNum = parseFloat(price);
        const totalSlotsNum = parseInt(totalSlots) || 1;

        if (isNaN(priceNum) || priceNum <= 0) {
            return NextResponse.json({ error: 'Invalid price value' }, { status: 400 });
        }

        if (isNaN(totalSlotsNum) || totalSlotsNum <= 0) {
            return NextResponse.json({ error: 'Invalid total slots value' }, { status: 400 });
        }

        // Geocode address (log only city/state, not full address)
        const fullAddress = `${address}, ${city}, ${state} ${zip}`;
        const coords = await geocodeAddress(fullAddress);

        if (!coords) {
            await logger.warn('Geocoding failed for listing', {
                route: '/api/listings',
                method: 'POST',
                city,
                state,
            });
            return NextResponse.json({ error: 'Could not geocode address' }, { status: 400 });
        }

        // Get authenticated user
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            await logger.warn('Unauthorized listing creation attempt', {
                route: '/api/listings',
                method: 'POST',
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        // Transaction to create listing and location, then update with PostGIS data
        const result = await prisma.$transaction(async (tx) => {
            const listing = await tx.listing.create({
                data: {
                    title,
                    description,
                    price: priceNum,
                    images: images || [],
                    amenities: amenities ? amenities.split(',').map((s: string) => s.trim()) : [],
                    houseRules: houseRules ? houseRules.split(',').map((s: string) => s.trim()) : [],
                    languages: Array.isArray(languages) ? languages : [],
                    genderPreference: genderPreference || null,
                    householdGender: householdGender || null,
                    leaseDuration,
                    roomType,
                    totalSlots: totalSlotsNum,
                    availableSlots: totalSlotsNum,
                    moveInDate: moveInDate ? new Date(moveInDate) : null,
                    ownerId: userId,
                }
            });

            const location = await tx.location.create({
                data: {
                    listingId: listing.id,
                    address,
                    city,
                    state,
                    zip,
                }
            });

            // Update with PostGIS geometry
            const point = `POINT(${coords.lng} ${coords.lat})`;
            await tx.$executeRaw`
        UPDATE "Location"
        SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
        WHERE id = ${location.id}
      `;

            return listing;
        });

        await logger.info('Listing created successfully', {
            route: '/api/listings',
            method: 'POST',
            listingId: result.id,
            userId: userId.slice(0, 8) + '...', // Truncate for privacy
            durationMs: Date.now() - startTime,
        });

        return NextResponse.json(result, { status: 201 });

    } catch (error) {
        logger.sync.error('Error creating listing', {
            route: '/api/listings',
            method: 'POST',
            error: error instanceof Error ? error.message : 'Unknown error',
            durationMs: Date.now() - startTime,
        });
        return NextResponse.json({
            error: 'Internal Server Error',
            details: process.env.NODE_ENV === 'development'
                ? (error instanceof Error ? error.message : 'Unknown error')
                : undefined
        }, { status: 500 });
    }
}
