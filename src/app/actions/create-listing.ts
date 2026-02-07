'use server';

import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { geocodeAddress } from '@/lib/geocoding';
import { createListingSchema } from '@/lib/schemas';
import { triggerInstantAlerts } from '@/lib/search-alerts';
import { checkSuspension, checkEmailVerified } from './suspension';
import { logger } from '@/lib/logger';
import { markListingDirty } from '@/lib/search/search-doc-dirty';
import { upsertSearchDocSync } from '@/lib/search/search-doc-sync';
import { checkServerComponentRateLimit } from '@/lib/with-rate-limit';

// P1-15 FIX: Define proper type for listing data returned to client
export type CreateListingData = {
    id: string;
    title: string;
    description: string | null;
    price: number;
    amenities: string[];
    houseRules: string[];
    totalSlots: number;
    availableSlots: number;
    ownerId: string;
    createdAt: Date;
};

export type CreateListingState = {
    success: boolean;
    error?: string;
    code?: string;
    fields?: Record<string, string>;
    data?: CreateListingData;
};

/**
 * @deprecated Use POST /api/listings instead. This server action is no longer
 * called by the create listing form but remains functional for backwards compatibility.
 */
export async function createListing(_prevState: CreateListingState, formData: FormData): Promise<CreateListingState> {
    console.warn('[DEPRECATED] createListing server action called — use POST /api/listings instead');

    // Rate limiting (defense-in-depth for deprecated action)
    const headersList = await headers();
    const rateLimitResult = await checkServerComponentRateLimit(
        headersList,
        "createListing",
        "/actions/createListing"
    );
    if (!rateLimitResult.allowed) {
        return {
            success: false,
            error: 'Too many requests. Please try again later.',
        };
    }

    // 1. Validate input using Zod
    const rawData = {
        title: formData.get('title'),
        description: formData.get('description'),
        price: formData.get('price'),
        amenities: formData.get('amenities'),
        houseRules: formData.get('houseRules'),
        totalSlots: formData.get('totalSlots'),
        address: formData.get('address'),
        city: formData.get('city'),
        state: formData.get('state'),
        zip: formData.get('zip'),
    };

    const validatedFields = createListingSchema.safeParse(rawData);

    if (!validatedFields.success) {
        const fields: Record<string, string> = {};
        validatedFields.error.issues.forEach((issue) => {
            if (issue.path.length > 0) {
                fields[issue.path[0].toString()] = issue.message;
            }
        });
        return {
            success: false,
            error: 'Validation failed. Please check your input.',
            fields,
        };
    }

    const { title, description, price, amenities, houseRules, totalSlots, address, city, state, zip } = validatedFields.data;

    try {
        // 2. Check authentication
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return { success: false, error: 'You must be logged in to create a listing.', code: 'SESSION_EXPIRED' };
        }

        const suspension = await checkSuspension();
        if (suspension.suspended) {
            return { success: false, error: suspension.error || 'Account suspended' };
        }

        const emailCheck = await checkEmailVerified();
        if (!emailCheck.verified) {
            return { success: false, error: emailCheck.error || 'Please verify your email to create a listing' };
        }

        const userId = session.user.id;

        // Check if user exists in DB (handling stale sessions)
        const userExists = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true }
        });

        if (!userExists) {
            return { success: false, error: 'User account not found. Please sign out and sign in again.' };
        }

        // 3. Geocode address (Strict)
        const fullAddress = `${address}, ${city}, ${state} ${zip}`;
        let coords;
        try {
            coords = await geocodeAddress(fullAddress);
        } catch (error: any) {
            return { success: false, error: error.message || 'Failed to geocode address.' };
        }

        if (!coords) {
            return { success: false, error: 'Could not find coordinates for this address. Please check the address and try again.' };
        }

        // 4. Create Listing and Location in a transaction
        const listing = await prisma.$transaction(async (tx) => {
            const newListing = await tx.listing.create({
                data: {
                    title,
                    description,
                    price,
                    amenities,
                    houseRules,
                    totalSlots,
                    availableSlots: totalSlots,
                    ownerId: userId,
                },
            });

            const location = await tx.location.create({
                data: {
                    listingId: newListing.id,
                    address,
                    city,
                    state,
                    zip,
                },
            });

            // Update with PostGIS geometry
            const point = `POINT(${coords.lng} ${coords.lat})`;
            try {
                await tx.$executeRaw`
                    UPDATE "Location"
                    SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
                    WHERE id = ${location.id}
                `;
            } catch (geoError) {
                logger.sync.error('PostGIS geometry update failed', {
                    action: 'createListing',
                    step: 'postgis_update',
                    error: geoError instanceof Error ? geoError.message : 'Unknown error',
                });
                throw new Error('Failed to update location coordinates.');
            }

            return newListing;
        });

        await logger.info('Listing created successfully', {
            action: 'createListing',
            listingId: listing.id.slice(0, 8) + '...',
            city,
            state,
        });

        // Synchronously upsert search doc for immediate visibility (0-second delay vs 6-hour batch)
        // This ensures new listings are searchable immediately after creation
        await upsertSearchDocSync(listing.id);

        // Also mark dirty as backup - if sync failed, cron will catch up
        markListingDirty(listing.id, 'listing_created').catch(() => {});

        // ASYNC: Trigger instant alerts in background - non-blocking for better UX and scalability
        // This follows best practices: sync risks cascading failures, async improves resilience
        triggerInstantAlerts({
            id: listing.id,
            title: listing.title,
            description: listing.description,
            price: listing.price,
            city,
            state,
            roomType: null, // Not included in basic create form
            leaseDuration: null, // Not included in basic create form
            amenities: listing.amenities,
            houseRules: listing.houseRules
        }).catch(err => {
            logger.sync.warn('Instant alerts trigger failed', {
                action: 'createListing',
                step: 'instant_alerts',
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        });

        return { success: true, data: listing };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.sync.error('Failed to create listing', {
            action: 'createListing',
            error: errorMessage,
        });
        return { success: false, error: `Server Error: ${errorMessage}` };
    }
}
