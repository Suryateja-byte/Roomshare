import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { geocodeAddress } from '@/lib/geocoding';
import { createClient } from '@supabase/supabase-js';
import { householdLanguagesSchema, supabaseImageUrlSchema, sanitizeUnicode, noHtmlTags, NO_HTML_MSG, listingLeaseDurationSchema, listingRoomTypeSchema, listingGenderPreferenceSchema, listingHouseholdGenderSchema, listingBookingModeSchema } from '@/lib/schemas';
import { VALID_AMENITIES, VALID_HOUSE_RULES } from '@/lib/filter-schema';
import { checkListingLanguageCompliance } from '@/lib/listing-language-guard';
import { isValidLanguageCode } from '@/lib/languages';
import { markListingDirty } from '@/lib/search/search-doc-dirty';
import { withRateLimit } from '@/lib/with-rate-limit';
import { captureApiError } from '@/lib/api-error-handler';
import { isCircuitOpenError } from '@/lib/circuit-breaker';
import { logger } from '@/lib/logger';
import { checkSuspension, checkEmailVerified } from '@/app/actions/suspension';
import { normalizeStringList } from '@/lib/utils';
import { z } from 'zod';
import { features } from '@/lib/env';
import { syncListingEmbedding } from '@/lib/embeddings/sync';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract storage path from Supabase public URL
function extractStoragePath(publicUrl: string): string | null {
    const match = publicUrl.match(/\/storage\/v1\/object\/public\/images\/(.+)$/);
    return match ? match[1] : null;
}

