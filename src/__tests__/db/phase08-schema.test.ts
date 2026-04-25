/**
 * @jest-environment node
 *
 * Phase 08 schema coverage for public cache fanout and Web Push storage.
 */

import {
  createPGlitePhase08Fixture,
  type Phase08Fixture,
} from "@/__tests__/utils/pglite-phase08";

let fixture: Phase08Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase08Fixture();
}, 30_000);

afterAll(async () => {
  await fixture?.close();
});

describe("Phase 08 client cache coherence schema", () => {
  it("adds fanout metadata to existing cache invalidation rows", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'cache_invalidations'`
    );

    expect(columns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        "fanout_status",
        "fanout_attempt_count",
        "fanout_next_attempt_at",
        "fanout_last_attempt_at",
        "fanout_completed_at",
        "fanout_last_error",
      ])
    );

    await fixture.query(
      `INSERT INTO cache_invalidations (
         id, unit_id, projection_epoch, unit_identity_epoch, reason
       ) VALUES (
         'cache-phase08-default', 'unit-phase08', 8, 2, 'TOMBSTONE'
       )`
    );

    const rows = await fixture.query<{
      fanout_status: string;
      fanout_attempt_count: number;
      fanout_next_attempt_at: Date | string | null;
    }>(
      `SELECT fanout_status, fanout_attempt_count, fanout_next_attempt_at
       FROM cache_invalidations
       WHERE id = 'cache-phase08-default'`
    );

    expect(rows).toEqual([
      {
        fanout_status: "PENDING",
        fanout_attempt_count: 0,
        fanout_next_attempt_at: expect.anything(),
      },
    ]);

    await expect(
      fixture.query(
        `INSERT INTO cache_invalidations (
           id, unit_id, projection_epoch, unit_identity_epoch, reason, fanout_status
         ) VALUES (
           'cache-phase08-bad-status', 'unit-phase08', 8, 2, 'TOMBSTONE', 'RAW_ENDPOINT'
         )`
      )
    ).rejects.toThrow();
  });

  it("creates fanout indexes for bounded push-worker claims", async () => {
    const indexes = await fixture.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'cache_invalidations'`
    );

    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "cache_invalidations_fanout_status_next_idx",
        "cache_invalidations_fanout_attempt_idx",
      ])
    );
  });

  it("stores push subscriptions by encrypted payload and unique endpoint hash", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'public_cache_push_subscriptions'`
    );

    expect(columns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        "endpoint_hash",
        "subscription_ciphertext",
        "subscription_ciphertext_version",
        "active",
        "last_seen_at",
        "last_delivered_at",
        "last_failed_at",
      ])
    );

    const indexes = await fixture.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE tablename = 'public_cache_push_subscriptions'`
    );

    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "public_cache_push_subscriptions_endpoint_hash_key",
        "public_cache_push_subscriptions_active_seen_idx",
        "public_cache_push_subscriptions_user_active_idx",
      ])
    );

    await fixture.insertUser("phase08-user");
    await fixture.query(
      `INSERT INTO public_cache_push_subscriptions (
         id, user_id, endpoint_hash, subscription_ciphertext
       ) VALUES (
         'push-sub-1', 'phase08-user', 'hash-1', 'encrypted-json'
       )`
    );

    await expect(
      fixture.query(
        `INSERT INTO public_cache_push_subscriptions (
           id, user_id, endpoint_hash, subscription_ciphertext
         ) VALUES (
           'push-sub-duplicate', 'phase08-user', 'hash-1', 'encrypted-json-2'
         )`
      )
    ).rejects.toThrow();
  });
});
