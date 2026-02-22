import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { geocodeAddress } from '@/lib/geocoding';
import { createClient } from '@supabase/supabase-js';
import { householdLanguagesSchema } from '@/lib/schemas';
import { checkListingLanguageCompliance } from '@/lib/listing-language-guard';
import { isValidLanguageCode } from '@/lib/languages';
import { markListingDirty } from '@/lib/search/search-doc-dirty';
import { withRateLimit } from '@/lib/with-rate-limit';
import { captureApiError } from '@/lib/api-error-handler';
import { logger } from '@/lib/logger';
import { checkSuspension, checkEmailVerified } from '@/app/actions/suspension';
import { normalizeStringList } from '@/lib/utils';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract storage path from Supabase public URL
function extractStoragePath(publicUrl: string): string | null {
    const match = publicUrl.match(/\/storage\/v1\/object\/public\/images\/(.+)$/);
    return match ? match[1] : null;
}

const updateListingSchema = z.object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().min(1).max(5000),
    price: z.coerce.number().positive(),
    amenities: z.union([z.array(z.string()), z.string()]).optional().default([]),
    houseRules: z.union([z.array(z.string()), z.string()]).optional().default([]),
    totalSlots: z.coerce.number().int().min(1).max(100),
    address: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    zip: z.string().trim().min(1).max(20),
    moveInDate: z.union([
        z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date format' }),
        z.null(),
    ]).optional(),
    leaseDuration: z.string().trim().max(100).nullable().optional(),
    roomType: z.string().trim().max(100).nullable().optional(),
    householdLanguages: z.array(z.string().trim().toLowerCase()).max(20).optional(),
    genderPreference: z.string().trim().max(50).nullable().optional(),
    householdGender: z.string().trim().max(50).nullable().optional(),
    images: z.array(z.string().trim().url().max(2048)).max(20).optional(),
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
        let listingTitle: string | null = null;
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

                listingTitle = listing.title;
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

        const suspension = await checkSuspension();
        if (suspension.suspended) {
            return NextResponse.json({ error: suspension.error || 'Account suspended' }, { status: 403 });
        }

        const emailCheck = await checkEmailVerified();
        if (!emailCheck.verified) {
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
                    error: 'Invalid request payload',
                    details: parsed.error.flatten().fieldErrors,
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
            images,
        } = parsed.data;

        // Check listing exists and user is the owner
        const listing = await prisma.listing.findUnique({
            where: { id },
            include: { location: true }
        });

        if (!listing) {
            return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
        }

        if (listing.ownerId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Validate language codes
        if (householdLanguages && householdLanguages.length > 0) {
            const langResult = householdLanguagesSchema.safeParse(householdLanguages);
            if (!langResult.success) {
                return NextResponse.json({ error: 'Invalid language codes' }, { status: 400 });
            }
        }

        // Check description for discriminatory language patterns
        if (description) {
            const complianceCheck = checkListingLanguageCompliance(description);
            if (!complianceCheck.allowed) {
                return NextResponse.json({ error: complianceCheck.message }, { status: 400 });
            }
        }

        // Check if address changed
        const addressChanged = listing.location &&
            (listing.location.address !== address ||
                listing.location.city !== city ||
                listing.location.state !== state ||
                listing.location.zip !== zip);

        // Geocode BEFORE transaction if address changed
        let coords = null;
        if (addressChanged && listing.location) {
            const fullAddress = `${address}, ${city}, ${state} ${zip}`;
            coords = await geocodeAddress(fullAddress);

            if (!coords) {
                return NextResponse.json({ error: 'Could not geocode new address' }, { status: 400 });
            }
        }

        const normalizedAmenities = normalizeStringList(amenities);
        const normalizedHouseRules = normalizeStringList(houseRules);

        let result;
        try {
            // Ownership is re-validated inside the transaction under row lock
            // to prevent TOCTOU between pre-check and update.
            result = await prisma.$transaction(async (tx) => {
                const [lockedListing] = await tx.$queryRaw<Array<{
                    ownerId: string;
                    totalSlots: number;
                    availableSlots: number;
                }>>`
                    SELECT "ownerId", "totalSlots", "availableSlots"
                    FROM "Listing"
                    WHERE "id" = ${id}
                    FOR UPDATE
                `;

                if (!lockedListing) {
                    throw new Error('NOT_FOUND');
                }

                if (lockedListing.ownerId !== session.user.id) {
                    throw new Error('FORBIDDEN');
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
            }
            throw error;
        }

        // Fire-and-forget: mark listing dirty for search doc refresh
        markListingDirty(id, 'listing_updated').catch(() => {});

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        return captureApiError(error, { route: '/api/listings/[id]', method: 'PATCH' });
    }
}
