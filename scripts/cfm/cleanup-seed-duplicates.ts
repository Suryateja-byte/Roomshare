import { prisma } from "../../src/lib/prisma";
import { normalizeAddress } from "../../src/lib/search/normalize-address";

interface CliArgs {
  apply: boolean;
  titlePrefix: string | null;
  ownerIds: string[] | null;
  maxGroupSize: number;
  createdAtSecondsWindow: number;
}

interface ListingRow {
  id: string;
  ownerId: string;
  title: string;
  price: number;
  moveInDate: string | null;
  availableSlots: number;
  totalSlots: number;
  createdAt: string;
  latitude: number | null;
  longitude: number | null;
  locationAddress: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationZip: string | null;
}

interface CandidateGroup {
  signature: string;
  rows: ListingRow[];
  keeper: ListingRow;
  deletable: ListingRow[];
}

const DEFAULT_MAX_GROUP_SIZE = 50;
const DEFAULT_CREATED_AT_SECONDS_WINDOW = 60 * 60; // 60 minutes

function normalizeListingTitleLocal(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCliArgs(argv: string[]): CliArgs {
  let apply = false;
  let dryRun = false;
  let titlePrefix: string | null = null;
  let ownerIdsRaw: string | null = null;
  let maxGroupSize = DEFAULT_MAX_GROUP_SIZE;
  let createdAtSecondsWindow = DEFAULT_CREATED_AT_SECONDS_WINDOW;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--title-prefix") {
      titlePrefix = argv[++i] ?? null;
    } else if (arg?.startsWith("--title-prefix=")) {
      titlePrefix = arg.slice("--title-prefix=".length);
    } else if (arg === "--owner-ids") {
      ownerIdsRaw = argv[++i] ?? null;
    } else if (arg?.startsWith("--owner-ids=")) {
      ownerIdsRaw = arg.slice("--owner-ids=".length);
    } else if (arg === "--max-group-size") {
      maxGroupSize = Number(argv[++i] ?? DEFAULT_MAX_GROUP_SIZE);
    } else if (arg?.startsWith("--max-group-size=")) {
      maxGroupSize = Number(arg.slice("--max-group-size=".length));
    } else if (arg === "--created-at-window-seconds") {
      createdAtSecondsWindow = Number(
        argv[++i] ?? DEFAULT_CREATED_AT_SECONDS_WINDOW
      );
    } else if (arg?.startsWith("--created-at-window-seconds=")) {
      createdAtSecondsWindow = Number(
        arg.slice("--created-at-window-seconds=".length)
      );
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (apply && dryRun) {
    throw new Error("Choose either --apply or --dry-run, not both.");
  }

  if (!titlePrefix && !ownerIdsRaw) {
    throw new Error(
      "At least one of --title-prefix or --owner-ids must be provided."
    );
  }

  if (!Number.isFinite(maxGroupSize) || maxGroupSize < 1) {
    throw new Error("--max-group-size must be a positive integer.");
  }
  if (!Number.isFinite(createdAtSecondsWindow) || createdAtSecondsWindow < 0) {
    throw new Error(
      "--created-at-window-seconds must be a non-negative integer."
    );
  }

  const ownerIds = ownerIdsRaw
    ? ownerIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  return { apply, titlePrefix, ownerIds, maxGroupSize, createdAtSecondsWindow };
}

export function computeGroupSignature(
  row: Pick<
    ListingRow,
    | "ownerId"
    | "title"
    | "moveInDate"
    | "price"
    | "availableSlots"
    | "totalSlots"
    | "locationAddress"
    | "locationCity"
    | "locationState"
    | "locationZip"
  >
): string {
  const normalizedAddress = normalizeAddress({
    address: row.locationAddress,
    city: row.locationCity,
    state: row.locationState,
    zip: row.locationZip,
  });
  const normalizedTitle = normalizeListingTitleLocal(row.title);
  return [
    row.ownerId,
    normalizedAddress,
    Math.round(row.price * 100),
    normalizedTitle,
    row.moveInDate ?? "",
    row.availableSlots,
    row.totalSlots,
  ].join("|");
}

function within(
  a: string | null,
  b: string | null,
  seconds: number
): boolean {
  if (!a || !b) return false;
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return false;
  return Math.abs(aMs - bMs) <= seconds * 1000;
}

export function groupDuplicates(
  rows: ListingRow[],
  createdAtSecondsWindow: number
): CandidateGroup[] {
  const bySig = new Map<string, ListingRow[]>();
  for (const row of rows) {
    const sig = computeGroupSignature(row);
    const bucket = bySig.get(sig) ?? [];
    bucket.push(row);
    bySig.set(sig, bucket);
  }

  const groups: CandidateGroup[] = [];
  for (const [sig, bucket] of bySig) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const keeper = bucket[0];
    const deletable = bucket
      .slice(1)
      .filter((r) => within(r.createdAt, keeper.createdAt, createdAtSecondsWindow));
    if (deletable.length === 0) continue;
    groups.push({ signature: sig, rows: bucket, keeper, deletable });
  }

  return groups;
}

