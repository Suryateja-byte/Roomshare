/**
 * Seed deterministic USA-wide listings for local/manual testing.
 *
 * Run with:
 *   node scripts/seed-listings.js
 *
 * Optional:
 *   USA_SEED_COUNT=80 node scripts/seed-listings.js
 *   USA_SEED_OWNER_EMAIL=you@example.com node scripts/seed-listings.js
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_OWNER_EMAIL =
  process.env.USA_SEED_OWNER_EMAIL || "usa-seed-host@roomshare.dev";
const DEFAULT_OWNER_NAME = process.env.USA_SEED_OWNER_NAME || "USA Seed Host";
const DEFAULT_SEED_COUNT = 60;
const MAX_SEED_COUNT = 200;
const SEED_PREFIX = "usa-seed";
const LOCAL_LISTING_IMAGES = [
  "/images/home/hero-living-room.png",
  "/images/auth/login-living-room.webp",
];
const PROJECTION_SOURCE_VERSION = 1;
const PROJECTION_EPOCH = 1;
const columnExistsCache = new Map();

const LOCATIONS = [
  {
    city: "Seattle",
    state: "WA",
    zip: "98101",
    address: "1521 1st Ave",
    lat: 47.6097,
    lng: -122.3425,
    area: "Pike Place",
  },
  {
    city: "Portland",
    state: "OR",
    zip: "97209",
    address: "420 NW 11th Ave",
    lat: 45.5254,
    lng: -122.6815,
    area: "Pearl District",
  },
  {
    city: "San Francisco",
    state: "CA",
    zip: "94103",
    address: "101 9th St",
    lat: 37.7752,
    lng: -122.4142,
    area: "SoMa",
  },
  {
    city: "Los Angeles",
    state: "CA",
    zip: "90028",
    address: "1717 N Highland Ave",
    lat: 34.1028,
    lng: -118.3386,
    area: "Hollywood",
  },
  {
    city: "San Diego",
    state: "CA",
    zip: "92101",
    address: "600 5th Ave",
    lat: 32.7116,
    lng: -117.1602,
    area: "Gaslamp",
  },
  {
    city: "Las Vegas",
    state: "NV",
    zip: "89109",
    address: "3570 Las Vegas Blvd S",
    lat: 36.1172,
    lng: -115.1747,
    area: "The Strip",
  },
  {
    city: "Phoenix",
    state: "AZ",
    zip: "85004",
    address: "201 E Washington St",
    lat: 33.4488,
    lng: -112.0712,
    area: "Downtown",
  },
  {
    city: "Salt Lake City",
    state: "UT",
    zip: "84101",
    address: "350 S 400 W",
    lat: 40.7608,
    lng: -111.891,
    area: "Granary District",
  },
  {
    city: "Denver",
    state: "CO",
    zip: "80202",
    address: "1701 Wynkoop St",
    lat: 39.753,
    lng: -104.999,
    area: "LoDo",
  },
  {
    city: "Boise",
    state: "ID",
    zip: "83702",
    address: "800 W Main St",
    lat: 43.615,
    lng: -116.2023,
    area: "Downtown",
  },
  {
    city: "Austin",
    state: "TX",
    zip: "78701",
    address: "300 Congress Ave",
    lat: 30.2636,
    lng: -97.7435,
    area: "Downtown",
  },
  {
    city: "Dallas",
    state: "TX",
    zip: "75201",
    address: "1800 Main St",
    lat: 32.7816,
    lng: -96.797,
    area: "Main Street District",
  },
  {
    city: "San Antonio",
    state: "TX",
    zip: "78205",
    address: "200 E Market St",
    lat: 29.4214,
    lng: -98.4887,
    area: "River Walk",
  },
  {
    city: "Houston",
    state: "TX",
    zip: "77002",
    address: "901 Bagby St",
    lat: 29.7604,
    lng: -95.3698,
    area: "Downtown",
  },
  {
    city: "Oklahoma City",
    state: "OK",
    zip: "73102",
    address: "100 W Main St",
    lat: 35.4676,
    lng: -97.5164,
    area: "Bricktown",
  },
  {
    city: "Kansas City",
    state: "MO",
    zip: "64108",
    address: "1914 Main St",
    lat: 39.0897,
    lng: -94.5843,
    area: "Crossroads",
  },
  {
    city: "Minneapolis",
    state: "MN",
    zip: "55401",
    address: "400 N 1st Ave",
    lat: 44.9849,
    lng: -93.2701,
    area: "North Loop",
  },
  {
    city: "Chicago",
    state: "IL",
    zip: "60622",
    address: "1500 N Milwaukee Ave",
    lat: 41.9088,
    lng: -87.6744,
    area: "Wicker Park",
  },
  {
    city: "Detroit",
    state: "MI",
    zip: "48226",
    address: "660 Woodward Ave",
    lat: 42.3301,
    lng: -83.0458,
    area: "Downtown",
  },
  {
    city: "Cleveland",
    state: "OH",
    zip: "44113",
    address: "2038 W 25th St",
    lat: 41.4845,
    lng: -81.7024,
    area: "Ohio City",
  },
  {
    city: "Nashville",
    state: "TN",
    zip: "37203",
    address: "1200 Broadway",
    lat: 36.156,
    lng: -86.7891,
    area: "The Gulch",
  },
  {
    city: "New Orleans",
    state: "LA",
    zip: "70130",
    address: "700 Tchoupitoulas St",
    lat: 29.9477,
    lng: -90.0676,
    area: "Warehouse District",
  },
  {
    city: "Atlanta",
    state: "GA",
    zip: "30308",
    address: "675 Ponce De Leon Ave NE",
    lat: 33.7725,
    lng: -84.3654,
    area: "Old Fourth Ward",
  },
  {
    city: "Charlotte",
    state: "NC",
    zip: "28202",
    address: "300 S Tryon St",
    lat: 35.2251,
    lng: -80.8458,
    area: "Uptown",
  },
  {
    city: "Miami",
    state: "FL",
    zip: "33130",
    address: "900 S Miami Ave",
    lat: 25.7651,
    lng: -80.1937,
    area: "Brickell",
  },
  {
    city: "Orlando",
    state: "FL",
    zip: "32801",
    address: "55 W Church St",
    lat: 28.5403,
    lng: -81.3792,
    area: "Downtown",
  },
  {
    city: "Washington",
    state: "DC",
    zip: "20001",
    address: "700 7th St NW",
    lat: 38.8998,
    lng: -77.0227,
    area: "Penn Quarter",
  },
  {
    city: "Philadelphia",
    state: "PA",
    zip: "19103",
    address: "1700 Market St",
    lat: 39.953,
    lng: -75.1685,
    area: "Center City",
  },
  {
    city: "New York",
    state: "NY",
    zip: "10003",
    address: "51 Astor Pl",
    lat: 40.7308,
    lng: -73.9916,
    area: "East Village",
  },
  {
    city: "Brooklyn",
    state: "NY",
    zip: "11201",
    address: "200 Schermerhorn St",
    lat: 40.6886,
    lng: -73.9845,
    area: "Downtown Brooklyn",
  },
  {
    city: "Boston",
    state: "MA",
    zip: "02116",
    address: "500 Boylston St",
    lat: 42.3503,
    lng: -71.0757,
    area: "Back Bay",
  },
  {
    city: "Providence",
    state: "RI",
    zip: "02903",
    address: "100 Westminster St",
    lat: 41.824,
    lng: -71.4128,
    area: "Downtown",
  },
];

const AMENITY_SETS = [
  ["WiFi", "Air Conditioning", "Washer/Dryer", "Kitchen Access"],
  ["WiFi", "Heating", "Parking", "Workspace"],
  ["WiFi", "Furnished", "Utilities Included", "Pet Friendly"],
  ["WiFi", "Air Conditioning", "Balcony", "Pool Access"],
  ["WiFi", "Heating", "Gym Access", "Dishwasher"],
  ["WiFi", "Storage", "Backyard", "Kitchen Access"],
];

const RULE_SETS = [
  ["No Smoking", "No Parties", "Quiet Hours 10pm-8am"],
  ["No Pets", "No Smoking", "Clean Common Areas"],
  ["Pet Friendly", "No Smoking", "Respect Shared Spaces"],
  ["No Overnight Guests", "No Smoking", "Keep Kitchen Clean"],
  ["Guests Allowed", "Be Respectful", "Communicate"],
];

const TITLE_PATTERNS = [
  "{area} private room near transit",
  "Sunny {city} room with workspace",
  "Furnished share in {area}",
  "Flexible lease near downtown {city}",
  "Quiet room in walkable {area}",
  "Updated roommate suite in {city}",
];

const DESCRIPTION_PATTERNS = [
  "Testing listing for {city}, {state}. The home is near restaurants, transit, and everyday errands.",
  "Seeded Roomshare listing in {area} with practical amenities for local search and map testing.",
  "USA-wide test inventory for validating filters, map bounds, sorting, and listing card behavior.",
  "Comfortable shared home in {city} with a realistic price, move-in date, and active availability.",
];

const ROOM_TYPES = ["Private Room", "Shared Room", "Entire Place"];
const LEASE_DURATIONS = [
  "Month-to-month",
  "3 months",
  "6 months",
  "12 months",
  "Flexible",
];
const GENDER_PREFERENCES = ["NO_PREFERENCE", "MALE_ONLY", "FEMALE_ONLY"];
const HOUSEHOLD_GENDERS = ["MIXED", "ALL_MALE", "ALL_FEMALE"];
const LANGUAGE_SETS = [
  ["en"],
  ["en", "es"],
  ["en", "zh"],
  ["en", "hi"],
  ["en", "ar"],
  ["en", "fr"],
  ["en", "ko"],
  ["en", "vi"],
];

function parseSeedCount() {
  const parsed = Number.parseInt(process.env.USA_SEED_COUNT || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SEED_COUNT;
  }
  return Math.min(parsed, MAX_SEED_COUNT);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function formatTemplate(template, location) {
  return template
    .replaceAll("{city}", location.city)
    .replaceAll("{state}", location.state)
    .replaceAll("{area}", location.area);
}

function buildSeed(location, index) {
  const sequence = String(index + 1).padStart(3, "0");
  const priceBase = 850 + ((index * 137) % 1950);
  const totalSlots = 1 + (index % 4);
  const openSlots = Math.max(1, Math.min(totalSlots, 1 + (index % 2)));
  const moveInDate = new Date(Date.now() + (7 + index) * 24 * 60 * 60 * 1000);
  const availableUntil = new Date(
    Date.now() + (210 + index) * 24 * 60 * 60 * 1000
  );
  const title = formatTemplate(
    TITLE_PATTERNS[index % TITLE_PATTERNS.length],
    location
  );
  const roomType = ROOM_TYPES[index % ROOM_TYPES.length];

  return {
    id: `${SEED_PREFIX}-${sequence}-${slugify(location.city)}-${slugify(location.area)}`,
    title,
    description: formatTemplate(
      DESCRIPTION_PATTERNS[index % DESCRIPTION_PATTERNS.length],
      location
    ),
    price: priceBase,
    images: LOCAL_LISTING_IMAGES.map(
      (_, imageIndex) =>
        LOCAL_LISTING_IMAGES[(index + imageIndex) % LOCAL_LISTING_IMAGES.length]
    ),
    amenities: AMENITY_SETS[index % AMENITY_SETS.length],
    houseRules: RULE_SETS[index % RULE_SETS.length],
    householdLanguages: LANGUAGE_SETS[index % LANGUAGE_SETS.length],
    primaryHomeLanguage: "en",
    genderPreference: GENDER_PREFERENCES[index % GENDER_PREFERENCES.length],
    householdGender: HOUSEHOLD_GENDERS[index % HOUSEHOLD_GENDERS.length],
    leaseDuration: LEASE_DURATIONS[index % LEASE_DURATIONS.length],
    roomType,
    bookingMode: toBookingMode(roomType),
    totalSlots,
    availableSlots: openSlots,
    openSlots,
    minStayMonths: 1 + (index % 6),
    moveInDate,
    availableUntil,
    location,
  };
}

function toProjectionRoomCategory(roomType) {
  const normalized = String(roomType || "")
    .trim()
    .toLowerCase();

  if (normalized === "shared room" || normalized === "shared_room") {
    return "SHARED_ROOM";
  }
  if (normalized === "entire place" || normalized === "entire_place") {
    return "ENTIRE_PLACE";
  }
  return "PRIVATE_ROOM";
}

function toBookingMode(roomType) {
  return toProjectionRoomCategory(roomType) === "ENTIRE_PLACE"
    ? "WHOLE_UNIT"
    : "SHARED";
}

function assertLocalImagePaths(images) {
  const remoteImage = images.find(
    (image) =>
      typeof image !== "string" ||
      image.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(image) ||
      !image.startsWith("/images/")
  );

  if (remoteImage) {
    throw new Error(
      `USA seed listings must use local /images/ assets only; found ${remoteImage}`
    );
  }
}

function assertSafeEnvironment() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_SEED !== "1"
  ) {
    throw new Error(
      "Refusing to seed while NODE_ENV=production. Set ALLOW_PRODUCTION_SEED=1 to override."
    );
  }
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

async function columnExists(tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`;
  if (columnExistsCache.has(cacheKey)) {
    return columnExistsCache.get(cacheKey);
  }

  const result = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `;
  const exists = result[0]?.exists === true;
  columnExistsCache.set(cacheKey, exists);
  return exists;
}

async function upsertSeedOwner() {
  return prisma.user.upsert({
    where: { email: DEFAULT_OWNER_EMAIL },
    update: {
      name: DEFAULT_OWNER_NAME,
      emailVerified: new Date(),
      isVerified: true,
      isSuspended: false,
      languages: ["en"],
    },
    create: {
      email: DEFAULT_OWNER_EMAIL,
      name: DEFAULT_OWNER_NAME,
      emailVerified: new Date(),
      isVerified: true,
      isSuspended: false,
      languages: ["en"],
      bio: "Seed host for local USA-wide Roomshare listing tests.",
    },
  });
}

async function upsertListing(ownerId, seed) {
  assertLocalImagePaths(seed.images);

  const existing = await prisma.listing.findUnique({
    where: { id: seed.id },
    select: { id: true },
  });

  const listing = await prisma.listing.upsert({
    where: { id: seed.id },
    update: {
      ownerId,
      title: seed.title,
      description: seed.description,
      price: seed.price,
      images: seed.images,
      amenities: seed.amenities,
      houseRules: seed.houseRules,
      householdLanguages: seed.householdLanguages,
      primaryHomeLanguage: seed.primaryHomeLanguage,
      genderPreference: seed.genderPreference,
      householdGender: seed.householdGender,
      leaseDuration: seed.leaseDuration,
      roomType: seed.roomType,
      totalSlots: seed.totalSlots,
      availableSlots: seed.availableSlots,
      openSlots: seed.openSlots,
      minStayMonths: seed.minStayMonths,
      lastConfirmedAt: new Date(),
      status: "ACTIVE",
      statusReason: null,
      moveInDate: seed.moveInDate,
      availableUntil: seed.availableUntil,
      normalizedAddress:
        `${seed.location.address}, ${seed.location.city}, ${seed.location.state} ${seed.location.zip}`.toLowerCase(),
      location: {
        upsert: {
          update: {
            address: seed.location.address,
            city: seed.location.city,
            state: seed.location.state,
            zip: seed.location.zip,
          },
          create: {
            address: seed.location.address,
            city: seed.location.city,
            state: seed.location.state,
            zip: seed.location.zip,
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
      images: seed.images,
      amenities: seed.amenities,
      houseRules: seed.houseRules,
      householdLanguages: seed.householdLanguages,
      primaryHomeLanguage: seed.primaryHomeLanguage,
      genderPreference: seed.genderPreference,
      householdGender: seed.householdGender,
      leaseDuration: seed.leaseDuration,
      roomType: seed.roomType,
      totalSlots: seed.totalSlots,
      availableSlots: seed.availableSlots,
      openSlots: seed.openSlots,
      minStayMonths: seed.minStayMonths,
      lastConfirmedAt: new Date(),
      status: "ACTIVE",
      statusReason: null,
      moveInDate: seed.moveInDate,
      availableUntil: seed.availableUntil,
      normalizedAddress:
        `${seed.location.address}, ${seed.location.city}, ${seed.location.state} ${seed.location.zip}`.toLowerCase(),
      location: {
        create: {
          address: seed.location.address,
          city: seed.location.city,
          state: seed.location.state,
          zip: seed.location.zip,
        },
      },
    },
  });

  const point = `POINT(${seed.location.lng} ${seed.location.lat})`;
  await prisma.$executeRaw`
    UPDATE "Location"
    SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
    WHERE "listingId" = ${listing.id}
  `;

  if (await columnExists("Listing", "booking_mode")) {
    await prisma.$executeRaw`
      UPDATE "Listing"
      SET "booking_mode" = ${seed.bookingMode}
      WHERE id = ${listing.id}
    `;
  }

  return { action: existing ? "updated" : "created", listing };
}

async function backfillSearchDocMetadata() {
  const setClauses = [];

  if (await columnExists("listing_search_docs", "booking_mode")) {
    setClauses.push(`
      booking_mode = CASE
        WHEN d.room_type IN ('Entire Place', 'ENTIRE_PLACE', 'entire_place') THEN 'WHOLE_UNIT'
        ELSE 'SHARED'
      END
    `);
  }

  if (await columnExists("listing_search_docs", "source_version")) {
    setClauses.push(`source_version = ${PROJECTION_SOURCE_VERSION}`);
  }

  if (await columnExists("listing_search_docs", "projection_version")) {
    setClauses.push(`projection_version = ${PROJECTION_EPOCH}`);
  }

  if (setClauses.length === 0) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    UPDATE listing_search_docs d
    SET
      ${setClauses.join(",\n      ")},
      doc_updated_at = NOW()
    WHERE d.id LIKE '${SEED_PREFIX}-%'
  `);
}

async function backfillSearchDocs() {
  if (!(await tableExists("listing_search_docs"))) {
    return { skipped: true, count: 0 };
  }

  await prisma.$executeRawUnsafe(
    `
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
      AND l.id LIKE $1
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
  `,
    `${SEED_PREFIX}-%`
  );

  await backfillSearchDocMetadata();

  const countResult = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM listing_search_docs
    WHERE id LIKE ${`${SEED_PREFIX}-%`}
  `;

  return { skipped: false, count: countResult[0]?.count || 0 };
}

async function backfillProjectionTables(seedListings) {
  const hasProjectionTables =
    (await tableExists("physical_units")) &&
    (await tableExists("listing_inventories")) &&
    (await tableExists("inventory_search_projection")) &&
    (await tableExists("unit_public_projection"));

  if (!hasProjectionTables) {
    return { skipped: true, inventories: 0, units: 0 };
  }

  for (const { seed, listing } of seedListings) {
    const unitId = `${SEED_PREFIX}-unit-${seed.id}`;
    const inventoryId = seed.id;
    const roomCategory = toProjectionRoomCategory(seed.roomType);
    const point = `POINT(${seed.location.lng} ${seed.location.lat})`;
    const cell = `${Number(seed.location.lat).toFixed(4)},${Number(seed.location.lng).toFixed(4)}`;
    const areaName = seed.location.area || seed.location.city;
    const canonicalAddressHash = `${SEED_PREFIX}:${seed.id}`;
    const availableFrom = seed.moveInDate.toISOString().slice(0, 10);
    const availableUntil = seed.availableUntil.toISOString().slice(0, 10);
    const capacityGuests =
      roomCategory === "SHARED_ROOM" ? null : seed.totalSlots;
    const totalBeds = roomCategory === "SHARED_ROOM" ? seed.totalSlots : null;
    const openBeds = roomCategory === "SHARED_ROOM" ? seed.openSlots : null;

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
          $1, 1, $2, $3, 'usa-seed.v1', 1, 'COMPLETE',
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
      unitId,
      canonicalAddressHash,
      seed.location.area,
      PROJECTION_SOURCE_VERSION,
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
          $10::NUMERIC, $11::INTEGER, NULL, FALSE, NULL, NULL, 'ACTIVE', 'PUBLISHED',
          $12::BIGINT, $12::BIGINT, $12::BIGINT, NULL, 'usa-seed.v1', $13, 1,
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
          lease_min_months = EXCLUDED.lease_min_months,
          lifecycle_status = EXCLUDED.lifecycle_status,
          publish_status = EXCLUDED.publish_status,
          source_version = EXCLUDED.source_version,
          row_version = EXCLUDED.row_version,
          last_published_version = EXCLUDED.last_published_version,
          canonical_address_hash = EXCLUDED.canonical_address_hash,
          updated_at = NOW()
      `,
      inventoryId,
      unitId,
      `listing:${seed.id}`,
      roomCategory,
      capacityGuests,
      totalBeds,
      openBeds,
      availableFrom,
      availableUntil,
      seed.price,
      seed.minStayMonths,
      PROJECTION_SOURCE_VERSION,
      canonicalAddressHash
    );

    await prisma.listing.update({
      where: { id: listing.id },
      data: { physicalUnitId: unitId },
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
          $11::INTEGER, NULL, FALSE, NULL, NULL, $12, $13, $14, 'PUBLISHED',
          $15::BIGINT, $16::BIGINT, NOW(), NOW()
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
          lease_min_months = EXCLUDED.lease_min_months,
          public_point = EXCLUDED.public_point,
          public_cell_id = EXCLUDED.public_cell_id,
          public_area_name = EXCLUDED.public_area_name,
          publish_status = EXCLUDED.publish_status,
          source_version = EXCLUDED.source_version,
          projection_epoch = EXCLUDED.projection_epoch,
          updated_at = NOW()
      `,
      `${SEED_PREFIX}-projection-${seed.id}`,
      inventoryId,
      unitId,
      roomCategory,
      capacityGuests,
      totalBeds,
      openBeds,
      seed.price,
      availableFrom,
      availableUntil,
      seed.minStayMonths,
      point,
      cell,
      areaName,
      PROJECTION_SOURCE_VERSION,
      PROJECTION_EPOCH
    );

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
          $14::BIGINT, $15::BIGINT, NOW(), NOW()
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
      unitId,
      inventoryId,
      seed.price,
      [roomCategory],
      availableFrom,
      1,
      [`${seed.openSlots} open`],
      point,
      cell,
      areaName,
      seed.title,
      `${seed.openSlots} ${seed.openSlots === 1 ? "space" : "spaces"} available`,
      seed.images[0] || null,
      PROJECTION_SOURCE_VERSION,
      PROJECTION_EPOCH
    );
  }

  return {
    skipped: false,
    inventories: seedListings.length,
    units: seedListings.length,
  };
}

async function main() {
  assertSafeEnvironment();

  const seedCount = parseSeedCount();
  const owner = await upsertSeedOwner();
  const seeds = Array.from({ length: seedCount }, (_, index) =>
    buildSeed(LOCATIONS[index % LOCATIONS.length], index)
  );

  console.log(`Seeding ${seeds.length} USA listings for ${owner.email}...`);

  let created = 0;
  let updated = 0;
  const states = new Set();
  const seedListings = [];

  for (const seed of seeds) {
    const { action, listing } = await upsertListing(owner.id, seed);
    if (action === "created") {
      created += 1;
    } else {
      updated += 1;
    }
    states.add(seed.location.state);
    seedListings.push({ seed, listing });
    console.log(
      `  ${action.padEnd(7)} ${seed.title} (${seed.location.city}, ${seed.location.state})`
    );
  }

  const searchDocs = await backfillSearchDocs();
  const projections = await backfillProjectionTables(seedListings);

  console.log("");
  console.log("USA listing seed complete.");
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  States covered: ${states.size}`);
  if (searchDocs.skipped) {
    console.log(
      "  Search docs: skipped; listing_search_docs table was not found"
    );
  } else {
    console.log(`  Search docs: ${searchDocs.count} USA seed docs indexed`);
  }
  if (projections.skipped) {
    console.log("  Projections: skipped; projection tables were not found");
  } else {
    console.log(
      `  Projections: ${projections.inventories} inventories, ${projections.units} units indexed`
    );
  }
}

main()
  .catch((error) => {
    console.error("USA listing seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
