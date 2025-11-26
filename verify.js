const { PrismaClient } = require('@prisma/client');
try {
    require('dotenv').config();
} catch (e) {
    console.log('dotenv not found, assuming env vars are set');
}

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Connecting to database...');

        // 1. Try to find existing test listing
        let listing = await prisma.listing.findFirst({
            where: { title: 'Test Room' },
            include: { location: true }
        });

        // 2. Create if not exists
        if (!listing) {
            console.log('Test listing not found. Creating one...');

            // Create user if needed
            let user = await prisma.user.findFirst({ where: { email: 'test@example.com' } });
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        email: 'test@example.com',
                        name: 'Test User',
                        password: 'password',
                    }
                });
                console.log('Created test user:', user.id);
            }

            // Create listing and location
            listing = await prisma.listing.create({
                data: {
                    title: 'Test Room',
                    description: 'A test room for verification',
                    price: 1000,
                    amenities: ['Wifi', 'Test'],
                    houseRules: 'No rules',
                    totalSlots: 1,
                    availableSlots: 1,
                    ownerId: user.id,
                    location: {
                        create: {
                            address: '123 Test St',
                            city: 'Test City',
                            state: 'TS',
                            zip: '12345'
                        }
                    }
                },
                include: { location: true }
            });
            console.log('Created test listing:', listing.id);

            // Update with PostGIS geometry (Mock coordinates for San Francisco)
            const lat = 37.7749;
            const lng = -122.4194;
            const point = `POINT(${lng} ${lat})`;

            await prisma.$executeRaw`
                UPDATE "Location"
                SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
                WHERE id = ${listing.location.id}
            `;
            console.log('Updated location with PostGIS coordinates');
        } else {
            console.log('Found existing test listing:', listing.id);
        }

        // 3. Verify Data
        console.log('Verifying data integrity...');
        console.log('Listing:', listing.title);

        if (listing.location) {
            console.log('Location Address:', listing.location.address);

            // Check for coordinates using raw query
            const result = await prisma.$queryRaw`
                SELECT ST_AsText(coords) as coords_text 
                FROM "Location" 
                WHERE id = ${listing.location.id}
            `;

            if (result.length > 0 && result[0].coords_text) {
                console.log('✅ SUCCESS: PostGIS Coordinates found:', result[0].coords_text);
            } else {
                console.error('❌ FAILURE: PostGIS Coordinates NOT found or empty');
            }
        } else {
            console.error('❌ FAILURE: Location record missing for listing');
        }

    } catch (error) {
        console.error('❌ ERROR:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
