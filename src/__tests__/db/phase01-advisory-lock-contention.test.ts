/**
 * @jest-environment node
 */
/**
 * AC#5 — advisory lock + upsert uniqueness invariant.
 *
 * Ten concurrent callers all invoke resolveOrCreateUnit with the same address.
 * The uniqueness constraint on physical_units(canonical_address_hash, canonical_unit)
 * plus ON CONFLICT upsert guarantees exactly 1 created row.
 *
 * PGlite is single-connection per instance.  pg_advisory_xact_lock therefore
 * serializes within the engine — this test proves the uniqueness invariant but
 * cannot model true lock *contention* across concurrent connections.
 * That limitation is documented; a Postgres testcontainer would be required for
 * full concurrency fidelity (deferred per v2-review.json §deferred).
 */

import { withActor } from "@/lib/db/with-actor";
import { resolveOrCreateUnit } from "@/lib/identity/resolve-or-create-unit";
import {
  createPGliteFixture,
  type PGliteFixture,
} from "@/__tests__/utils/pglite-phase01";

describe("Phase 01 advisory-lock contention (PGlite)", () => {
  let fixture: PGliteFixture;

  beforeAll(async () => {
    fixture = await createPGliteFixture();
    await fixture.insertUser("host-lock-1");
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("AC#5: 10 parallel callers converge on one physical_units row and 9 resolve existing", async () => {
    const actor = { role: "host" as const, id: "host-lock-1" };
    const address = {
      address: "123 Main St Apt 4B",
      city: "San Francisco",
      state: "CA",
      zip: "94107",
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        withActor(
          actor,
          async (tx) =>
            resolveOrCreateUnit(tx as never, {
              actor,
              address,
              requestId: `req-${index}`,
            }),
          { client: fixture.client as never }
        )
      )
    );

    // All 10 calls succeeded.
    expect(results).toHaveLength(10);

    // Exactly one insertion; nine resolutions.
    const created = results.filter((r) => r.created);
    const resolved = results.filter((r) => !r.created);
    expect(created).toHaveLength(1);
    expect(resolved).toHaveLength(9);

    // Exactly one physical_units row in the DB.
    const units = await fixture.getPhysicalUnits();
    expect(units).toHaveLength(1);

    // All calls reference the same unit id.
    const unitIds = new Set(results.map((r) => r.unitId));
    expect(unitIds.size).toBe(1);

    // source_version must equal 10 (1 insert + 9 updates, each incrementing by 1).
    expect(units[0].sourceVersion).toBe(BigInt(10));
  });

  it("AC#5: advisory lock SQL reaches pg_advisory_xact_lock(hashtext(key)) without error", async () => {
    // Directly exercise acquireXactLock to confirm the SQL emitted is accepted by PGlite.
    await fixture.client.$transaction(async (tx: unknown) => {
      // acquireXactLock calls tx.$executeRawUnsafe + tx.$executeRaw
      const { acquireXactLock, canonicalUnitLockKey } = await import(
        "@/lib/identity/advisory-locks"
      );
      await acquireXactLock(
        tx as never,
        canonicalUnitLockKey("test-hash-for-lock")
      );
    });
    // If we reach here the lock was acquired without error.
  });
});
