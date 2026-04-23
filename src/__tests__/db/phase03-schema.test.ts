/**
 * @jest-environment node
 *
 * Phase 03 schema tests for semantic_inventory_projection.
 */

import fs from "fs";
import path from "path";

import {
  createPGlitePhase03Fixture,
  type Phase03Fixture,
} from "@/__tests__/utils/pglite-phase03";

let fixture: Phase03Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase03Fixture();
}, 30_000);

afterAll(async () => {
  await fixture.close();
});

describe("Phase 03 semantic projection schema", () => {
  it("creates semantic_inventory_projection with versioned publish columns", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'semantic_inventory_projection'`
    );
    const names = columns.map((row) => row.column_name);

    expect(names).toContain("inventory_id");
    expect(names).toContain("unit_id");
    expect(names).toContain("unit_identity_epoch");
    expect(names).toContain("embedding_version");
    expect(names).toContain("sanitized_content_hash");
    expect(names).toContain("embedding");
    expect(names).toContain("coarse_filter_attrs");
    expect(names).toContain("publish_status");
    expect(names).toContain("source_version");
    expect(names).toContain("projection_epoch");
    expect(names).toContain("last_built_at");
  });

  it("rejects unknown semantic publish statuses", async () => {
    await expect(
      fixture.query(
        `INSERT INTO semantic_inventory_projection (
           id, inventory_id, unit_id, unit_identity_epoch,
           embedding_version, sanitized_content_hash, embedding,
           publish_status, source_version, projection_epoch
         ) VALUES (
           'bad-status', 'inv-bad', 'unit-bad', 1,
           'v1', 'hash', '[0.1]', 'PENDING_EMBEDDING', 1, 1
         )`
      )
    ).rejects.toThrow();
  });

  it("keeps production migration on pgvector and HNSW", () => {
    const migrationDir = path.resolve(
      __dirname,
      "../../../prisma/migrations"
    );
    const tableSql = fs.readFileSync(
      path.join(
        migrationDir,
        "20260503000000_phase03_semantic_projection",
        "migration.sql"
      ),
      "utf8"
    );
    const hnswSql = fs.readFileSync(
      path.join(
        migrationDir,
        "20260503010000_phase03_semantic_projection_hnsw",
        "migration.sql"
      ),
      "utf8"
    );

    expect(tableSql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(tableSql).toContain('"embedding"              vector(768)');
    expect(hnswSql).toContain("USING hnsw");
    expect(hnswSql).toContain("vector_cosine_ops");
  });
});
