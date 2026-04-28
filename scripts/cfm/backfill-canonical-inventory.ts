import crypto from "crypto";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const CANONICALIZER_VERSION = "v1.0-2026-04";
const DEFAULT_BATCH_SIZE = 100;

type ListingRow = {
  id: string;
  ownerId: string;
  price: string;
  roomType: string | null;
  totalSlots: number;
  availableSlots: number;
  openSlots: number | null;
  moveInDate: Date | null;
  availableUntil: Date | null;
  minStayMonths: number | null;
  status: string;
  version: number | null;
  genderPreference: string | null;
  householdGender: string | null;
  physicalUnitId: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
};

type BackfillArgs = {
  apply: boolean;
  batchSize: number;
  limit: number | null;
};

const TOKEN_NORMALIZATIONS: Record<string, string> = {
  apartment: "apt",
  avenue: "ave",
  boulevard: "blvd",
  circle: "cir",
  court: "ct",
  drive: "dr",
  east: "e",
  floor: "fl",
  highway: "hwy",
  lane: "ln",
  north: "n",
  parkway: "pkwy",
  place: "pl",
  road: "rd",
  room: "rm",
  south: "s",
  street: "st",
  suite: "ste",
  terrace: "ter",
  trail: "trl",
  unit: "unit",
  west: "w",
};

