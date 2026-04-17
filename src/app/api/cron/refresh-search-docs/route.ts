/**
 * SearchDoc refresh cron.
 *
 * Processes dirty listing ids oldest-first and routes every listing through the
 * shared SearchDoc projection helper used by immediate sync.
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { validateCronAuth } from "@/lib/cron-auth";
import { features } from "@/lib/env";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";
import { prisma } from "@/lib/prisma";
import {
  getSearchDocCronTelemetrySnapshot,
  recordSearchDocCronRun,
  toSearchDocCronReasonLabel,
  type SearchDocCronReasonLabel,
} from "@/lib/search/search-doc-cron-telemetry";
import {
  projectSearchDocument,
  type SearchDocProjectionResult,
} from "@/lib/search/search-doc-sync";

export const maxDuration = 30;

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_RESCAN_SAMPLE_SIZE = 50;
const DEFAULT_TIME_BUDGET_MS = 20_000;
const UPSERT_CONCURRENCY = 10;
const RESCAN_CONCURRENCY = 5;

type OutcomeCounters = {
  upsert: number;
  suppress_delete: number;
  defer_retry: number;
  confirmed_orphan: number;
};

type ReasonCounters = Record<SearchDocCronReasonLabel, number>;

type DirtyListingEntry = {
  listing_id: string;
  marked_at: Date | string | null;
};

function parsePositiveIntEnv(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getBatchSize(): number {
  return parsePositiveIntEnv(
    process.env.SEARCH_DOC_BATCH_SIZE,
    DEFAULT_BATCH_SIZE
  );
}

function getRescanSampleSize(): number {
  return parsePositiveIntEnv(
    process.env.SEARCH_DOC_RESCAN_SAMPLE_SIZE,
    DEFAULT_RESCAN_SAMPLE_SIZE
  );
}

function getTimeBudgetMs(): number {
  return parsePositiveIntEnv(
    process.env.SEARCH_DOC_CRON_TIME_BUDGET_MS,
    DEFAULT_TIME_BUDGET_MS
  );
}

function createOutcomeCounters(): OutcomeCounters {
  return {
    upsert: 0,
    suppress_delete: 0,
    defer_retry: 0,
    confirmed_orphan: 0,
  };
}

function createReasonCounters(): ReasonCounters {
  return {
    missing: 0,
    stale: 0,
    version_skew: 0,
  };
}

function addOutcomeCounters(
  target: OutcomeCounters,
  source: OutcomeCounters
): void {
  target.upsert += source.upsert;
  target.suppress_delete += source.suppress_delete;
  target.defer_retry += source.defer_retry;
  target.confirmed_orphan += source.confirmed_orphan;
}

function addReasonCounters(target: ReasonCounters, source: ReasonCounters): void {
  target.missing += source.missing;
  target.stale += source.stale;
  target.version_skew += source.version_skew;
}

function sumReasonCounters(counts: ReasonCounters): number {
  return counts.missing + counts.stale + counts.version_skew;
}

function toMarkedAtDate(markedAt: DirtyListingEntry["marked_at"]): Date | null {
  if (!markedAt) {
    return null;
  }

  const parsed = markedAt instanceof Date ? markedAt : new Date(markedAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeDirtyQueueAgeSeconds(
  dirtyEntries: DirtyListingEntry[],
  nowMs: number
): number[] {
  return dirtyEntries
    .map((entry) => {
      const markedAt = toMarkedAtDate(entry.marked_at);
      if (!markedAt) {
        return null;
      }

      const ageSeconds = Math.max(0, (nowMs - markedAt.getTime()) / 1000);
      return Math.round(ageSeconds * 100) / 100;
    })
    .filter((ageSeconds): ageSeconds is number => ageSeconds != null);
}

async function fetchDirtyListingEntries(limit: number): Promise<DirtyListingEntry[]> {
  return prisma.$queryRaw<DirtyListingEntry[]>`
    SELECT listing_id, marked_at
    FROM listing_search_doc_dirty
    ORDER BY marked_at ASC
    LIMIT ${limit}
  `;
}

async function fetchRescanListingIds(
  sampleSize: number,
  excludedListingIds: string[]
): Promise<string[]> {
  if (sampleSize <= 0) {
    return [];
  }

  const sampleClause = Prisma.raw(`SYSTEM_ROWS(${sampleSize})`);
  const excludedListingClause =
    excludedListingIds.length > 0
      ? Prisma.sql`AND id <> ALL(${excludedListingIds})`
      : Prisma.empty;

  const rescanEntries = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`
      SELECT id
      FROM listing_search_docs
      TABLESAMPLE ${sampleClause}
      WHERE NOT EXISTS (
        SELECT 1
        FROM listing_search_doc_dirty dirty
        WHERE dirty.listing_id = listing_search_docs.id
      )
      ${excludedListingClause}
      LIMIT ${sampleSize}
    `
  );

  return rescanEntries.map((entry) => entry.id);
}

async function clearDirtyFlags(listingIds: string[]): Promise<number> {
  if (listingIds.length === 0) {
    return 0;
  }

  return prisma.$executeRaw`
    DELETE FROM listing_search_doc_dirty
    WHERE listing_id = ANY(${listingIds})
  `;
}

async function processWithConcurrency<I, T>(
  items: I[],
  fn: (item: I) => Promise<T>,
  concurrency: number
): Promise<{ fulfilled: T[]; rejected: { item: I; error: unknown }[] }> {
  const fulfilled: T[] = [];
  const rejected: { item: I; error: unknown }[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map(fn));
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        fulfilled.push(result.value);
      } else {
        rejected.push({ item: chunk[j], error: result.reason });
      }
    }
  }

  return { fulfilled, rejected };
}

function shouldClearDirtyFlag(result: SearchDocProjectionResult): boolean {
  return result.outcome !== "defer_retry";
}

function countProjectionResults(results: SearchDocProjectionResult[]): {
  outcomes: OutcomeCounters;
  divergences: ReasonCounters;
  repaired: ReasonCounters;
} {
  const outcomes = createOutcomeCounters();
  const divergences = createReasonCounters();
  const repaired = createReasonCounters();

  for (const result of results) {
    outcomes[result.outcome] += 1;

    const reason = toSearchDocCronReasonLabel(result.divergenceReason);
    if (!reason) {
      continue;
    }

    divergences[reason] += 1;

    if (result.outcome === "upsert" && result.writeApplied) {
      repaired[reason] += 1;
    }
  }

  return { outcomes, divergences, repaired };
}

function logDivergenceRepairs(
  results: SearchDocProjectionResult[],
  phase: "dirty" | "rescan"
): void {
  for (const result of results) {
    const reason = toSearchDocCronReasonLabel(result.divergenceReason);
    if (!reason || result.outcome !== "upsert" || !result.writeApplied) {
      continue;
    }

    logger.sync.info("cfm.search.doc.divergence_detected", {
      event: "cfm.search.doc.divergence_detected",
      phase,
      listingIdHash: hashIdForLog(result.listingId),
      reason,
      listingVersion: result.listingVersion ?? undefined,
      docSourceVersion: result.docSourceVersion ?? undefined,
      docProjectionVersion: result.docProjectionVersion ?? undefined,
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authError = validateCronAuth(request);
    if (authError) {
      return authError;
    }

    const startTime = Date.now();
    const dirtyEntries = await fetchDirtyListingEntries(getBatchSize());
    const dirtyIds = dirtyEntries.map((entry) => entry.listing_id);
    const dirtyQueueAgeSeconds = computeDirtyQueueAgeSeconds(
      dirtyEntries,
      Date.now()
    );

    const totalOutcomes = createOutcomeCounters();
    const totalDivergences = createReasonCounters();
    const totalRepaired = createReasonCounters();
    let totalErrors = 0;
    let rescanned = 0;

    const dirtyPhase = await processWithConcurrency(
      dirtyIds,
      async (listingId) => projectSearchDocument(listingId),
      UPSERT_CONCURRENCY
    );

    const clearableIds = dirtyPhase.fulfilled
      .filter(shouldClearDirtyFlag)
      .map((result) => result.listingId);
    await clearDirtyFlags(clearableIds);

    const dirtyCounts = countProjectionResults(dirtyPhase.fulfilled);
    addOutcomeCounters(totalOutcomes, dirtyCounts.outcomes);
    addReasonCounters(totalDivergences, dirtyCounts.divergences);
    addReasonCounters(totalRepaired, dirtyCounts.repaired);
    totalErrors += dirtyPhase.rejected.length;
    logDivergenceRepairs(dirtyPhase.fulfilled, "dirty");

    const shouldRunRescan =
      features.searchDocRescan &&
      Date.now() - startTime < getTimeBudgetMs() &&
      getRescanSampleSize() > 0;

    if (shouldRunRescan) {
      try {
        const rescanIds = await fetchRescanListingIds(
          getRescanSampleSize(),
          dirtyIds
        );
        rescanned = rescanIds.length;

        const rescanPhase = await processWithConcurrency(
          rescanIds,
          async (listingId) => projectSearchDocument(listingId),
          RESCAN_CONCURRENCY
        );

        const rescanCounts = countProjectionResults(rescanPhase.fulfilled);
        addOutcomeCounters(totalOutcomes, rescanCounts.outcomes);
        addReasonCounters(totalDivergences, rescanCounts.divergences);
        addReasonCounters(totalRepaired, rescanCounts.repaired);
        totalErrors += rescanPhase.rejected.length;
        logDivergenceRepairs(rescanPhase.fulfilled, "rescan");
      } catch (error) {
        logger.sync.warn("[SearchDoc Cron] Rescan skipped", {
          event: "search_doc_cron_rescan_skipped",
          error: sanitizeErrorMessage(error),
          sampleSize: getRescanSampleSize(),
        });
      }
    }

    const processed = totalOutcomes.upsert;
    const repaired = sumReasonCounters(totalRepaired);

    recordSearchDocCronRun({
      divergenceCounts: totalDivergences,
      repairedCounts: totalRepaired,
      processedCount: processed,
      errorCounts: { projection_error: totalErrors },
      dirtyQueueAgeSeconds,
    });

    const telemetrySnapshot = getSearchDocCronTelemetrySnapshot();
    const durationMs = Date.now() - startTime;

    logger.sync.info("[SearchDoc Cron] Complete", {
      event: "search_doc_cron_complete",
      processed,
      repaired,
      suppressed: totalOutcomes.suppress_delete,
      deferred: totalOutcomes.defer_retry,
      orphans: totalOutcomes.confirmed_orphan,
      divergentMissingDoc: totalDivergences.missing,
      divergentStaleDoc: totalDivergences.stale,
      divergentVersionSkew: totalDivergences.version_skew,
      dirtyQueueAgeP50Sec: telemetrySnapshot.dirtyQueueAgeSeconds.p50,
      dirtyQueueAgeP95Sec: telemetrySnapshot.dirtyQueueAgeSeconds.p95,
      errors: totalErrors,
      totalDirty: dirtyIds.length,
      rescanned,
      durationMs,
    });

    return NextResponse.json({
      success: totalErrors === 0,
      processed,
      repaired,
      orphans: totalOutcomes.confirmed_orphan,
      suppressed: totalOutcomes.suppress_delete,
      deferred: totalOutcomes.defer_retry,
      divergentMissingDoc: totalDivergences.missing,
      divergentStaleDoc: totalDivergences.stale,
      divergentVersionSkew: totalDivergences.version_skew,
      dirtyQueueAgeP50Sec: telemetrySnapshot.dirtyQueueAgeSeconds.p50,
      dirtyQueueAgeP95Sec: telemetrySnapshot.dirtyQueueAgeSeconds.p95,
      errors: totalErrors,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.sync.error("[SearchDoc Cron] Error", {
      error: sanitizeErrorMessage(error),
    });
    return NextResponse.json(
      { error: "SearchDoc refresh failed" },
      { status: 500 }
    );
  }
}
