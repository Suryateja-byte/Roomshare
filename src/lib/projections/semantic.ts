import "server-only";

import { createHash } from "crypto";
import pgvector from "pgvector";

import type { TransactionClient } from "@/lib/db/with-actor";
import { generateEmbedding } from "@/lib/embeddings/gemini";
import {
  getBuildEmbeddingVersion,
  getReadEmbeddingVersion,
} from "@/lib/embeddings/version";
import { currentProjectionEpoch } from "@/lib/projections/epoch";

export const SEMANTIC_PROJECTION_STATUSES = [
  "BUILDING",
  "SHADOW",
  "PUBLISHED",
  "STALE_PUBLISHED",
  "TOMBSTONED",
  "FAILED",
] as const;

export type SemanticProjectionStatus =
  (typeof SEMANTIC_PROJECTION_STATUSES)[number];

export interface SemanticProjectionInput {
  unitId: string;
  inventoryId: string;
  sourceVersion: bigint;
  unitIdentityEpoch: number;
  embeddingVersion?: string;
}

export interface SemanticProjectionResult {
  updated: boolean;
  skippedStale: boolean;
  embeddingVersion: string;
  sanitizedContentHash: string | null;
}

export interface SemanticCandidate {
  inventoryId: string;
  unitId: string;
  embeddingVersion: string;
  publishStatus: SemanticProjectionStatus;
  sourceVersion: bigint;
}

interface SemanticSourceRow {
  inventory_id: string;
  unit_id: string;
  unit_identity_epoch_written_at: number;
  room_category: string;
  capacity_guests: number | null;
  total_beds: number | null;
  open_beds: number | null;
  price: string;
  available_from: Date | string;
  available_until: Date | string | null;
  lease_min_months: number | null;
  lease_max_months: number | null;
  lease_negotiable: boolean;
  gender_preference: string | null;
  household_gender: string | null;
  public_cell_id: string | null;
  public_area_name: string | null;
  matching_inventory_count: number | null;
  projection_source_version: bigint | number | string;
}

export class EmbeddingBudgetExceededError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("EMBEDDING_TOKEN_BUDGET_EXCEEDED");
    this.name = "EmbeddingBudgetExceededError";
    this.retryAfterMs = retryAfterMs;
  }
}

type GenerateEmbeddingFn = typeof generateEmbedding;

interface SemanticProjectionDeps {
  generateEmbedding?: GenerateEmbeddingFn;
  nowMs?: () => number;
  tokenBudgetPerMinute?: number;
}

let budgetWindowStartedAt = 0;
let budgetTokensUsed = 0;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function tokenBudgetPerMinute(deps?: SemanticProjectionDeps): number {
  const configured =
    deps?.tokenBudgetPerMinute ??
    Number(process.env.EMBEDDING_TOKEN_BUDGET_PER_MINUTE);
  return Number.isFinite(configured) && configured > 0 ? configured : 120_000;
}

function reserveEmbeddingTokens(
  text: string,
  deps?: SemanticProjectionDeps
): void {
  const now = deps?.nowMs?.() ?? Date.now();
  if (now - budgetWindowStartedAt >= 60_000) {
    budgetWindowStartedAt = now;
    budgetTokensUsed = 0;
  }

  const tokenCount = estimateTokens(text);
  const budget = tokenBudgetPerMinute(deps);
  if (budgetTokensUsed + tokenCount > budget) {
    const retryAfterMs = Math.max(1_000, 60_000 - (now - budgetWindowStartedAt));
    throw new EmbeddingBudgetExceededError(retryAfterMs);
  }

  budgetTokensUsed += tokenCount;
}

export function __resetEmbeddingTokenBudgetForTesting(): void {
  budgetWindowStartedAt = 0;
  budgetTokensUsed = 0;
}

function hashSemanticContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function formatOptionalDate(date: Date | string | null): string | null {
  if (!date) return null;
  return typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
}

