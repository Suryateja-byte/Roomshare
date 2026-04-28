import { PrismaClient, type Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

let prismaClient: PrismaClient | null = null;
const PRIVATE_BUCKET = "verification-documents";
const DEFAULT_BATCH_SIZE = 50;
const MAX_LEGACY_BYTES = 20 * 1024 * 1024;
const REVIEWED_DOCUMENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type BackfillArgs = {
  apply: boolean;
  batchSize: number;
  limit: number | null;
};

type VerificationRow = {
  id: string;
  userId: string;
  documentUrl: string | null;
  selfieUrl: string | null;
  documentPath: string | null;
  selfiePath: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  updatedAt: Date;
  reviewedAt: Date | null;
  documentsExpireAt: Date | null;
  documentsDeletedAt: Date | null;
};

type LegacyObject = {
  bucket: string;
  objectPath: string;
  extension: string;
  mimeType: string;
};

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

type BackfillPrismaClient = Pick<PrismaClient, "verificationRequest">;

type BackfillOutput = Pick<Console, "log" | "error">;

type BackfillSummary = {
  mode: "apply" | "dry-run";
  scanned: number;
  candidateObjects: number;
  migratedObjects: number;
  sourceDeletedObjects: number;
  updatedRows: number;
  legacyUrlsAlreadyPrivate: number;
  retentionRowsUpdated: number;
  invalidLegacyUrls: number;
  failedObjects: number;
  failedSourceDeletes: number;
};

type RunBackfillOptions = {
  argv?: string[];
  prismaClient?: BackfillPrismaClient;
  supabaseClient?: SupabaseClient | null;
  fetchFn?: typeof fetch;
  stdout?: Pick<Console, "log">;
  stderr?: Pick<Console, "error">;
  now?: Date;
};

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

function parsePositiveIntArg(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parseArgs(argv: string[]): BackfillArgs {
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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { apply, batchSize, limit };
}

function getExpectedSupabaseHost(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }

  const parsed = new URL(supabaseUrl);
  return parsed.host;
}

export function parseLegacyPublicUrl(
  url: string,
  expectedHost: string
): LegacyObject {
  const parsed = new URL(url);
  if (parsed.host !== expectedHost) {
    throw new Error("URL is not from this Supabase project");
  }

  const match = parsed.pathname.match(
    /^\/storage\/v1\/object\/public\/([^/]+)\/(.+\.([a-z0-9]+))$/i
  );
  if (!match) {
    throw new Error("URL is not a Supabase public object URL");
  }

  const extension = match[3].toLowerCase();
  const mimeType = EXTENSION_TO_MIME[extension];
  if (!mimeType) {
    throw new Error("Unsupported legacy document extension");
  }

  return {
    bucket: decodeURIComponent(match[1]),
    objectPath: decodeURIComponent(match[2]),
    extension: extension === "jpeg" ? "jpg" : extension,
    mimeType,
  };
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getPrismaClient() {
  prismaClient ??= new PrismaClient();
  return prismaClient;
}

async function copyLegacyObject(params: {
  row: VerificationRow;
  kind: "document" | "selfie";
  url: string;
  expectedHost: string;
  supabase: SupabaseClient;
  fetchFn: typeof fetch;
}) {
  const legacyObject = parseLegacyPublicUrl(params.url, params.expectedHost);
  const response = await params.fetchFn(params.url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Legacy object fetch failed with status ${response.status}`
    );
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > MAX_LEGACY_BYTES) {
    throw new Error("Legacy object is too large");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_LEGACY_BYTES) {
    throw new Error("Legacy object is too large");
  }

  const storagePath = `${params.row.userId}/legacy/${params.row.id}/${params.kind}.${legacyObject.extension}`;
  const { error } = await params.supabase.storage
    .from(PRIVATE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: legacyObject.mimeType,
      upsert: true,
    });

  if (error) {
    throw error;
  }

  return {
    storagePath,
    mimeType: legacyObject.mimeType,
    legacyObject,
  };
}

async function deleteLegacySourceObject(params: {
  legacyObject: LegacyObject;
  supabase: SupabaseClient;
}) {
  const { error } = await params.supabase.storage
    .from(params.legacyObject.bucket)
    .remove([params.legacyObject.objectPath]);

  if (error) {
    throw new Error("LEGACY_SOURCE_DELETE_FAILED");
  }
}

export function buildReviewedDocumentsExpireAt(
  row: Pick<
    VerificationRow,
    "status" | "reviewedAt" | "updatedAt" | "documentsExpireAt"
  >,
  now: Date
): Date | null {
  if (row.status === "PENDING" || row.documentsExpireAt) {
    return null;
  }

  const baseTime = row.reviewedAt ?? row.updatedAt;
  const expiresAt = new Date(
    baseTime.getTime() + REVIEWED_DOCUMENT_RETENTION_MS
  );
  return expiresAt <= now ? now : expiresAt;
}

function hasPrivateDocumentPaths(row: VerificationRow): boolean {
  return Boolean(row.documentPath || row.selfiePath);
}

function isReviewedPrivateRowMissingRetention(row: VerificationRow): boolean {
  return (
    row.status !== "PENDING" &&
    !row.documentsExpireAt &&
    !row.documentsDeletedAt &&
    hasPrivateDocumentPaths(row)
  );
}

function shouldApplyReviewedRetention(row: VerificationRow): boolean {
  return isReviewedPrivateRowMissingRetention(row);
}

function logObjectFailure(params: {
  output: BackfillOutput;
  rowId: string;
  kind: "document" | "selfie";
  error: unknown;
}) {
  const label =
    params.kind === "document" ? "verification document" : "verification selfie";
  const errorMessage =
    params.error instanceof Error ? params.error.message : String(params.error);
  const safeMessage = safeBackfillErrorMessage(errorMessage);

  params.output.error(
    `Failed to migrate ${label} for request ${params.rowId}: ${safeMessage}`
  );
}

function safeBackfillErrorMessage(errorMessage: string): string {
  if (errorMessage === "LEGACY_SOURCE_DELETE_FAILED") {
    return "Legacy source deletion failed";
  }

  if (
    errorMessage === "URL is not from this Supabase project" ||
    errorMessage === "URL is not a Supabase public object URL" ||
    errorMessage === "Unsupported legacy document extension" ||
    errorMessage === "Legacy object is too large" ||
    errorMessage.startsWith("Legacy object fetch failed with status")
  ) {
    return errorMessage;
  }

  return "Legacy object migration failed";
}

export async function runBackfill(
  options: RunBackfillOptions = {}
): Promise<BackfillSummary> {
  const args = parseArgs(options.argv ?? process.argv.slice(2));
  const expectedHost = getExpectedSupabaseHost();
  const db = options.prismaClient ?? getPrismaClient();
  const output = {
    log: options.stdout?.log ?? console.log,
    error: options.stderr?.error ?? console.error,
  };
  const supabase = args.apply
    ? options.supabaseClient ?? createSupabaseClient()
    : null;
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? new Date();
  let lastId: string | null = null;
  let scanned = 0;
  let candidateObjects = 0;
  let migratedObjects = 0;
  let sourceDeletedObjects = 0;
  let updatedRows = 0;
  let legacyUrlsAlreadyPrivate = 0;
  let retentionRowsUpdated = 0;
  let invalidLegacyUrls = 0;
  let failedObjects = 0;
  let failedSourceDeletes = 0;
  const updatedRowIds = new Set<string>();

  async function updateVerificationRow(
    row: VerificationRow,
    data: Prisma.VerificationRequestUpdateInput
  ) {
    if (!args.apply || Object.keys(data).length === 0) return;

    await db.verificationRequest.update({
      where: { id: row.id },
      data,
    });
    if (!updatedRowIds.has(row.id)) {
      updatedRows++;
      updatedRowIds.add(row.id);
    }
  }

  output.log(
    `Verification document backfill starting (${args.apply ? "apply" : "dry-run"})`
  );

  while (args.limit === null || scanned < args.limit) {
    const remaining =
      args.limit === null
        ? args.batchSize
        : Math.min(args.batchSize, args.limit - scanned);
    if (remaining <= 0) break;

    const rows: VerificationRow[] = await db.verificationRequest.findMany({
      where: {
        id: lastId ? { gt: lastId } : undefined,
        OR: [
          { documentUrl: { not: null } },
          { selfieUrl: { not: null } },
          {
            status: { in: ["APPROVED", "REJECTED"] },
            documentsExpireAt: null,
            documentsDeletedAt: null,
            OR: [{ documentPath: { not: null } }, { selfiePath: { not: null } }],
          },
        ],
      },
      select: {
        id: true,
        userId: true,
        documentUrl: true,
        selfieUrl: true,
        documentPath: true,
        selfiePath: true,
        status: true,
        updatedAt: true,
        reviewedAt: true,
        documentsExpireAt: true,
        documentsDeletedAt: true,
      },
      orderBy: { id: "asc" },
      take: remaining,
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      scanned++;
      lastId = row.id;

      if (row.documentUrl) {
        if (row.documentPath) {
          candidateObjects++;
          try {
            const legacyObject = parseLegacyPublicUrl(
              row.documentUrl,
              expectedHost
            );
            if (args.apply && supabase) {
              await deleteLegacySourceObject({ legacyObject, supabase });
              sourceDeletedObjects++;
              await updateVerificationRow(row, { documentUrl: null });
              row.documentUrl = null;
              legacyUrlsAlreadyPrivate++;
            }
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === "LEGACY_SOURCE_DELETE_FAILED"
            ) {
              failedSourceDeletes++;
            } else {
              invalidLegacyUrls++;
            }
            failedObjects++;
            logObjectFailure({
              output,
              rowId: row.id,
              kind: "document",
              error,
            });
          }
        } else if (args.apply && supabase) {
          candidateObjects++;
          try {
            const copied = await copyLegacyObject({
              row,
              kind: "document",
              url: row.documentUrl,
              expectedHost,
              supabase,
              fetchFn,
            });
            await updateVerificationRow(row, {
              documentPath: copied.storagePath,
              documentMimeType: copied.mimeType,
            });
            row.documentPath = copied.storagePath;
            await deleteLegacySourceObject({
              legacyObject: copied.legacyObject,
              supabase,
            });
            sourceDeletedObjects++;
            await updateVerificationRow(row, { documentUrl: null });
            row.documentUrl = null;
            migratedObjects++;
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === "LEGACY_SOURCE_DELETE_FAILED"
            ) {
              failedSourceDeletes++;
            }
            failedObjects++;
            logObjectFailure({
              output,
              rowId: row.id,
              kind: "document",
              error,
            });
          }
        } else {
          candidateObjects++;
          try {
            parseLegacyPublicUrl(row.documentUrl, expectedHost);
          } catch (error) {
            invalidLegacyUrls++;
            output.error(
              `Invalid legacy verification document URL for request ${row.id}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }

      if (row.selfieUrl) {
        if (row.selfiePath) {
          candidateObjects++;
          try {
            const legacyObject = parseLegacyPublicUrl(
              row.selfieUrl,
              expectedHost
            );
            if (args.apply && supabase) {
              await deleteLegacySourceObject({ legacyObject, supabase });
              sourceDeletedObjects++;
              await updateVerificationRow(row, { selfieUrl: null });
              row.selfieUrl = null;
              legacyUrlsAlreadyPrivate++;
            }
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === "LEGACY_SOURCE_DELETE_FAILED"
            ) {
              failedSourceDeletes++;
            } else {
              invalidLegacyUrls++;
            }
            failedObjects++;
            logObjectFailure({
              output,
              rowId: row.id,
              kind: "selfie",
              error,
            });
          }
        } else if (args.apply && supabase) {
          candidateObjects++;
          try {
            const copied = await copyLegacyObject({
              row,
              kind: "selfie",
              url: row.selfieUrl,
              expectedHost,
              supabase,
              fetchFn,
            });
            await updateVerificationRow(row, {
              selfiePath: copied.storagePath,
              selfieMimeType: copied.mimeType,
            });
            row.selfiePath = copied.storagePath;
            await deleteLegacySourceObject({
              legacyObject: copied.legacyObject,
              supabase,
            });
            sourceDeletedObjects++;
            await updateVerificationRow(row, { selfieUrl: null });
            row.selfieUrl = null;
            migratedObjects++;
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === "LEGACY_SOURCE_DELETE_FAILED"
            ) {
              failedSourceDeletes++;
            }
            failedObjects++;
            logObjectFailure({
              output,
              rowId: row.id,
              kind: "selfie",
              error,
            });
          }
        } else {
          candidateObjects++;
          try {
            parseLegacyPublicUrl(row.selfieUrl, expectedHost);
          } catch (error) {
            invalidLegacyUrls++;
            output.error(
              `Invalid legacy verification selfie URL for request ${row.id}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }

      if (args.apply && shouldApplyReviewedRetention(row)) {
        const expiresAt = buildReviewedDocumentsExpireAt(row, now);
        if (expiresAt) {
          await updateVerificationRow(row, { documentsExpireAt: expiresAt });
          row.documentsExpireAt = expiresAt;
          retentionRowsUpdated++;
        }
      }
    }
  }

  const summary: BackfillSummary = {
    mode: args.apply ? "apply" : "dry-run",
    scanned,
    candidateObjects,
    migratedObjects,
    sourceDeletedObjects,
    updatedRows,
    legacyUrlsAlreadyPrivate,
    retentionRowsUpdated,
    invalidLegacyUrls,
    failedObjects,
    failedSourceDeletes,
  };

  output.log(JSON.stringify(summary, null, 2));

  if (!args.apply) {
    output.log("Dry-run only. Re-run with --apply to migrate documents.");
  }

  return summary;
}

async function main() {
  await runBackfill();
}

if (process.env.NODE_ENV !== "test") {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prismaClient?.$disconnect();
    });
}