async function fetchCandidateRows(args: CliArgs): Promise<ListingRow[]> {
  const { titlePrefix, ownerIds } = args;
  const titleFilter = titlePrefix ? `${titlePrefix}%` : null;

  const rows = await prisma.$queryRaw<ListingRow[]>`
    SELECT
      l.id,
      l."ownerId",
      l.title,
      l.price::float AS price,
      l."moveInDate"::text AS "moveInDate",
      l."availableSlots",
      l."totalSlots",
      l."createdAt"::text AS "createdAt",
      l.latitude::float AS latitude,
      l.longitude::float AS longitude,
      loc.address AS "locationAddress",
      loc.city AS "locationCity",
      loc.state AS "locationState",
      loc.zip AS "locationZip"
    FROM "Listing" l
    LEFT JOIN "Location" loc ON loc."listingId" = l.id
    WHERE (
      (${titleFilter}::text IS NOT NULL AND l.title ILIKE ${titleFilter})
      OR (${ownerIds}::text[] IS NOT NULL AND l."ownerId" = ANY(${ownerIds}))
    )
      AND l.status IN ('ACTIVE', 'PAUSED')
  `;

  return rows;
}

async function assertNoBookings(listingIds: string[]): Promise<void> {
  if (listingIds.length === 0) return;
  const [bookings] = await prisma.$queryRaw<[{ count: number }]>`
    SELECT COUNT(*)::int AS count
    FROM "Booking"
    WHERE "listingId" = ANY(${listingIds})
  `;
  if ((bookings?.count ?? 0) > 0) {
    throw new Error(
      `Abort: ${bookings.count} Booking rows reference candidate listings. Refusing to delete; resolve bookings first.`
    );
  }
}

export interface CleanupResult {
  status: "success" | "dry-run" | "aborted";
  groupsFound: number;
  rowsScanned: number;
  rowsWouldDelete: number;
  rowsDeleted: number;
  oversizedGroups: number;
}

async function main(): Promise<CleanupResult> {
  const args = parseCliArgs(process.argv.slice(2));
  console.log("cleanup-seed-duplicates");
  console.log(`Mode: ${args.apply ? "APPLY" : "DRY_RUN"}`);
  console.log(`Title prefix: ${args.titlePrefix ?? "(none)"}`);
  console.log(
    `Owner IDs: ${
      args.ownerIds ? `${args.ownerIds.length} provided` : "(none)"
    }`
  );
  console.log(`Max group size: ${args.maxGroupSize}`);
  console.log(
    `Created-at window: ${args.createdAtSecondsWindow} seconds`
  );

  const rows = await fetchCandidateRows(args);
  console.log(`Rows matched (ACTIVE|PAUSED): ${rows.length}`);

  const groups = groupDuplicates(rows, args.createdAtSecondsWindow);
  const oversized = groups.filter((g) => g.rows.length > args.maxGroupSize);
  if (oversized.length > 0) {
    console.log(
      `Warning: ${oversized.length} group(s) exceed --max-group-size=${args.maxGroupSize}. They will be SKIPPED.`
    );
  }
  const groupsToApply = groups.filter(
    (g) => g.rows.length <= args.maxGroupSize
  );

  const deletable = groupsToApply.flatMap((g) => g.deletable);

  console.log(`Candidate groups: ${groupsToApply.length}`);
  console.log(`Rows that would be deleted: ${deletable.length}`);
  if (deletable.length > 0) {
    console.log("Sample groups:");
    for (const g of groupsToApply.slice(0, 5)) {
      console.log(
        `  - ${g.rows.length} rows, keeper=${g.keeper.id}, deleting=${g.deletable
          .map((r) => r.id)
          .join(",")}`
      );
    }
  }

  if (!args.apply) {
    console.log("Dry-run only. No rows were mutated.");
    return {
      status: "dry-run",
      groupsFound: groupsToApply.length,
      rowsScanned: rows.length,
      rowsWouldDelete: deletable.length,
      rowsDeleted: 0,
      oversizedGroups: oversized.length,
    };
  }

  try {
    await assertNoBookings(deletable.map((r) => r.id));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return {
      status: "aborted",
      groupsFound: groupsToApply.length,
      rowsScanned: rows.length,
      rowsWouldDelete: deletable.length,
      rowsDeleted: 0,
      oversizedGroups: oversized.length,
    };
  }

  const deletedIds: string[] = [];
  for (const group of groupsToApply) {
    for (const row of group.deletable) {
      await prisma.$executeRaw`DELETE FROM "Listing" WHERE id = ${row.id}`;
      deletedIds.push(row.id);
    }
  }

  console.log(`Deleted ${deletedIds.length} listing row(s).`);
  return {
    status: "success",
    groupsFound: groupsToApply.length,
    rowsScanned: rows.length,
    rowsWouldDelete: deletable.length,
    rowsDeleted: deletedIds.length,
    oversizedGroups: oversized.length,
  };
}

if (process.env.JEST_WORKER_ID === undefined) {
  main()
    .then((result) => {
      process.exitCode = result.status === "aborted" ? 2 : 0;
    })
    .catch((err) => {
      console.error("cleanup-seed-duplicates failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
