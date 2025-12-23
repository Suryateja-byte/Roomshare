import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { geocodeAddress } from '@/lib/geocoding';
import { createClient } from '@supabase/supabase-js';
import { householdLanguagesSchema } from '@/lib/schemas';
import { checkListingLanguageCompliance } from '@/lib/listing-language-guard';
import { isValidLanguageCode } from '@/lib/languages';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract storage path from Supabase public URL
function extractStoragePath(publicUrl: string): string | null {
    const match = publicUrl.match(/\/storage\/v1\/object\/public\/images\/(.+)$/);
    return match ? match[1] : null;
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Check if listing exists and user is the owner
        const listing = await prisma.listing.findUnique({
            where: { id },
            select: { ownerId: true, title: true, images: true }
        });

        if (!listing) {
            return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
        }

        if (listing.ownerId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Check for active ACCEPTED bookings - block deletion if any exist
        const activeAcceptedBookings = await prisma.booking.count({
            where: {
                listingId: id,
                status: 'ACCEPTED',
                endDate: { gte: new Date() }
            }
        });

        if (activeAcceptedBookings > 0) {
            return NextResponse.json(
                {
                    error: 'Cannot delete listing with active bookings',
                    message: 'You have active bookings for this listing. Please cancel them before deleting.',
                    activeBookings: activeAcceptedBookings
                },
                { status: 400 }
            );
        }

        // Get all PENDING bookings to notify tenants before deletion
        const pendingBookings = await prisma.booking.findMany({
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
        const notificationPromises = pendingBookings.map(booking =>
            prisma.notification.create({
                data: {
                    userId: booking.tenantId,
                    type: 'BOOKING_CANCELLED',
                    title: 'Booking Request Cancelled',
                    message: `Your pending booking request for "${listing.title}" has been cancelled because the host removed the listing.`,
                    link: '/bookings'
                }
            })
        );

        // Clean up images from Supabase storage
        if (listing.images && listing.images.length > 0 && supabaseUrl && supabaseServiceKey) {
            try {
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                const paths = listing.images
                    .map(extractStoragePath)
                    .filter((p): p is string => p !== null);

                if (paths.length > 0) {
                    await supabase.storage.from('images').remove(paths);
                }
            } catch (storageError) {
                console.error('Failed to delete images from storage:', storageError);
                // Continue with listing deletion even if storage cleanup fails
            }
        }

        // Delete listing and create notifications in transaction
        // Location and bookings will be cascade deleted automatically
        await prisma.$transaction([
            ...notificationPromises,
            prisma.location.deleteMany({ where: { listingId: id } }),
            prisma.listing.delete({ where: { id } })
        ]);

        return NextResponse.json({
            success: true,
            notifiedTenants: pendingBookings.length
        }, { status: 200 });
    } catch (error) {
        console.error('Error deleting listing:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();

        const { title, description, price, amenities, houseRules, totalSlots, address, city, state, zip, moveInDate, leaseDuration, roomType, householdLanguages, genderPreference, householdGender, images } = body;

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

        // Validate numeric fields
        const priceNum = parseFloat(price);
        const totalSlotsNum = parseInt(totalSlots) || 1;

        if (isNaN(priceNum) || priceNum <= 0) {
            return NextResponse.json({ error: 'Invalid price value' }, { status: 400 });
        }

        if (isNaN(totalSlotsNum) || totalSlotsNum <= 0) {
            return NextResponse.json({ error: 'Invalid total slots value' }, { status: 400 });
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

        // Update in transaction
        const result = await prisma.$transaction(async (tx) => {
            // Update listing
            const updatedListing = await tx.listing.update({
                where: { id },
                data: {
                    title,
                    description,
                    price: priceNum,
                    amenities: amenities ? amenities.split(',').map((s: string) => s.trim()) : [],
                    houseRules: houseRules ? houseRules.split(',').map((s: string) => s.trim()) : [],
                    householdLanguages: Array.isArray(householdLanguages)
                        ? householdLanguages.map((l: string) => l.trim().toLowerCase()).filter(isValidLanguageCode)
                        : [],
                    genderPreference: genderPreference || null,
                    householdGender: householdGender || null,
                    leaseDuration: leaseDuration || null,
                    roomType: roomType || null,
                    totalSlots: totalSlotsNum,
                    availableSlots: Math.max(0, Math.min(listing.availableSlots + (totalSlotsNum - listing.totalSlots), totalSlotsNum)),
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

                const point = `POINT(${coords.lng} ${coords.lat})`;
                await tx.$executeRaw`
                    UPDATE "Location"
                    SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
                    WHERE id = ${listing.location.id}
                `;
            }

            return updatedListing;
        });

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        console.error('Error updating listing:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({
            error: 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        }, { status: 500 });
    }
}