export function buildSemanticProjectionText(row: SemanticSourceRow): string {
  const parts: string[] = [
    `Room category: ${row.room_category}.`,
    `Price: $${row.price} per month.`,
  ];

  if (row.capacity_guests != null) {
    parts.push(`Capacity: ${row.capacity_guests} guests.`);
  }
  if (row.total_beds != null) {
    parts.push(`Beds: ${row.open_beds ?? row.total_beds} of ${row.total_beds} open.`);
  }
  const availableFrom = formatOptionalDate(row.available_from);
  if (availableFrom) {
    parts.push(`Available from ${availableFrom}.`);
  }
  const availableUntil = formatOptionalDate(row.available_until);
  if (availableUntil) {
    parts.push(`Available until ${availableUntil}.`);
  }
  if (row.lease_min_months != null || row.lease_max_months != null) {
    parts.push(
      `Lease months: ${row.lease_min_months ?? "any"} to ${row.lease_max_months ?? "any"}.`
    );
  }
  if (row.lease_negotiable) {
    parts.push("Lease is negotiable.");
  }
  if (row.gender_preference) {
    parts.push(`Gender preference: ${row.gender_preference}.`);
  }
  if (row.household_gender) {
    parts.push(`Household gender: ${row.household_gender}.`);
  }
  if (row.public_area_name) {
    parts.push(`Area: ${row.public_area_name}.`);
  } else if (row.public_cell_id) {
    parts.push(`Area cell: ${row.public_cell_id}.`);
  }
  if (row.matching_inventory_count != null) {
    parts.push(`Visible inventory count for unit: ${row.matching_inventory_count}.`);
  }

  return parts.join(" ");
}

async function fetchSemanticSourceRow(
  tx: TransactionClient,
  input: SemanticProjectionInput
): Promise<SemanticSourceRow | null> {
  const rows = await tx.$queryRaw<SemanticSourceRow[]>`
    SELECT
      isp.inventory_id,
      isp.unit_id,
      isp.unit_identity_epoch_written_at,
      isp.room_category,
      isp.capacity_guests,
      isp.total_beds,
      isp.open_beds,
      isp.price::TEXT AS price,
      isp.available_from,
      isp.available_until,
      isp.lease_min_months,
      isp.lease_max_months,
      isp.lease_negotiable,
      isp.gender_preference,
      isp.household_gender,
      isp.public_cell_id,
      isp.public_area_name,
      isp.source_version AS projection_source_version,
      upp.matching_inventory_count
    FROM inventory_search_projection isp
    LEFT JOIN unit_public_projection upp
      ON upp.unit_id = isp.unit_id
     AND upp.unit_identity_epoch = isp.unit_identity_epoch_written_at
    WHERE isp.inventory_id = ${input.inventoryId}
      AND isp.unit_id = ${input.unitId}
      AND isp.publish_status = 'PUBLISHED'
    LIMIT 1
  `;

  return rows[0] ?? null;
}

function vectorCastSuffix(): string {
  return process.env.NODE_ENV === "test" ? "" : "::vector";
}

export async function rebuildSemanticInventoryProjection(
  tx: TransactionClient,
  input: SemanticProjectionInput,
  deps?: SemanticProjectionDeps
): Promise<SemanticProjectionResult> {
  const embeddingVersion = input.embeddingVersion ?? getBuildEmbeddingVersion();
  const sourceRow = await fetchSemanticSourceRow(tx, input);
  if (!sourceRow) {
    return {
      updated: false,
      skippedStale: true,
      embeddingVersion,
      sanitizedContentHash: null,
    };
  }

  const text = buildSemanticProjectionText(sourceRow);
  if (BigInt(sourceRow.projection_source_version) > input.sourceVersion) {
    return {
      updated: false,
      skippedStale: true,
      embeddingVersion,
      sanitizedContentHash: null,
    };
  }

  reserveEmbeddingTokens(text, deps);

  const embedding = await (deps?.generateEmbedding ?? generateEmbedding)(
    text,
    "RETRIEVAL_DOCUMENT"
  );
  const vectorLiteral = pgvector.toSql(embedding);
  const sanitizedContentHash = hashSemanticContent(text);
  const projectionEpoch = currentProjectionEpoch();
  const coarseFilterAttrs = JSON.stringify({
    roomCategory: sourceRow.room_category,
    publicCellId: sourceRow.public_cell_id,
    publicAreaName: sourceRow.public_area_name,
    capacityGuests: sourceRow.capacity_guests,
  });
  const semanticId = `${input.inventoryId}:${embeddingVersion}`;

  const updatedCount = await tx.$executeRawUnsafe(
    `
      INSERT INTO semantic_inventory_projection (
        id, inventory_id, unit_id, unit_identity_epoch,
        embedding_version, sanitized_content_hash, embedding,
        coarse_filter_attrs, publish_status, source_version, projection_epoch,
        last_built_at, published_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7${vectorCastSuffix()},
        $8::jsonb, 'PUBLISHED', $9::BIGINT, $10::BIGINT,
        NOW(), NOW(), NOW(), NOW()
      )
      ON CONFLICT (inventory_id, embedding_version) DO UPDATE SET
        unit_id = EXCLUDED.unit_id,
        unit_identity_epoch = EXCLUDED.unit_identity_epoch,
        sanitized_content_hash = EXCLUDED.sanitized_content_hash,
        embedding = EXCLUDED.embedding,
        coarse_filter_attrs = EXCLUDED.coarse_filter_attrs,
        publish_status = EXCLUDED.publish_status,
        source_version = EXCLUDED.source_version,
        projection_epoch = EXCLUDED.projection_epoch,
        last_built_at = NOW(),
        published_at = NOW(),
        tombstoned_at = NULL,
        updated_at = NOW()
      WHERE semantic_inventory_projection.source_version <= EXCLUDED.source_version
        AND semantic_inventory_projection.publish_status <> 'TOMBSTONED'
    `,
    semanticId,
    input.inventoryId,
    input.unitId,
    input.unitIdentityEpoch,
    embeddingVersion,
    sanitizedContentHash,
    vectorLiteral,
    coarseFilterAttrs,
    input.sourceVersion,
    projectionEpoch
  );

  const updated = updatedCount > 0;
  if (updated) {
    await tx.$executeRaw`
      UPDATE listing_inventories
      SET publish_status = 'PUBLISHED',
          last_embedded_version = ${embeddingVersion},
          last_published_version = ${input.sourceVersion}::BIGINT,
          updated_at = NOW()
      WHERE id = ${input.inventoryId}
    `;
  }

  return {
    updated,
    skippedStale: !updated,
    embeddingVersion,
    sanitizedContentHash,
  };
}

