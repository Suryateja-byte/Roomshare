/**
 * @jest-environment node
 *
 * Real-Postgres concurrency proof for the Stripe webhook worker (review P0-3).
 *
 * Why this cannot be a PGlite test: PGlite is single-connection, so it can prove
 * uniqueness but never true lock contention (see the note in
 * phase01-advisory-lock-contention.test.ts).
 *
 * What the fix actually changed, stated precisely because the original diagnosis
 * overstated it. processCapturedStripeEvent used to read `processedAt` and only then take
 * pg_advisory_xact_lock. Worker B read processedAt = null, blocked on the lock, and once A
 * committed proceeded on that stale read — re-running the entire grant path and recording
 * a second attempt. It did NOT double-grant: the downstream existingGrant guard and the
 * unique constraints on EntitlementGrant.paymentId / Payment.stripePaymentIntentId each
 * independently prevent that, which was verified by re-running this file against the
 * pre-fix ordering and against each guard removed in turn.
 *
 * So this is a redundant-reprocessing and attempt-accounting defect, not a money bug. The
 * observable difference, and the assertion this file exists for, is StripeEvent
 * .attemptCount: 1 with the lock taken first, 2 without.
 *
 * Requires a live Postgres. Opt in by setting REAL_DB_URL; skipped otherwise so the
 * default suite stays hermetic.
 *
 * Note it deliberately does NOT read DATABASE_URL: jest.env.js overwrites that with a
 * dummy (localhost:5432) before any module loads, and a separate variable also makes it
 * impossible to point this at a real environment by accident.
 *
 *   docker compose up -d db
 *   REAL_DB_URL=postgresql://postgres:password@localhost:5434/roomshare \
 *     pnpm exec jest src/__tests__/db/payment-webhook-concurrency.test.ts
 */

import { PrismaClient } from "@prisma/client";
import { processCapturedStripeEvent } from "@/lib/payments/webhook-worker";

const REAL_DB_URL = process.env.REAL_DB_URL;
const shouldRun = Boolean(REAL_DB_URL);

const describeRealDb = shouldRun ? describe : describe.skip;

// Namespaced so a parallel run against the same database cannot collide.
const RUN_ID = `p03-${process.pid}`;
const USER_ID = `${RUN_ID}-user`;
const STRIPE_EVENT_ID = `${RUN_ID}-evt`;
const PAYMENT_INTENT_ID = `${RUN_ID}-pi`;

function succeededIntentPayload() {
  return {
    id: STRIPE_EVENT_ID,
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: PAYMENT_INTENT_ID,
        amount_received: 499,
        amount: 499,
        currency: "usd",
        customer: `${RUN_ID}-cus`,
        latest_charge: `${RUN_ID}-ch`,
        metadata: {
          purchaseContext: "CONTACT_HOST",
          userId: USER_ID,
          listingId: `${RUN_ID}-listing`,
          unitId: `${RUN_ID}-unit`,
          unitIdentityEpoch: "7",
          productCode: "CONTACT_PACK_3",
          contactKind: "MESSAGE_START",
        },
      },
    },
  };
}

