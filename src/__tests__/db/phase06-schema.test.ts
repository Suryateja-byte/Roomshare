/**
 * @jest-environment node
 *
 * Phase 06 schema coverage for monetization, Stripe, and entitlement hardening.
 */

import {
  createPGlitePhase06Fixture,
  type Phase06Fixture,
} from "@/__tests__/utils/pglite-phase06";

let fixture: Phase06Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase06Fixture();
}, 30_000);

afterAll(async () => {
  await fixture.close();
});

describe("Phase 06 monetization schema", () => {
  it("adds REVEAL_PHONE and host-bounce restoration enum values", async () => {
    const contactKinds = await fixture.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'ContactKind'
       ORDER BY enumsortorder`
    );
    expect(contactKinds.map((row) => row.enumlabel)).toEqual(
      expect.arrayContaining(["MESSAGE_START", "REVEAL_PHONE"])
    );

    const restorationStates = await fixture.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'ContactRestorationState'`
    );
    expect(restorationStates.map((row) => row.enumlabel)).toContain(
      "RESTORED_HOST_BOUNCE"
    );
  });

  it("extends stripe_events for async processing and livemode isolation", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'stripe_events'`
    );
    expect(columns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        "livemode",
        "signature_verified",
        "processing_status",
        "attempt_count",
        "next_attempt_at",
        "last_error",
        "processed_by",
      ])
    );

    const indexes = await fixture.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'stripe_events'`
    );
    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "stripe_events_processing_idx",
        "stripe_events_livemode_type_idx",
      ])
    );
  });

  it("adds grant deltas, fraud fields, and abuse/refund/audit queue tables", async () => {
    const grantColumns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'entitlement_grants'`
    );
    expect(grantColumns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        "original_credit_count",
        "window_start_delta",
        "window_end_delta",
        "source_refund_id",
        "idempotency_key",
      ])
    );

    const paymentColumns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'payments'`
    );
    expect(paymentColumns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        "stripe_customer_id",
        "livemode",
        "fraud_flag",
        "auto_refund_status",
        "origin_stripe_event_id",
      ])
    );

    const tables = await fixture.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_name IN (
         'payment_abuse_signals',
         'refund_queue_items',
         'fraud_audit_jobs'
       )`
    );
    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "payment_abuse_signals",
        "refund_queue_items",
        "fraud_audit_jobs",
      ])
    );
  });

  it("allows separate consumption records per unit epoch for message and reveal", async () => {
    await fixture.query(
      `INSERT INTO contact_consumption (
         id, user_id, listing_id, unit_id, unit_identity_epoch,
         contact_kind, source, client_idempotency_key, consumed_credit_from
       ) VALUES
         ('consume-message', 'user-1', 'listing-1', 'unit-1', 1,
          'MESSAGE_START', 'FREE', 'idem-message', 'FREE'),
         ('consume-reveal', 'user-1', 'listing-1', 'unit-1', 1,
          'REVEAL_PHONE', 'FREE', 'idem-reveal', 'FREE')`
    );

    const rows = await fixture.query<{ contact_kind: string }>(
      `SELECT contact_kind
       FROM contact_consumption
       WHERE user_id = 'user-1'
       ORDER BY contact_kind`
    );
    expect(rows.map((row) => row.contact_kind)).toEqual([
      "MESSAGE_START",
      "REVEAL_PHONE",
    ]);
  });
});
