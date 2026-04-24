export interface EmbeddingDrillRow {
  inventoryId: string;
  unitId: string;
  embeddingVersion: string;
  publishStatus: "SHADOW" | "PUBLISHED" | "STALE_PUBLISHED" | "TOMBSTONED";
  rank: number;
}

export interface EmbeddingSwapDrillInput {
  previousVersion: string;
  targetVersion: string;
  rows: EmbeddingDrillRow[];
  tombstonedInventoryIds: string[];
  minTopKOverlap: number;
  topK: number;
}

export interface EmbeddingSwapDrillReport {
  targetPublishedCount: number;
  previousStaleCount: number;
  tombstoneViolations: string[];
  topKOverlap: number;
  observableRankingGap: boolean;
  rollbackReadVersion: string;
}

function topK(rows: EmbeddingDrillRow[], version: string, k: number): string[] {
  return rows
    .filter(
      (row) =>
        row.embeddingVersion === version &&
        row.publishStatus !== "TOMBSTONED"
    )
    .sort((a, b) => a.rank - b.rank)
    .slice(0, k)
    .map((row) => row.inventoryId);
}

export function simulateEmbeddingSwapDrill(
  input: EmbeddingSwapDrillInput
): EmbeddingSwapDrillReport {
  const previousTopK = topK(input.rows, input.previousVersion, input.topK);
  const targetTopK = topK(input.rows, input.targetVersion, input.topK);
  const overlap = targetTopK.filter((id) => previousTopK.includes(id)).length;
  const topKOverlap =
    input.topK > 0 ? Number((overlap / input.topK).toFixed(4)) : 0;

  const tombstoned = new Set(input.tombstonedInventoryIds);
  const tombstoneViolations = input.rows
    .filter(
      (row) =>
        tombstoned.has(row.inventoryId) &&
        row.publishStatus !== "TOMBSTONED"
    )
    .map((row) => `${row.inventoryId}@${row.embeddingVersion}`);

  return {
    targetPublishedCount: input.rows.filter(
      (row) =>
        row.embeddingVersion === input.targetVersion &&
        row.publishStatus === "PUBLISHED"
    ).length,
    previousStaleCount: input.rows.filter(
      (row) =>
        row.embeddingVersion === input.previousVersion &&
        row.publishStatus === "STALE_PUBLISHED"
    ).length,
    tombstoneViolations,
    topKOverlap,
    observableRankingGap:
      topKOverlap < input.minTopKOverlap || tombstoneViolations.length > 0,
    rollbackReadVersion: input.previousVersion,
  };
}
