// Seed script to create 20 random listings across USA
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Sample data for generating realistic listings
const listings = [
    {
        title: "Sunny Studio in Downtown Austin",
        city: "Austin", state: "TX", zip: "78701",
        address: "123 Congress Ave",
        lat: 30.2672, lng: -97.7431,
        price: 1200, description: "Bright and modern studio in the heart of Austin's entertainment district. Walking distance to everything!"
    },
    {
        title: "Cozy Room in Brooklyn Brownstone",
        city: "Brooklyn", state: "NY", zip: "11201",
        address: "456 Atlantic Ave",
        lat: 40.6892, lng: -73.9857,
        price: 1800, description: "Charming room in a classic Brooklyn brownstone. Great neighborhood with cafes and parks nearby."
    },
    {
        title: "Modern Loft near Golden Gate",
        city: "San Francisco", state: "CA", zip: "94102",
        address: "789 Market St",
        lat: 37.7749, lng: -122.4194,
        price: 2200, description: "Spacious loft with stunning views. Minutes from public transit and tech companies."
    },
    {
        title: "Beach House Room in Miami",
        city: "Miami Beach", state: "FL", zip: "33139",
        address: "321 Ocean Dr",
        lat: 25.7617, lng: -80.1918,
        price: 1500, description: "Steps from the beach! Enjoy the Miami lifestyle in this beautiful shared space."
    },
    {
        title: "Capitol Hill Apartment Share",
        city: "Seattle", state: "WA", zip: "98102",
        address: "555 Pike St",
        lat: 47.6062, lng: -122.3321,
        price: 1400, description: "Trendy Capitol Hill location with coffee shops and nightlife at your doorstep."
    },
    {
        title: "Historic Townhouse in Georgetown",
        city: "Washington", state: "DC", zip: "20007",
        address: "888 M St NW",
        lat: 38.9072, lng: -77.0369,
        price: 1700, description: "Beautiful historic townhouse in prestigious Georgetown. Near universities and embassies."
    },
    {
        title: "Wicker Park Shared Apartment",
        city: "Chicago", state: "IL", zip: "60622",
        address: "234 Division St",
        lat: 41.8781, lng: -87.6298,
        price: 1100, description: "Hip Wicker Park location with amazing restaurants and art galleries nearby."
    },
    {
        title: "Hollywood Hills Room with View",
        city: "Los Angeles", state: "CA", zip: "90028",
        address: "567 Hollywood Blvd",
        lat: 34.0522, lng: -118.2437,
        price: 1900, description: "Stunning hilltop location with city views. Perfect for entertainment industry professionals."
    },
    {
        title: "Student-Friendly Room near Harvard",
        city: "Cambridge", state: "MA", zip: "02138",
        address: "42 Harvard Square",
        lat: 42.3736, lng: -71.1097,
        price: 1600, description: "Ideal for students! Walking distance to Harvard and MIT campuses."
    },
    {
        title: "Midtown Manhattan Studio Share",
        city: "New York", state: "NY", zip: "10018",
        address: "350 5th Ave",
        lat: 40.7484, lng: -73.9857,
        price: 2500, description: "Prime Midtown location near Times Square and Grand Central. Ultra-convenient!"
    },
    {
        title: "Arts District Loft in Denver",
        city: "Denver", state: "CO", zip: "80202",
        address: "100 Larimer St",
        lat: 39.7392, lng: -104.9903,
        price: 1300, description: "Creative space in Denver's vibrant arts district. Mountain views and cool vibes."
    },
    {
        title: "French Quarter Charm in NOLA",
        city: "New Orleans", state: "LA", zip: "70116",
        address: "200 Bourbon St",
        lat: 29.9511, lng: -90.0715,
        price: 1000, description: "Experience the magic of New Orleans in this charming French Quarter space."
    },
    {
        title: "Tech Hub Room in Palo Alto",
        city: "Palo Alto", state: "CA", zip: "94301",
        address: "300 University Ave",
        lat: 37.4419, lng: -122.1430,
        price: 2100, description: "Perfect for tech workers! Near Stanford and major tech company headquarters."
    },
    {
        title: "Lakefront Living in Minneapolis",
        city: "Minneapolis", state: "MN", zip: "55401",
        address: "150 Lake St",
        lat: 44.9778, lng: -93.2650,
        price: 950, description: "Beautiful lakefront location with bike trails and parks. Four seasons of fun!"
    },
    {
        title: "Music Row Room in Nashville",
        city: "Nashville", state: "TN", zip: "37203",
        address: "400 Music Row",
        lat: 36.1627, lng: -86.7816,
        price: 1150, description: "Live among musicians in Nashville's famous Music Row. Perfect for creatives!"
    },
    {
        title: "Desert Oasis near Scottsdale",
        city: "Scottsdale", state: "AZ", zip: "85251",
        address: "500 Camelback Rd",
        lat: 33.4942, lng: -111.9261,
        price: 1250, description: "Relaxing desert living with pool access and mountain views. Sunshine guaranteed!"
    },
    {
        title: "Pearl District Modern Space",
        city: "Portland", state: "OR", zip: "97209",
        address: "600 NW 23rd Ave",
        lat: 45.5152, lng: -122.6784,
        price: 1350, description: "Trendy Pearl District location with amazing food scene and galleries."
    },
    {
        title: "Gaslamp Quarter Room in San Diego",
        city: "San Diego", state: "CA", zip: "92101",
        address: "700 5th Ave",
        lat: 32.7157, lng: -117.1611,
        price: 1450, description: "Beach city living in vibrant Gaslamp Quarter. Perfect weather year-round!"
    },
    {
        title: "Buckhead Luxury Share in Atlanta",
        city: "Atlanta", state: "GA", zip: "30305",
        address: "800 Peachtree St",
        lat: 33.7490, lng: -84.3880,
        price: 1350, description: "Upscale Buckhead location with excellent shopping and dining options."
    },
    {
        title: "River Walk Charmer in San Antonio",
        city: "San Antonio", state: "TX", zip: "78205",
        address: "900 Commerce St",
        lat: 29.4241, lng: -98.4936,
        price: 900, description: "Steps from the famous River Walk! Experience authentic Texas hospitality."
    }
];

