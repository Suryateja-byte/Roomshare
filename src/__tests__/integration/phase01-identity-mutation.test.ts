/**
 * @jest-environment node
 */
/**
 * AC#6 — recordIdentityMutation writes ledger + outbox + audit in one transaction,
 *         and real transaction rollback discards all three on failure.
 */

import { recordIdentityMutation } from "@/lib/identity/mutate-unit";
import {
  createPGliteFixture,
  type PGliteFixture,
} from "@/__tests__/utils/pglite-phase01";

describe("Phase 01 identity mutation integration (PGlite)", () => {
  let fixture: PGliteFixture;

  beforeAll(async () => {
    fixture = await createPGliteFixture();
    await fixture.insertUser("moderator-1");
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("AC#6: rolls back the ledger row and outbox when a failure happens after the INSERT", async () => {
    const sourceUnitId = await fixture.insertPhysicalUnit({
      id: "unit-merge-a",
      canonicalAddressHash: "hash-merge-a",
      unitIdentityEpoch: 2,
    });
    const targetUnitId = await fixture.insertPhysicalUnit({
      id: "unit-merge-target",
      canonicalAddressHash: "hash-merge-target",
      unitIdentityEpoch: 4,
    });

    const unitsBefore = await fixture.getPhysicalUnits();

    await expect(
      fixture.client.$transaction(async (tx: unknown) => {
        // Patch outboxEvent.create on this tx instance to throw after the
        // identity_mutations INSERT has already happened.
        const txObj = tx as Record<string, unknown>;
        const failingTx = {
          ...txObj,
          outboxEvent: {
            ...(txObj.outboxEvent as Record<string, unknown>),
            create: jest
              .fn()
              .mockRejectedValue(new Error("synthetic outbox failure")),
          },
        };

        await recordIdentityMutation(failingTx as never, {
          kind: "MERGE",
          fromUnitIds: [sourceUnitId],
          toUnitIds: [targetUnitId],
          reasonCode: "operator_duplicate",
          operatorId: "moderator-1",
        });
      })
    ).rejects.toThrow("synthetic outbox failure");

    // Everything rolled back — ledger, outbox, and audit are all empty.
    expect(await fixture.getIdentityMutations()).toEqual([]);
    expect(await fixture.getOutboxEvents()).toEqual([]);
    expect(await fixture.getAuditEvents()).toEqual([]);

    // Physical units unchanged.
    const unitsAfter = await fixture.getPhysicalUnits();
    expect(unitsAfter.map((u) => ({ id: u.id, unitIdentityEpoch: u.unitIdentityEpoch }))).toEqual(
      unitsBefore.map((u) => ({ id: u.id, unitIdentityEpoch: u.unitIdentityEpoch }))
    );
  });

  it("AC#6: supports SPLIT with multiple to_unit_ids and bumps all affected epochs", async () => {
    const sourceUnitId = await fixture.insertPhysicalUnit({
      id: "unit-split-source",
      canonicalAddressHash: "hash-split-source",
      unitIdentityEpoch: 5,
    });
    const targetUnitOneId = await fixture.insertPhysicalUnit({
      id: "unit-split-target-1",
      canonicalAddressHash: "hash-split-target-1",
      unitIdentityEpoch: 1,
      supersedesUnitIds: ["legacy-parent"],
    });
    const targetUnitTwoId = await fixture.insertPhysicalUnit({
      id: "unit-split-target-2",
      canonicalAddressHash: "hash-split-target-2",
      unitIdentityEpoch: 3,
    });

    const result = await fixture.client.$transaction((tx: unknown) =>
      recordIdentityMutation(tx as never, {
        kind: "SPLIT",
        fromUnitIds: [sourceUnitId],
        toUnitIds: [targetUnitOneId, targetUnitTwoId],
        reasonCode: "operator_split",
        operatorId: "moderator-1",
      })
    );

    expect(result.affectedUnitIds).toEqual(
      expect.arrayContaining([sourceUnitId, targetUnitOneId, targetUnitTwoId])
    );
    expect(result.affectedUnitIds).toHaveLength(3);

    // Scope by mutationId to avoid conflicts with other tests sharing the fixture.
    const mutations = await fixture.query<{
      id: string;
      kind: string;
      from_unit_ids: string[];
      to_unit_ids: string[];
      resulting_epoch: number;
    }>(
      `SELECT id, kind, from_unit_ids, to_unit_ids, resulting_epoch
       FROM identity_mutations WHERE id = $1`,
      [result.mutationId]
    );
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      kind: "SPLIT",
      from_unit_ids: [sourceUnitId],
      to_unit_ids: [targetUnitOneId, targetUnitTwoId],
      resulting_epoch: 6,
    });

    const outbox = await fixture.query<{
      kind: string;
      priority: number;
      unit_identity_epoch: number;
    }>(
      `SELECT kind, priority, unit_identity_epoch
       FROM outbox_events WHERE aggregate_id = $1`,
      [result.mutationId]
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      kind: "IDENTITY_MUTATION",
      priority: 0,
      unit_identity_epoch: 6,
    });

    const units = await fixture.getPhysicalUnits();
    const byId = Object.fromEntries(units.map((u) => [u.id, u]));

    expect(byId[sourceUnitId].unitIdentityEpoch).toBe(6);
    expect(byId[targetUnitOneId].unitIdentityEpoch).toBe(6);
    expect(byId[targetUnitOneId].supersedesUnitIds).toEqual(
      expect.arrayContaining(["legacy-parent", sourceUnitId])
    );
    expect(byId[targetUnitTwoId].unitIdentityEpoch).toBe(6);
    expect(byId[targetUnitTwoId].supersedesUnitIds).toEqual(
      expect.arrayContaining([sourceUnitId])
    );
  });

  it("AC#6: supports CANONICALIZER_UPGRADE with null operator_id and writes priority 0", async () => {
    const unitId = await fixture.insertPhysicalUnit({
      id: "unit-upgrade",
      canonicalAddressHash: "hash-upgrade",
      unitIdentityEpoch: 7,
    });

    const result = await fixture.client.$transaction((tx: unknown) =>
      recordIdentityMutation(tx as never, {
        kind: "CANONICALIZER_UPGRADE",
        fromUnitIds: [unitId],
        toUnitIds: [unitId],
        reasonCode: "canonicalizer_upgrade",
        operatorId: null,
      })
    );

    expect(result.resultingEpoch).toBe(8);

    const mutations = await fixture.getIdentityMutations();
    const upgrade = mutations.find((m) => m.kind === "CANONICALIZER_UPGRADE");
    expect(upgrade).toBeDefined();
    expect(upgrade!.operatorId).toBeNull();
    expect(upgrade!.resultingEpoch).toBe(8);

    // Scope outbox lookup by the specific mutationId returned.
    const outbox = await fixture.query<{ priority: number }>(
      `SELECT priority FROM outbox_events WHERE aggregate_id = $1`,
      [result.mutationId]
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0].priority).toBe(0);

    // Scope audit lookup by the specific mutationId returned.
    const audit = await fixture.query<{ actor_role: string; actor_id: string | null }>(
      `SELECT actor_role, actor_id FROM audit_events
       WHERE aggregate_id = $1 AND kind = 'IDENTITY_MUTATION'`,
      [result.mutationId]
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_role).toBe("system");
    expect(audit[0].actor_id).toBeNull();
  });
});
