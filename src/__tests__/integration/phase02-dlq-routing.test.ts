/**
 * @jest-environment node
 *
 * AC 9: DLQ routing — events that exceed MAX_ATTEMPTS or have fatal errors
 * are routed to DLQ status with a dlqReason.
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { routeToDlq } from "@/lib/outbox/dlq";
import type { TransactionClient } from "@/lib/db/with-actor";

let fixture: Phase02Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase02Fixture();
}, 30_000);

afterAll(async () => {
  await fixture.close();
});

async function withTx<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return fixture.client.$transaction((tx) => fn(tx as unknown as TransactionClient));
}

async function seedPendingEvent(kind = "INVENTORY_UPSERTED"): Promise<string> {
  return fixture.seedOutboxEvent({ kind, status: "IN_FLIGHT" });
}

describe("AC 9: DLQ routing", () => {
  it("routes event to DLQ with MAX_ATTEMPTS_EXHAUSTED reason", async () => {
    const id = await seedPendingEvent();
    await withTx((tx) => routeToDlq(tx, id, "MAX_ATTEMPTS_EXHAUSTED", "too many retries"));

    const rows = await fixture.query(
      `SELECT status, dlq_reason FROM outbox_events WHERE id = '${id}'`
    );
    expect(rows[0].status).toBe("DLQ");
    expect(rows[0].dlq_reason).toBe("MAX_ATTEMPTS_EXHAUSTED");
  });

  it("routes geocode-exhausted event to DLQ", async () => {
    const id = await seedPendingEvent("GEOCODE_NEEDED");
    await withTx((tx) => routeToDlq(tx, id, "GEOCODE_EXHAUSTED", "geocode failed 8 times"));

    const rows = await fixture.query(
      `SELECT status, dlq_reason, last_error FROM outbox_events WHERE id = '${id}'`
    );
    expect(rows[0].status).toBe("DLQ");
    expect(rows[0].dlq_reason).toBe("GEOCODE_EXHAUSTED");
    expect(rows[0].last_error).toBe("geocode failed 8 times");
  });

  it("DLQ row is preserved (not deleted) for operator inspection", async () => {
    const id = await seedPendingEvent();
    await withTx((tx) => routeToDlq(tx, id, "FATAL_ERROR", "unrecoverable"));

    const rows = await fixture.query(
      `SELECT id, status FROM outbox_events WHERE id = '${id}'`
    );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("DLQ");
  });

  it("routes multiple events to DLQ independently", async () => {
    const ids = await Promise.all([
      seedPendingEvent("INVENTORY_UPSERTED"),
      seedPendingEvent("GEOCODE_NEEDED"),
      seedPendingEvent("TOMBSTONE"),
    ]);

    for (const id of ids) {
      await withTx((tx) => routeToDlq(tx, id, "MAX_ATTEMPTS_EXHAUSTED", "retry limit"));
    }

    const rows = await fixture.query(
      `SELECT id, status FROM outbox_events WHERE status = 'DLQ' AND id = ANY($1)`,
      [ids]
    );
    expect(rows.length).toBe(3);
  });
});
