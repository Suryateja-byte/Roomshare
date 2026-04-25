/**
 * @jest-environment node
 *
 * Phase 04 schema coverage for projection-read cutover fields.
 */

import {
  createPGlitePhase04Fixture,
  type Phase04Fixture,
} from "@/__tests__/utils/pglite-phase04";

let fixture: Phase04Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase04Fixture();
}, 30_000);

afterAll(async () => {
  await fixture.close();
});

describe("Phase 04 projection search schema", () => {
  it("extends unit_public_projection with grouped public card/map fields", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'unit_public_projection'`
    );
    const names = columns.map((row) => row.column_name);

    expect(names).toEqual(
      expect.arrayContaining([
        "representative_inventory_id",
        "public_point",
        "public_cell_id",
        "public_area_name",
        "display_title",
        "display_subtitle",
        "hero_image_url",
        "payload_version",
      ])
    );
  });

  it("extends query_snapshots with unit-key and version pinning fields", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'query_snapshots'`
    );
    const names = columns.map((row) => row.column_name);

    expect(names).toEqual(
      expect.arrayContaining([
        "ordered_listing_ids",
        "ordered_unit_keys",
        "projection_epoch",
        "unit_identity_epoch_floor",
        "snapshot_version",
      ])
    );
  });

  it("creates Phase 04 query snapshot indexes", async () => {
    const indexes = await fixture.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE tablename = 'query_snapshots'`
    );
    const names = indexes.map((row) => row.indexname);

    expect(names).toContain("query_snapshots_projection_epoch_idx");
    expect(names).toContain(
      "query_snapshots_snapshot_version_query_hash_created_at_idx"
    );
  });

  it("stores legacy listing ids and grouped unit keys side by side", async () => {
    await fixture.query(
      `INSERT INTO query_snapshots (
         id, query_hash, backend_source, response_version,
         ordered_listing_ids, ordered_unit_keys, projection_epoch,
         unit_identity_epoch_floor, snapshot_version, total, expires_at
       ) VALUES (
         'phase04-snapshot-schema', 'hash-schema', 'v2', 'contract-v2',
         ARRAY['inv-1','inv-2'], ARRAY['unit-1:1','unit-2:1'], 7,
         1, 'phase04-unit-v1', 2, NOW() + INTERVAL '5 minutes'
       )`
    );

    const rows = await fixture.query<{
      ordered_listing_ids: string[];
      ordered_unit_keys: string[];
      projection_epoch: number;
      unit_identity_epoch_floor: number;
      snapshot_version: string;
    }>(
      `SELECT ordered_listing_ids, ordered_unit_keys, projection_epoch,
              unit_identity_epoch_floor, snapshot_version
       FROM query_snapshots
       WHERE id = 'phase04-snapshot-schema'`
    );

    expect(rows[0]).toMatchObject({
      ordered_listing_ids: ["inv-1", "inv-2"],
      ordered_unit_keys: ["unit-1:1", "unit-2:1"],
      projection_epoch: 7,
      unit_identity_epoch_floor: 1,
      snapshot_version: "phase04-unit-v1",
    });
  });
});
