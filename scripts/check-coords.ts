import { prisma } from '../src/lib/prisma';

async function checkListingCoordinates() {
    console.log('Checking listing coordinates...\n');

    const listings: any[] = await prisma.$queryRaw`
    SELECT 
      l.id, 
      l.title, 
      loc.address, 
      loc.city, 
      ST_X(loc.coords::geometry) as lng, 
      ST_Y(loc.coords::geometry) as lat
    FROM "Listing" l
    JOIN "Location" loc ON l.id = loc."listingId"
    ORDER BY l."createdAt" DESC
  `;

    console.log('Found', listings.length, 'listings:\n');

    listings.forEach((listing, index) => {
        console.log(`Listing ${index + 1}:`);
        console.log(`  ID: ${listing.id}`);
        console.log(`  Title: ${listing.title}`);
        console.log(`  Address: ${listing.address}, ${listing.city}`);
        console.log(`  Coordinates: (${listing.lng}, ${listing.lat})`);
        console.log('');
    });

    // Check for duplicate coordinates
    const coordMap = new Map<string, number>();
    listings.forEach(listing => {
        const coordKey = `${listing.lng},${listing.lat}`;
        coordMap.set(coordKey, (coordMap.get(coordKey) || 0) + 1);
    });

    console.log('Coordinate analysis:');
    coordMap.forEach((count, coords) => {
        if (count > 1) {
            console.log(`  WARNING: ${count} listings share coordinates ${coords}`);
        } else {
            console.log(`  OK: ${coords} is unique`);
        }
    });

    await prisma.$disconnect();
}

checkListingCoordinates().catch(console.error);
