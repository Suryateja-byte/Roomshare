import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { geocodeAddress } from '@/lib/geocoding';

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
            select: { ownerId: true }
        });

        if (!listing) {
            return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
        }

        if (listing.ownerId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Delete associated location and listing
        await prisma.$transaction([
            prisma.location.deleteMany({ where: { listingId: id } }),
            prisma.listing.delete({ where: { id } })
        ]);

        return NextResponse.json({ success: true }, { status: 200 });
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
        console.log('=== PATCH LISTING - Starting');
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        console.log('=== Request body:', JSON.stringify(body, null, 2));

        const { title, description, price, amenities, houseRules, totalSlots, address, city, state, zip, moveInDate } = body;

        // Ch listing exists and user is the owner
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

        // Validate numeric fields
        const priceNum = parseFloat(price);
        const totalSlotsNum = parseInt(totalSlots) || 1;

        if (isNaN(priceNum) || priceNum <= 0) {
            return NextResponse.json({ error: 'Invalid price value' }, { status: 400 });
        }

        if (isNaN(totalSlotsNum) || totalSlotsNum <= 0) {
            return NextResponse.json({ error: 'Invalid total slots value' }, { status: 400 });
        }

        console.log('=== Validations passed');

        // Check if address changed
        const addressChanged = listing.location &&
            (listing.location.address !== address ||
                listing.location.city !== city ||
                listing.location.state !== state ||
                listing.location.zip !== zip);

        console.log('=== Address changed:', addressChanged);

        // Geocode BEFORE transaction if address changed
        let coords = null;
        if (addressChanged && listing.location) {
            console.log('=== Geocoding new address...');
            const fullAddress = `${address}, ${city}, ${state} ${zip}`;
            coords = await geocodeAddress(fullAddress);

            if (!coords) {
                console.log('=== Geocoding failed');
                return NextResponse.json({ error: 'Could not geocode new address' }, { status: 400 });
            }
            console.log('=== Geocoding successful');
        }

        console.log('=== Starting transaction...');
        // Update in transaction
        const result = await prisma.$transaction(async (tx) => {
            console.log('=== Updating listing...');
            // Update listing
            const updatedListing = await tx.listing.update({
                where: { id },
                data: {
                    title,
                    description,
                    price: priceNum,
                    amenities: amenities ? amenities.split(',').map((s: string) => s.trim()) : [],
                    houseRules: houseRules || '',
                    totalSlots: totalSlotsNum,
                    availableSlots: Math.max(0, listing.availableSlots + (totalSlotsNum - listing.totalSlots)),
                    moveInDate: moveInDate ? new Date(moveInDate) : null,
                }
            });
            console.log('=== Listing updated');

            // Update location if it exists and address changed
            if (addressChanged && listing.location && coords) {
                console.log('=== Updating location...');
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
                console.log('=== Location updated');
            }

            return updatedListing;
        });

        console.log('=== Transaction completed successfully');
        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        console.error('=== ERROR updating listing:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('=== Error details:', errorMessage);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        }, { status: 500 });
    }
}
