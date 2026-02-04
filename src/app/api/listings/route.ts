import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { geocodeAddress } from '@/lib/geocoding';
import { auth } from '@/auth';
import { getListings } from '@/lib/data';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/with-rate-limit';
import { householdLanguagesSchema } from '@/lib/schemas';
import { checkListingLanguageCompliance } from '@/lib/listing-language-guard';
import { isValidLanguageCode } from '@/lib/languages';
import { markListingDirty } from '@/lib/search/search-doc-dirty';

const normalizeStringList = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value
            .filter((item): item is string => typeof item === 'string')
            .map(item => item.trim())
            .filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    }
    return [];
};

export async function GET(request: Request) {
    // P2-3: Add rate limiting to prevent scraping
    const rateLimitResponse = await withRateLimit(request, { type: 'listingsRead' });
    if (rateLimitResponse) return rateLimitResponse;

    const startTime = Date.now();
    const requestId = crypto.randomUUID();
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
            requestId,
        });

        // P2-6: Add Cache-Control headers for CDN and client-side caching
        // s-maxage=60: CDN caches for 60s
        // max-age=30: Browser caches for 30s (shorter to get fresher data)
        // stale-while-revalidate=120: Serve stale while revalidating in background
        return NextResponse.json(listings, {
            headers: {
                "Cache-Control": "public, s-maxage=60, max-age=30, stale-while-revalidate=120",
                "x-request-id": requestId,
                "Vary": "Accept-Encoding",
            },
        });
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
    // P1-3 FIX: Add rate limiting to prevent spam listings
    const rateLimitResponse = await withRateLimit(request, { type: 'createListing' });
    if (rateLimitResponse) return rateLimitResponse;

    const startTime = Date.now();
    try {
        // Get authenticated user before expensive operations (e.g., geocoding)
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            await logger.warn('Unauthorized listing creation attempt', {
                route: '/api/listings',
                method: 'POST',
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const body = await request.json();
        // Log only non-sensitive metadata, NOT the full request body
        await logger.info('Create listing request received', {
            route: '/api/listings',
            method: 'POST',
            hasTitle: !!body.title,
            hasAddress: !!body.address,
            imageCount: body.images?.length || 0,
            userId: userId.slice(0, 8) + '...',
        });

        const { title, description, price, amenities, houseRules, totalSlots, address, city, state, zip, moveInDate, leaseDuration, roomType, images, householdLanguages, genderPreference, householdGender } = body;

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

        // Validate language codes
        if (householdLanguages && householdLanguages.length > 0) {
            const langResult = householdLanguagesSchema.safeParse(householdLanguages);
            if (!langResult.success) {
                await logger.warn('Invalid language codes in listing creation', {
                    route: '/api/listings',
                    method: 'POST',
                });
                return NextResponse.json({ error: 'Invalid language codes' }, { status: 400 });
            }
        }

        // Check description for discriminatory language patterns
        if (description) {
            const complianceCheck = checkListingLanguageCompliance(description);
            if (!complianceCheck.allowed) {
                await logger.warn('Listing description failed compliance check', {
                    route: '/api/listings',
                    method: 'POST',
                });
                return NextResponse.json({ error: complianceCheck.message }, { status: 400 });
            }
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

        const normalizedAmenities = normalizeStringList(amenities);
        const normalizedHouseRules = normalizeStringList(houseRules);

        // Transaction to create listing and location, then update with PostGIS data
        const result = await prisma.$transaction(async (tx) => {
            const listing = await tx.listing.create({
                data: {
                    title,
                    description,
                    price: priceNum,
                    images: images || [],
                    amenities: normalizedAmenities,
                    houseRules: normalizedHouseRules,
                    householdLanguages: Array.isArray(householdLanguages)
                        ? householdLanguages.map((l: string) => l.trim().toLowerCase()).filter(isValidLanguageCode)
                        : [],
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

        // Fire-and-forget: mark listing dirty for search doc refresh
        markListingDirty(result.id, 'listing_created').catch((err) => {
            console.warn("[API] Failed to mark listing dirty", {
                listingId: result.id,
                error: err instanceof Error ? err.message : String(err)
            });
        });

        // P2-1: Mutation responses must not be cached
        const response = NextResponse.json(result, { status: 201 });
        response.headers.set('Cache-Control', 'no-store');
        return response;

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
