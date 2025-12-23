import { geocodeAddress } from '../src/lib/geocoding';

async function testGeocoding() {
    console.log('Testing Mapbox geocoding with real addresses...\n');

    const testAddresses = [
        '1121 Hidden Ridge, Irving, TX',
        '123 Test St, Test City',
        '1600 Amphitheatre Parkway, Mountain View, CA',
    ];

    for (const address of testAddresses) {
        console.log(`\nTesting: ${address}`);
        const result = await geocodeAddress(address);

        if (result) {
            console.log(`  ✓ Result: lat=${result.lat}, lng=${result.lng}`);

            // Check if it's the fallback coordinates
            if (result.lat === 37.7749 && result.lng === -122.4194) {
                console.log('  ⚠️  WARNING: Received fallback coordinates (geocoding likely failed)');
            } else {
                console.log('  ✓ SUCCESS: Unique coordinates received');
            }
        } else {
            console.log('  ✗ ERROR: Geocoding returned null');
        }
    }
}

testGeocoding().catch(console.error);
