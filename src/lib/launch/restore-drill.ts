export interface RestoreSemanticRow {
  inventoryId: string;
  unitId: string;
  embeddingVersion: string;
  publishStatus: "PUBLISHED" | "SHADOW" | "STALE_PUBLISHED" | "TOMBSTONED";
  matchesQuery: boolean;
}

export interface RestoreSmokeInput {
  restoredAt: string;
  expectedEmbeddingVersion: string;
  rows: RestoreSemanticRow[];
  outboxPendingCount: number;
}

export interface RestoreSmokeReport {
  restoredAt: string;
  expectedCandidates: string[];
  semanticSmokePassed: boolean;
  outboxReplayRequired: boolean;
}

export function simulateRestoreSemanticSmoke(
  input: RestoreSmokeInput
): RestoreSmokeReport {
  const expectedCandidates = input.rows
    .filter(
      (row) =>
        row.embeddingVersion === input.expectedEmbeddingVersion &&
        row.publishStatus === "PUBLISHED" &&
        row.matchesQuery
    )
    .map((row) => row.inventoryId)
    .sort();

  return {
    restoredAt: input.restoredAt,
    expectedCandidates,
    semanticSmokePassed: expectedCandidates.length > 0,
    outboxReplayRequired: input.outboxPendingCount > 0,
  };
}
