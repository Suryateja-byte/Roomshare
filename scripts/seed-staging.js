#!/usr/bin/env node
/**
 * Guarded staging/QA seed script.
 *
 * Defaults to dry-run. Use --apply only against a confirmed non-production DB.
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const NON_PROD_ENVS = new Set([
  "local",
  "development",
  "test",
  "qa",
  "staging",
  "preview",
]);
const REMOTE_NON_PROD_ENVS = new Set(["qa", "staging", "preview"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const PROD_NAME_PATTERN = /(^|[_.:/-])prod(uction)?($|[_.:/-])/i;
const MIN_PASSWORD_LENGTH = 12;

const QA_USERS = [
  {
    key: "host",
    email: "qa-host@roomshare.dev",
    name: "QA Host",
    bio: "Verified staging host profile for release smoke testing.",
    languages: ["en", "es"],
    isAdmin: false,
  },
  {
    key: "seeker",
    email: "qa-seeker@roomshare.dev",
    name: "QA Seeker",
    bio: "Verified staging seeker profile for search and contact testing.",
    languages: ["en"],
    isAdmin: false,
  },
  {
    key: "secondHost",
    email: "qa-second-host@roomshare.dev",
    name: "QA Second Host",
    bio: "Second verified staging host for owner boundary testing.",
    languages: ["en", "zh"],
    isAdmin: false,
  },
  {
    key: "moderator",
    email: "qa-moderator@roomshare.dev",
    name: "QA Moderator",
    bio: "Staging moderator profile for admin boundary smoke testing.",
    languages: ["en"],
    isAdmin: true,
  },
];

const DEFAULT_IMAGES = [
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200",
];

const LISTINGS = [
  {
    id: "staging-sf-mission-private-room",
    ownerKey: "host",
    title: "QA Mission Private Room",
    description:
      "Bright private room near BART with a work desk, shared kitchen, and flexible move-in.",
    price: 1250,
    roomType: "Private Room",
    totalSlots: 2,
    availableSlots: 1,
    openSlots: 1,
    lat: 37.7599,
    lng: -122.4148,
    address: "2400 Mission St",
    city: "San Francisco",
    state: "CA",
    zip: "94110",
    amenities: ["Wifi", "Furnished", "Kitchen", "Workspace"],
    houseRules: ["No Smoking", "Quiet Hours 10pm-8am"],
    leaseDuration: "6 months",
    genderPreference: "NO_PREFERENCE",
    householdGender: "MIXED",
    primaryHomeLanguage: "en",
    status: "ACTIVE",
  },
  {
    id: "staging-sf-soma-shared-room",
    ownerKey: "host",
    title: "QA SOMA Shared Room",
    description:
      "Shared room in a modern SOMA apartment for budget-focused search smoke tests.",
    price: 850,
    roomType: "Shared Room",
    totalSlots: 3,
    availableSlots: 2,
    openSlots: 2,
    lat: 37.7785,
    lng: -122.395,
    address: "500 Howard St",
    city: "San Francisco",
    state: "CA",
    zip: "94105",
    amenities: ["Wifi", "Kitchen", "Gym"],
    houseRules: ["No Smoking", "Guests allowed"],
    leaseDuration: "Month-to-month",
    genderPreference: "NO_PREFERENCE",
    householdGender: "MIXED",
    primaryHomeLanguage: "en",
    status: "ACTIVE",
  },
  {
    id: "staging-sf-sunset-studio",
    ownerKey: "host",
    title: "QA Sunset Studio",
    description:
      "Entire studio near Golden Gate Park with ocean-side search result coverage.",
    price: 2200,
    roomType: "Entire Place",
    totalSlots: 1,
    availableSlots: 1,
    openSlots: 1,
    lat: 37.7535,
    lng: -122.495,
    address: "1800 Irving St",
    city: "San Francisco",
    state: "CA",
    zip: "94122",
    amenities: ["Wifi", "Furnished", "Kitchen", "Parking"],
    houseRules: ["No Smoking", "Pets allowed"],
    leaseDuration: "12 months",
    genderPreference: "NO_PREFERENCE",
    householdGender: "MIXED",
    primaryHomeLanguage: "en",
    status: "ACTIVE",
  },
  {
    id: "staging-sf-hayes-suite",
    ownerKey: "host",
    title: "QA Hayes Valley Suite",
    description:
      "Premium private suite with en-suite bath and visible contact-host CTA coverage.",
    price: 1850,
    roomType: "Private Room",
    totalSlots: 2,
    availableSlots: 1,
    openSlots: 1,
    lat: 37.776,
    lng: -122.424,
    address: "400 Hayes St",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
    amenities: ["Wifi", "Furnished", "AC", "Washer", "Dryer"],
    houseRules: ["No Smoking", "Quiet Hours 10pm-8am"],
    leaseDuration: "6 months",
    genderPreference: "FEMALE_ONLY",
    householdGender: "ALL_FEMALE",
    primaryHomeLanguage: "en",
    status: "ACTIVE",
  },
  {
    id: "staging-sf-marina-second-host",
    ownerKey: "secondHost",
    title: "QA Marina Second Host Room",
    description:
      "Second-owner listing used to prove non-owner listing boundaries and public details.",
    price: 1650,
    roomType: "Private Room",
    totalSlots: 2,
    availableSlots: 1,
    openSlots: 1,
    lat: 37.801,
    lng: -122.437,
    address: "2100 Chestnut St",
    city: "San Francisco",
    state: "CA",
    zip: "94123",
    amenities: ["Wifi", "Parking", "AC", "Furnished"],
    houseRules: ["No Smoking", "Guests allowed"],
    leaseDuration: "3 months",
    genderPreference: "NO_PREFERENCE",
    householdGender: "MIXED",
    primaryHomeLanguage: "zh",
    status: "ACTIVE",
  },
  {
    id: "staging-sf-dogpatch-loft",
    ownerKey: "secondHost",
    title: "QA Dogpatch Loft",
    description:
      "High-price entire-place listing for map, detail, and price-filter smoke coverage.",
    price: 2450,
    roomType: "Entire Place",
    totalSlots: 1,
    availableSlots: 1,
    openSlots: 1,
    lat: 37.759,
    lng: -122.388,
    address: "700 3rd St",
    city: "San Francisco",
    state: "CA",
    zip: "94107",
    amenities: ["Wifi", "Furnished", "Pool", "Gym", "Parking", "Kitchen"],
    houseRules: ["Pets allowed", "Couples allowed"],
    leaseDuration: "12 months",
    genderPreference: "NO_PREFERENCE",
    householdGender: "MIXED",
    primaryHomeLanguage: "en",
    status: "ACTIVE",
  },
  {
    id: "staging-sf-inner-sunset-shared",
    ownerKey: "secondHost",
    title: "QA Inner Sunset Shared",
    description:
      "Low-price shared listing near UCSF for sort and removable price-chip smoke tests.",
    price: 750,
    roomType: "Shared Room",
    totalSlots: 4,
    availableSlots: 1,
    openSlots: 1,
    lat: 37.762,
    lng: -122.46,
    address: "900 Irving St",
    city: "San Francisco",
    state: "CA",
    zip: "94122",
    amenities: ["Wifi", "Kitchen"],
    houseRules: ["Quiet Hours 10pm-8am"],
    leaseDuration: "Flexible",
    genderPreference: "MALE_ONLY",
    householdGender: "ALL_MALE",
    primaryHomeLanguage: "en",
    status: "ACTIVE",
  },
  {
    id: "staging-sf-paused-hidden",
    ownerKey: "host",
    title: "QA Paused Hidden Listing",
    description:
      "Paused staging fixture that should not appear in public active search results.",
    price: 1400,
    roomType: "Private Room",
    totalSlots: 2,
    availableSlots: 1,
    openSlots: 1,
    lat: 37.789,
    lng: -122.42,
    address: "1000 Van Ness Ave",
    city: "San Francisco",
    state: "CA",
    zip: "94109",
    amenities: ["Wifi", "Kitchen"],
    houseRules: ["No Smoking"],
    leaseDuration: "6 months",
    genderPreference: "NO_PREFERENCE",
    householdGender: "MIXED",
    primaryHomeLanguage: "en",
    status: "PAUSED",
  },
  {
    id: "staging-sf-rented-hidden",
    ownerKey: "host",
    title: "QA Rented Hidden Listing",
    description:
      "Rented staging fixture that should stay hidden from public active search results.",
    price: 1500,
    roomType: "Private Room",
    totalSlots: 1,
    availableSlots: 0,
    openSlots: 0,
    lat: 37.79,
    lng: -122.41,
    address: "1200 California St",
    city: "San Francisco",
    state: "CA",
    zip: "94109",
    amenities: ["Wifi", "Furnished"],
    houseRules: ["No Smoking"],
    leaseDuration: "12 months",
    genderPreference: "NO_PREFERENCE",
    householdGender: "MIXED",
    primaryHomeLanguage: "en",
    status: "RENTED",
  },
];

function usage() {
  return `
Usage:
  pnpm run seed:staging -- --dry-run
  STAGING_SEED_PASSWORD='...' pnpm run seed:staging -- --apply

Remote non-production targets also require:
  STAGING_SEED_ENV=staging
  STAGING_SEED_CONFIRM=non-production

Options:
  --dry-run          Inspect and print the planned changes. Default.
  --apply            Write users/listings to the configured database.
  --reset-password   Reset existing QA user passwords while applying.
  --help             Show this help.
`;
}

function parseArgs(argv) {
  const args = { apply: false, resetPassword: false, help: false };

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.apply = false;
    else if (arg === "--reset-password") args.resetPassword = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parseDatabaseTarget(databaseUrl) {
  if (!databaseUrl) return null;

  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\/+/, "") || "(default)";
  const host = parsed.hostname;

  return {
    protocol: parsed.protocol.replace(/:$/, ""),
    host,
    port: parsed.port || "(default)",
    database,
    isLocal: LOCAL_HOSTS.has(host),
  };
}

function redactTarget(target) {
  if (!target) return null;
  return {
    protocol: target.protocol,
    host: target.host,
    port: target.port,
    database: target.database,
    isLocal: target.isLocal,
  };
}

function resolveSeedEnv(target) {
  const explicit = process.env.STAGING_SEED_ENV;
  if (explicit) return explicit.toLowerCase();
  return target?.isLocal ? "local" : "";
}

function assertSafeTarget({ args, target, seedEnv }) {
  if (!target && args.apply) {
    throw new Error("DATABASE_URL is required when using --apply.");
  }

  if (process.env.VERCEL_ENV === "production") {
    throw new Error(
      "Refusing to run staging seed while VERCEL_ENV=production."
    );
  }

  if (seedEnv === "production" || seedEnv === "prod") {
    throw new Error("Refusing to run staging seed with a production seed env.");
  }

  if (seedEnv && !NON_PROD_ENVS.has(seedEnv)) {
    throw new Error(
      `STAGING_SEED_ENV must be one of: ${[...NON_PROD_ENVS].join(", ")}`
    );
  }

  if (target) {
    const targetFingerprint = `${target.host}/${target.database}`;
    if (PROD_NAME_PATTERN.test(targetFingerprint)) {
      throw new Error(
        `Refusing to seed a target that looks production-like: ${target.host}/${target.database}`
      );
    }
  }

  if (target && !target.isLocal) {
    if (!REMOTE_NON_PROD_ENVS.has(seedEnv)) {
      throw new Error(
        "Remote DB targets require STAGING_SEED_ENV=staging, preview, or qa."
      );
    }

    if (args.apply && process.env.STAGING_SEED_CONFIRM !== "non-production") {
      throw new Error(
        "Remote --apply requires STAGING_SEED_CONFIRM=non-production."
      );
    }
  }
}

function requirePassword() {
  const password = process.env.STAGING_SEED_PASSWORD;
  if (!password) {
    throw new Error("STAGING_SEED_PASSWORD is required when using --apply.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `STAGING_SEED_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }

  return password;
}

function daysFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

function deriveBookingMode(roomType) {
  return roomType === "Entire Place" ? "WHOLE_UNIT" : "SHARED";
}

function buildListingData(seed, ownerId) {
  const moveInDate = daysFromNow(seed.status === "ACTIVE" ? 14 : 30);
  const availableUntil = daysFromNow(180);
  const now = new Date();

  return {
    ownerId,
    title: seed.title,
    description: seed.description,
    price: seed.price,
    images: DEFAULT_IMAGES,
    amenities: seed.amenities,
    houseRules: seed.houseRules,
    leaseDuration: seed.leaseDuration,
    roomType: seed.roomType,
    bookingMode: seed.bookingMode || deriveBookingMode(seed.roomType),
    normalizedAddress:
      `${seed.address}, ${seed.city}, ${seed.state} ${seed.zip}`
        .toLowerCase()
        .replace(/\s+/g, " "),
    physicalUnitId: null,
    householdLanguages: [seed.primaryHomeLanguage || "en"],
    primaryHomeLanguage: seed.primaryHomeLanguage || "en",
    genderPreference: seed.genderPreference,
    householdGender: seed.householdGender,
    totalSlots: seed.totalSlots,
    availableSlots: seed.availableSlots,
    openSlots: seed.openSlots,
    moveInDate,
    availableUntil,
    minStayMonths: 1,
    lastConfirmedAt: now,
    statusReason: seed.status === "ACTIVE" ? null : "STAGING_QA_FIXTURE",
    status: seed.status,
  };
}

async function inspectExisting(prisma) {
  const emails = QA_USERS.map((user) => user.email);
  const listingIds = LISTINGS.map((listing) => listing.id);

  const [users, listings] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    }),
    prisma.listing.findMany({
      where: { id: { in: listingIds } },
      select: { id: true, status: true },
    }),
  ]);

  return {
    existingUsers: users.length,
    missingUsers: emails.length - users.length,
    existingListings: listings.length,
    missingListings: listingIds.length - listings.length,
    activeFixtureListings: listings.filter(
      (listing) => listing.status === "ACTIVE"
    ).length,
  };
}

async function upsertUsers(prisma, args, passwordHash) {
  const usersByKey = new Map();
  let created = 0;
  let updated = 0;
  let passwordsReset = 0;

  for (const seed of QA_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: seed.email },
      select: { id: true },
    });
    const shouldSetPassword = !existing || args.resetPassword;

    const update = {
      name: seed.name,
      emailVerified: new Date(),
      image:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
      bio: seed.bio,
      countryOfOrigin: "United States",
      languages: seed.languages,
      isVerified: true,
      isAdmin: seed.isAdmin,
      isSuspended: false,
    };

    if (shouldSetPassword) {
      update.password = passwordHash;
      update.passwordChangedAt = new Date();
    }

    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update,
      create: {
        email: seed.email,
        ...update,
      },
    });

    usersByKey.set(seed.key, user);
    if (existing) updated += 1;
    else created += 1;
    if (shouldSetPassword) passwordsReset += 1;
  }

  return { usersByKey, created, updated, passwordsReset };
}

async function upsertListings(prisma, usersByKey) {
  let created = 0;
  let updated = 0;

  for (const seed of LISTINGS) {
    const owner = usersByKey.get(seed.ownerKey);
    if (!owner) throw new Error(`Missing owner for ${seed.id}`);

    const existing = await prisma.listing.findUnique({
      where: { id: seed.id },
      select: { id: true },
    });
    const listingData = buildListingData(seed, owner.id);

    const listing = await prisma.listing.upsert({
      where: { id: seed.id },
      update: {
        ...listingData,
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
        ...listingData,
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

    if (existing) updated += 1;
    else created += 1;
  }

  return { created, updated };
}

function printSummary(summary) {
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage().trim());
    return;
  }

  const target = parseDatabaseTarget(process.env.DATABASE_URL);
  const seedEnv = resolveSeedEnv(target);
  assertSafeTarget({ args, target, seedEnv });

  const planned = {
    mode: args.apply ? "apply" : "dry-run",
    target: redactTarget(target),
    seedEnv: seedEnv || "(unset)",
    users: QA_USERS.map((user) => ({
      email: user.email,
      role: user.isAdmin ? "moderator" : user.key,
    })),
    listings: {
      total: LISTINGS.length,
      active: LISTINGS.filter((listing) => listing.status === "ACTIVE").length,
      hidden: LISTINGS.filter((listing) => listing.status !== "ACTIVE").length,
    },
  };

  if (!target) {
    printSummary({
      ...planned,
      databaseInspection: "skipped: DATABASE_URL is not set",
    });
    return;
  }

  const passwordHash = args.apply
    ? await bcrypt.hash(requirePassword(), 10)
    : null;
  const prisma = new PrismaClient();

  try {
    const before = await inspectExisting(prisma);

    if (!args.apply) {
      printSummary({
        ...planned,
        databaseInspection: before,
        next: "Set STAGING_SEED_PASSWORD and run with --apply to write non-production fixtures.",
      });
      return;
    }

    const users = await upsertUsers(prisma, args, passwordHash);
    const listings = await upsertListings(prisma, users.usersByKey);
    const after = await inspectExisting(prisma);

    printSummary({
      ...planned,
      before,
      applied: {
        users: {
          created: users.created,
          updated: users.updated,
          passwordsSetOrReset: users.passwordsReset,
        },
        listings,
      },
      after,
      next: "Run pnpm run backfill:canonical-inventory -- --apply, then smoke the staging URL.",
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
