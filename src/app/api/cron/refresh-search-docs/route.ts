/**
 * SearchDoc refresh cron.
 *
 * Processes dirty listing ids oldest-first and routes every listing through the
 * shared SearchDoc projection helper used by immediate sync.
 */

import { NextRequest, NextResponse } from "next/server";

import { validateCronAuth } from "@/lib/cron-auth";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  projectSearchDocument,
  type SearchDocProjectionResult,
} from "@/lib/search/search-doc-sync";

const BATCH_SIZE = parseInt(process.env.SEARCH_DOC_BATCH_SIZE || "100", 10);
const UPSERT_CONCURRENCY = 10;

type DivergenceCounters = {
  missingDoc: number;
  staleDoc: number;
};

type OutcomeCounters = {
  upsert: number;
  suppress_delete: number;
  defer_retry: number;
  confirmed_orphan: number;
};

function createOutcomeCounters(): OutcomeCounters {
  return {
    upsert: 0,
    suppress_delete: 0,
    defer_retry: 0,
    confirmed_orphan: 0,
  };
}

function createDivergenceCounters(): DivergenceCounters {
  return {
    missingDoc: 0,
    staleDoc: 0,
  };
}

async function fetchDirtyListingIds(limit: number): Promise<string[]> {
  const dirtyEntries = await prisma.$queryRaw<{ listing_id: string }[]>`
    SELECT listing_id
    FROM listing_search_doc_dirty
    ORDER BY marked_at ASC
    LIMIT ${limit}
  `;

  return dirtyEntries.map((entry) => entry.listing_id);
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
  divergences: DivergenceCounters;
} {
  const outcomes = createOutcomeCounters();
  const divergences = createDivergenceCounters();

  for (const result of results) {
    outcomes[result.outcome] += 1;

    if (result.divergenceReason === "missing_doc") {
      divergences.missingDoc += 1;
    } else if (result.divergenceReason === "stale_doc") {
      divergences.staleDoc += 1;
    }
  }

  return { outcomes, divergences };
}

export async function GET(request: NextRequest) {
  try {
    const authError = validateCronAuth(request);
    if (authError) {
      return authError;
    }

    const startTime = Date.now();
    const dirtyIds = await fetchDirtyListingIds(BATCH_SIZE);

    if (dirtyIds.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        orphans: 0,
        suppressed: 0,
        deferred: 0,
        divergentMissingDoc: 0,
        divergentStaleDoc: 0,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    const { fulfilled, rejected } = await processWithConcurrency(
      dirtyIds,
      async (listingId) => projectSearchDocument(listingId),
      UPSERT_CONCURRENCY
    );

    const clearableIds = fulfilled
      .filter(shouldClearDirtyFlag)
      .map((result) => result.listingId);
    await clearDirtyFlags(clearableIds);

    const { outcomes, divergences } = countProjectionResults(fulfilled);
    const durationMs = Date.now() - startTime;
    const errors = rejected.map(
      ({ item, error }) => `Listing ${item}: ${sanitizeErrorMessage(error)}`
    );

    logger.sync.info("[SearchDoc Cron] Complete", {
      event: "search_doc_cron_complete",
      processed: outcomes.upsert,
      suppressed: outcomes.suppress_delete,
      deferred: outcomes.defer_retry,
      orphans: outcomes.confirmed_orphan,
      divergentMissingDoc: divergences.missingDoc,
      divergentStaleDoc: divergences.staleDoc,
      errors: errors.length,
      totalDirty: dirtyIds.length,
      durationMs,
    });

    return NextResponse.json({
      success: errors.length === 0,
      processed: outcomes.upsert,
      orphans: outcomes.confirmed_orphan,
      suppressed: outcomes.suppress_delete,
      deferred: outcomes.defer_retry,
      divergentMissingDoc: divergences.missingDoc,
      divergentStaleDoc: divergences.staleDoc,
      errors: errors.length,
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
