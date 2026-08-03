/**
 * @jest-environment node
 *
 * Real-Postgres proof that a client-chosen idempotency key cannot unlock a contact it did
 * not pay for (review P0-4).
 *
 * The defect: contact_consumption was unique on (user_id, client_idempotency_key) only,
 * and consumeContactEntitlement short-circuited on that key BEFORE the correctly-scoped
 * (user, unit, epoch, kind) lookup. One key spent on listing A therefore satisfied every
 * later message-start and phone-reveal for any other listing, and crossed contact kind.
 *
 * This runs the real function against the real schema — including the widened unique
 * index from 20260803000000 — rather than against mocks.
 *
 * Requires a live Postgres. Opt in with REAL_DB_URL; skipped otherwise.
 * (Deliberately not DATABASE_URL: jest.env.js overwrites that with a dummy, and a separate
 * variable makes it impossible to point this at a real environment by accident.)
 *
 *   docker compose up -d db
 *   REAL_DB_URL=postgresql://postgres:password@localhost:5434/roomshare \
 *     pnpm exec jest src/__tests__/db/contact-paywall-idempotency.test.ts
 */

import { PrismaClient } from "@prisma/client";
import { consumeContactEntitlement } from "@/lib/payments/contact-paywall";

const REAL_DB_URL = process.env.REAL_DB_URL;
const describeRealDb = REAL_DB_URL ? describe : describe.skip;

const RUN_ID = `p04-${process.pid}`;
const USER_ID = `${RUN_ID}-user`;
const UNIT_A = `${RUN_ID}-unit-a`;
const UNIT_B = `${RUN_ID}-unit-b`;
const LISTING_A = `${RUN_ID}-listing-a`;
const LISTING_B = `${RUN_ID}-listing-b`;
const KEY = `${RUN_ID}-k1`;

describeRealDb("consumeContactEntitlement — real Postgres idempotency scope", () => {
  const prisma = new PrismaClient({ datasourceUrl: REAL_DB_URL });

  beforeAll(async () => {
    process.env.ENABLE_CONTACT_PAYWALL = "true";
    process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT = "true";
    process.env.ENABLE_ENTITLEMENT_STATE = "false";
    process.env.KILL_SWITCH_EMERGENCY_OPEN_PAYWALL = "false";
    await prisma.$connect();

    // Seeded with raw SQL rather than prisma.physicalUnit.create: the table carries
    // PostGIS geography columns, which Prisma cannot deserialize on the way back out
    // ("Column type 'geography' could not be deserialized"). An INSERT that returns
    // nothing sidesteps that entirely.
    for (const [id, hash] of [
      [UNIT_A, `${RUN_ID}-hash-a`],
      [UNIT_B, `${RUN_ID}-hash-b`],
    ]) {
      await prisma.$executeRaw`
        INSERT INTO physical_units (id, unit_identity_epoch, canonical_address_hash, canonicalizer_version)
        VALUES (${id}, 1, ${hash}, 'test')
        ON CONFLICT (id) DO NOTHING
      `;
    }
  });

  afterAll(async () => {
    await prisma.contactConsumption
      .deleteMany({ where: { userId: USER_ID } })
      .catch(() => {});
    await prisma
      .$executeRaw`DELETE FROM physical_units WHERE id IN (${UNIT_A}, ${UNIT_B})`
      .catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.contactConsumption.deleteMany({ where: { userId: USER_ID } });
  });

  it("spends a free credit on the first contact, then replays idempotently for the same unit", async () => {
    const first = await prisma.$transaction((tx) =>
      consumeContactEntitlement(tx, {
        userId: USER_ID,
        listingId: LISTING_A,
        physicalUnitId: UNIT_A,
        clientIdempotencyKey: KEY,
        contactKind: "MESSAGE_START",
      })
    );
    expect(first.ok).toBe(true);
    expect(first).toMatchObject({ source: "FREE" });

    const replay = await prisma.$transaction((tx) =>
      consumeContactEntitlement(tx, {
        userId: USER_ID,
        listingId: LISTING_A,
        physicalUnitId: UNIT_A,
        clientIdempotencyKey: KEY,
        contactKind: "MESSAGE_START",
      })
    );
    expect(replay).toMatchObject({ ok: true, source: "EXISTING_CONSUMPTION" });

    // A genuine retry must not burn a second credit.
    const rows = await prisma.contactConsumption.count({
      where: { userId: USER_ID },
    });
    expect(rows).toBe(1);
  }, 30_000);

  it("rejects the same key replayed against a different listing", async () => {
    await prisma.$transaction((tx) =>
      consumeContactEntitlement(tx, {
        userId: USER_ID,
        listingId: LISTING_A,
        physicalUnitId: UNIT_A,
        clientIdempotencyKey: KEY,
        contactKind: "MESSAGE_START",
      })
    );

    // The exploit: same key, different listing/unit. Pre-fix this returned
    // ok: true / EXISTING_CONSUMPTION and handed over the contact for free.
    const exploit = await prisma.$transaction((tx) =>
      consumeContactEntitlement(tx, {
        userId: USER_ID,
        listingId: LISTING_B,
        physicalUnitId: UNIT_B,
        clientIdempotencyKey: KEY,
        contactKind: "MESSAGE_START",
      })
    );

    expect(exploit).toMatchObject({
      ok: false,
      code: "IDEMPOTENCY_KEY_REUSED",
    });

    // And nothing was written for the second listing.
    const rows = await prisma.contactConsumption.findMany({
      where: { userId: USER_ID },
      select: { unitId: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].unitId).toBe(UNIT_A);
  }, 30_000);

  it("rejects the same key replayed against a different contact kind", async () => {
    await prisma.$transaction((tx) =>
      consumeContactEntitlement(tx, {
        userId: USER_ID,
        listingId: LISTING_A,
        physicalUnitId: UNIT_A,
        clientIdempotencyKey: KEY,
        contactKind: "MESSAGE_START",
      })
    );

    // A MESSAGE_START consumption must not authorise a REVEAL_PHONE — this is what let a
    // single purchase harvest the host phone directory.
    const exploit = await prisma.$transaction((tx) =>
      consumeContactEntitlement(tx, {
        userId: USER_ID,
        listingId: LISTING_A,
        physicalUnitId: UNIT_A,
        clientIdempotencyKey: KEY,
        contactKind: "REVEAL_PHONE",
      })
    );

    expect(exploit).toMatchObject({
      ok: false,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
  }, 30_000);
});
