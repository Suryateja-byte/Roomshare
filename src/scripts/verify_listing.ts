import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const listing = await prisma.listing.findFirst({
        where: { title: 'Test Room' },
        include: { location: true }
    });

    if (!listing) {
        console.log('Listing NOT found');
        return;
    }

    console.log('Listing found:', listing.title);
    console.log('Price:', listing.price);
    console.log('Owner ID:', listing.ownerId);

    if (listing.location) {
        console.log('Location found: [REDACTED]');

        // Check for coordinates using raw query
        const result: any[] = await prisma.$queryRaw`
      SELECT ST_AsText(coords) as coords_text 
      FROM "Location" 
      WHERE id = ${listing.location.id}
    `;

        if (result.length > 0 && result[0].coords_text) {
            console.log('Coordinates found:', result[0].coords_text);
        } else {
            console.log('Coordinates NOT found or empty');
        }
    } else {
        console.log('Location NOT found');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
