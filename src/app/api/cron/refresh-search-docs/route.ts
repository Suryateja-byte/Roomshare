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
  recordSearchDocCronRun,
  type SearchDocCronCasSuppressionReasonLabel,
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
const MAX_DURATION_MS = maxDuration * 1000;
const RESCAN_CHUNK_SAFETY_MARGIN_MS = 3_000;
const UPSERT_CONCURRENCY = 10;
const RESCAN_CONCURRENCY = 5;

type OutcomeCounters = {
  upsert: number;
  suppress_delete: number;
  defer_retry: number;
  confirmed_orphan: number;
};

type ReasonCounters = Record<SearchDocCronReasonLabel, number>;
type CasSuppressionCounters = Record<
  SearchDocCronCasSuppressionReasonLabel,
  number
>;

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

function createCasSuppressionCounters(): CasSuppressionCounters {
  return {
    older_source_version: 0,
    older_projection_version: 0,
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

function addCasSuppressionCounters(
  target: CasSuppressionCounters,
  source: CasSuppressionCounters
): void {
  target.older_source_version += source.older_source_version;
  target.older_projection_version += source.older_projection_version;
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

function computePercentile(sortedSamples: number[], percentile: number): number {
  if (sortedSamples.length === 0) {
    return 0;
  }

  const index = Math.ceil((percentile / 100) * sortedSamples.length) - 1;
  return sortedSamples[Math.max(0, index)];
}

function summarizeDirtyQueueAgeSeconds(samples: number[]) {
  const sortedSamples = [...samples].sort((left, right) => left - right);

  return {
    p50: computePercentile(sortedSamples, 50),
    p95: computePercentile(sortedSamples, 95),
  };
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
  concurrency: number,
  shouldContinue: () => boolean = () => true
): Promise<{
  fulfilled: T[];
  rejected: { item: I; error: unknown }[];
  truncated: boolean;
}> {
  const fulfilled: T[] = [];
  const rejected: { item: I; error: unknown }[] = [];
  let truncated = false;

  for (let i = 0; i < items.length; i += concurrency) {
    if (!shouldContinue()) {
      truncated = i < items.length;
      break;
    }

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

  return { fulfilled, rejected, truncated };
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

function reportProjectionResults(
  results: SearchDocProjectionResult[],
  phase: "dirty" | "rescan"
): { casSuppressed: CasSuppressionCounters } {
  const casSuppressed = createCasSuppressionCounters();

  for (const result of results) {
    if (result.outcome !== "upsert") {
      continue;
    }

    if (result.writeApplied) {
      const reason = toSearchDocCronReasonLabel(result.divergenceReason);
      if (!reason) {
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
      continue;
    }

    if (result.casSuppressionReason) {
      casSuppressed[result.casSuppressionReason] += 1;
    }
  }

  return { casSuppressed };
}

export async function GET(request: NextRequest) {
  let cronStarted = false;
  let partial = true;
  let responsePartial = false;
  let cronStartMs = 0;
  const totalOutcomes = createOutcomeCounters();
  const totalDivergences = createReasonCounters();
  const totalRepaired = createReasonCounters();
  const totalCasSuppressed = createCasSuppressionCounters();
  let totalErrors = 0;
  let rescanned = 0;
  let dirtyIds: string[] = [];
  let dirtyQueueAgeSeconds: number[] = [];

  try {
    const authError = validateCronAuth(request);
    if (authError) {
      return authError;
    }

    cronStartMs = Date.now();
    cronStarted = true;
    const dirtyEntries = await fetchDirtyListingEntries(getBatchSize());
    dirtyIds = dirtyEntries.map((entry) => entry.listing_id);
    dirtyQueueAgeSeconds = computeDirtyQueueAgeSeconds(dirtyEntries, Date.now());

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
    addCasSuppressionCounters(
      totalCasSuppressed,
      reportProjectionResults(dirtyPhase.fulfilled, "dirty").casSuppressed
    );

    const shouldRunRescan =
      features.searchDocRescan &&
      Date.now() - cronStartMs < getTimeBudgetMs() &&
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
          RESCAN_CONCURRENCY,
          () =>
            MAX_DURATION_MS - (Date.now() - cronStartMs) >=
            RESCAN_CHUNK_SAFETY_MARGIN_MS
        );

        const rescanCounts = countProjectionResults(rescanPhase.fulfilled);
        addOutcomeCounters(totalOutcomes, rescanCounts.outcomes);
        addReasonCounters(totalDivergences, rescanCounts.divergences);
        addReasonCounters(totalRepaired, rescanCounts.repaired);
        totalErrors += rescanPhase.rejected.length;
        addCasSuppressionCounters(
          totalCasSuppressed,
          reportProjectionResults(rescanPhase.fulfilled, "rescan").casSuppressed
        );

        if (rescanPhase.truncated) {
          logger.sync.warn("[SearchDoc Cron] Rescan truncated by time budget", {
            event: "search_doc_cron_rescan_truncated",
            processed: rescanPhase.fulfilled.length,
            dropped:
              rescanIds.length -
              rescanPhase.fulfilled.length -
              rescanPhase.rejected.length,
            durationMs: Date.now() - cronStartMs,
          });
        }

        responsePartial = rescanPhase.truncated;
      } catch (error) {
        logger.sync.warn("[SearchDoc Cron] Rescan skipped", {
          event: "search_doc_cron_rescan_skipped",
          error: sanitizeErrorMessage(error),
          sampleSize: getRescanSampleSize(),
        });
        responsePartial = false;
      }
    } else {
      responsePartial = false;
    }

    const processed = totalOutcomes.upsert;
    const repaired = sumReasonCounters(totalRepaired);
    const queueAgeSummary = summarizeDirtyQueueAgeSeconds(dirtyQueueAgeSeconds);
    const durationMs = Date.now() - cronStartMs;

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
      casSuppressedOlderSourceVersion: totalCasSuppressed.older_source_version,
      casSuppressedOlderProjectionVersion:
        totalCasSuppressed.older_projection_version,
      dirtyQueueAgeP50Sec: queueAgeSummary.p50,
      dirtyQueueAgeP95Sec: queueAgeSummary.p95,
      errors: totalErrors,
      totalDirty: dirtyIds.length,
      rescanned,
      durationMs,
      partial: responsePartial,
    });

    partial = responsePartial;

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
      casSuppressedOlderSourceVersion: totalCasSuppressed.older_source_version,
      casSuppressedOlderProjectionVersion:
        totalCasSuppressed.older_projection_version,
      dirtyQueueAgeP50Sec: queueAgeSummary.p50,
      dirtyQueueAgeP95Sec: queueAgeSummary.p95,
      errors: totalErrors,
      durationMs,
      partial: responsePartial,
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
  } finally {
    if (cronStarted) {
      // JS finally blocks do not run on SIGKILL/maxDuration termination. The
      // per-chunk rescan budget above is the primary defense for timeout exits.
      recordSearchDocCronRun({
        divergenceCounts: totalDivergences,
        repairedCounts: totalRepaired,
        casSuppressedCounts: totalCasSuppressed,
        processedCount: totalOutcomes.upsert,
        errorCounts: { projection_error: totalErrors },
        dirtyQueueAgeSeconds,
        partial,
      });

      if (partial) {
        logger.sync.warn("[SearchDoc Cron] Partial run recorded", {
          event: "search_doc_cron_partial",
          processed: totalOutcomes.upsert,
          errors: totalErrors,
          durationMs: cronStartMs === 0 ? 0 : Date.now() - cronStartMs,
        });
      }
    }
  }
}
