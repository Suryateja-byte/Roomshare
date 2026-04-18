import { prisma } from "../../src/lib/prisma";
import {
  computeNormalizedAddressForRow,
  type NormalizedAddressSourceRow,
} from "./normalized-address-computer";

const BATCH_SIZE = 1000;
const SAMPLE_SIZE = 10;
const WRITE_CHUNK_SIZE = 50;

interface BackfillCliArgs {
  apply: boolean;
}

interface BackfillCountRow {
  count: string;
}

interface PendingRow extends NormalizedAddressSourceRow {
  id: string;
}

interface CancellationSignal {
  requested: boolean;
}

interface BackfillRunResult {
  status: "success" | "cancelled";
  totalPending: number;
  batchesProcessed: number;
  rowsScanned: number;
  rowsUpdated: number;
}

export function parseCliArgs(argv: string[]): BackfillCliArgs {
  let apply = false;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && dryRun) {
    throw new Error("Choose either --apply or --dry-run, not both.");
  }

  return {
    apply,
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildSampleRows(rows: PendingRow[]): Array<{
  sample: number;
  presentFieldCount: number;
  hasLocationData: boolean;
  normalizedLength: number;
  normalizedIsEmpty: boolean;
}> {
  return rows.map((row, index) => {
    const presentFieldCount = [
      row.address,
      row.city,
      row.state,
      row.zip,
    ].filter((value) => typeof value === "string" && value.trim().length > 0)
      .length;
    const normalized = computeNormalizedAddressForRow(row);

    return {
      sample: index + 1,
      presentFieldCount,
      hasLocationData: presentFieldCount > 0,
      normalizedLength: normalized.length,
      normalizedIsEmpty: normalized.length === 0,
    };
  });
}

function installCancellationHandler(): {
  cleanup: () => void;
  signal: CancellationSignal;
} {
  const signal: CancellationSignal = {
    requested: false,
  };

  const onSigInt = () => {
    if (signal.requested) {
      return;
    }

    signal.requested = true;
    console.log("SIGINT received. Finishing the current batch before exit.");
  };

  process.on("SIGINT", onSigInt);

  return {
    cleanup: () => {
      process.off("SIGINT", onSigInt);
    },
    signal,
  };
}

async function fetchPendingCount(): Promise<number> {
  const rows = await prisma.$queryRaw<BackfillCountRow[]>`
    SELECT COUNT(*)::text AS count
    FROM "Listing"
    WHERE "normalizedAddress" IS NULL
  `;

  return Number(rows[0]?.count ?? "0");
}

async function fetchPendingRows(
  cursorId: string | null,
  limit: number
): Promise<PendingRow[]> {
  return prisma.$queryRaw<PendingRow[]>`
    SELECT
      l.id,
      loc.address,
      loc.city,
      loc.state,
      loc.zip
    FROM "Listing" l
    LEFT JOIN "Location" loc
      ON loc."listingId" = l.id
    WHERE l."normalizedAddress" IS NULL
      AND (${cursorId}::text IS NULL OR l.id > ${cursorId})
    ORDER BY l.id
    LIMIT ${limit}
  `;
}

async function applyWriteChunk(rows: PendingRow[]): Promise<number> {
  const results = await Promise.all(
    rows.map((row) =>
      prisma.$executeRaw`
        UPDATE "Listing"
        SET "normalizedAddress" = ${computeNormalizedAddressForRow(row)}
        WHERE id = ${row.id}
          AND "normalizedAddress" IS NULL
      `
    )
  );

  return results.reduce((sum, count) => sum + Number(count), 0);
}

async function applyBatch(rows: PendingRow[]): Promise<number> {
  let updated = 0;

  for (let index = 0; index < rows.length; index += WRITE_CHUNK_SIZE) {
    updated += await applyWriteChunk(rows.slice(index, index + WRITE_CHUNK_SIZE));
  }

  return updated;
}

function logHeader(apply: boolean, totalPending: number): void {
  console.log("Listing normalizedAddress backfill");
  console.log(`Mode: ${apply ? "APPLY" : "DRY_RUN"}`);
  console.log(`Rows pending: ${totalPending}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
}

function logBatchProgress(
  batchIndex: number,
  totalBatches: number,
  rowsScanned: number,
  rowsUpdated: number,
  totalPending: number,
  startedAtMs: number
): void {
  const elapsedMs = Date.now() - startedAtMs;
  const remainingRows = Math.max(totalPending - rowsScanned, 0);
  const etaMs =
    rowsScanned === 0 ? 0 : Math.round((elapsedMs / rowsScanned) * remainingRows);

  console.log(
    `Batch ${batchIndex} of ${totalBatches}: rows updated so far ${rowsUpdated}/${totalPending}, ETA ${formatDuration(etaMs)}`
  );
}

export async function runBackfillCli(
  args: BackfillCliArgs,
  options: {
    cancellationSignal?: CancellationSignal;
  } = {}
): Promise<BackfillRunResult> {
  const cancellationSignal = options.cancellationSignal ?? { requested: false };
  const totalPending = await fetchPendingCount();

  logHeader(args.apply, totalPending);

  if (!args.apply) {
    const samples = await fetchPendingRows(null, SAMPLE_SIZE);

    console.log("Sample rows:");
    if (samples.length === 0) {
      console.log("  (none)");
    } else {
      for (const sample of buildSampleRows(samples)) {
        console.log(`  ${JSON.stringify(sample)}`);
      }
    }
    console.log("Dry-run only. No rows were mutated.");

    return {
      status: "success",
      totalPending,
      batchesProcessed: 0,
      rowsScanned: samples.length,
      rowsUpdated: 0,
    };
  }

  if (totalPending === 0) {
    console.log("No rows are pending.");

    return {
      status: "success",
      totalPending,
      batchesProcessed: 0,
      rowsScanned: 0,
      rowsUpdated: 0,
    };
  }

  const totalBatches = Math.ceil(totalPending / BATCH_SIZE);
  const startedAtMs = Date.now();
  let cursorId: string | null = null;
  let batchesProcessed = 0;
  let rowsScanned = 0;
  let rowsUpdated = 0;

  while (true) {
    if (cancellationSignal.requested) {
      console.log("Cancellation requested. Exiting before the next batch.");
      break;
    }

    const rows = await fetchPendingRows(cursorId, BATCH_SIZE);

    if (rows.length === 0) {
      break;
    }

    cursorId = rows[rows.length - 1]?.id ?? cursorId;
    rowsUpdated += await applyBatch(rows);
    rowsScanned += rows.length;
    batchesProcessed += 1;

    logBatchProgress(
      batchesProcessed,
      totalBatches,
      rowsScanned,
      rowsUpdated,
      totalPending,
      startedAtMs
    );
  }

  if (cancellationSignal.requested) {
    console.log(
      `Cancelled after ${batchesProcessed} batch(es). Rows updated: ${rowsUpdated}/${totalPending}.`
    );

    return {
      status: "cancelled",
      totalPending,
      batchesProcessed,
      rowsScanned,
      rowsUpdated,
    };
  }

  console.log(`Backfill complete. Rows updated: ${rowsUpdated}/${totalPending}.`);

  return {
    status: "success",
    totalPending,
    batchesProcessed,
    rowsScanned,
    rowsUpdated,
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const { cleanup, signal } = installCancellationHandler();

  try {
    const result = await runBackfillCli(args, {
      cancellationSignal: signal,
    });

    process.exitCode = result.status === "cancelled" ? 2 : 0;
  } finally {
    cleanup();
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined) {
  main().catch(() => {
    console.error("Listing normalizedAddress backfill failed.");
    process.exitCode = 1;
  });
}
