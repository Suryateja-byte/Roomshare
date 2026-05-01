/**
 * Lightweight E2E seed script
 * Creates minimal test data for Playwright journeys (5 SF listings + reviews)
 *
 * Run with: node scripts/seed-e2e.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const E2E_USER_EMAIL = process.env.E2E_TEST_EMAIL || 'e2e-test@roomshare.dev';
const E2E_USER_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
const DEFAULT_IMAGES = [
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600',
];
const DEFAULT_PROFILE_IMAGE =
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200';
const DEFAULT_PROFILE_BIO =
  'E2E verified Roomshare test profile with enough detail for create flows.';
const SF_PRIMARY_USER_LISTING_COUNT = 5;

function slugifyFixtureId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function buildSfListingSeed(data, index) {
  const moveInDate = new Date(Date.UTC(2026, 4, 1 + index, 12, 0, 0));
  const createdAt = new Date(Date.UTC(2026, 3, 1, 12, index, 0));

  return {
    ...data,
    id: `e2e-sf-${index + 1}-${slugifyFixtureId(data.title)}`,
    moveInDate: moveInDate.toISOString(),
    createdAt: createdAt.toISOString(),
  };
}

// SF locations within the bounds used by E2E tests
const SF_LISTINGS = [
  {
    title: 'Sunny Mission Room',
    description: 'Bright private room in the heart of the Mission District. Walking distance to BART.',
    price: 1200,
    roomType: 'Private Room',
    lat: 37.7599, lng: -122.4148,
    address: '2400 Mission St', city: 'San Francisco', state: 'CA', zip: '94110',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Parking'],
    houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
    leaseDuration: '6 months',
  },
  {
    title: 'Spacious SOMA Shared',
    description: 'Shared room in modern SOMA loft. Great for young professionals.',
    price: 800,
    roomType: 'Shared Room',
    lat: 37.7785, lng: -122.3950,
    address: '500 Howard St', city: 'San Francisco', state: 'CA', zip: '94105',
    amenities: ['Wifi', 'AC', 'Gym', 'Kitchen'],
    houseRules: ['No Smoking', 'Guests allowed'],
    leaseDuration: 'Month-to-month',
  },
  {
    title: 'Cozy Sunset Studio',
    description: 'Entire studio in the Outer Sunset. Ocean views, near Golden Gate Park.',
    price: 2200,
    roomType: 'Entire Place',
    lat: 37.7535, lng: -122.4950,
    address: '1800 Irving St', city: 'San Francisco', state: 'CA', zip: '94122',
    amenities: ['Wifi', 'Furnished', 'Pool', 'Kitchen', 'Parking'],
    houseRules: ['No Smoking', 'Pets allowed'],
    leaseDuration: '12 months',
  },
  {
    title: 'Hayes Valley Private Suite',
    description: 'Furnished private suite with en-suite bath. Close to restaurants and shops.',
    price: 1800,
    roomType: 'Private Room',
    lat: 37.7760, lng: -122.4240,
    address: '400 Hayes St', city: 'San Francisco', state: 'CA', zip: '94102',
    amenities: ['Wifi', 'Furnished', 'AC', 'Washer', 'Dryer'],
    houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
    leaseDuration: '6 months',
  },
  {
    title: 'Richmond District Room',
    description: 'Quiet private room near Golden Gate Park. Ideal for students.',
    price: 1000,
    roomType: 'Private Room',
    lat: 37.7800, lng: -122.4700,
    address: '600 Clement St', city: 'San Francisco', state: 'CA', zip: '94118',
    amenities: ['Wifi', 'Kitchen', 'Furnished'],
    houseRules: ['Quiet Hours 10pm-8am', 'Guests allowed'],
    leaseDuration: 'Month-to-month',
  },
  // Additional listings to ensure >12 results for pagination testing
  {
    title: 'Marina District Flat',
    description: 'Bright flat near Chestnut St shops and Marina Green.',
    price: 1600,
    roomType: 'Private Room',
    lat: 37.8010, lng: -122.4370,
    address: '2100 Chestnut St', city: 'San Francisco', state: 'CA', zip: '94123',
    amenities: ['Wifi', 'Parking', 'AC', 'Furnished'],
    houseRules: ['No Smoking', 'Pets allowed'],
    leaseDuration: '3 months',
  },
  {
    title: 'Noe Valley Garden Room',
    description: 'Peaceful room with garden access in family-friendly Noe Valley.',
    price: 1400,
    roomType: 'Private Room',
    lat: 37.7502, lng: -122.4337,
    address: '1200 Church St', city: 'San Francisco', state: 'CA', zip: '94114',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Pool'],
    houseRules: ['Pets allowed', 'Guests allowed'],
    leaseDuration: '12 months',
  },
  {
    title: 'Potrero Hill Studio',
    description: 'Modern studio with city views on Potrero Hill.',
    price: 1900,
    roomType: 'Entire Place',
    lat: 37.7615, lng: -122.4010,
    address: '800 18th St', city: 'San Francisco', state: 'CA', zip: '94107',
    amenities: ['Wifi', 'Gym', 'AC', 'Parking', 'Kitchen'],
    houseRules: ['No Smoking', 'Couples allowed'],
    leaseDuration: '6 months',
  },
  {
    title: 'Inner Sunset Shared',
    description: 'Shared room steps from UCSF and Golden Gate Park.',
    price: 750,
    roomType: 'Shared Room',
    lat: 37.7620, lng: -122.4600,
    address: '900 Irving St', city: 'San Francisco', state: 'CA', zip: '94122',
    amenities: ['Wifi', 'Kitchen'],
    houseRules: ['Quiet Hours 10pm-8am'],
    leaseDuration: 'Flexible',
  },
  {
    title: 'Dogpatch Loft',
    description: 'Industrial chic loft in up-and-coming Dogpatch neighborhood.',
    price: 2000,
    roomType: 'Entire Place',
    lat: 37.7590, lng: -122.3880,
    address: '700 3rd St', city: 'San Francisco', state: 'CA', zip: '94107',
    amenities: ['Wifi', 'Furnished', 'Pool', 'Gym', 'Parking', 'Kitchen'],
    houseRules: ['Pets allowed', 'Couples allowed'],
    leaseDuration: '12 months',
  },
  {
    title: 'Pacific Heights Room',
    description: 'Elegant room in Pacific Heights with bay views.',
    price: 2100,
    roomType: 'Private Room',
    lat: 37.7930, lng: -122.4340,
    address: '2500 Fillmore St', city: 'San Francisco', state: 'CA', zip: '94115',
    amenities: ['Wifi', 'Furnished', 'AC', 'Washer', 'Dryer', 'Parking'],
    houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
    leaseDuration: '6 months',
  },
  {
    title: 'Bernal Heights Cottage',
    description: 'Cozy cottage on Bernal Hill with panoramic views.',
    price: 1700,
    roomType: 'Entire Place',
    lat: 37.7450, lng: -122.4150,
    address: '300 Cortland Ave', city: 'San Francisco', state: 'CA', zip: '94110',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Pool'],
    houseRules: ['Pets allowed', 'Guests allowed'],
    leaseDuration: 'Flexible',
  },
  {
    title: 'Castro Neighborhood Room',
    description: 'Charming room in the heart of the Castro District.',
    price: 1350,
    roomType: 'Private Room',
    lat: 37.7610, lng: -122.4350,
    address: '500 Castro St', city: 'San Francisco', state: 'CA', zip: '94114',
    amenities: ['Wifi', 'AC', 'Kitchen', 'Gym'],
    houseRules: ['Guests allowed', 'Couples allowed'],
    leaseDuration: '3 months',
  },
  {
    title: 'North Beach Shared Space',
    description: 'Shared space near Washington Square and Italian restaurants.',
    price: 900,
    roomType: 'Shared Room',
    lat: 37.8010, lng: -122.4100,
    address: '400 Columbus Ave', city: 'San Francisco', state: 'CA', zip: '94133',
    amenities: ['Wifi', 'Kitchen'],
    houseRules: ['Smoking allowed', 'Guests allowed'],
    leaseDuration: 'Month-to-month',
  },
  {
    title: 'Haight-Ashbury Suite',
    description: 'Colorful suite in historic Haight-Ashbury neighborhood.',
    price: 1550,
    roomType: 'Private Room',
    lat: 37.7700, lng: -122.4480,
    address: '1600 Haight St', city: 'San Francisco', state: 'CA', zip: '94117',
    amenities: ['Wifi', 'Furnished', 'Parking', 'Gym'],
    houseRules: ['Pets allowed', 'Smoking allowed'],
    leaseDuration: '6 months',
  },
  {
    title: 'Financial District Studio',
    description: 'Compact studio near Montgomery BART station.',
    price: 2300,
    roomType: 'Entire Place',
    lat: 37.7940, lng: -122.4010,
    address: '100 Montgomery St', city: 'San Francisco', state: 'CA', zip: '94104',
    amenities: ['Wifi', 'AC', 'Furnished', 'Kitchen', 'Parking'],
    houseRules: ['No Smoking', 'Couples allowed'],
    leaseDuration: '12 months',
  },
  {
    title: 'Japantown Shared Room',
    description: 'Shared room near Japan Center and Peace Plaza.',
    price: 850,
    roomType: 'Shared Room',
    lat: 37.7855, lng: -122.4300,
    address: '1700 Post St', city: 'San Francisco', state: 'CA', zip: '94115',
    amenities: ['Wifi', 'Kitchen'],
    houseRules: ['Quiet Hours 10pm-8am'],
    leaseDuration: 'Flexible',
  },
  {
    title: 'Russian Hill Room',
    description: 'Cozy room with Lombard Street views in Russian Hill.',
    price: 1650,
    roomType: 'Private Room',
    lat: 37.8020, lng: -122.4190,
    address: '1000 Lombard St', city: 'San Francisco', state: 'CA', zip: '94109',
    amenities: ['Wifi', 'Furnished', 'AC', 'Kitchen'],
    houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
    leaseDuration: '6 months',
  },
  {
    title: 'SoMa Tech Room',
    description: 'Modern room near tech offices south of Market.',
    price: 1500,
    roomType: 'Private Room',
    lat: 37.7730, lng: -122.4050,
    address: '200 Brannan St', city: 'San Francisco', state: 'CA', zip: '94107',
    amenities: ['Wifi', 'Gym', 'Parking', 'Kitchen', 'AC'],
    houseRules: ['No Smoking', 'Guests allowed'],
    leaseDuration: '3 months',
  },
];

const DEDUPE_SINGLETON_SEED = {
  id: 'e2e-dedupe-singleton',
  title: 'E2E Dedupe Singleton Room',
  description: 'A single listing used to verify the list renders without a grouping affordance.',
  price: 980,
  roomType: 'Private Room',
  lat: 37.7842,
  lng: -122.4068,
  address: '811 Sutter St',
  city: 'San Francisco',
  state: 'CA',
  zip: '94109',
  moveInDate: '2026-05-10T00:00:00.000Z',
  createdAt: '2026-01-10T12:00:00.000Z',
};

const DEDUPE_GROUP_SEEDS = [
  {
    id: 'e2e-dedupe-clone-mar20',
    title: 'E2E Dedupe Clone Group',
    description: 'Canonical dedupe listing for the grouped-date search specs.',
    price: 1000,
    roomType: 'Private Room',
    lat: 37.7861,
    lng: -122.4094,
    address: '1555 Market St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94103',
    moveInDate: '2026-05-20T00:00:00.000Z',
    createdAt: '2026-01-04T12:00:00.000Z',
  },
  {
    id: 'e2e-dedupe-clone-apr18',
    title: 'E2E Dedupe Clone Group',
    description: 'Sibling dedupe listing for the grouped-date search specs.',
    price: 1000,
    roomType: 'Private Room',
    lat: 37.7861,
    lng: -122.4094,
    address: '1555 Market St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94103',
    moveInDate: '2026-06-18T00:00:00.000Z',
    createdAt: '2026-01-03T12:00:00.000Z',
  },
  {
    id: 'e2e-dedupe-clone-may15',
    title: 'E2E Dedupe Clone Group',
    description: 'Sibling dedupe listing for the grouped-date search specs.',
    price: 1000,
    roomType: 'Private Room',
    lat: 37.7861,
    lng: -122.4094,
    address: '1555 Market St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94103',
    moveInDate: '2026-07-15T00:00:00.000Z',
    createdAt: '2026-01-02T12:00:00.000Z',
  },
  {
    id: 'e2e-dedupe-clone-jun01',
    title: 'E2E Dedupe Clone Group',
    description: 'Sibling dedupe listing for the grouped-date search specs.',
    price: 1000,
    roomType: 'Private Room',
    lat: 37.7861,
    lng: -122.4094,
    address: '1555 Market St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94103',
    moveInDate: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-01-01T12:00:00.000Z',
  },
];

const CROSS_OWNER_SEEDS = [
  {
    id: 'e2e-cross-owner-a',
    title: 'E2E Cross Owner Visual',
    description: 'Cross-owner seed listing A to verify the list never merges different owners.',
    price: 1450,
    roomType: 'Private Room',
    lat: 37.7902,
    lng: -122.4051,
    address: '88 3rd St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94103',
    moveInDate: '2026-05-01T00:00:00.000Z',
    createdAt: '2026-01-08T12:00:00.000Z',
  },
  {
    id: 'e2e-cross-owner-b',
    title: 'E2E Cross Owner Visual',
    description: 'Cross-owner seed listing B to verify the list never merges different owners.',
    price: 1450,
    roomType: 'Private Room',
    lat: 37.7908,
    lng: -122.4045,
    address: '88 3rd St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94103',
    moveInDate: '2026-05-15T00:00:00.000Z',
    createdAt: '2026-01-07T12:00:00.000Z',
  },
];

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
      houseRules: seed.houseRules || ['No Smoking', 'Quiet Hours 10pm-8am'],
      householdLanguages: ['en'],
      leaseDuration: seed.leaseDuration || '6 months',
      totalSlots: seed.totalSlots || 2,
      availableSlots: seed.availableSlots || 1,
      openSlots: seed.openSlots ?? seed.availableSlots ?? 1,
      moveInDate: new Date(seed.moveInDate),
      images: seed.images || DEFAULT_IMAGES,
      createdAt: new Date(seed.createdAt),
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
      houseRules: seed.houseRules || ['No Smoking', 'Quiet Hours 10pm-8am'],
      householdLanguages: ['en'],
      leaseDuration: seed.leaseDuration || '6 months',
      totalSlots: seed.totalSlots || 2,
      availableSlots: seed.availableSlots || 1,
      openSlots: seed.openSlots ?? seed.availableSlots ?? 1,
      moveInDate: new Date(seed.moveInDate),
      images: seed.images || DEFAULT_IMAGES,
      createdAt: new Date(seed.createdAt),
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
    unitId: `e2e-unit-${hash.slice(0, 24)}`,
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

async function upsertProjectionFixtureRows(inputs) {
  if (inputs.length === 0) return;

  const hasProjectionTables =
    (await tableExists('physical_units')) &&
    (await tableExists('listing_inventories')) &&
    (await tableExists('inventory_search_projection')) &&
    (await tableExists('unit_public_projection'));

  if (!hasProjectionTables) {
    console.log('  ⚠ projection tables do not exist — skipping projection fixture backfill');
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
          $1, 1, $2, $3, 'e2e.v1', 1, 'COMPLETE',
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
          $11::BIGINT, $11::BIGINT, $11::BIGINT, NULL, 'e2e.v1', $12, 1,
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
      `e2e-projection-${listing.id}`,
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
    `  ✓ contact-first projections backfilled: ${inputs.length} inventories, ${groups.size} units`
  );
}

async function main() {
  console.log('🌱 Seeding E2E test data...');

  // 1. Upsert E2E test user
  const hashedPassword = await bcrypt.hash(E2E_USER_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: E2E_USER_EMAIL },
    update: {
      password: hashedPassword,
      emailVerified: new Date(),
      isVerified: true,
      bio: DEFAULT_PROFILE_BIO,
      image: DEFAULT_PROFILE_IMAGE,
      countryOfOrigin: 'United States',
      languages: ['en'],
    },
    create: {
      email: E2E_USER_EMAIL,
      name: 'E2E Test User',
      password: hashedPassword,
      emailVerified: new Date(),
      isVerified: true,
      bio: DEFAULT_PROFILE_BIO,
      image: DEFAULT_PROFILE_IMAGE,
      countryOfOrigin: 'United States',
      languages: ['en'],
    },
  });
  console.log(`  ✓ User: ${user.email} (${user.id})`);

  // 2. Create a second user for reviews
  const reviewer = await prisma.user.upsert({
    where: { email: 'e2e-reviewer@roomshare.dev' },
    update: {
      bio: DEFAULT_PROFILE_BIO,
      image: DEFAULT_PROFILE_IMAGE,
      countryOfOrigin: 'United States',
      languages: ['en'],
      isVerified: true,
    },
    create: {
      email: 'e2e-reviewer@roomshare.dev',
      name: 'E2E Reviewer',
      password: hashedPassword,
      emailVerified: new Date(),
      isVerified: true,
      bio: DEFAULT_PROFILE_BIO,
      image: DEFAULT_PROFILE_IMAGE,
      countryOfOrigin: 'United States',
      languages: ['en'],
    },
  });
  console.log(`  ✓ Reviewer: ${reviewer.email} (${reviewer.id})`);

  // 3. Create listings with locations. Keep the primary test user below the
  // create-listing cap so real create flows can exercise their intended paths.
  const createdListings = [];
  const sfListingOwnerIds = [];
  const sfListingIds = [];
  for (const [index, data] of SF_LISTINGS.entries()) {
    const ownerId =
      index < SF_PRIMARY_USER_LISTING_COUNT ? user.id : reviewer.id;
    const seed = buildSfListingSeed(data, index);
    const listing = await upsertListingWithLocation(ownerId, seed);

    sfListingOwnerIds.push(ownerId);
    sfListingIds.push(listing.id);
    createdListings.push(listing);
    console.log(`  ✓ Listing: ${data.title} (${listing.id})`);
  }

  const retiredSfDuplicates = await prisma.listing.updateMany({
    where: {
      id: { notIn: sfListingIds },
      ownerId: { in: [user.id, reviewer.id] },
      title: { in: SF_LISTINGS.map((listing) => listing.title) },
      status: { in: ['ACTIVE', 'PAUSED'] },
    },
    data: { status: 'RENTED' },
  });
  if (retiredSfDuplicates.count > 0) {
    console.log(`  ✓ Retired stale SF listing duplicates: ${retiredSfDuplicates.count}`);
  }

  // 3b. Create a listing owned by REVIEWER (so test user sees booking form, not owner view)
  const REVIEWER_LISTING = {
    title: 'Reviewer Nob Hill Apartment',
    description: 'Cozy apartment on Nob Hill. Great for visiting SF.',
    price: 1500,
    roomType: 'Entire Place',
    lat: 37.7920, lng: -122.4130,
    address: '1000 California St', city: 'San Francisco', state: 'CA', zip: '94108',
  };

  const existingReviewerListing = await prisma.listing.findFirst({
    where: { title: REVIEWER_LISTING.title, ownerId: reviewer.id },
  });

  let reviewerListing;
  if (existingReviewerListing) {
    reviewerListing = existingReviewerListing;
    console.log(`  ⏭ Reviewer listing exists: ${REVIEWER_LISTING.title}`);
  } else {
    reviewerListing = await prisma.listing.create({
      data: {
        ownerId: reviewer.id,
        title: REVIEWER_LISTING.title,
        description: REVIEWER_LISTING.description,
        price: REVIEWER_LISTING.price,
        roomType: REVIEWER_LISTING.roomType,
        amenities: ['WiFi', 'Furnished', 'Laundry'],
        houseRules: ['No Pets'],
        householdLanguages: ['en'],
        totalSlots: 1,
        availableSlots: 1,
        moveInDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        images: [
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600',
        ],
        location: {
          create: {
            address: REVIEWER_LISTING.address,
            city: REVIEWER_LISTING.city,
            state: REVIEWER_LISTING.state,
            zip: REVIEWER_LISTING.zip,
          },
        },
      },
    });
    const point = `POINT(${REVIEWER_LISTING.lng} ${REVIEWER_LISTING.lat})`;
    await prisma.$executeRaw`
      UPDATE "Location"
      SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
      WHERE "listingId" = ${reviewerListing.id}
    `;
    console.log(`  ✓ Reviewer listing: ${REVIEWER_LISTING.title} (${reviewerListing.id})`);
  }

  console.log('  ✓ Review fixture uses contact-first private feedback; bookings retired');

  // 4. Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'e2e-admin@roomshare.dev' },
    update: {
      isAdmin: true,
      bio: DEFAULT_PROFILE_BIO,
      image: DEFAULT_PROFILE_IMAGE,
      countryOfOrigin: 'United States',
      languages: ['en'],
      isVerified: true,
    },
    create: {
      email: 'e2e-admin@roomshare.dev',
      name: 'E2E Admin',
      password: hashedPassword,
      emailVerified: new Date(),
      isVerified: true,
      isAdmin: true,
      bio: DEFAULT_PROFILE_BIO,
      image: DEFAULT_PROFILE_IMAGE,
      countryOfOrigin: 'United States',
      languages: ['en'],
    },
  });
  console.log(`  ✓ Admin: ${admin.email} (${admin.id})`);

  // 5. Create third user (for blocking/messaging tests)
  const thirdUser = await prisma.user.upsert({
    where: { email: 'e2e-other@roomshare.dev' },
    update: {
      bio: 'Another verified E2E user for messaging and safety tests.',
      image: DEFAULT_PROFILE_IMAGE,
      countryOfOrigin: 'United States',
      languages: ['en'],
      isVerified: true,
    },
    create: {
      email: 'e2e-other@roomshare.dev',
      name: 'E2E Other User',
      password: hashedPassword,
      emailVerified: new Date(),
      isVerified: true,
      bio: 'Another test user for E2E tests.',
      image: DEFAULT_PROFILE_IMAGE,
      countryOfOrigin: 'United States',
      languages: ['en'],
    },
  });
  console.log(`  ✓ Third user: ${thirdUser.email} (${thirdUser.id})`);

  const dedupeSingleton = await upsertListingWithLocation(
    reviewer.id,
    DEDUPE_SINGLETON_SEED
  );
  console.log(`  ✓ Dedupe singleton: ${dedupeSingleton.id}`);

  const dedupeGroupListings = [];
  for (const seed of DEDUPE_GROUP_SEEDS) {
    const listing = await upsertListingWithLocation(reviewer.id, seed);
    dedupeGroupListings.push(listing);
  }
  console.log(
    `  ✓ Dedupe clone group: ${dedupeGroupListings.map((listing) => listing.id).join(', ')}`
  );

  const crossOwnerListings = [
    await upsertListingWithLocation(reviewer.id, CROSS_OWNER_SEEDS[0]),
    await upsertListingWithLocation(thirdUser.id, CROSS_OWNER_SEEDS[1]),
  ];
  console.log(
    `  ✓ Cross-owner listings: ${crossOwnerListings.map((listing) => listing.id).join(', ')}`
  );

  // 6. Add reviews to first listing
  if (createdListings.length > 0) {
    const targetListing = createdListings[0];
    const existingReview = await prisma.review.findFirst({
      where: { authorId: reviewer.id, listingId: targetListing.id },
    });

    if (!existingReview) {
      await prisma.review.create({
        data: {
          authorId: reviewer.id,
          listingId: targetListing.id,
          rating: 5,
          comment: 'Great place! Clean, well-maintained, and the host was very responsive.',
        },
      });
      console.log(`  ✓ Review added to: ${targetListing.title}`);
    } else {
      // Delete any existing response so J29 test can add one fresh
      await prisma.reviewResponse.deleteMany({
        where: { reviewId: existingReview.id },
      });
      console.log(`  ⏭ Review exists for: ${targetListing.title} (cleared responses)`);
    }
  }

  // 7. Booking-era fixtures are intentionally omitted after Phase 09.
  console.log('  ✓ Booking fixtures omitted; contact-first flow is canonical');

  // 8. Create conversation with messages between user and reviewer
  if (createdListings.length > 0) {
    const convoListing = createdListings[0];
    let conversation = await prisma.conversation.findFirst({
      where: {
        listingId: convoListing.id,
        participants: { some: { id: reviewer.id } },
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          listingId: convoListing.id,
          participants: { connect: [{ id: user.id }, { id: reviewer.id }] },
        },
      });

      await prisma.message.createMany({
        data: [
          {
            conversationId: conversation.id,
            senderId: reviewer.id,
            content: 'Hi! Is this room still available?',
            read: true,
          },
          {
            conversationId: conversation.id,
            senderId: user.id,
            content: 'Yes, it is! Would you like to schedule a viewing?',
            read: true,
          },
          {
            conversationId: conversation.id,
            senderId: reviewer.id,
            content: 'That would be great! When works for you?',
            read: false,
          },
        ],
      });
      console.log(`  ✓ Conversation + messages for: ${convoListing.title}`);
    } else {
      console.log(`  ⏭ Conversation exists for: ${convoListing.title}`);
    }
  }

  // 8b. Create conversation between user and thirdUser (for multi-user E2E tests)
  if (createdListings.length > 0) {
    const convoListing2 = createdListings[0];
    let conversation2 = await prisma.conversation.findFirst({
      where: {
        listingId: convoListing2.id,
        participants: { some: { id: thirdUser.id } },
      },
    });

    if (!conversation2) {
      conversation2 = await prisma.conversation.create({
        data: {
          listingId: convoListing2.id,
          participants: { connect: [{ id: user.id }, { id: thirdUser.id }] },
        },
      });

      await prisma.message.createMany({
        data: [
          {
            conversationId: conversation2.id,
            senderId: thirdUser.id,
            content: 'Hey, is the room still available?',
            read: true,
            createdAt: new Date(Date.now() - 120000),
          },
          {
            conversationId: conversation2.id,
            senderId: user.id,
            content: 'Yes! Want to schedule a viewing?',
            read: true,
            createdAt: new Date(Date.now() - 60000),
          },
        ],
      });
      console.log(`  ✓ Conversation 2 (user <-> thirdUser) for: ${convoListing2.title}`);
    } else {
      console.log(`  ⏭ Conversation 2 exists for: ${convoListing2.title}`);
    }
  }

  // 9. Create an OPEN report
  if (createdListings.length >= 4) {
    const reportedListing = createdListings[3]; // Hayes Valley
    const existingReport = await prisma.report.findFirst({
      where: { reporterId: thirdUser.id, listingId: reportedListing.id },
    });
    if (!existingReport) {
      await prisma.report.create({
        data: {
          listingId: reportedListing.id,
          reporterId: thirdUser.id,
          reason: 'Misleading information',
          details: 'The listing photos do not match the actual property.',
          status: 'OPEN',
        },
      });
      console.log(`  ✓ OPEN report on: ${reportedListing.title}`);
    } else {
      console.log(`  ⏭ Report exists`);
    }
  }

  // 10. Create a PENDING VerificationRequest
  const existingVerification = await prisma.verificationRequest.findFirst({
    where: { userId: thirdUser.id, status: 'PENDING' },
  });
  if (!existingVerification) {
    await prisma.verificationRequest.create({
      data: {
        userId: thirdUser.id,
        documentType: 'driver_license',
        documentUrl: null,
        selfieUrl: null,
        status: 'PENDING',
      },
    });
    console.log(`  ✓ PENDING verification request for: ${thirdUser.email}`);
  } else {
    console.log(`  ⏭ Verification request exists`);
  }

  // 11. Create AuditLog entries
  const existingAudit = await prisma.auditLog.findFirst({
    where: { adminId: admin.id },
  });
  if (!existingAudit) {
    await prisma.auditLog.createMany({
      data: [
        {
          adminId: admin.id,
          action: 'LISTING_APPROVED',
          targetType: 'Listing',
          targetId: createdListings[0]?.id || 'unknown',
          details: { reason: 'Meets all guidelines' },
        },
        {
          adminId: admin.id,
          action: 'USER_VERIFIED',
          targetType: 'User',
          targetId: reviewer.id,
          details: { documentType: 'passport' },
        },
        {
          adminId: admin.id,
          action: 'REPORT_RESOLVED',
          targetType: 'Report',
          targetId: 'seeded-report',
          details: { resolution: 'No action needed' },
        },
      ],
    });
    console.log(`  ✓ AuditLog entries created`);
  } else {
    console.log(`  ⏭ AuditLog entries exist`);
  }

  // 12. Backfill listing_search_docs (denormalized search table)
  // This table is created by migration 20260110000000_search_doc
  // The facets API queries it with no fallback, so it MUST be populated
  try {
    // Check if the table exists
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'listing_search_docs'
      ) AS "exists"
    `;
    if (tableExists[0]?.exists) {
      // Upsert from Listing + Location + Review joins.
      // ON CONFLICT preserves embedding columns so backfilled embeddings survive re-seeding.
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
          COALESCE(AVG(r.rating), 0)::float,
          COUNT(r.id)::int,
          (COALESCE(AVG(r.rating), 0) * 20 + l."viewCount" * 0.1 + COUNT(r.id) * 5),
          ARRAY(SELECT LOWER(unnest(l.amenities))),
          ARRAY(SELECT LOWER(unnest(l."houseRules"))),
          ARRAY(SELECT LOWER(unnest(l."household_languages"))),
          l."genderPreference", l."householdGender",
          NOW(), NOW()
        FROM "Listing" l
        JOIN "Location" loc ON l.id = loc."listingId"
        LEFT JOIN "Review" r ON l.id = r."listingId"
        WHERE loc.coords IS NOT NULL
        GROUP BY l.id, loc.id
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
          avg_rating = EXCLUDED.avg_rating,
          review_count = EXCLUDED.review_count,
          recommended_score = EXCLUDED.recommended_score,
          amenities_lower = EXCLUDED.amenities_lower,
          house_rules_lower = EXCLUDED.house_rules_lower,
          household_languages_lower = EXCLUDED.household_languages_lower,
          gender_preference = EXCLUDED.gender_preference,
          household_gender = EXCLUDED.household_gender,
          doc_updated_at = NOW()
      `);

      // Count the inserted rows
      const countResult = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count FROM listing_search_docs
      `;
      console.log(`  ✓ listing_search_docs backfilled: ${countResult[0].count} rows`);
    } else {
      console.log('  ⚠ listing_search_docs table does not exist — skipping backfill (run prisma migrate deploy first)');
    }
  } catch (err) {
    console.error('  ⚠ listing_search_docs backfill failed:', err.message);
    // Non-fatal: tests may still partially work without it
  }

  // 12b. Backfill contact-first projection tables for Phase 04 reads.
  try {
    const projectionInputs = [
      ...createdListings.map((listing, index) =>
        buildProjectionInput(
          listing,
          SF_LISTINGS[index],
          sfListingOwnerIds[index] || user.id
        )
      ),
      buildProjectionInput(reviewerListing, REVIEWER_LISTING, reviewer.id),
      buildProjectionInput(dedupeSingleton, DEDUPE_SINGLETON_SEED, reviewer.id),
      ...dedupeGroupListings.map((listing, index) =>
        buildProjectionInput(listing, DEDUPE_GROUP_SEEDS[index], reviewer.id)
      ),
      ...crossOwnerListings.map((listing, index) =>
        buildProjectionInput(
          listing,
          CROSS_OWNER_SEEDS[index],
          index === 0 ? reviewer.id : thirdUser.id
        )
      ),
    ];

    await upsertProjectionFixtureRows(projectionInputs);
  } catch (err) {
    console.error('  ⚠ contact-first projection backfill failed:', err.message);
  }

  // 13. Create notification records for E2E tests
  const existingNotification = await prisma.notification.findFirst({
    where: { userId: user.id, type: 'NEW_MESSAGE' },
  });
  if (!existingNotification) {
    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          type: 'NEW_MESSAGE',
          title: 'New Message',
          message: 'E2E Reviewer sent you a message about Sunny Mission Room.',
          link: '/messages',
          read: false,
        },
        {
          userId: user.id,
          type: 'NEW_REVIEW',
          title: 'New Review',
          message: 'Someone left a review on your listing Sunny Mission Room.',
          link: `/listings/${createdListings[0]?.id || 'unknown'}`,
          read: true,
        },
      ],
    });
    console.log('  ✓ Notification records created');
  } else {
    console.log('  ⏭ Notification records exist');
  }

  // 14. Create BlockedUser for Settings E2E tests
  // NOTE: Block admin (not thirdUser) to avoid poisoning messaging conversations.
  // thirdUser shares conversation2 with user; blocking them causes BlockedConversationBanner
  // to replace message-input, breaking all messaging tests that use that conversation.
  // Settings tests (ST-11, ST-12) only need ANY blocked user — they don't care who.
  const existingBlock = await prisma.blockedUser.findFirst({
    where: { blockerId: user.id, blockedId: admin.id },
  });
  if (!existingBlock) {
    await prisma.blockedUser.create({
      data: {
        blockerId: user.id,
        blockedId: admin.id,
      },
    });
    console.log(`  ✓ BlockedUser: ${user.email} blocked ${admin.email}`);
  } else {
    console.log(`  ⏭ BlockedUser exists`);
  }

  // 15. Create SavedSearch records for E2E tests
  const existingSavedSearch = await prisma.savedSearch.findFirst({
    where: { userId: user.id },
  });
  if (!existingSavedSearch) {
    await prisma.savedSearch.createMany({
      data: [
        {
          userId: user.id,
          name: 'SF Under $1500',
          query: 'San Francisco',
          filters: {
            minPrice: 500,
            maxPrice: 1500,
            roomType: 'private',
            location: 'San Francisco',
          },
          alertEnabled: true,
          alertFrequency: 'DAILY',
        },
        {
          userId: user.id,
          name: 'Mission District',
          query: 'Mission',
          filters: {
            location: 'Mission District',
            amenities: ['wifi', 'parking'],
          },
          alertEnabled: false,
          alertFrequency: 'WEEKLY',
        },
      ],
    });
    console.log('  ✓ SavedSearch records created');
  } else {
    console.log('  ⏭ SavedSearch records exist');
  }

  // 16. Create RecentlyViewed records for E2E tests
  const existingRecent = await prisma.recentlyViewed.findFirst({
    where: { userId: user.id },
  });
  if (!existingRecent && createdListings.length >= 3) {
    const now = new Date();
    await prisma.recentlyViewed.createMany({
      data: [
        {
          userId: user.id,
          listingId: createdListings[0].id,
          viewedAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 min ago
        },
        {
          userId: user.id,
          listingId: createdListings[1].id,
          viewedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2h ago
        },
        {
          userId: user.id,
          listingId: createdListings[2].id,
          viewedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1d ago
        },
      ],
    });
    console.log('  ✓ RecentlyViewed records created');
  } else {
    console.log(`  ⏭ RecentlyViewed ${existingRecent ? 'exists' : 'skipped (need 3+ listings)'}`);
  }

  const seedManifest = {
    generatedAt: new Date().toISOString(),
    listingsByTitle: Object.fromEntries(
      [
        ...createdListings,
        reviewerListing,
        dedupeSingleton,
        ...dedupeGroupListings,
        ...crossOwnerListings,
      ].map((listing) => [
        listing.title,
        listing.id,
      ])
    ),
    dedupe: {
      singletonId: dedupeSingleton.id,
      groupIds: dedupeGroupListings.map((listing) => listing.id),
      crossOwnerIds: crossOwnerListings.map((listing) => listing.id),
    },
  };
  const seedManifestDir = path.resolve(__dirname, '../playwright/.cache');
  fs.mkdirSync(seedManifestDir, { recursive: true });
  fs.writeFileSync(
    path.join(seedManifestDir, 'e2e-seed.json'),
    JSON.stringify(seedManifest, null, 2)
  );
  console.log(
    `  ✓ E2E seed manifest written: ${path.join(seedManifestDir, 'e2e-seed.json')}`
  );

  console.log('✅ E2E seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ E2E seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
