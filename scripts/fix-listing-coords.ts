import { config } from 'dotenv';
import { prisma } from '../src/lib/prisma';

// Load environment variables from .env file
config();

interface Coords {
    lat: number;
    lng: number;
}

async function geocodeAddress(address: string): Promise<Coords | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!token) {
        console.error('❌ Mapbox token is missing!');
        return null;
    }

    try {
        const encodedAddress = encodeURIComponent(address);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${token}&limit=1`;

        console.log(`  🔍 Geocoding: ${address}`);
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`  ❌ API error: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].center;
            console.log(`  ✅ Success: lat=${lat}, lng=${lng}`);
            return { lat, lng };
        }

        console.warn(`  ⚠️  No results found for: ${address}`);
        return null;
    } catch (error) {
        console.error(`  ❌ Error:`, error);
        return null;
    }
}

async function fixListingCoordinates() {
    console.log('🔧 Re-geocoding all listings...\n');

    // Fetch all listings with their locations
    const listings: any[] = await prisma.$queryRaw`
    SELECT 
      l.id, 
      l.title,
      loc.id as location_id,
      loc.address, 
      loc.city, 
      loc.state,
      loc.zip,
      ST_X(loc.coords::geometry) as current_lng, 
      ST_Y(loc.coords::geometry) as current_lat
    FROM "Listing" l
    JOIN "Location" loc ON l.id = loc."listingId"
    ORDER BY l."createdAt" DESC
  `;

    console.log(`Found ${listings.length} listings to update\n`);

    let successCount = 0;
    let failCount = 0;

    for (const listing of listings) {
        console.log(`\n📍 Listing: ${listing.title}`);
        console.log(`  Current coords: (${listing.current_lng}, ${listing.current_lat})`);

        const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;
        const coords = await geocodeAddress(fullAddress);

        if (coords) {
            // Update the database with new coordinates
            const point = `POINT(${coords.lng} ${coords.lat})`;
            await prisma.$executeRaw`
        UPDATE "Location"
        SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
        WHERE id = ${listing.location_id}
      `;
            console.log(`  💾 Updated in database`);
            successCount++;
        } else {
            console.log(`  ⚠️  Skipped (geocoding failed)`);
            failCount++;
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`\n\n✅ Summary:`);
    console.log(`  • Successfully updated: ${successCount}`);
    console.log(`  • Failed: ${failCount}`);
    console.log(`  • Total: ${listings.length}`);

    await prisma.$disconnect();
}

fixListingCoordinates().catch(console.error);