const amenities = [
    ["WiFi", "Air Conditioning", "Washer/Dryer", "Kitchen Access"],
    ["WiFi", "Heating", "Parking", "Gym Access"],
    ["WiFi", "Furnished", "Utilities Included", "Pet Friendly"],
    ["WiFi", "Air Conditioning", "Balcony", "Pool Access"],
    ["WiFi", "Heating", "Washer/Dryer", "Workspace"]
];

const houseRules = [
    ["No Smoking", "No Parties", "Quiet Hours 10pm-8am"],
    ["No Pets", "No Smoking", "Clean Common Areas"],
    ["Pet Friendly", "No Smoking", "Respect Shared Spaces"],
    ["No Overnight Guests", "No Smoking", "Keep Kitchen Clean"],
    ["Flexible", "Be Respectful", "Communicate"]
];

const roomTypes = ["Private Room", "Shared Room", "Entire Place"];
const leaseDurations = ["Month-to-month", "3 months", "6 months", "12 months"];
const genderPrefs = ["Any", "Male Only", "Female Only"];

async function main() {
    // Get the user ID for the owner
    const user = await prisma.user.findFirst({
        where: { email: "suryaram564@gmail.com" }
    });

    if (!user) {
        console.error("User not found! Please log in first.");
        process.exit(1);
    }

    console.log(`Creating listings for user: ${user.name} (${user.email})`);

    for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        const amenitySet = amenities[i % amenities.length];
        const ruleSet = houseRules[i % houseRules.length];

        try {
            const created = await prisma.listing.create({
                data: {
                    title: listing.title,
                    description: listing.description,
                    price: listing.price,
                    images: [
                        `https://picsum.photos/seed/${i + 100}/800/600`,
                        `https://picsum.photos/seed/${i + 200}/800/600`,
                        `https://picsum.photos/seed/${i + 300}/800/600`
                    ],
                    amenities: amenitySet,
                    houseRules: ruleSet,
                    languages: ["English"],
                    genderPreference: genderPrefs[i % genderPrefs.length],
                    householdGender: "Mixed",
                    leaseDuration: leaseDurations[i % leaseDurations.length],
                    roomType: roomTypes[i % roomTypes.length],
                    totalSlots: 2,
                    availableSlots: 1,
                    status: "ACTIVE",
                    moveInDate: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000), // Staggered dates
                    ownerId: user.id,
                    location: {
                        create: {
                            address: listing.address,
                            city: listing.city,
                            state: listing.state,
                            zip: listing.zip,
                        }
                    }
                }
            });

            // Update location with coordinates using raw SQL for PostGIS
            const point = `POINT(${listing.lng} ${listing.lat})`;
            await prisma.$executeRaw`
        UPDATE "Location"
        SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
        WHERE "listingId" = ${created.id}
      `;

            console.log(`✓ Created: ${listing.title} in ${listing.city}, ${listing.state}`);
        } catch (error) {
            console.error(`✗ Failed: ${listing.title}`, error.message);
        }
    }

    console.log("\n✅ Done! Created 20 listings across the USA.");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