function parsePositiveIntArg(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseArgs(argv: string[]): BackfillArgs {
  let apply = false;
  let batchSize = DEFAULT_BATCH_SIZE;
  let limit: number | null = null;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
    } else if (arg.startsWith("--batch-size=")) {
      batchSize = parsePositiveIntArg("--batch-size", arg.split("=")[1]);
    } else if (arg.startsWith("--limit=")) {
      limit = parsePositiveIntArg("--limit", arg.split("=")[1]);
    } else if (arg !== "--dry-run") {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { apply, batchSize, limit };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((token) => TOKEN_NORMALIZATIONS[token] ?? token)
    .join(" ");
}

function canonicalize(row: ListingRow): {
  canonicalAddressHash: string;
  canonicalUnit: string;
} {
  const tuple = [
    normalizeText(row.address),
    normalizeText(row.city),
    normalizeText(row.state),
    row.zip.replace(/\D/g, "").slice(0, 5),
    "_none_",
    "us",
  ].join("|");

  return {
    canonicalAddressHash: crypto
      .createHash("sha256")
      .update(tuple)
      .digest("base64url")
      .slice(0, 32),
    canonicalUnit: "_none_",
  };
}

function roomCategory(
  row: ListingRow
): "ENTIRE_PLACE" | "PRIVATE_ROOM" | "SHARED_ROOM" {
  if (row.roomType === "Entire Place") return "ENTIRE_PLACE";
  if (row.roomType === "Shared Room") return "SHARED_ROOM";
  return "PRIVATE_ROOM";
}

function dateOnly(value: Date | null): Date | null {
  if (!value) return null;
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function toBigInt(value: bigint | number | string): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

async function fetchPendingRows(
  cursorId: string | null,
  limit: number
): Promise<ListingRow[]> {
  return prisma.$queryRaw<ListingRow[]>`
    SELECT
      l.id,
      l."ownerId" AS "ownerId",
      l.price::TEXT AS price,
      l."roomType" AS "roomType",
      l."totalSlots" AS "totalSlots",
      l."availableSlots" AS "availableSlots",
      l."openSlots" AS "openSlots",
      l."moveInDate" AS "moveInDate",
      l."availableUntil" AS "availableUntil",
      l."minStayMonths" AS "minStayMonths",
      l.status::TEXT AS status,
      l.version,
      l."genderPreference" AS "genderPreference",
      l."householdGender" AS "householdGender",
      l.physical_unit_id AS "physicalUnitId",
      loc.address,
      loc.city,
      loc.state,
      loc.zip
    FROM "Listing" l
    INNER JOIN "Location" loc ON loc."listingId" = l.id
    LEFT JOIN listing_inventories li ON li.id = l.id
    WHERE l.status IN ('ACTIVE', 'PAUSED', 'RENTED')
      AND (l.physical_unit_id IS NULL OR li.id IS NULL)
      AND (${cursorId}::TEXT IS NULL OR l.id > ${cursorId})
    ORDER BY l.id
    LIMIT ${limit}
  `;
}

async function countPending(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: string }[]>`
    SELECT COUNT(*)::TEXT AS count
    FROM "Listing" l
    INNER JOIN "Location" loc ON loc."listingId" = l.id
    LEFT JOIN listing_inventories li ON li.id = l.id
    WHERE l.status IN ('ACTIVE', 'PAUSED', 'RENTED')
      AND (l.physical_unit_id IS NULL OR li.id IS NULL)
  `;
  return Number(rows[0]?.count ?? "0");
}

async function appendOutbox(
  tx: Prisma.TransactionClient,
  input: {
    aggregateType: string;
    aggregateId: string;
    kind: string;
    payload: Record<string, unknown>;
    sourceVersion: bigint;
    unitIdentityEpoch: number;
    priority?: number;
  }
) {
  await tx.$executeRaw`
    INSERT INTO outbox_events (
      id, aggregate_type, aggregate_id, kind, payload,
      source_version, unit_identity_epoch, priority
    ) VALUES (
      ${crypto.randomUUID()},
      ${input.aggregateType},
      ${input.aggregateId},
      ${input.kind},
      ${JSON.stringify(input.payload)}::JSONB,
      ${input.sourceVersion}::BIGINT,
      ${input.unitIdentityEpoch},
      ${input.priority ?? 100}
    )
  `;
}

async function backfillOne(row: ListingRow): Promise<void> {
  const canonical = canonicalize(row);
  const sourceVersion = BigInt(Math.max(1, Number(row.version ?? 1)));
  const openSlots = Math.max(0, Number(row.openSlots ?? row.availableSlots));
  const totalSlots = Math.max(1, Number(row.totalSlots));
  const from = dateOnly(row.moveInDate) ?? todayDateOnly();
  const until = dateOnly(row.availableUntil);
  const category = roomCategory(row);
  const visible =
    row.status === "ACTIVE" && openSlots > 0 && row.moveInDate !== null;
  const price = Number(row.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Listing ${row.id} has invalid price`);
  }
  if (visible && until && until < from) {
    throw new Error(`Listing ${row.id} has invalid availability range`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.actor_role', 'system', true)`;
    await tx.$executeRaw`SELECT set_config('app.actor_id', '', true)`;

    const units = await tx.$queryRaw<
      {
        id: string;
        unit_identity_epoch: number;
        geocode_status: string;
        source_version: bigint | number;
      }[]
    >`
      INSERT INTO physical_units (
        id, canonical_address_hash, canonical_unit, canonicalizer_version
      ) VALUES (
        ${crypto.randomUUID()},
        ${canonical.canonicalAddressHash},
        ${canonical.canonicalUnit},
        ${CANONICALIZER_VERSION}
      )
      ON CONFLICT (canonical_address_hash, canonical_unit) DO UPDATE SET
        canonicalizer_version = EXCLUDED.canonicalizer_version,
        source_version = physical_units.source_version + 1,
        row_version = physical_units.row_version + 1,
        updated_at = NOW()
      RETURNING id, unit_identity_epoch, geocode_status, source_version
    `;
    const unit = units[0];
    if (!unit) throw new Error(`Could not resolve physical unit for ${row.id}`);

    await tx.$executeRaw`
      UPDATE "Listing"
      SET physical_unit_id = ${unit.id}
      WHERE id = ${row.id}
    `;

    const hasActiveGeocode = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM outbox_events
      WHERE aggregate_type = 'PHYSICAL_UNIT'
        AND aggregate_id = ${unit.id}
        AND kind = 'GEOCODE_NEEDED'
        AND status IN ('PENDING', 'IN_FLIGHT')
      LIMIT 1
    `;

    if (unit.geocode_status !== "COMPLETE" && hasActiveGeocode.length === 0) {
      await appendOutbox(tx, {
        aggregateType: "PHYSICAL_UNIT",
        aggregateId: unit.id,
        kind: "GEOCODE_NEEDED",
        payload: {
          address: `${row.address}, ${row.city}, ${row.state} ${row.zip}`,
          canonicalAddressHash: canonical.canonicalAddressHash,
          requestId: null,
        },
        sourceVersion: toBigInt(unit.source_version),
        unitIdentityEpoch: Number(unit.unit_identity_epoch),
        priority: 100,
      });
    }

    const publishStatus = visible
      ? unit.geocode_status === "COMPLETE"
        ? "PENDING_PROJECTION"
        : "PENDING_GEOCODE"
      : row.status === "PAUSED"
        ? "PAUSED"
        : "ARCHIVED";
    const capacityGuests =
      category === "SHARED_ROOM" ? null : Math.max(1, openSlots || totalSlots);
    const totalBeds = category === "SHARED_ROOM" ? totalSlots : null;
    const openBeds = category === "SHARED_ROOM" ? openSlots : null;

    await tx.$executeRaw`
      INSERT INTO listing_inventories (
        id, unit_id, unit_identity_epoch_written_at, inventory_key,
        room_category, capacity_guests, total_beds, open_beds,
        available_from, available_until, availability_range, price,
        lease_min_months, lease_negotiable, gender_preference, household_gender,
        publish_status, source_version, row_version,
        canonicalizer_version, canonical_address_hash
      ) VALUES (
        ${row.id},
        ${unit.id},
        ${unit.unit_identity_epoch},
        ${`listing:${row.id}`},
        ${category},
        ${capacityGuests}::INTEGER,
        ${totalBeds}::INTEGER,
        ${openBeds}::INTEGER,
        ${from}::DATE,
        ${until}::DATE,
        tstzrange(${from}::DATE::TIMESTAMPTZ, (${until}::DATE + INTERVAL '1 day')::TIMESTAMPTZ, '[)'),
        ${price}::NUMERIC,
        ${Math.max(1, Number(row.minStayMonths ?? 1))},
        ${false},
        ${category === "ENTIRE_PLACE" ? null : row.genderPreference},
        ${category === "ENTIRE_PLACE" ? null : row.householdGender},
        ${publishStatus},
        ${sourceVersion}::BIGINT,
        1,
        ${CANONICALIZER_VERSION},
        ${canonical.canonicalAddressHash}
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
        lease_negotiable = EXCLUDED.lease_negotiable,
        gender_preference = EXCLUDED.gender_preference,
        household_gender = EXCLUDED.household_gender,
        publish_status = EXCLUDED.publish_status,
        source_version = EXCLUDED.source_version,
        row_version = listing_inventories.row_version + 1,
        canonicalizer_version = EXCLUDED.canonicalizer_version,
        canonical_address_hash = EXCLUDED.canonical_address_hash,
        updated_at = NOW()
    `;

    if (publishStatus === "PENDING_PROJECTION") {
      await appendOutbox(tx, {
        aggregateType: "LISTING_INVENTORY",
        aggregateId: row.id,
        kind: "INVENTORY_UPSERTED",
        payload: {
          unitId: unit.id,
          inventoryKey: `listing:${row.id}`,
          listingId: row.id,
          requestId: null,
        },
        sourceVersion,
        unitIdentityEpoch: Number(unit.unit_identity_epoch),
        priority: 100,
      });
    } else {
      await tx.$executeRaw`
        DELETE FROM inventory_search_projection
        WHERE inventory_id = ${row.id}
      `;
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const totalPending = await countPending();
  let processed = 0;
  let failed = 0;
  let cursorId: string | null = null;

  console.log(
    `Canonical inventory backfill (${args.apply ? "APPLY" : "DRY_RUN"})`
  );
  console.log(`Rows pending: ${totalPending}`);

  while (args.limit === null || processed < args.limit) {
    const remaining =
      args.limit === null ? args.batchSize : args.limit - processed;
    const rows = await fetchPendingRows(
      cursorId,
      Math.min(args.batchSize, remaining)
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      cursorId = row.id;
      if (args.apply) {
        try {
          await backfillOne(row);
        } catch (error) {
          failed += 1;
          console.error(
            `Failed ${row.id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      processed += 1;
    }

    console.log(
      `Processed ${processed}${args.apply ? `, failed ${failed}` : ""}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
