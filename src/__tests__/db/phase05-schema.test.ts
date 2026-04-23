/**
 * @jest-environment node
 *
 * Phase 05 schema coverage for contact attempts and phone reveal audit paths.
 */

import {
  createPGlitePhase05Fixture,
  type Phase05Fixture,
} from "@/__tests__/utils/pglite-phase05";

let fixture: Phase05Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase05Fixture();
}, 30_000);

afterAll(async () => {
  await fixture.close();
});

describe("Phase 05 privacy/contact schema", () => {
  it("creates durable contact_attempts with idempotency and lookup indexes", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'contact_attempts'`
    );
    const names = columns.map((row) => row.column_name);

    expect(names).toEqual(
      expect.arrayContaining([
        "user_id",
        "listing_id",
        "unit_id",
        "unit_identity_epoch_observed",
        "unit_identity_epoch_resolved",
        "contact_kind",
        "outcome",
        "client_idempotency_key",
        "conversation_id",
        "reason_code",
      ])
    );

    const indexes = await fixture.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'contact_attempts'`
    );
    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "contact_attempts_user_idempotency_kind_idx",
        "contact_attempts_listing_created_at_idx",
        "contact_attempts_user_kind_created_at_idx",
      ])
    );
  });

  it("creates host contact channels for revealable phone metadata", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'host_contact_channels'`
    );
    const names = columns.map((row) => row.column_name);

    expect(names).toEqual(
      expect.arrayContaining([
        "host_user_id",
        "phone_e164_ciphertext",
        "phone_e164_last4",
        "phone_reveal_enabled",
        "verified_at",
      ])
    );
  });

  it("creates phone_reveal_audits with idempotency and audit lookup indexes", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'phone_reveal_audits'`
    );
    const names = columns.map((row) => row.column_name);

    expect(names).toEqual(
      expect.arrayContaining([
        "user_id",
        "listing_id",
        "unit_id",
        "unit_identity_epoch",
        "host_user_id",
        "outcome",
        "reason_code",
        "client_idempotency_key",
      ])
    );

    const indexes = await fixture.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'phone_reveal_audits'`
    );
    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "phone_reveal_audits_user_listing_idempotency_idx",
        "phone_reveal_audits_listing_created_at_idx",
        "phone_reveal_audits_user_created_at_idx",
      ])
    );
  });

  it("stores idempotent contact attempts and phone reveal audits", async () => {
    await fixture.query(
      `INSERT INTO contact_attempts (
         id, user_id, listing_id, unit_id, unit_identity_epoch_observed,
         unit_identity_epoch_resolved, contact_kind, outcome,
         client_idempotency_key, conversation_id, reason_code
       ) VALUES (
         'attempt-1', 'renter-1', 'listing-1', 'unit-1', 1,
         1, 'MESSAGE_START', 'SUCCEEDED',
         'idem-1', 'conv-1', NULL
       )`
    );

    await fixture.query(
      `INSERT INTO phone_reveal_audits (
         id, user_id, listing_id, unit_id, unit_identity_epoch,
         host_user_id, outcome, reason_code, client_idempotency_key
       ) VALUES (
         'reveal-audit-1', 'renter-1', 'listing-1', 'unit-1', 1,
         'host-1', 'DENIED', 'NO_REVEALABLE_PHONE', 'reveal-idem-1'
       )`
    );

    const attempts = await fixture.query<{ outcome: string }>(
      `SELECT outcome FROM contact_attempts WHERE id = 'attempt-1'`
    );
    const audits = await fixture.query<{ reason_code: string }>(
      `SELECT reason_code FROM phone_reveal_audits WHERE id = 'reveal-audit-1'`
    );

    expect(attempts[0]?.outcome).toBe("SUCCEEDED");
    expect(audits[0]?.reason_code).toBe("NO_REVEALABLE_PHONE");
  });
});
