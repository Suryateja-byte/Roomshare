const SEARCH_DOC_CRON_REASON_LABELS = [
  "missing",
  "stale",
  "version_skew",
] as const;

const SEARCH_DOC_CRON_ERROR_REASON_LABELS = ["projection_error"] as const;

export type SearchDocCronReasonLabel =
  (typeof SEARCH_DOC_CRON_REASON_LABELS)[number];
export type SearchDocCronErrorReasonLabel =
  (typeof SEARCH_DOC_CRON_ERROR_REASON_LABELS)[number];

type ReasonCounterMap = Record<SearchDocCronReasonLabel, number>;
type ErrorCounterMap = Record<SearchDocCronErrorReasonLabel, number>;

interface SearchDocCronTelemetryStore {
  divergenceCounts: ReasonCounterMap;
  repairedCounts: ReasonCounterMap;
  processedCount: number;
  errorCounts: ErrorCounterMap;
  dirtyQueueAgeSeconds: number[];
}

const INTERNAL_TO_METRIC_REASON: Record<string, SearchDocCronReasonLabel> = {
  missing: "missing",
  missing_doc: "missing",
  stale: "stale",
  stale_doc: "stale",
  version_skew: "version_skew",
};

function createReasonCounterMap(): ReasonCounterMap {
  return {
    missing: 0,
    stale: 0,
    version_skew: 0,
  };
}

function createErrorCounterMap(): ErrorCounterMap {
  return {
    projection_error: 0,
  };
}

const telemetryStore: SearchDocCronTelemetryStore = {
  divergenceCounts: createReasonCounterMap(),
  repairedCounts: createReasonCounterMap(),
  processedCount: 0,
  errorCounts: createErrorCounterMap(),
  dirtyQueueAgeSeconds: [],
};

function sanitizeCount(value: number | undefined): number {
  if (!Number.isFinite(value) || value == null || value < 0) {
    return 0;
  }
  return Math.trunc(value);
}

function sanitizeAgeSamples(samples: number[] | undefined): number[] {
  if (!Array.isArray(samples)) {
    return [];
  }

  return samples
    .filter((sample) => Number.isFinite(sample) && sample >= 0)
    .map((sample) => Math.round(sample * 100) / 100);
}

function computePercentile(sortedSamples: number[], percentile: number): number {
  if (sortedSamples.length === 0) {
    return 0;
  }

  const index = Math.ceil((percentile / 100) * sortedSamples.length) - 1;
  return sortedSamples[Math.max(0, index)];
}

function getReasonCount(
  counts: Partial<Record<string, number>> | undefined,
  reason: SearchDocCronReasonLabel
): number {
  return sanitizeCount(counts?.[reason]);
}

function getErrorCount(
  counts: Partial<Record<string, number>> | undefined,
  reason: SearchDocCronErrorReasonLabel
): number {
  return sanitizeCount(counts?.[reason]);
}

export function toSearchDocCronReasonLabel(
  reason: string | null | undefined
): SearchDocCronReasonLabel | null {
  if (!reason) {
    return null;
  }

  return INTERNAL_TO_METRIC_REASON[reason] ?? null;
}

export function recordSearchDocCronRun({
  divergenceCounts,
  repairedCounts,
  processedCount = 0,
  errorCounts,
  dirtyQueueAgeSeconds,
}: {
  divergenceCounts?: Partial<Record<string, number>>;
  repairedCounts?: Partial<Record<string, number>>;
  processedCount?: number;
  errorCounts?: Partial<Record<string, number>>;
  dirtyQueueAgeSeconds?: number[];
}): void {
  for (const reason of SEARCH_DOC_CRON_REASON_LABELS) {
    telemetryStore.divergenceCounts[reason] = getReasonCount(
      divergenceCounts,
      reason
    );
    telemetryStore.repairedCounts[reason] += getReasonCount(
      repairedCounts,
      reason
    );
  }

  telemetryStore.processedCount += sanitizeCount(processedCount);

  for (const reason of SEARCH_DOC_CRON_ERROR_REASON_LABELS) {
    telemetryStore.errorCounts[reason] += getErrorCount(errorCounts, reason);
  }

  telemetryStore.dirtyQueueAgeSeconds = sanitizeAgeSamples(dirtyQueueAgeSeconds);
}

export function getSearchDocCronTelemetrySnapshot() {
  const sortedDirtyQueueAgeSeconds = [...telemetryStore.dirtyQueueAgeSeconds].sort(
    (left, right) => left - right
  );
  const dirtyQueueAgeSum =
    Math.round(
      telemetryStore.dirtyQueueAgeSeconds.reduce(
        (sum, sample) => sum + sample,
        0
      ) * 100
    ) / 100;

  return {
    divergenceCounts: { ...telemetryStore.divergenceCounts },
    repairedCounts: { ...telemetryStore.repairedCounts },
    processedCount: telemetryStore.processedCount,
    errorCounts: { ...telemetryStore.errorCounts },
    dirtyQueueAgeSeconds: {
      p50: computePercentile(sortedDirtyQueueAgeSeconds, 50),
      p95: computePercentile(sortedDirtyQueueAgeSeconds, 95),
      count: sortedDirtyQueueAgeSeconds.length,
      sum: dirtyQueueAgeSum,
    },
  };
}

export const getSearchDocCronSnapshot = getSearchDocCronTelemetrySnapshot;

export function resetSearchDocCronTelemetryForTests(): void {
  telemetryStore.divergenceCounts = createReasonCounterMap();
  telemetryStore.repairedCounts = createReasonCounterMap();
  telemetryStore.processedCount = 0;
  telemetryStore.errorCounts = createErrorCounterMap();
  telemetryStore.dirtyQueueAgeSeconds = [];
}

export {
  SEARCH_DOC_CRON_ERROR_REASON_LABELS,
  SEARCH_DOC_CRON_REASON_LABELS,
};
