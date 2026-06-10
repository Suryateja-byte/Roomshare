/**
 * Demo data seed script for recruiter / investor demos
 * Creates 3 demo accounts + 14 realistic listings (10 SF, 4 Seattle)
 *
 * Run with: node scripts/seed-demo.js
 * Dry run:  node scripts/seed-demo.js --dry-run
 *
 * The script is idempotent — safe to re-run (upsert-by-email / upsert-by-id).
 * DATABASE_URL must be set in the environment before running.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const DEMO_PASSWORD = 'RoomshareDemo2026!';

// ---------------------------------------------------------------------------
// Demo user definitions
// ---------------------------------------------------------------------------
const DEMO_USERS = [
  {
    email: 'demo-host@roomshare.dev',
    name: 'Maya Chen',
  },
  {
    email: 'demo-host2@roomshare.dev',
    name: 'Jordan Park',
  },
  {
    email: 'demo-seeker@roomshare.dev',
    name: 'Alex Rivera',
  },
];

// ---------------------------------------------------------------------------
// Stable Unsplash photo IDs for room / apartment interiors
// These are well-known, stable Unsplash photo identifiers.
// ---------------------------------------------------------------------------
const ROOM_PHOTOS = {
  brightPrivate: [
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80',
    'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200&q=80',
    'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?w=1200&q=80',
  ],
  modernStudio: [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80',
    'https://images.unsplash.com/photo-1556020685-ae41abfc9365?w=1200&q=80',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&q=80',
  ],
  cozyNook: [
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=80',
    'https://images.unsplash.com/photo-1505693314120-0d443867891c?w=1200&q=80',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
  ],
  sunnyLoft: [
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&q=80',
  ],
  gardenView: [
    'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=1200&q=80',
    'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=1200&q=80',
    'https://images.unsplash.com/photo-1519643381401-22c77e60520e?w=1200&q=80',
  ],
  minimalist: [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80',
    'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200&q=80',
  ],
  seattleApt: [
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80',
    'https://images.unsplash.com/photo-1600607687939-ce8a6d349fb7?w=1200&q=80',
    'https://images.unsplash.com/photo-1617104678098-de229db51175?w=1200&q=80',
  ],
};

// ---------------------------------------------------------------------------
// Helper: compute a move-in date N days from "now at script run time"
// ---------------------------------------------------------------------------
function daysFromNow(days) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Listing data — 10 SF + 4 Seattle
// Each entry follows the same shape used by seed-e2e.js SF_LISTINGS.
// ---------------------------------------------------------------------------
const DEMO_LISTINGS = [
  // ── San Francisco ──────────────────────────────────────────────────────────
  {
    id: 'demo-sf-01-mission-artist-flat',
    ownerKey: 'demo-host@roomshare.dev',
    title: 'Sunny Mission room in artist flat',
    description:
      'Wake up to morning light flooding through tall Victorian windows in this warmly decorated private room. ' +
      'You\'ll share the flat with two working artists who keep things tidy and social. ' +
      'Half a block from Dolores Park and a short walk to BART — the city is truly at your door.',
    price: 1450,
    roomType: 'Private Room',
    lat: 37.7598, lng: -122.4148,
    address: '3200 18th St', city: 'San Francisco', state: 'CA', zip: '94110',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Washer', 'Dryer'],
    houseRules: ['Pets allowed'],
    leaseDuration: '6 months',
    minStayMonths: 6,
    moveInDate: daysFromNow(14),
    images: ROOM_PHOTOS.brightPrivate,
  },
  {
    id: 'demo-sf-02-hayes-valley-suite',
    ownerKey: 'demo-host@roomshare.dev',
    title: 'Elegant Hayes Valley suite near Gough',
    description:
      'A fully furnished en-suite room in a beautifully renovated Edwardian flat, steps from the best coffee ' +
      'shops and wine bars Hayes Valley has to offer. ' +
      'The en-suite bath and private entrance from the hallway give you genuine privacy while still feeling at home.',
    price: 1950,
    roomType: 'Private Room',
    lat: 37.7762, lng: -122.4244,
    address: '420 Hayes St', city: 'San Francisco', state: 'CA', zip: '94102',
    amenities: ['Wifi', 'Furnished', 'AC', 'Washer', 'Dryer'],
    houseRules: ['Guests allowed'],
    leaseDuration: '6 months',
    minStayMonths: 6,
    moveInDate: daysFromNow(21),
    images: ROOM_PHOTOS.sunnyLoft,
  },
  {
    id: 'demo-sf-03-noe-valley-garden',
    ownerKey: 'demo-host2@roomshare.dev',
    title: 'Quiet Noe Valley room with garden access',
    description:
      'This south-facing room overlooks a shared garden bursting with roses and citrus trees — a rare SF luxury. ' +
      'The house is owned by a remote-working couple who value calm evenings and good conversation over dinner. ' +
      'Church St Muni is a three-minute walk for easy downtown access.',
    price: 1650,
    roomType: 'Private Room',
    lat: 37.7503, lng: -122.4338,
    address: '1340 Church St', city: 'San Francisco', state: 'CA', zip: '94114',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Parking', 'Washer'],
    houseRules: ['Pets allowed', 'Guests allowed'],
    leaseDuration: '12 months',
    minStayMonths: 6,
    moveInDate: daysFromNow(10),
    images: ROOM_PHOTOS.gardenView,
  },
  {
    id: 'demo-sf-04-outer-sunset-studio',
    ownerKey: 'demo-host@roomshare.dev',
    title: 'Breezy Outer Sunset studio near ocean',
    description:
      'An entire studio apartment two blocks from the Pacific, with a dedicated workspace and fast fiber. ' +
      'The neighborhood is quiet, walkable, and full of excellent dim sum spots and independent coffee shops. ' +
      'Golden Gate Park\'s western edge is a five-minute bike ride.',
    price: 2100,
    roomType: 'Entire Place',
    lat: 37.7539, lng: -122.5041,
    address: '1970 Judah St', city: 'San Francisco', state: 'CA', zip: '94122',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'AC', 'Washer', 'Dryer'],
    houseRules: ['Couples allowed'],
    leaseDuration: '12 months',
    minStayMonths: 8,
    moveInDate: daysFromNow(30),
    images: ROOM_PHOTOS.modernStudio,
  },
  {
    id: 'demo-sf-05-richmond-park-room',
    ownerKey: 'demo-host2@roomshare.dev',
    title: 'Peaceful Richmond District room near the park',
    description:
      'A bright private room in a classic Richmond District flat shared with two grad students. ' +
      'The flat is meticulously maintained, with a fully stocked kitchen and a reading nook that gets great afternoon light. ' +
      'One block from Clement Street\'s legendary restaurant row.',
    price: 1250,
    roomType: 'Private Room',
    lat: 37.7799, lng: -122.4703,
    address: '740 Clement St', city: 'San Francisco', state: 'CA', zip: '94118',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Gym'],
    houseRules: ['Guests allowed'],
    leaseDuration: 'Month-to-month',
    minStayMonths: 3,
    moveInDate: daysFromNow(7),
    images: ROOM_PHOTOS.cozyNook,
  },
  {
    id: 'demo-sf-06-soma-loft-share',
    ownerKey: 'demo-host@roomshare.dev',
    title: 'SoMa designer loft — private room available',
    description:
      'Live in a converted warehouse loft with soaring 16-foot ceilings, exposed brick, and polished concrete floors. ' +
      'The private room features a built-in Murphy bed that folds away to reveal a generous home-office setup — ' +
      'ideal for engineers or designers working downtown or remotely.',
    price: 1800,
    roomType: 'Private Room',
    lat: 37.7786, lng: -122.3953,
    address: '488 Brannan St', city: 'San Francisco', state: 'CA', zip: '94107',
    amenities: ['Wifi', 'Furnished', 'AC', 'Gym', 'Parking'],
    houseRules: [],
    leaseDuration: '6 months',
    minStayMonths: 6,
    moveInDate: daysFromNow(20),
    images: ROOM_PHOTOS.sunnyLoft,
  },
  {
    id: 'demo-sf-07-castro-charming-room',
    ownerKey: 'demo-host2@roomshare.dev',
    title: 'Charming Castro room in restored Victorian',
    description:
      'Original hardwood floors, decorative fireplace, and period details bring character to this cheerful private room. ' +
      'The Castro neighborhood means you\'re central, walkable, and surrounded by great brunch spots and independent bookstores. ' +
      'MUNI access right outside the front door.',
    price: 1400,
    roomType: 'Private Room',
    lat: 37.7612, lng: -122.4351,
    address: '520 Castro St', city: 'San Francisco', state: 'CA', zip: '94114',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Washer', 'Dryer'],
    houseRules: ['Guests allowed', 'Couples allowed'],
    leaseDuration: '3 months',
    minStayMonths: 3,
    moveInDate: daysFromNow(15),
    images: ROOM_PHOTOS.brightPrivate,
  },
  {
    id: 'demo-sf-08-bernal-heights-cottage',
    ownerKey: 'demo-host@roomshare.dev',
    title: 'Bernal Heights garden cottage — entire unit',
    description:
      'A freestanding garden cottage behind the main house, completely private with its own entrance, ' +
      'small kitchenette, and outdoor seating area framed by bougainvillea. ' +
      'Bernal Hill\'s panoramic trails are steps away, and the Mission\'s restaurants are a ten-minute walk.',
    price: 2200,
    roomType: 'Entire Place',
    lat: 37.7449, lng: -122.4153,
    address: '310 Cortland Ave', city: 'San Francisco', state: 'CA', zip: '94110',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Washer'],
    houseRules: ['Pets allowed'],
    leaseDuration: '12 months',
    minStayMonths: 8,
    moveInDate: daysFromNow(45),
    images: ROOM_PHOTOS.gardenView,
  },
  {
    id: 'demo-sf-09-inner-sunset-shared',
    ownerKey: 'demo-host2@roomshare.dev',
    title: 'Inner Sunset shared room — UCSF and park nearby',
    description:
      'A comfortable shared room in a four-person flat just off Irving Street, popular with UCSF residents, ' +
      'researchers, and anyone who wants easy access to Golden Gate Park without downtown prices. ' +
      'The house is clean, social, and has a great big kitchen for weekend cooking sessions.',
    price: 850,
    roomType: 'Shared Room',
    lat: 37.7618, lng: -122.4601,
    address: '915 Irving St', city: 'San Francisco', state: 'CA', zip: '94122',
    amenities: ['Wifi', 'Kitchen', 'Washer', 'Dryer'],
    houseRules: [],
    leaseDuration: 'Month-to-month',
    minStayMonths: 1,
    moveInDate: daysFromNow(5),
    images: ROOM_PHOTOS.cozyNook,
  },
  {
    id: 'demo-sf-10-nob-hill-classic',
    ownerKey: 'demo-host@roomshare.dev',
    title: 'Classic Nob Hill room with cable car views',
    description:
      'High-ceilinged room in a stunning pre-war building at the top of Nob Hill, with bay windows that look out ' +
      'onto the iconic cable car tracks on California Street. ' +
      'Walking distance to Chinatown, Union Square, and the Financial District — old SF charm at its best.',
    price: 1850,
    roomType: 'Private Room',
    lat: 37.7930, lng: -122.4126,
    address: '1050 California St', city: 'San Francisco', state: 'CA', zip: '94108',
    amenities: ['Wifi', 'Furnished', 'AC'],
    houseRules: [],
    leaseDuration: '6 months',
    minStayMonths: 6,
    moveInDate: daysFromNow(28),
    images: ROOM_PHOTOS.minimalist,
  },

  // ── Seattle ─────────────────────────────────────────────────────────────────
  {
    id: 'demo-sea-01-capitol-hill-bright',
    ownerKey: 'demo-host2@roomshare.dev',
    title: 'Bright Capitol Hill room — walkable to everything',
    description:
      'A sun-soaked private room in a modern Capitol Hill apartment shared with two friendly young professionals. ' +
      'The neighborhood is Seattle\'s most walkable — coffee shops, live music venues, and light rail to downtown ' +
      'are all within a few blocks.',
    price: 1300,
    roomType: 'Private Room',
    lat: 47.6221, lng: -122.3219,
    address: '1500 E Olive Way', city: 'Seattle', state: 'WA', zip: '98122',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Washer', 'Dryer'],
    houseRules: ['Pets allowed', 'Guests allowed'],
    leaseDuration: '6 months',
    minStayMonths: 3,
    moveInDate: daysFromNow(18),
    images: ROOM_PHOTOS.seattleApt,
  },
  {
    id: 'demo-sea-02-ballard-craftsman',
    ownerKey: 'demo-host@roomshare.dev',
    title: 'Ballard craftsman bungalow — private suite',
    description:
      'A private suite with its own bath in a lovingly maintained 1920s craftsman bungalow in the heart of Ballard. ' +
      'Your housemates are a chef and a marine biologist — expect excellent dinner conversations and a well-stocked spice rack. ' +
      'The Burke-Gilman Trail for cycling commutes starts at the end of the block.',
    price: 1550,
    roomType: 'Private Room',
    lat: 47.6685, lng: -122.3835,
    address: '5600 22nd Ave NW', city: 'Seattle', state: 'WA', zip: '98107',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Parking'],
    houseRules: [],
    leaseDuration: '12 months',
    minStayMonths: 6,
    moveInDate: daysFromNow(25),
    images: ROOM_PHOTOS.brightPrivate,
  },
  {
    id: 'demo-sea-03-fremont-studio',
    ownerKey: 'demo-host2@roomshare.dev',
    title: 'Fremont studio apartment — entire unit',
    description:
      'An entire studio in the quirky, creative Fremont neighborhood — known for its Sunday market, ' +
      'giant Lenin statue, and some of the best coffee and craft beer in Seattle. ' +
      'The studio is compact but smartly designed, with a Murphy bed, built-in shelving, and a full kitchen.',
    price: 1750,
    roomType: 'Entire Place',
    lat: 47.6512, lng: -122.3497,
    address: '3500 Fremont Ave N', city: 'Seattle', state: 'WA', zip: '98103',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'AC'],
    houseRules: ['Couples allowed'],
    leaseDuration: '6 months',
    minStayMonths: 5,
    moveInDate: daysFromNow(35),
    images: ROOM_PHOTOS.modernStudio,
  },
  {
    id: 'demo-sea-04-queen-anne-hilltop',
    ownerKey: 'demo-host@roomshare.dev',
    title: 'Queen Anne hilltop room with Seattle skyline views',
    description:
      'From this room on the south slope of Queen Anne, you can see the Space Needle, Elliott Bay, and the Olympic Mountains ' +
      'on a clear day. The three-story home is quiet and professionally kept, ' +
      'with a shared rooftop deck that becomes the best seat in Seattle at sunset.',
    price: 1700,
    roomType: 'Private Room',
    lat: 47.6373, lng: -122.3564,
    address: '400 Ward St', city: 'Seattle', state: 'WA', zip: '98109',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Parking', 'AC'],
    houseRules: ['Pets allowed'],
    leaseDuration: '6 months',
    minStayMonths: 4,
    moveInDate: daysFromNow(22),
    images: ROOM_PHOTOS.sunnyLoft,
  },
];

// ---------------------------------------------------------------------------
// Contract guard — keep in sync with VALID_AMENITIES / VALID_HOUSE_RULES in
// src/lib/filter-schema.ts. The listings API enforces these allowlists on
// every create/save, so non-canonical seed values make seeded listings
// un-editable in the UI (PATCH 400 "Invalid amenity value") and invisible to
// amenity/house-rule filters. Fails fast at script start, before any writes.
// ---------------------------------------------------------------------------
const VALID_AMENITIES = [
  'Wifi', 'AC', 'Parking', 'Washer', 'Dryer', 'Kitchen', 'Gym', 'Pool', 'Furnished',
];
const VALID_HOUSE_RULES = [
  'Pets allowed', 'Smoking allowed', 'Couples allowed', 'Guests allowed',
];

for (const listing of DEMO_LISTINGS) {
  for (const amenity of listing.amenities || []) {
    if (!VALID_AMENITIES.includes(amenity)) {
      throw new Error(
        `seed-demo: listing "${listing.id}" has non-canonical amenity "${amenity}" — must be one of VALID_AMENITIES (src/lib/filter-schema.ts)`
      );
    }
  }
  for (const rule of listing.houseRules || []) {
    if (!VALID_HOUSE_RULES.includes(rule)) {
      throw new Error(
        `seed-demo: listing "${listing.id}" has non-canonical house rule "${rule}" — must be one of VALID_HOUSE_RULES (src/lib/filter-schema.ts)`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Copied verbatim from seed-e2e.js — identical logic, identical SQL shape
// ---------------------------------------------------------------------------

const ROOM_CATEGORY_BY_ROOM_TYPE = {
  'Private Room': 'PRIVATE_ROOM',
  'Shared Room': 'SHARED_ROOM',
  'Entire Place': 'ENTIRE_PLACE',
};

function toRoomCategory(roomType) {
  return ROOM_CATEGORY_BY_ROOM_TYPE[roomType] || 'PRIVATE_ROOM';
}

function toDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function deriveUnitIdentity(ownerId, seed) {
  const canonicalMaterial = [
    ownerId,
    seed.address,
    seed.city,
    seed.state,
    seed.zip,
  ]
    .join('|')
    .toLowerCase();
  const hash = crypto
    .createHash('sha256')
    .update(canonicalMaterial)
    .digest('hex');

  return {
    unitId: `demo-unit-${hash.slice(0, 24)}`,
    canonicalAddressHash: hash,
    canonicalUnit: `owner:${ownerId}`,
  };
}

function buildProjectionInput(listing, seed, ownerId) {
  return {
    listing,
    seed,
    ownerId,
    unit: deriveUnitIdentity(ownerId, seed),
    roomCategory: toRoomCategory(seed.roomType),
    availableFrom: toDateOnly(listing.moveInDate || seed.moveInDate),
    availableUntil: listing.availableUntil
      ? toDateOnly(listing.availableUntil)
      : null,
    totalSlots: Number(listing.totalSlots || 1),
    openSlots: Math.max(
      1,
      Number(listing.openSlots ?? listing.availableSlots ?? 1)
    ),
    price: Number(listing.price ?? seed.price ?? 1000),
  };
}

async function tableExists(tableName) {
  const result = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists"
  `;
  return result[0]?.exists === true;
}

// ---------------------------------------------------------------------------
// upsertListingWithLocation — mirrors seed-e2e.js exactly
// ---------------------------------------------------------------------------
async function upsertListingWithLocation(ownerId, seed) {
  const listing = await prisma.listing.upsert({
    where: { id: seed.id },
    update: {
      ownerId,
      title: seed.title,
      description: seed.description,
      price: seed.price,
      roomType: seed.roomType,
      amenities: seed.amenities || ['Wifi', 'Furnished', 'Kitchen'],
      houseRules: seed.houseRules || [],
      householdLanguages: ['en'],
      leaseDuration: seed.leaseDuration || '6 months',
      minStayMonths: seed.minStayMonths || 3,
      totalSlots: seed.totalSlots || 2,
      availableSlots: seed.availableSlots || 1,
      openSlots: seed.openSlots ?? seed.availableSlots ?? 1,
      moveInDate: new Date(seed.moveInDate),
      status: 'ACTIVE',
      statusReason: null,
      lastConfirmedAt: new Date(),
      images: seed.images || [],
      location: {
        upsert: {
          update: {
            address: seed.address,
            city: seed.city,
            state: seed.state,
            zip: seed.zip,
          },
          create: {
            address: seed.address,
            city: seed.city,
            state: seed.state,
            zip: seed.zip,
          },
        },
      },
    },
    create: {
      id: seed.id,
      ownerId,
      title: seed.title,
      description: seed.description,
      price: seed.price,
      roomType: seed.roomType,
      amenities: seed.amenities || ['Wifi', 'Furnished', 'Kitchen'],
      houseRules: seed.houseRules || [],
      householdLanguages: ['en'],
      leaseDuration: seed.leaseDuration || '6 months',
      minStayMonths: seed.minStayMonths || 3,
      totalSlots: seed.totalSlots || 2,
      availableSlots: seed.availableSlots || 1,
      openSlots: seed.openSlots ?? seed.availableSlots ?? 1,
      moveInDate: new Date(seed.moveInDate),
      status: 'ACTIVE',
      statusReason: null,
      lastConfirmedAt: new Date(),
      images: seed.images || [],
      location: {
        create: {
          address: seed.address,
          city: seed.city,
          state: seed.state,
          zip: seed.zip,
        },
      },
    },
  });

  const point = `POINT(${seed.lng} ${seed.lat})`;
  await prisma.$executeRaw`
    UPDATE "Location"
    SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
    WHERE "listingId" = ${listing.id}
  `;

  return listing;
}

// ---------------------------------------------------------------------------
// upsertProjectionFixtureRows — mirrors seed-e2e.js exactly
// ---------------------------------------------------------------------------
async function upsertProjectionFixtureRows(inputs) {
  if (inputs.length === 0) return;

  const hasProjectionTables =
    (await tableExists('physical_units')) &&
    (await tableExists('listing_inventories')) &&
    (await tableExists('inventory_search_projection')) &&
    (await tableExists('unit_public_projection'));

  if (!hasProjectionTables) {
    console.log('  ⚠ projection tables do not exist — skipping projection backfill');
    return;
  }

  const groups = new Map();

  for (const input of inputs) {
    const { listing, seed, unit, roomCategory } = input;
    const point = `POINT(${seed.lng} ${seed.lat})`;
    const cell = `${Number(seed.lat).toFixed(4)},${Number(seed.lng).toFixed(4)}`;
    const areaName = seed.city || 'San Francisco';
    const capacityGuests = roomCategory === 'SHARED_ROOM' ? null : input.totalSlots;
    const totalBeds = roomCategory === 'SHARED_ROOM' ? input.totalSlots : null;
    const openBeds = roomCategory === 'SHARED_ROOM' ? input.openSlots : null;
    const sourceVersion = 1;
    const projectionEpoch = 1;

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "physical_units" (
          id, unit_identity_epoch, canonical_address_hash, canonical_unit,
          canonicalizer_version, privacy_version, geocode_status,
          lifecycle_status, publish_status, supersedes_unit_ids,
          superseded_by_unit_id, source_version, row_version,
          exact_point, public_point, public_cell_id, public_area_name,
          created_at, updated_at
        )
        VALUES (
          $1, 1, $2, $3, 'demo.v1', 1, 'COMPLETE',
          'ACTIVE', 'PUBLISHED', ARRAY[]::TEXT[],
          NULL, $4::BIGINT, $4::BIGINT,
          $5::geography, $5::geography, $6, $7,
          NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          unit_identity_epoch = EXCLUDED.unit_identity_epoch,
          canonical_address_hash = EXCLUDED.canonical_address_hash,
          canonical_unit = EXCLUDED.canonical_unit,
          canonicalizer_version = EXCLUDED.canonicalizer_version,
          privacy_version = EXCLUDED.privacy_version,
          geocode_status = EXCLUDED.geocode_status,
          lifecycle_status = EXCLUDED.lifecycle_status,
          publish_status = EXCLUDED.publish_status,
          source_version = EXCLUDED.source_version,
          row_version = EXCLUDED.row_version,
          exact_point = EXCLUDED.exact_point,
          public_point = EXCLUDED.public_point,
          public_cell_id = EXCLUDED.public_cell_id,
          public_area_name = EXCLUDED.public_area_name,
          updated_at = NOW()
      `,
      unit.unitId,
      unit.canonicalAddressHash,
      unit.canonicalUnit,
      sourceVersion,
      point,
      cell,
      areaName
    );

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "listing_inventories" (
          id, unit_id, unit_identity_epoch_written_at, inventory_key,
          room_category, space_label, capacity_guests, total_beds, open_beds,
          available_from, available_until, availability_range, price,
          lease_min_months, lease_max_months, lease_negotiable,
          gender_preference, household_gender, lifecycle_status, publish_status,
          source_version, row_version, last_published_version, last_embedded_version,
          canonicalizer_version, canonical_address_hash, privacy_version,
          created_at, updated_at
        )
        VALUES (
          $1, $2, 1, $3, $4, NULL, $5::INTEGER, $6::INTEGER, $7::INTEGER,
          $8::DATE, $9::DATE,
          tstzrange($8::timestamptz, COALESCE($9::timestamptz, 'infinity'::timestamptz), '[)'),
          $10::NUMERIC, 1, NULL, FALSE, NULL, NULL, 'ACTIVE', 'PUBLISHED',
          $11::BIGINT, $11::BIGINT, $11::BIGINT, NULL, 'demo.v1', $12, 1,
          NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          unit_id = EXCLUDED.unit_id,
          unit_identity_epoch_written_at = EXCLUDED.unit_identity_epoch_written_at,
          inventory_key = EXCLUDED.inventory_key,
          room_category = EXCLUDED.room_category,
          capacity_guests = EXCLUDED.capacity_guests,
          total_beds = EXCLUDED.total_beds,
          open_beds = EXCLUDED.open_beds,
          available_from = EXCLUDED.available_from,
          available_until = EXCLUDED.available_until,
          availability_range = EXCLUDED.availability_range,
          price = EXCLUDED.price,
          lifecycle_status = EXCLUDED.lifecycle_status,
          publish_status = EXCLUDED.publish_status,
          source_version = EXCLUDED.source_version,
          row_version = EXCLUDED.row_version,
          last_published_version = EXCLUDED.last_published_version,
          canonical_address_hash = EXCLUDED.canonical_address_hash,
          updated_at = NOW()
      `,
      listing.id,
      unit.unitId,
      `listing:${listing.id}`,
      roomCategory,
      capacityGuests,
      totalBeds,
      openBeds,
      input.availableFrom,
      input.availableUntil,
      input.price,
      sourceVersion,
      unit.canonicalAddressHash
    );

    await prisma.listing.update({
      where: { id: listing.id },
      data: { physicalUnitId: unit.unitId },
    });

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "inventory_search_projection" (
          id, inventory_id, unit_id, unit_identity_epoch_written_at,
          room_category, capacity_guests, total_beds, open_beds, price,
          available_from, available_until, availability_range,
          lease_min_months, lease_max_months, lease_negotiable,
          gender_preference, household_gender, public_point, public_cell_id,
          public_area_name, publish_status, source_version, projection_epoch,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, 1, $4, $5::INTEGER, $6::INTEGER, $7::INTEGER,
          $8::NUMERIC, $9::DATE, $10::DATE,
          tstzrange($9::timestamptz, COALESCE($10::timestamptz, 'infinity'::timestamptz), '[)'),
          1, NULL, FALSE, NULL, NULL, $11, $12, $13, 'PUBLISHED',
          $14::BIGINT, $15::BIGINT, NOW(), NOW()
        )
        ON CONFLICT (inventory_id) DO UPDATE SET
          unit_id = EXCLUDED.unit_id,
          unit_identity_epoch_written_at = EXCLUDED.unit_identity_epoch_written_at,
          room_category = EXCLUDED.room_category,
          capacity_guests = EXCLUDED.capacity_guests,
          total_beds = EXCLUDED.total_beds,
          open_beds = EXCLUDED.open_beds,
          price = EXCLUDED.price,
          available_from = EXCLUDED.available_from,
          available_until = EXCLUDED.available_until,
          availability_range = EXCLUDED.availability_range,
          public_point = EXCLUDED.public_point,
          public_cell_id = EXCLUDED.public_cell_id,
          public_area_name = EXCLUDED.public_area_name,
          publish_status = EXCLUDED.publish_status,
          source_version = EXCLUDED.source_version,
          projection_epoch = EXCLUDED.projection_epoch,
          updated_at = NOW()
      `,
      `demo-projection-${listing.id}`,
      listing.id,
      unit.unitId,
      roomCategory,
      capacityGuests,
      totalBeds,
      openBeds,
      input.price,
      input.availableFrom,
      input.availableUntil,
      point,
      cell,
      areaName,
      sourceVersion,
      projectionEpoch
    );

    const groupKey = unit.unitId;
    const group = groups.get(groupKey) || {
      unit,
      point,
      cell,
      areaName,
      inputs: [],
    };
    group.inputs.push(input);
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    const sorted = [...group.inputs].sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return a.availableFrom.localeCompare(b.availableFrom);
    });
    const representative = sorted[0];
    const fromPrice = Math.min(...sorted.map((input) => input.price));
    const roomCategories = Array.from(
      new Set(sorted.map((input) => input.roomCategory))
    );
    const earliestAvailableFrom = sorted
      .map((input) => input.availableFrom)
      .sort()[0];
    const heroImage = representative.listing.images?.[0] || null;

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "unit_public_projection" (
          unit_id, unit_identity_epoch, representative_inventory_id,
          from_price, room_categories, earliest_available_from,
          matching_inventory_count, coarse_availability_badges,
          public_point, public_cell_id, public_area_name,
          display_title, display_subtitle, hero_image_url, payload_version,
          source_version, projection_epoch, created_at, updated_at
        )
        VALUES (
          $1, 1, $2, $3::NUMERIC, $4::TEXT[], $5::DATE, $6::INTEGER,
          $7::TEXT[], $8, $9, $10, $11, $12, $13, 'phase04.v1',
          1::BIGINT, 1::BIGINT, NOW(), NOW()
        )
        ON CONFLICT (unit_id, unit_identity_epoch) DO UPDATE SET
          representative_inventory_id = EXCLUDED.representative_inventory_id,
          from_price = EXCLUDED.from_price,
          room_categories = EXCLUDED.room_categories,
          earliest_available_from = EXCLUDED.earliest_available_from,
          matching_inventory_count = EXCLUDED.matching_inventory_count,
          coarse_availability_badges = EXCLUDED.coarse_availability_badges,
          public_point = EXCLUDED.public_point,
          public_cell_id = EXCLUDED.public_cell_id,
          public_area_name = EXCLUDED.public_area_name,
          display_title = EXCLUDED.display_title,
          display_subtitle = EXCLUDED.display_subtitle,
          hero_image_url = EXCLUDED.hero_image_url,
          payload_version = EXCLUDED.payload_version,
          source_version = EXCLUDED.source_version,
          projection_epoch = EXCLUDED.projection_epoch,
          updated_at = NOW()
      `,
      group.unit.unitId,
      representative.listing.id,
      fromPrice,
      roomCategories,
      earliestAvailableFrom,
      sorted.length,
      [`${sorted.length} open`],
      group.point,
      group.cell,
      group.areaName,
      representative.seed.title,
      `${sorted.length} available ${sorted.length === 1 ? 'space' : 'spaces'}`,
      heroImage
    );
  }

  console.log(
    `  ✓ projections backfilled: ${inputs.length} inventories, ${groups.size} units`
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN — no database writes will occur\n');

    console.log('Users to create/upsert:');
    for (const u of DEMO_USERS) {
      console.log(`  • ${u.email} (${u.name})`);
    }

    console.log(`\nListings to create/upsert (${DEMO_LISTINGS.length} total):`);
    const sfListings = DEMO_LISTINGS.filter((l) => l.city === 'San Francisco');
    const seaListings = DEMO_LISTINGS.filter((l) => l.city === 'Seattle');
    console.log(`  San Francisco (${sfListings.length}):`);
    for (const l of sfListings) {
      console.log(`    • [${l.roomType}] ${l.title} — $${l.price}/mo, available ${l.moveInDate.toISOString().slice(0, 10)}`);
    }
    console.log(`  Seattle (${seaListings.length}):`);
    for (const l of seaListings) {
      console.log(`    • [${l.roomType}] ${l.title} — $${l.price}/mo, available ${l.moveInDate.toISOString().slice(0, 10)}`);
    }

    console.log('\n✅ Dry run complete. No data written.');
    return;
  }

  console.log('🌱 Seeding demo data...');

  // 1. Hash password once for all demo users
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 2. Upsert demo users
  const userMap = {};
  for (const u of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password: hashedPassword,
        emailVerified: new Date(),
        isVerified: true,
        isSuspended: false,
        bio: `${u.name} is a Roomshare member. This is a demo account.`,
        image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&q=80',
        countryOfOrigin: 'United States',
        languages: ['en'],
      },
      create: {
        email: u.email,
        name: u.name,
        password: hashedPassword,
        emailVerified: new Date(),
        isVerified: true,
        isSuspended: false,
        bio: `${u.name} is a Roomshare member. This is a demo account.`,
        image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&q=80',
        countryOfOrigin: 'United States',
        languages: ['en'],
      },
    });
    userMap[u.email] = user;
    console.log(`  ✓ User: ${user.email} (${user.id})`);
  }

  // 3. Upsert all listings with PostGIS location
  const createdListings = [];
  const projectionInputs = [];

  for (const seed of DEMO_LISTINGS) {
    const owner = userMap[seed.ownerKey];
    if (!owner) {
      throw new Error(`Owner not found for listing "${seed.title}" — ownerKey: ${seed.ownerKey}`);
    }

    const listing = await upsertListingWithLocation(owner.id, seed);
    createdListings.push(listing);
    projectionInputs.push(buildProjectionInput(listing, seed, owner.id));
    console.log(`  ✓ Listing: ${seed.title} (${listing.id})`);
  }

  // 4. Backfill listing_search_docs (same SQL as seed-e2e.js — required for search to work)
  try {
    const searchDocsExists = await tableExists('listing_search_docs');
    if (searchDocsExists) {
      // Build the id list for this seed's listings only so we don't clobber e2e rows
      const demoIds = createdListings.map((l) => l.id);

      await prisma.$executeRawUnsafe(`
        INSERT INTO listing_search_docs (
          id, owner_id, title, description, price, images,
          amenities, house_rules, household_languages, primary_home_language,
          lease_duration, room_type, move_in_date, total_slots, available_slots,
          view_count, status, listing_created_at,
          address, city, state, zip, location_geog, lat, lng,
          avg_rating, review_count, recommended_score,
          amenities_lower, house_rules_lower, household_languages_lower,
          gender_preference, household_gender,
          doc_created_at, doc_updated_at
        )
        SELECT
          l.id, l."ownerId", l.title, l.description, l.price, l.images,
          l.amenities, l."houseRules", l."household_languages", l."primary_home_language",
          l."leaseDuration", l."roomType", l."moveInDate", l."totalSlots", l."availableSlots",
          l."viewCount", l.status::text, l."createdAt",
          loc.address, loc.city, loc.state, loc.zip,
          loc.coords, ST_Y(loc.coords::geometry), ST_X(loc.coords::geometry),
          0::float, 0::int, (l."viewCount" * 0.1),
          ARRAY(SELECT LOWER(unnest(l.amenities))),
          ARRAY(SELECT LOWER(unnest(l."houseRules"))),
          ARRAY(SELECT LOWER(unnest(l."household_languages"))),
          l."genderPreference", l."householdGender",
          NOW(), NOW()
        FROM "Listing" l
        JOIN "Location" loc ON l.id = loc."listingId"
        WHERE loc.coords IS NOT NULL
          AND l.id = ANY($1::text[])
        ON CONFLICT (id) DO UPDATE SET
          owner_id = EXCLUDED.owner_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          images = EXCLUDED.images,
          amenities = EXCLUDED.amenities,
          house_rules = EXCLUDED.house_rules,
          household_languages = EXCLUDED.household_languages,
          primary_home_language = EXCLUDED.primary_home_language,
          lease_duration = EXCLUDED.lease_duration,
          room_type = EXCLUDED.room_type,
          move_in_date = EXCLUDED.move_in_date,
          total_slots = EXCLUDED.total_slots,
          available_slots = EXCLUDED.available_slots,
          view_count = EXCLUDED.view_count,
          status = EXCLUDED.status,
          listing_created_at = EXCLUDED.listing_created_at,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip = EXCLUDED.zip,
          location_geog = EXCLUDED.location_geog,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          amenities_lower = EXCLUDED.amenities_lower,
          house_rules_lower = EXCLUDED.house_rules_lower,
          household_languages_lower = EXCLUDED.household_languages_lower,
          gender_preference = EXCLUDED.gender_preference,
          household_gender = EXCLUDED.household_gender,
          doc_updated_at = NOW()
      `, demoIds);

      console.log(`  ✓ listing_search_docs backfilled for ${demoIds.length} demo listings`);
    } else {
      console.log('  ⚠ listing_search_docs table does not exist — skipping (run prisma migrate deploy first)');
    }
  } catch (err) {
    console.error('  ⚠ listing_search_docs backfill failed:', err.message);
  }

  // 5. Backfill projection tables (same mechanics as seed-e2e.js)
  try {
    await upsertProjectionFixtureRows(projectionInputs);
  } catch (err) {
    console.error('  ⚠ projection backfill failed:', err.message);
  }

  // 6. Summary
  const sfCount = DEMO_LISTINGS.filter((l) => l.city === 'San Francisco').length;
  const seaCount = DEMO_LISTINGS.filter((l) => l.city === 'Seattle').length;

  console.log('');
  console.log('✅ Demo seed complete.');
  console.log(`   Users created/updated : ${DEMO_USERS.length}`);
  console.log(`   Listings total        : ${DEMO_LISTINGS.length}`);
  console.log(`     San Francisco       : ${sfCount}`);
  console.log(`     Seattle             : ${seaCount}`);
  console.log('');
  console.log('   Demo credentials (all accounts):');
  for (const u of DEMO_USERS) {
    console.log(`     ${u.email}  /  ${DEMO_PASSWORD}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
