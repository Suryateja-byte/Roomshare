/**
 * @jest-environment node
 */
/**
 * AC#3 — plpgsql trigger enforce_moderation_precedence() fires with real
 *         ERRCODE='P0001' and HINT='moderation'.
 *
 * Tests run against a real PGlite instance so the actual plpgsql function body,
 * RAISE EXCEPTION ... ERRCODE / HINT, and isModerationLockedError(hint path) are
 * all exercised end-to-end.
 */

import { withActor } from "@/lib/db/with-actor";
import { ModerationLockedError } from "@/lib/identity/errors";
import {
  createPGliteFixture,
  hostActor,
  moderatorActor,
  type PGliteFixture,
} from "@/__tests__/utils/pglite-phase01";

describe("Phase 01 moderation-precedence and append-only triggers (PGlite)", () => {
  let fixture: PGliteFixture;
  let physicalUnitId: string;
  let claimId: string;
  let inventoryId: string;

  beforeAll(async () => {
    fixture = await createPGliteFixture();
    await fixture.insertUser("host-1");
    await fixture.insertUser("moderator-1");
  });

  beforeEach(async () => {
    physicalUnitId = await fixture.insertPhysicalUnit({
      canonicalAddressHash: `hash-mod-${Date.now()}-${Math.random()}`,
    });
    claimId = await fixture.insertHostUnitClaim({
      unitId: physicalUnitId,
      hostUserId: "host-1",
    });
    inventoryId = await fixture.insertListingInventory({
      unitId: physicalUnitId,
      canonicalAddressHash: "hash-mod",
      roomCategory: "PRIVATE_ROOM",
      capacityGuests: 1,
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  // -------------------------------------------------------------------------
  // AC#3a — trigger fires; ModerationLockedError is thrown via message path
  // -------------------------------------------------------------------------

  it.each([
    ["publish_status", "PUBLISHED"],
    ["lifecycle_status", "PAUSED"],
    ["privacy_version", 2],
  ])(
    "AC#3: host role cannot update %s on physical_units (ModerationLockedError thrown)",
    async (column, value) => {
      await expect(
        withActor(
          hostActor(),
          async (tx) => {
            await (tx as never as { physicalUnit: { update: (a: unknown) => Promise<void> } }).physicalUnit.update({
              where: { id: physicalUnitId },
              data: { [column]: value },
            });
          },
          { client: fixture.client as never }
        )
      ).rejects.toBeInstanceOf(ModerationLockedError);

      // Row must be unchanged — trigger rolled back the write.
      const rows = await fixture.query<{
        publish_status: string;
        lifecycle_status: string;
        privacy_version: number;
      }>(
        `SELECT publish_status, lifecycle_status, privacy_version
         FROM physical_units WHERE id = $1`,
        [physicalUnitId]
      );
      expect(rows[0]).toEqual({
        publish_status: "DRAFT",
        lifecycle_status: "ACTIVE",
        privacy_version: 1,
      });
    }
  );

  // -------------------------------------------------------------------------
  // AC#3b — HINT='moderation' path in isModerationLockedError is exercised
  // -------------------------------------------------------------------------

  it("AC#3: trigger error carries HINT=moderation and P0001 error code", async () => {
    let caughtError: unknown;

    // Reach directly into PGlite to capture the raw error before withActor wraps it.
    await (fixture.pg as unknown as {
      transaction: (fn: (tx: {
        query: (sql: string, params: unknown[]) => Promise<void>;
      }) => Promise<void>) => Promise<void>;
    }).transaction(async (tx) => {
      await tx.query("SELECT set_config($1, $2, true)", ["app.actor_role", "host"]);
      try {
        await tx.query(
          `UPDATE physical_units SET publish_status = 'PUBLISHED' WHERE id = $1`,
          [physicalUnitId]
        );
      } catch (err) {
        caughtError = err;
      }
    }).catch(() => {
      // transaction rollback is expected — the important thing is caughtError was set
    });

    expect(caughtError).toBeDefined();
    const e = caughtError as { code?: string; hint?: string; message?: string };
    expect(e.code).toBe("P0001");
    expect(e.hint).toBe("moderation");
    expect(e.message).toContain("MODERATION_LOCKED");
  });

  // -------------------------------------------------------------------------
  // AC#3c — moderator and system roles are allowed
  // -------------------------------------------------------------------------

  it("AC#3: moderator role can update publish_status on all three canonical tables", async () => {
    await withActor(
      moderatorActor(),
      async (tx) => {
        const client = tx as never as {
          physicalUnit: { update: (a: unknown) => Promise<void> };
          hostUnitClaim: { update: (a: unknown) => Promise<void> };
          listingInventory: { update: (a: unknown) => Promise<void> };
        };
        await client.physicalUnit.update({
          where: { id: physicalUnitId },
          data: { publish_status: "PUBLISHED" },
        });
        await client.hostUnitClaim.update({
          where: { id: claimId },
          data: { publish_status: "PUBLISHED" },
        });
        await client.listingInventory.update({
          where: { id: inventoryId },
          data: { publish_status: "PUBLISHED" },
        });
      },
      { client: fixture.client as never }
    );

    const puRows = await fixture.query<{ publish_status: string }>(
      `SELECT publish_status FROM physical_units WHERE id = $1`,
      [physicalUnitId]
    );
    expect(puRows[0].publish_status).toBe("PUBLISHED");

    const hucRows = await fixture.query<{ publish_status: string }>(
      `SELECT publish_status FROM host_unit_claims WHERE id = $1`,
      [claimId]
    );
    expect(hucRows[0].publish_status).toBe("PUBLISHED");

    const liRows = await fixture.query<{ publish_status: string }>(
      `SELECT publish_status FROM listing_inventories WHERE id = $1`,
      [inventoryId]
    );
    expect(liRows[0].publish_status).toBe("PUBLISHED");
  });

  it("AC#3: missing actor_role defaults to system and passes moderation guard", async () => {
    // No set_config call — current_setting returns '' which trigger treats as 'system'.
    await fixture.client.$transaction(async (tx: unknown) => {
      const client = tx as never as {
        physicalUnit: { update: (a: unknown) => Promise<void> };
      };
      await client.physicalUnit.update({
        where: { id: physicalUnitId },
        data: { publish_status: "PUBLISHED" },
      });
    });

    const rows = await fixture.query<{ publish_status: string }>(
      `SELECT publish_status FROM physical_units WHERE id = $1`,
      [physicalUnitId]
    );
    expect(rows[0].publish_status).toBe("PUBLISHED");
  });

  it("AC#3: trigger applies to host_unit_claims for host-role updates", async () => {
    await expect(
      withActor(
        hostActor(),
        async (tx) => {
          const client = tx as never as {
            hostUnitClaim: { update: (a: unknown) => Promise<void> };
          };
          await client.hostUnitClaim.update({
            where: { id: claimId },
            data: { publish_status: "PUBLISHED" },
          });
        },
        { client: fixture.client as never }
      )
    ).rejects.toBeInstanceOf(ModerationLockedError);
  });

  it("AC#3: trigger applies to listing_inventories for host-role updates", async () => {
    await expect(
      withActor(
        hostActor(),
        async (tx) => {
          const client = tx as never as {
            listingInventory: { update: (a: unknown) => Promise<void> };
          };
          await client.listingInventory.update({
            where: { id: inventoryId },
            data: { publish_status: "PUBLISHED" },
          });
        },
        { client: fixture.client as never }
      )
    ).rejects.toBeInstanceOf(ModerationLockedError);
  });

  // -------------------------------------------------------------------------
  // AC#3d — forbid_update_delete trigger for append-only tables
  // -------------------------------------------------------------------------

  it("AC#3: identity_mutations rejects UPDATE (forbid_update_delete trigger)", async () => {
    const mutId = await fixture.insertIdentityMutation({
      fromUnitIds: [physicalUnitId],
      toUnitIds: [physicalUnitId],
    });

    await expect(
      fixture.pg.query(
        `UPDATE identity_mutations SET reason_code = 'manual_moderation' WHERE id = $1`,
        [mutId]
      )
    ).rejects.toThrow(/append-only/i);
  });

  it("AC#3: identity_mutations rejects DELETE (forbid_update_delete trigger)", async () => {
    const mutId = await fixture.insertIdentityMutation({
      fromUnitIds: [physicalUnitId],
      toUnitIds: [physicalUnitId],
    });

    await expect(
      fixture.pg.query(
        `DELETE FROM identity_mutations WHERE id = $1`,
        [mutId]
      )
    ).rejects.toThrow(/append-only/i);
  });

  it("AC#3: audit_events rejects UPDATE (forbid_update_delete trigger)", async () => {
    const auditId = await fixture.insertAuditEvent({});

    await expect(
      fixture.pg.query(
        `UPDATE audit_events SET kind = 'CANONICAL_UNIT_CREATED' WHERE id = $1`,
        [auditId]
      )
    ).rejects.toThrow(/append-only/i);
  });

  it("AC#3: audit_events rejects DELETE (forbid_update_delete trigger)", async () => {
    const auditId = await fixture.insertAuditEvent({});

    await expect(
      fixture.pg.query(`DELETE FROM audit_events WHERE id = $1`, [auditId])
    ).rejects.toThrow(/append-only/i);
  });
});
