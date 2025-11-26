import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { geocodeAddress } from '@/lib/geocoding';
import { auth } from '@/auth';
import { getListings } from '@/lib/data';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q') || undefined;

        const listings = await getListings({ query: q });

        return NextResponse.json(listings);
    } catch (error) {
        console.error('Error fetching listings:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        console.log('=== CREATE LISTING START ===');
        const body = await request.json();
        console.log('Request body:', JSON.stringify(body, null, 2));
        const { title, description, price, amenities, houseRules, totalSlots, address, city, state, zip, moveInDate, leaseDuration, roomType, images } = body;

        // Basic validation
        if (!title || !price || !address || !city || !state || !zip) {
            console.log('Missing required fields');
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Validate numeric fields
        const priceNum = parseFloat(price);
        const totalSlotsNum = parseInt(totalSlots) || 1;
        console.log('Parsed values - price:', priceNum, 'totalSlots:', totalSlotsNum);

        if (isNaN(priceNum) || priceNum <= 0) {
            console.log('Invalid price value:', priceNum);
            return NextResponse.json({ error: 'Invalid price value' }, { status: 400 });
        }

        if (isNaN(totalSlotsNum) || totalSlotsNum <= 0) {
            console.log('Invalid total slots value:', totalSlotsNum);
            return NextResponse.json({ error: 'Invalid total slots value' }, { status: 400 });
        }

        // Geocode address
        const fullAddress = `${address}, ${city}, ${state} ${zip}`;
        console.log('Geocoding address:', fullAddress);
        const coords = await geocodeAddress(fullAddress);
        console.log('Geocoding result:', coords);

        if (!coords) {
            console.log('Geocoding failed - no coordinates returned');
            return NextResponse.json({ error: 'Could not geocode address' }, { status: 400 });
        }

        // Get authenticated user
        console.log('Checking authentication...');
        const session = await auth();
        console.log('Session:', session ? 'exists' : 'null', session?.user?.id);
        if (!session || !session.user || !session.user.id) {
            console.log('Authentication failed');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        console.log('User ID:', userId);

        // Transaction to create listing and location, then update with PostGIS data
        console.log('Starting database transaction...');
        const result = await prisma.$transaction(async (tx) => {
            console.log('Creating listing...');
            const listing = await tx.listing.create({
                data: {
                    title,
                    description,
                    price: priceNum,
                    images: images || [],
                    amenities: amenities ? amenities.split(',').map((s: string) => s.trim()) : [],
                    houseRules: houseRules ? houseRules.split(',').map((s: string) => s.trim()) : [],
                    leaseDuration,
                    roomType,
                    totalSlots: totalSlotsNum,
                    availableSlots: totalSlotsNum,
                    moveInDate: moveInDate ? new Date(moveInDate) : null,
                    ownerId: userId,
                }
            });
            console.log('Listing created:', listing.id);

            console.log('Creating location...');
            const location = await tx.location.create({
                data: {
                    listingId: listing.id,
                    address,
                    city,
                    state,
                    zip,
                }
            });
            console.log('Location created:', location.id);

            // Update with PostGIS geometry
            // Note: We use a raw query to set the geometry column
            const point = `POINT(${coords.lng} ${coords.lat})`;
            console.log('Updating coords with PostGIS point:', point);
            await tx.$executeRaw`
        UPDATE "Location"
        SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
        WHERE id = ${location.id}
      `;
            console.log('PostGIS coords updated');

            return listing;
        });

        console.log('Transaction completed successfully');
        return NextResponse.json(result, { status: 201 });

    } catch (error) {
        console.error('Error creating listing:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error details:', errorMessage);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        }, { status: 500 });
    }
}