describeRealDb("processCapturedStripeEvent — real Postgres concurrency", () => {
  const prisma = new PrismaClient({ datasourceUrl: REAL_DB_URL });
  let stripeEventRowId: string;

  beforeAll(async () => {
    process.env.KILL_SWITCH_FREEZE_NEW_GRANTS = "false";
    await prisma.$connect();
  });

  afterAll(async () => {
    // Best-effort cleanup; each id is namespaced to this run.
    await prisma.entitlementGrant
      .deleteMany({ where: { userId: USER_ID } })
      .catch(() => {});
    await prisma.payment
      .deleteMany({ where: { userId: USER_ID } })
      .catch(() => {});
    await prisma.stripeEvent
      .deleteMany({ where: { stripeEventId: STRIPE_EVENT_ID } })
      .catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.entitlementGrant
      .deleteMany({ where: { userId: USER_ID } })
      .catch(() => {});
    await prisma.payment
      .deleteMany({ where: { userId: USER_ID } })
      .catch(() => {});
    await prisma.stripeEvent
      .deleteMany({ where: { stripeEventId: STRIPE_EVENT_ID } })
      .catch(() => {});

    const row = await prisma.stripeEvent.create({
      data: {
        stripeEventId: STRIPE_EVENT_ID,
        eventType: "payment_intent.succeeded",
        stripeObjectId: PAYMENT_INTENT_ID,
        payload: succeededIntentPayload(),
        livemode: false,
        signatureVerified: true,
        processingStatus: "PENDING",
      },
      select: { id: true },
    });
    stripeEventRowId = row.id;
  });

  it("grants exactly once when two workers process the same event concurrently", async () => {
    const run = () =>
      prisma
        .$transaction((tx) => processCapturedStripeEvent(tx, stripeEventRowId))
        .then(
          () => "ok" as const,
          (error: unknown) => error
        );

    // Both start before either commits — this is the window the TOCTOU lived in.
    const results = await Promise.all([run(), run()]);

    const grants = await prisma.entitlementGrant.findMany({
      where: { userId: USER_ID },
      select: { id: true, creditCount: true },
    });
    const payments = await prisma.payment.findMany({
      where: { userId: USER_ID },
      select: { id: true, status: true },
    });

    expect(grants).toHaveLength(1);
    expect(payments).toHaveLength(1);

    // Neither of the assertions above discriminates the lock ordering — measured, not
    // assumed. Against the pre-fix ordering the grant and payment counts are still 1 and
    // both workers still succeed, because the losing worker is caught by the downstream
    // existingGrant guard (webhook-worker.ts:325) and by the unique constraints on
    // EntitlementGrant.paymentId and Payment.stripePaymentIntentId. Removing any single
    // one of those guards in isolation also fails to break this test: the layers mask each
    // other. Keep them as invariants, but do not mistake them for the regression guard.
    const failures = results.filter((r) => r !== "ok");
    expect(failures).toHaveLength(0);

    const settled = await prisma.stripeEvent.findUnique({
      where: { id: stripeEventRowId },
      select: {
        processedAt: true,
        processingStatus: true,
        attemptCount: true,
      },
    });
    expect(settled?.processedAt).not.toBeNull();
    expect(settled?.processingStatus).toBe("PROCESSED");

    // The discriminating assertion for the lock ordering.
    //
    // attemptCount is incremented AFTER the processedAt check. With the advisory lock
    // taken first, the losing worker blocks, re-reads processedAt under the lock, sees it
    // set, and early-returns before that increment — so exactly one attempt is recorded.
    //
    // With the pre-fix ordering (read, then lock) the loser proceeds on a stale read and
    // increments a second time, then redundantly re-runs the whole grant path, relying on
    // downstream guards to stay correct. Verified to fail at 2 against that ordering.
    expect(settled?.attemptCount).toBe(1);
  }, 30_000);

  it("is a no-op when replayed after the event is already processed", async () => {
    await prisma.$transaction((tx) =>
      processCapturedStripeEvent(tx, stripeEventRowId)
    );

    const afterFirst = await prisma.entitlementGrant.findMany({
      where: { userId: USER_ID },
      select: { id: true },
    });
    expect(afterFirst).toHaveLength(1);

    // Stripe redelivers routinely (5xx retries, dashboard replay).
    await prisma.$transaction((tx) =>
      processCapturedStripeEvent(tx, stripeEventRowId)
    );

    const afterReplay = await prisma.entitlementGrant.findMany({
      where: { userId: USER_ID },
      select: { id: true },
    });
    expect(afterReplay).toHaveLength(1);
    expect(afterReplay[0].id).toBe(afterFirst[0].id);
  }, 30_000);
});
