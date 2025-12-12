'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { geocodeAddress } from '@/lib/geocoding';
import { createListingSchema } from '@/lib/schemas';
import { triggerInstantAlerts } from '@/lib/search-alerts';
import { checkSuspension, checkEmailVerified } from './suspension';

export type CreateListingState = {
    success: boolean;
    error?: string;
    code?: string;
    fields?: Record<string, string>;
    data?: any; // Using any for now to avoid circular dependency issues with Prisma types on the client if not careful, but ideally should be Listing
};

export async function createListing(prevState: CreateListingState, formData: FormData): Promise<CreateListingState> {
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
        console.log('Starting transaction...');
        const listing = await prisma.$transaction(async (tx) => {
            console.log('Creating listing record...');
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
            console.log('Listing created:', newListing.id);

            console.log('Creating location record...');
            const location = await tx.location.create({
                data: {
                    listingId: newListing.id,
                    address,
                    city,
                    state,
                    zip,
                },
            });
            console.log('Location created:', location.id);

            // Update with PostGIS geometry
            const point = `POINT(${coords.lng} ${coords.lat})`;
            console.log('Updating PostGIS geometry with point:', point);
            try {
                await tx.$executeRaw`
                    UPDATE "Location"
                    SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
                    WHERE id = ${location.id}
                `;
                console.log('PostGIS update successful');
            } catch (geoError) {
                console.error('PostGIS update failed:', geoError);
                throw new Error('Failed to update location coordinates.');
            }

            return newListing;
        });

        console.log('Transaction completed successfully.');

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
        }).catch(err => console.error('[INSTANT ALERTS] Failed to trigger:', err));

        return { success: true, data: listing };

    } catch (error: any) {
        console.error('Error creating listing (FULL ERROR):', error);
        console.error('Error stack:', error.stack);
        // Return the actual error message for debugging purposes (in production we might want to hide this)
        return { success: false, error: `Server Error: ${error.message || 'Unknown error'}` };
    }
}
