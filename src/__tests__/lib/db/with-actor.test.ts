/**
 * @jest-environment node
 */

import { ModerationLockedError } from "@/lib/identity/errors";
import { withActor } from "@/lib/db/with-actor";
import {
  createPGliteFixture,
  hostActor,
  type PGliteFixture,
} from "@/__tests__/utils/pglite-phase01";

// ---------------------------------------------------------------------------
// Unit tests — mock $transaction (no PGlite required)
// ---------------------------------------------------------------------------

/** Build a minimal mock client whose $transaction just calls fn with a stub tx. */
function makeMockClient(throwInTx?: unknown) {
  const stubTx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
  };

  return {
    $transaction: jest.fn(async (fn: (tx: typeof stubTx) => Promise<unknown>) => {
      if (throwInTx !== undefined) {
        throw throwInTx;
      }
      return fn(stubTx);
    }),
  };
}

describe("withActor — unit (mock client)", () => {
  it("re-throws non-object errors (e.g. strings) without wrapping", async () => {
    // Covers isModerationLockedError's early-return false branch (line 27):
    // `!error || typeof error !== "object"` → return false → error is re-thrown as-is.
    const client = makeMockClient("plain string error");

    await expect(
      withActor(hostActor(), async () => "ok", { client: client as never })
    ).rejects.toBe("plain string error");
  });

  it("wraps MODERATION_LOCKED:SUPPRESSED errors with reason=SUPPRESSED", async () => {
    // Covers moderationReasonFromError's SUPPRESSED branch (line 51).
    const err = Object.assign(new Error("MODERATION_LOCKED:SUPPRESSED"), {
      hint: "moderation",
    });
    const client = makeMockClient(err);

    const caught = await withActor(hostActor(), async () => "ok", {
      client: client as never,
    }).catch((e) => e);

    expect(caught).toBeInstanceOf(ModerationLockedError);
    expect((caught as ModerationLockedError).reason).toBe("SUPPRESSED");
  });

  it("wraps MODERATION_LOCKED:PAUSED errors with reason=PAUSED", async () => {
    // Covers moderationReasonFromError's PAUSED branch (line 54).
    const err = Object.assign(new Error("MODERATION_LOCKED:PAUSED"), {
      hint: "moderation",
    });
    const client = makeMockClient(err);

    const caught = await withActor(hostActor(), async () => "ok", {
      client: client as never,
    }).catch((e) => e);

    expect(caught).toBeInstanceOf(ModerationLockedError);
    expect((caught as ModerationLockedError).reason).toBe("PAUSED");
  });

  it("wraps MODERATION_LOCKED errors with reason=REVIEW when no specific reason in message", async () => {
    // Covers the REVIEW fallback in moderationReasonFromError.
    const err = Object.assign(new Error("MODERATION_LOCKED"), {
      hint: "moderation",
    });
    const client = makeMockClient(err);

    const caught = await withActor(hostActor(), async () => "ok", {
      client: client as never,
    }).catch((e) => e);

    expect(caught).toBeInstanceOf(ModerationLockedError);
    expect((caught as ModerationLockedError).reason).toBe("REVIEW");
  });

  it("accepts hint via meta.hint (Prisma production path)", async () => {
    // Covers the hint = candidate.meta?.hint path.
    const err = { message: "MODERATION_LOCKED:SUPPRESSED", meta: { hint: "moderation" } };
    const client = makeMockClient(err);

    const caught = await withActor(hostActor(), async () => "ok", {
      client: client as never,
    }).catch((e) => e);

    expect(caught).toBeInstanceOf(ModerationLockedError);
    expect((caught as ModerationLockedError).reason).toBe("SUPPRESSED");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — PGlite (real Postgres semantics)
// ---------------------------------------------------------------------------

describe("withActor — integration (PGlite)", () => {
  let fixture: PGliteFixture;

  beforeAll(async () => {
    fixture = await createPGliteFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("makes actor_role visible inside the transaction via current_setting", async () => {
    const result = await withActor(
      hostActor(),
      async (tx) => {
        const rows = await (tx as never as {
          $queryRaw: (s: TemplateStringsArray) => Promise<Array<{ role: string }>>;
        }).$queryRaw`SELECT current_setting('app.actor_role', true) as role`;
        return rows[0].role;
      },
      { client: fixture.client as never }
    );

    expect(result).toBe("host");
  });

  it("auto-resets actor GUCs outside the transaction", async () => {
    await withActor(hostActor(), async () => "ok", {
      client: fixture.client as never,
    });

    // After transaction completes, set_config with is_local=true means the
    // GUC reverts. Check it is absent / empty outside the transaction.
    const rows = await fixture.query<{ role: string }>(
      `SELECT current_setting('app.actor_role', true) as role`
    );
    // Outside any transaction, set_config(..., true) has reverted — value is '' or null.
    expect(rows[0].role ?? "").toBe("");
  });

  it("leaves no actor GUC residue after a rolled-back transaction", async () => {
    await expect(
      withActor(
        hostActor(),
        async () => {
          throw new Error("rollback me");
        },
        { client: fixture.client as never }
      )
    ).rejects.toThrow("rollback me");

    const rows = await fixture.query<{ role: string }>(
      `SELECT current_setting('app.actor_role', true) as role`
    );
    expect(rows[0].role ?? "").toBe("");
  });

  it("translates moderation trigger failures to ModerationLockedError", async () => {
    const unitId = await fixture.insertPhysicalUnit({
      canonicalAddressHash: `hash-locked-${Date.now()}`,
    });

    await expect(
      withActor(
        hostActor(),
        async (tx) => {
          await (tx as never as {
            physicalUnit: {
              update: (a: unknown) => Promise<void>;
            };
          }).physicalUnit.update({
            where: { id: unitId },
            data: { publish_status: "PUBLISHED" },
          });
        },
        { client: fixture.client as never }
      )
    ).rejects.toBeInstanceOf(ModerationLockedError);
  });
});
