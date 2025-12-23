import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Testing Database Connection...');
    try {
        // 1. Check basic connection
        const userCount = await prisma.user.count();
        console.log(`Successfully connected. User count: ${userCount}`);

        // 2. Check PostGIS
        console.log('Testing PostGIS functions...');
        try {
            const result = await prisma.$queryRaw`SELECT ST_AsText(ST_SetSRID(ST_Point(0,0), 4326)) as point`;
            console.log('PostGIS test successful:', result);
        } catch (e) {
            console.error('PostGIS test failed. Is the extension enabled?', e);
        }

        // 3. Test Listing Creation
        console.log('Testing Listing Creation...');
        try {
            // Create a dummy user
            const user = await prisma.user.create({
                data: {
                    email: 'test-script-user@example.com',
                    name: 'Test Script User',
                }
            });
            console.log('Test user created:', user.id);

            // Create a listing
            const listing = await prisma.listing.create({
                data: {
                    title: 'Test Listing',
                    description: 'Test Description',
                    price: 100,
                    amenities: ['Wifi'],
                    houseRules: ['No smoking'],
                    totalSlots: 1,
                    availableSlots: 1,
                    ownerId: user.id,
                }
            });
            console.log('Test listing created:', listing.id);

            // Create location
            const location = await prisma.location.create({
                data: {
                    listingId: listing.id,
                    address: '123 Test St',
                    city: 'Test City',
                    state: 'TS',
                    zip: '12345',
                }
            });
            console.log('Test location created:', location.id);

            // Update geometry
            const point = `POINT(0 0)`;
            await prisma.$executeRaw`
            UPDATE "Location"
            SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
            WHERE id = ${location.id}
        `;
            console.log('Test location geometry updated.');

            // Clean up
            await prisma.user.delete({ where: { id: user.id } });
            console.log('Cleaned up test data.');

        } catch (error) {
            console.error('Listing creation test failed:', error);
        }

    } catch (error) {
        console.error('Database connection failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
