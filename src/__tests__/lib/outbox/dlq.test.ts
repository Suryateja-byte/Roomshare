/**
 * @jest-environment node
 *
 * Tests for src/lib/outbox/dlq.ts
 * Uses PGlite Phase 02 fixture.
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

async function seedOutboxEvent(): Promise<string> {
  const id = await fixture.seedOutboxEvent({
    kind: "INVENTORY_UPSERTED",
    status: "IN_FLIGHT",
    priority: 100,
  });
  return id;
}

describe("routeToDlq()", () => {
  it("sets outbox event status to DLQ", async () => {
    const id = await seedOutboxEvent();

    await withTx((tx) => routeToDlq(tx, id, "MAX_ATTEMPTS_EXHAUSTED", "too many retries"));

    const rows = await fixture.query(
      `SELECT status, dlq_reason, last_error FROM outbox_events WHERE id = '${id}'`
    );
    expect(rows[0].status).toBe("DLQ");
  });

  it("records the dlq_reason", async () => {
    const id = await seedOutboxEvent();

    await withTx((tx) => routeToDlq(tx, id, "GEOCODE_EXHAUSTED", "geocode failed"));

    const rows = await fixture.query(
      `SELECT dlq_reason FROM outbox_events WHERE id = '${id}'`
    );
    expect(rows[0].dlq_reason).toBe("GEOCODE_EXHAUSTED");
  });

  it("records the lastError message", async () => {
    const id = await seedOutboxEvent();
    const errorMsg = "Connection refused after 8 attempts";

    await withTx((tx) => routeToDlq(tx, id, "MAX_ATTEMPTS_EXHAUSTED", errorMsg));

    const rows = await fixture.query(
      `SELECT last_error FROM outbox_events WHERE id = '${id}'`
    );
    expect(rows[0].last_error).toBe(errorMsg);
  });

  it("handles different reason codes without error", async () => {
    const reasons = [
      "MAX_ATTEMPTS_EXHAUSTED",
      "GEOCODE_EXHAUSTED",
      "UNKNOWN_KIND",
      "FATAL_ERROR",
    ];

    for (const reason of reasons) {
      const id = await seedOutboxEvent();
      await expect(
        withTx((tx) => routeToDlq(tx, id, reason, "some error"))
      ).resolves.not.toThrow();
    }
  });
});