export async function getSemanticInventoryCandidates(
  tx: TransactionClient,
  opts: { embeddingVersion?: string; limit?: number } = {}
): Promise<SemanticCandidate[]> {
  const embeddingVersion = opts.embeddingVersion ?? getReadEmbeddingVersion();
  const limit = opts.limit ?? 50;
  const rows = await tx.$queryRaw<
    {
      inventory_id: string;
      unit_id: string;
      embedding_version: string;
      publish_status: SemanticProjectionStatus;
      source_version: bigint;
    }[]
  >`
    SELECT inventory_id, unit_id, embedding_version, publish_status, source_version
    FROM semantic_inventory_projection
    WHERE embedding_version = ${embeddingVersion}
      AND publish_status = 'PUBLISHED'
    ORDER BY last_built_at DESC, inventory_id ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    inventoryId: row.inventory_id,
    unitId: row.unit_id,
    embeddingVersion: row.embedding_version,
    publishStatus: row.publish_status,
    sourceVersion: BigInt(row.source_version),
  }));
}

export async function tombstoneSemanticProjectionRows(
  tx: TransactionClient,
  input: { unitId: string; inventoryId: string | null }
): Promise<number> {
  if (input.inventoryId) {
    return tx.$executeRaw`
      DELETE FROM semantic_inventory_projection
      WHERE inventory_id = ${input.inventoryId}
    `;
  }

  return tx.$executeRaw`
    DELETE FROM semantic_inventory_projection
    WHERE unit_id = ${input.unitId}
  `;
}

export async function swapSemanticProjectionVersion(
  tx: TransactionClient,
  input: {
    targetEmbeddingVersion: string;
    previousEmbeddingVersion?: string | null;
    minTargetRows?: number;
  }
): Promise<{ targetRows: number; staleRows: number; publishedRows: number }> {
  const targetRows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::BIGINT AS count
    FROM semantic_inventory_projection
    WHERE embedding_version = ${input.targetEmbeddingVersion}
      AND publish_status IN ('SHADOW', 'PUBLISHED')
  `;
  const targetCount = Number(targetRows[0]?.count ?? 0);
  if (targetCount < (input.minTargetRows ?? 1)) {
    throw new Error("SEMANTIC_SWAP_COHERENCE_FAILED");
  }

  let staleRows = 0;
  if (input.previousEmbeddingVersion) {
    staleRows = await tx.$executeRaw`
      UPDATE semantic_inventory_projection
      SET publish_status = 'STALE_PUBLISHED',
          updated_at = NOW()
      WHERE embedding_version = ${input.previousEmbeddingVersion}
        AND publish_status = 'PUBLISHED'
    `;
  }

  const publishedRows = await tx.$executeRaw`
    UPDATE semantic_inventory_projection
    SET publish_status = 'PUBLISHED',
        published_at = NOW(),
        updated_at = NOW()
    WHERE embedding_version = ${input.targetEmbeddingVersion}
      AND publish_status IN ('SHADOW', 'BUILDING')
  `;

  return { targetRows: targetCount, staleRows, publishedRows };
}