const updateListingSchema = z.object({
    title: z.string().trim().min(1).max(100).transform(sanitizeUnicode).refine(noHtmlTags, NO_HTML_MSG),
    description: z.string().trim().min(1).max(1000).transform(sanitizeUnicode).refine(noHtmlTags, NO_HTML_MSG),
    price: z.coerce.number().positive().multipleOf(0.01),
    amenities: z.union([
        z.array(z.string().max(50).transform(sanitizeUnicode)).max(20),
        z.string().transform(s => [sanitizeUnicode(s)]),
    ]).optional().default([]),
    houseRules: z.union([
        z.array(z.string().max(50).transform(sanitizeUnicode)).max(20),
        z.string().transform(s => [sanitizeUnicode(s)]),
    ]).optional().default([]),
    totalSlots: z.coerce.number().int().min(1).max(20),
    address: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    zip: z.string().trim().min(1).max(20),
    moveInDate: z.union([
        z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date format' }),
        z.null(),
    ]).optional(),
    leaseDuration: listingLeaseDurationSchema,
    roomType: listingRoomTypeSchema,
    householdLanguages: z.array(z.string().trim().toLowerCase().transform(sanitizeUnicode)).max(20).optional(),
    genderPreference: listingGenderPreferenceSchema,
    householdGender: listingHouseholdGenderSchema,
    primaryHomeLanguage: z.string().refine(isValidLanguageCode, { message: 'Invalid language code' }).nullable().optional(),
    images: z.array(supabaseImageUrlSchema).max(10).optional(),
    bookingMode: listingBookingModeSchema,
});

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimitResponse = await withRateLimit(request, { type: 'deleteListing' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Wrap ownership check + delete in interactive transaction with FOR UPDATE
        // to prevent TOCTOU race between check and delete
        let _listingTitle: string | null = null;
        let listingImages: string[] = [];
        let pendingBookings: { id: string; tenantId: string }[] = [];

        try {
            await prisma.$transaction(async (tx) => {
                // Lock the listing row to prevent concurrent modifications
                const [listing] = await tx.$queryRaw<Array<{ ownerId: string; title: string; images: string[] }>>`
                    SELECT "ownerId", "title", "images" FROM "Listing"
                    WHERE "id" = ${id}
                    FOR UPDATE
                `;

                if (!listing || listing.ownerId !== session.user.id) {
                    throw new Error('NOT_FOUND_OR_UNAUTHORIZED');
                }

                _listingTitle = listing.title;
                listingImages = listing.images || [];

                // Check for active ACCEPTED bookings - block deletion if any exist
                const activeAcceptedBookings = await tx.booking.count({
                    where: {
                        listingId: id,
                        status: 'ACCEPTED',
                        endDate: { gte: new Date() }
                    }
                });

                if (activeAcceptedBookings > 0) {
                    throw new Error('ACTIVE_BOOKINGS');
                }

                // Get all PENDING bookings to notify tenants before deletion
                pendingBookings = await tx.booking.findMany({
                    where: {
                        listingId: id,
                        status: 'PENDING'
                    },
                    select: {
                        id: true,
                        tenantId: true
                    }
                });

                // Create notifications for tenants with pending bookings
                for (const booking of pendingBookings) {
                    await tx.notification.create({
                        data: {
                            userId: booking.tenantId,
                            type: 'BOOKING_CANCELLED',
                            title: 'Booking Request Cancelled',
                            message: `Your pending booking request for "${listing.title}" has been cancelled because the host removed the listing.`,
                            link: '/bookings'
                        }
                    });
                }

                // Phase 4: Notify tenants with active HELD bookings
                const heldBookings = await tx.booking.findMany({
                    where: { listingId: id, status: 'HELD', heldUntil: { gte: new Date() } },
                    select: { id: true, tenantId: true }
                });
                for (const booking of heldBookings) {
                    await tx.notification.create({
                        data: {
                            userId: booking.tenantId,
                            type: 'BOOKING_HOLD_EXPIRED',
                            title: 'Hold Cancelled',
                            message: `Your hold on "${listing.title}" has been cancelled because the host removed the listing.`,
                            link: '/bookings'
                        }
                    });
                }

                // Delete listing — Location and bookings cascade-deleted automatically
                await tx.listing.delete({ where: { id } });
            });
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === 'NOT_FOUND_OR_UNAUTHORIZED') {
                    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
                }
                if (error.message === 'ACTIVE_BOOKINGS') {
                    return NextResponse.json(
                        {
                            error: 'Cannot delete listing with active bookings',
                            message: 'You have active bookings for this listing. Please cancel them before deleting.',
                        },
                        { status: 400 }
                    );
                }
            }
            throw error;
        }

        // Fire-and-forget: mark listing dirty for search doc removal
        markListingDirty(id, 'listing_deleted').catch(() => {});

        // Clean up images from Supabase storage (outside transaction — best-effort)
        if (listingImages.length > 0 && supabaseUrl && supabaseServiceKey) {
            try {
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                const paths = listingImages
                    .map(extractStoragePath)
                    .filter((p): p is string => p !== null);

                if (paths.length > 0) {
                    await supabase.storage.from('images').remove(paths);
                }
            } catch (storageError) {
                logger.sync.error('Failed to delete images from storage', {
                    error: storageError instanceof Error ? storageError.message : 'Unknown error',
                    route: '/api/listings/[id]',
                    method: 'DELETE',
                });
                // Continue even if storage cleanup fails
            }
        }

        return NextResponse.json({
            success: true,
            notifiedTenants: pendingBookings.length
        }, { status: 200 });
    } catch (error) {
        return captureApiError(error, { route: '/api/listings/[id]', method: 'DELETE' });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimitResponse = await withRateLimit(request, { type: 'updateListing' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        const suspension = await checkSuspension(userId);
        if (suspension.suspended) {
            await logger.warn('Listing update blocked: account suspended', {
                route: '/api/listings/[id]', method: 'PATCH',
                userId: userId.slice(0, 8) + '...',
            });
            return NextResponse.json({ error: suspension.error || 'Account suspended' }, { status: 403 });
        }

        const emailCheck = await checkEmailVerified(userId);
        if (!emailCheck.verified) {
            await logger.warn('Listing update blocked: email unverified', {
                route: '/api/listings/[id]', method: 'PATCH',
                userId: userId.slice(0, 8) + '...',
            });
            return NextResponse.json({ error: emailCheck.error || 'Email verification required' }, { status: 403 });
        }

        const { id } = await params;
        let rawBody: unknown;
        try {
            rawBody = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
        }

        const parsed = updateListingSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json(
                {
                    error: 'Validation failed',
                    fields: parsed.error.flatten().fieldErrors,
                },
                { status: 400 }
            );
        }

        const {
            title,
            description,
            price,
            amenities,
            houseRules,
            totalSlots,
            address,
            city,
            state,
            zip,
            moveInDate,
            leaseDuration,
            roomType,
            householdLanguages,
            genderPreference,
            householdGender,
            primaryHomeLanguage,
            images,
            bookingMode,
        } = parsed.data;

        // Check listing exists and user is the owner
        const listing = await prisma.listing.findUnique({
            where: { id },
            include: { location: true }
        });

        if (!listing) {
            return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
        }

        if (listing.ownerId !== userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Validate language codes
        if (householdLanguages && householdLanguages.length > 0) {
            const langResult = householdLanguagesSchema.safeParse(householdLanguages);
            if (!langResult.success) {
                return NextResponse.json({ error: 'Invalid language codes' }, { status: 400 });
            }
        }

        // Validate image URL ownership (prevent cross-user URL injection)
        // URLs already stored on the listing are trusted (e.g. seed data
        // uploaded by a different user); only NEW URLs must match the
        // current user's storage prefix.
        if (Array.isArray(images) && images.length > 0) {
            const existingImageSet = new Set(listing.images as string[]);
            const expectedPrefix = `listings/${userId}/`;
            const hasInvalidImage = images.some(url => {
                if (existingImageSet.has(url)) return false; // already trusted
                const storagePath = extractStoragePath(url);
                return !storagePath || !storagePath.startsWith(expectedPrefix);
            });
            if (hasInvalidImage) {
                return NextResponse.json(
                    { error: 'One or more image URLs are invalid' },
                    { status: 400 }
                );
            }
        }

        // Check title for discriminatory language patterns (BE-H2)
        if (title) {
            const titleCheck = checkListingLanguageCompliance(title);
            if (!titleCheck.allowed) {
                await logger.warn('Listing title failed compliance check', {
                    route: '/api/listings/[id]', method: 'PATCH',
                    userId: userId.slice(0, 8) + '...',
                    field: 'title',
                });
                return NextResponse.json(
                    { error: titleCheck.message ?? 'Content policy violation', field: 'title' },
                    { status: 400 },
                );
            }
        }

        // Check description for discriminatory language patterns
        if (description) {
            const complianceCheck = checkListingLanguageCompliance(description);
            if (!complianceCheck.allowed) {
                await logger.warn('Listing description failed compliance check', {
                    route: '/api/listings/[id]', method: 'PATCH',
                    userId: userId.slice(0, 8) + '...',
                    field: 'description',
                });
                return NextResponse.json(
                    { error: complianceCheck.message ?? 'Content policy violation', field: 'description' },
                    { status: 400 },
                );
            }
        }

        // Check if address changed
        const addressChanged = listing.location &&
            (listing.location.address !== address ||
                listing.location.city !== city ||
                listing.location.state !== state ||
                listing.location.zip !== zip);

        // Geocode BEFORE transaction if address changed
        let coords: { lat: number; lng: number } | null = null;
        if (addressChanged && listing.location) {
            const fullAddress = `${address}, ${city}, ${state} ${zip}`;
            try {
                const geoResult = await geocodeAddress(fullAddress);
                if (geoResult.status === 'not_found') {
                    await logger.warn('Geocoding failed for listing update', {
                        route: '/api/listings/[id]', method: 'PATCH',
                        userId: userId.slice(0, 8) + '...',
                        city, state,
                    });
                    return NextResponse.json(
                        { error: 'Could not find this address. Please check and try again.' },
                        { status: 400 }
                    );
                }
                if (geoResult.status === 'error') {
                    return NextResponse.json(
                        { error: 'Address verification temporarily unavailable. Please try again.' },
                        { status: 503, headers: { 'Retry-After': '10' } }
                    );
                }
                coords = { lat: geoResult.lat, lng: geoResult.lng };
            } catch (geoError) {
                if (isCircuitOpenError(geoError)) {
                    return NextResponse.json(
                        { error: 'Address verification service temporarily unavailable. Please try again shortly.' },
                        { status: 503, headers: { 'Retry-After': '30' } }
                    );
                }
                throw geoError;
            }
        }

        const normalizedAmenities = normalizeStringList(amenities);
        const normalizedHouseRules = normalizeStringList(houseRules);

        // Allowlist validation for amenities and houseRules
        const invalidAmenity = normalizedAmenities.find(
            item => !VALID_AMENITIES.some(v => v.toLowerCase() === item.toLowerCase())
        );
        if (invalidAmenity) {
            return NextResponse.json({ error: 'Invalid amenity value' }, { status: 400 });
        }
        const invalidRule = normalizedHouseRules.find(
            item => !VALID_HOUSE_RULES.some(v => v.toLowerCase() === item.toLowerCase())
        );
        if (invalidRule) {
            return NextResponse.json({ error: 'Invalid house rule value' }, { status: 400 });
        }

        // Phase 3: Feature flag gate for WHOLE_UNIT booking mode
        if (bookingMode === 'WHOLE_UNIT') {
            const { features } = await import('@/lib/env');
            if (!features.wholeUnitMode) {
                return NextResponse.json(
                    { error: 'Whole-unit booking mode is not currently available.' },
                    { status: 400 }
                );
            }
        }

        let result;
        try {
            // Ownership is re-validated inside the transaction under row lock
            // to prevent TOCTOU between pre-check and update.
            result = await prisma.$transaction(async (tx) => {
                const [lockedListing] = await tx.$queryRaw<Array<{
                    ownerId: string;
                    totalSlots: number;
                    availableSlots: number;
                    bookingMode: string;
                }>>`
                    SELECT "ownerId", "totalSlots", "availableSlots", "booking_mode" as "bookingMode"
                    FROM "Listing"
                    WHERE "id" = ${id}
                    FOR UPDATE
                `;

                if (!lockedListing) {
                    throw new Error('NOT_FOUND');
                }

                if (lockedListing.ownerId !== userId) {
                    throw new Error('FORBIDDEN');
                }

                // Phase 3: Block mode changes when future ACCEPTED bookings exist (D5/D8)
                // PENDING bookings are NOT blocked — they are requests, not commitments
                if (bookingMode !== undefined && bookingMode !== null && bookingMode !== lockedListing.bookingMode) {
                    const futureAccepted = await tx.booking.count({
                        where: {
                            listingId: id,
                            status: 'ACCEPTED',
                            endDate: { gte: new Date() },
                        },
                    });
                    if (futureAccepted > 0) {
                        throw new Error('BOOKING_MODE_CONFLICT');
                    }
                }

                // Phase 4: Block totalSlots reduction below committed bookings + active holds
                if (totalSlots !== undefined && totalSlots !== null && totalSlots < lockedListing.totalSlots) {
                    const [committedSlots] = await tx.$queryRaw<[{ total: bigint }]>`
                        SELECT COALESCE(SUM("slotsRequested"), 0) AS total
                        FROM "Booking"
                        WHERE "listingId" = ${id}
                        AND (status = 'ACCEPTED' OR (status = 'HELD' AND "heldUntil" > NOW()))
                        AND "endDate" >= NOW()
                    `;
                    const committed = Number(committedSlots.total);
                    if (totalSlots < committed) {
                        throw new Error('SLOTS_REDUCTION_BLOCKED');
                    }
                }

                const updatedListing = await tx.listing.update({
                    where: { id },
                    data: {
                        title,
                        description,
                        price,
                        amenities: normalizedAmenities,
                        houseRules: normalizedHouseRules,
                        householdLanguages: Array.isArray(householdLanguages)
                            ? householdLanguages.map((l: string) => l.trim().toLowerCase()).filter(isValidLanguageCode)
                            : [],
                        genderPreference: genderPreference || null,
                        householdGender: householdGender || null,
                        ...(primaryHomeLanguage !== undefined && { primaryHomeLanguage: primaryHomeLanguage || null }),
                        leaseDuration: leaseDuration || null,
                        roomType: roomType || null,
                        totalSlots,
                        availableSlots: Math.max(
                            0,
                            Math.min(
                                lockedListing.availableSlots + (totalSlots - lockedListing.totalSlots),
                                totalSlots
                            )
                        ),
                        moveInDate: moveInDate ? new Date(moveInDate) : null,
                        ...(Array.isArray(images) && { images }),
                        ...(bookingMode !== undefined && bookingMode !== null && { bookingMode }),
                    }
                });

                // Update location if it exists and address changed
                if (addressChanged && listing.location && coords) {
                    await tx.location.update({
                        where: { id: listing.location.id },
                        data: {
                            address,
                            city,
                            state,
                            zip,
                        }
                    });

                    await tx.$executeRaw`
                        UPDATE "Location"
                        SET coords = ST_SetSRID(ST_MakePoint(${coords.lng}::float8, ${coords.lat}::float8), 4326)
                        WHERE id = ${listing.location.id}
                    `;
                }

                return updatedListing;
            });
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === 'NOT_FOUND') {
                    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
                }
                if (error.message === 'FORBIDDEN') {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
                if (error.message === 'BOOKING_MODE_CONFLICT') {
                    return NextResponse.json(
                        { error: 'Cannot change booking mode while active bookings exist. Cancel conflicting bookings first.' },
                        { status: 400 }
                    );
                }
                if (error.message === 'SLOTS_REDUCTION_BLOCKED') {
                    return NextResponse.json(
                        { error: 'Cannot reduce total slots below the number committed by accepted bookings and active holds.' },
                        { status: 400 }
                    );
                }
            }
            throw error;
        }

        // Clean up removed images from storage (outside transaction — best-effort)
        if (Array.isArray(images) && listing.images && supabaseUrl && supabaseServiceKey) {
            const oldSet = new Set(listing.images as string[]);
            const newSet = new Set(images);
            const removedUrls = [...oldSet].filter(url => !newSet.has(url));

            if (removedUrls.length > 0) {
                try {
                    const supabase = createClient(supabaseUrl, supabaseServiceKey);
                    const paths = removedUrls
                        .map(extractStoragePath)
                        .filter((p): p is string => p !== null);
                    if (paths.length > 0) {
                        await supabase.storage.from('images').remove(paths);
                    }
                } catch (storageError) {
                    logger.sync.warn('Failed to clean up removed images on edit', {
                        error: storageError instanceof Error ? storageError.message : 'Unknown',
                        route: '/api/listings/[id]',
                        method: 'PATCH',
                    });
                }
            }
        }

        // Fire-and-forget: mark listing dirty for search doc refresh
        markListingDirty(id, 'listing_updated').catch(() => {});

        if (features.semanticSearch) {
            syncListingEmbedding(id).catch(() => {});
        }

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        return captureApiError(error, { route: '/api/listings/[id]', method: 'PATCH' });
    }
}
