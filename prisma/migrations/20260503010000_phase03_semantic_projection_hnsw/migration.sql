-- Phase 03: HNSW index for semantic_inventory_projection.
-- Data-safety: additive only. Apply manually if Prisma migrate rejects CONCURRENTLY.
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS semantic_inventory_projection_embedding_hnsw_idx;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "semantic_inventory_projection_embedding_hnsw_idx"
  ON "semantic_inventory_projection"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE "publish_status" = 'PUBLISHED';
