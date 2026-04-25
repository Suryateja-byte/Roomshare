/**
 * PGlite fixture for Phase 03 semantic projection tests.
 *
 * Extends Phase 02 and applies the semantic projection migration with a local
 * vector fallback: PGlite does not provide pgvector, so `embedding vector(768)`
 * is normalized to TEXT while production migration SQL keeps real pgvector.
 */

import fs from "fs";
import path from "path";

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../prisma/migrations");

const PHASE03_SEMANTIC_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260503000000_phase03_semantic_projection",
  "migration.sql"
);

export interface Phase03Fixture extends Phase02Fixture {
  insertSemanticInventoryProjection(opts: {
    id?: string;
    inventoryId: string;
    unitId: string;
    unitIdentityEpoch?: number;
    embeddingVersion?: string;
    sanitizedContentHash?: string;
    embedding?: string;
    coarseFilterAttrs?: Record<string, unknown>;
    publishStatus?: string;
    sourceVersion?: bigint;
    projectionEpoch?: bigint;
  }): Promise<string>;

  getSemanticInventoryProjections(): Promise<
    {
      id: string;
      inventoryId: string;
      unitId: string;
      unitIdentityEpoch: number;
      embeddingVersion: string;
      publishStatus: string;
      sourceVersion: bigint;
      projectionEpoch: bigint;
      sanitizedContentHash: string;
    }[]
  >;
}

function normalizeSemanticMigrationForPGlite(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/g, "")
    .replace(/"embedding"\s+vector\(768\)\s+NOT NULL/g, '"embedding" TEXT NOT NULL');
}

export async function createPGlitePhase03Fixture(): Promise<Phase03Fixture> {
  const base = await createPGlitePhase02Fixture();
  const pg = base.pg;
  const pgExec = (
    pg as unknown as { exec: (sql: string) => Promise<void> }
  ).exec.bind(pg);

  const semanticSql = normalizeSemanticMigrationForPGlite(
    fs.readFileSync(PHASE03_SEMANTIC_MIGRATION, "utf8")
  );
  await pgExec(semanticSql);

  const insertSemanticInventoryProjection: Phase03Fixture["insertSemanticInventoryProjection"] =
    async (opts) => {
      const id =
        opts.id ?? `${opts.inventoryId}:${opts.embeddingVersion ?? "test-version"}`;
      await pg.query(
        `INSERT INTO semantic_inventory_projection (
           id, inventory_id, unit_id, unit_identity_epoch,
           embedding_version, sanitized_content_hash, embedding,
           coarse_filter_attrs, publish_status, source_version, projection_epoch,
           last_built_at, published_at, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,NOW(),NOW(),NOW(),NOW())
         ON CONFLICT (inventory_id, embedding_version) DO UPDATE SET
           publish_status = EXCLUDED.publish_status,
           source_version = EXCLUDED.source_version,
           updated_at = NOW()`,
        [
          id,
          opts.inventoryId,
          opts.unitId,
          opts.unitIdentityEpoch ?? 1,
          opts.embeddingVersion ?? "test-version",
          opts.sanitizedContentHash ?? "hash",
          opts.embedding ?? "[0.1,0.2,0.3]",
          JSON.stringify(opts.coarseFilterAttrs ?? {}),
          opts.publishStatus ?? "PUBLISHED",
          Number(opts.sourceVersion ?? BigInt(1)),
          Number(opts.projectionEpoch ?? BigInt(1)),
        ]
      );
      return id;
    };

  const getSemanticInventoryProjections: Phase03Fixture["getSemanticInventoryProjections"] =
    async () => {
      const rows = await base.query(
        `SELECT id, inventory_id, unit_id, unit_identity_epoch,
                embedding_version, publish_status, source_version,
                projection_epoch, sanitized_content_hash
         FROM semantic_inventory_projection
         ORDER BY created_at, id`
      );
      return rows.map((row) => ({
        id: String(row.id),
        inventoryId: String(row.inventory_id),
        unitId: String(row.unit_id),
        unitIdentityEpoch: Number(row.unit_identity_epoch),
        embeddingVersion: String(row.embedding_version),
        publishStatus: String(row.publish_status),
        sourceVersion: BigInt(Number(row.source_version)),
        projectionEpoch: BigInt(Number(row.projection_epoch)),
        sanitizedContentHash: String(row.sanitized_content_hash),
      }));
    };

  return {
    ...base,
    insertSemanticInventoryProjection,
    getSemanticInventoryProjections,
  };
}
