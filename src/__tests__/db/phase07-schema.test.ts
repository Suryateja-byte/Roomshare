/**
 * @jest-environment node
 *
 * Phase 07 schema coverage for saved-search alert durability and revalidation.
 */

import {
  createPGlitePhase07Fixture,
  type Phase07Fixture,
} from "@/__tests__/utils/pglite-phase07";

let fixture: Phase07Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase07Fixture();
}, 30_000);

afterAll(async () => {
  await fixture?.close();
});

describe("Phase 07 saved-search alerts schema", () => {
  it("adds canonical metadata columns to legacy SavedSearch rows", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'SavedSearch'`
    );

    expect(columns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        "search_spec_json",
        "search_spec_hash",
        "embedding_version_at_save",
        "ranker_profile_version_at_save",
        "unit_identity_epoch_floor",
        "active",
      ])
    );

    await fixture.insertUser("phase07-user");
    await fixture.query(
      `INSERT INTO "SavedSearch" (
         id, "userId", name, filters, "alertEnabled", "alertFrequency", "createdAt"
       ) VALUES (
         'legacy-search', 'phase07-user', 'Legacy', '{}'::jsonb, true, 'DAILY', NOW()
       )`
    );

    const rows = await fixture.query<{
      id: string;
      active: boolean;
      search_spec_hash: string | null;
    }>(`SELECT id, active, search_spec_hash FROM "SavedSearch" WHERE id = 'legacy-search'`);

    expect(rows).toEqual([
      {
        id: "legacy-search",
        active: true,
        search_spec_hash: null,
      },
    ]);
  });

  it("creates alert subscription table with EMAIL channel and scheduling indexes", async () => {
    const tables = await fixture.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_name = 'alert_subscriptions'`
    );
    expect(tables.map((row) => row.table_name)).toEqual([
      "alert_subscriptions",
    ]);

    const indexes = await fixture.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'alert_subscriptions'`
    );
    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "alert_subscriptions_saved_search_channel_key",
        "alert_subscriptions_active_channel_frequency_last_idx",
        "alert_subscriptions_user_active_idx",
      ])
    );

    await fixture.query(
      `INSERT INTO alert_subscriptions (
         id, saved_search_id, user_id, channel, frequency, active
       ) VALUES (
         'sub-email', 'legacy-search', 'phase07-user', 'EMAIL', 'DAILY', true
       )`
    );

    await expect(
      fixture.query(
        `INSERT INTO alert_subscriptions (
           id, saved_search_id, user_id, channel, frequency, active
         ) VALUES (
           'sub-sms', 'legacy-search', 'phase07-user', 'SMS', 'DAILY', true
         )`
      )
    ).rejects.toThrow();
  });

  it("creates idempotent alert delivery table with status and drop-reason constraints", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'alert_deliveries'`
    );

    expect(columns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        "idempotency_key",
        "target_listing_id",
        "target_unit_id",
        "target_inventory_id",
        "target_unit_identity_epoch",
        "query_hash",
        "embedding_version",
        "ranker_profile_version",
        "projection_epoch",
        "drop_reason",
        "expires_at",
      ])
    );

    const indexes = await fixture.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'alert_deliveries'`
    );
    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "alert_deliveries_idempotency_key_key",
        "alert_deliveries_status_scheduled_idx",
        "alert_deliveries_target_status_idx",
      ])
    );

    await fixture.query(
      `INSERT INTO alert_deliveries (
         id, subscription_id, saved_search_id, user_id, delivery_kind,
         status, idempotency_key, target_listing_id, new_listings_count
       ) VALUES (
         'delivery-ok', 'sub-email', 'legacy-search', 'phase07-user',
         'SCHEDULED', 'DROPPED', 'idem-ok', 'listing-1', 1
       )`
    );

    await expect(
      fixture.query(
        `INSERT INTO alert_deliveries (
           id, subscription_id, saved_search_id, user_id, delivery_kind,
           status, drop_reason, idempotency_key
         ) VALUES (
           'delivery-bad-status', 'sub-email', 'legacy-search', 'phase07-user',
           'SCHEDULED', 'SENT', NULL, 'idem-bad-status'
         )`
      )
    ).rejects.toThrow();

    await expect(
      fixture.query(
        `INSERT INTO alert_deliveries (
           id, subscription_id, saved_search_id, user_id, delivery_kind,
           status, drop_reason, idempotency_key
         ) VALUES (
           'delivery-bad-reason', 'sub-email', 'legacy-search', 'phase07-user',
           'SCHEDULED', 'DROPPED', 'BOGUS', 'idem-bad-reason'
         )`
      )
    ).rejects.toThrow();
  });
});
