/**
 * Tests for GET /api/cron/sweep-expired-holds route.
 *
 * Covers advisory-lock discovery, per-hold transaction isolation, stale hold
 * handling, summary logging, and post-commit side effects.
 */

jest.mock("@/lib/availability", () => ({
  applyInventoryDeltas: jest.fn(),
}));

jest.mock("@/lib/booking-audit", () => ({
  logBookingAudit: jest.fn(),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
  markListingsDirty: jest.fn(),
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
  markListingsDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  features: {
    softHoldsEnabled: true,
    softHoldsDraining: false,
  },
}));

jest.mock("@/lib/notifications", () => ({
  createInternalNotification: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error ?? "Unknown error")
  ),
}));

jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest extends Request {
    declare headers: Headers;

    constructor(url: string, init?: RequestInit) {
      super(url, init);
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { GET } from "@/app/api/cron/sweep-expired-holds/route";
import { applyInventoryDeltas } from "@/lib/availability";
import { logBookingAudit } from "@/lib/booking-audit";
import { validateCronAuth } from "@/lib/cron-auth";
import { features } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createInternalNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { NextRequest } from "next/server";

type ExpiredHold = ReturnType<typeof makeExpiredHold>;
type TransactionStep = (cb: Function) => Promise<unknown>;
type PerHoldPlan = {
  bookingUpdateCount?: number;
  failAt?: "booking" | "listing";
  error?: Error;
};

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers.authorization = authHeader;
  }

  return new NextRequest("http://localhost:3000/api/cron/sweep-expired-holds", {
    method: "GET",
    headers,
  });
}

function makeExpiredHold(
  overrides: Partial<{
    id: string;
    listingId: string;
    tenantId: string;
    slotsRequested: number;
    version: number;
    heldUntil: Date;
    startDate: Date;
    endDate: Date;
    totalSlots: number;
    tenantEmail: string | null;
    tenantName: string | null;
    listingTitle: string;
    hostId: string;
    hostEmail: string | null;
    hostName: string | null;
  }> = {}
) {
  return {
    id: overrides.id ?? "booking-1",
    listingId: overrides.listingId ?? "listing-1",
    tenantId: overrides.tenantId ?? "tenant-1",
    slotsRequested: overrides.slotsRequested ?? 1,
    version: overrides.version ?? 1,
    heldUntil:
      overrides.heldUntil ?? new Date("2026-04-14T10:00:00.000Z"),
    startDate:
      overrides.startDate ?? new Date("2026-05-01T00:00:00.000Z"),
    endDate: overrides.endDate ?? new Date("2026-06-01T00:00:00.000Z"),
    totalSlots: overrides.totalSlots ?? 5,
    tenantEmail: overrides.tenantEmail ?? "tenant@example.com",
    tenantName: overrides.tenantName ?? "Tenant One",
    listingTitle: overrides.listingTitle ?? "Cozy Room",
    hostId: overrides.hostId ?? "host-1",
    hostEmail: overrides.hostEmail ?? "host@example.com",
    hostName: overrides.hostName ?? "Host One",
  };
}

function installTransactionQueue(steps: TransactionStep[]) {
  const pending = [...steps];

  (prisma.$transaction as jest.Mock).mockImplementation(async (cb: Function) => {
    const step = pending.shift();
    if (!step) {
      throw new Error("Unexpected transaction");
    }
    return step(cb);
  });

  return pending;
}

function makeDiscoveryStep(opts: {
  lockAcquired?: boolean;
  expiredBookings?: ExpiredHold[];
}) {
  const { lockAcquired = true, expiredBookings = [] } = opts;
  const queryRaw = jest.fn();
  let queryCallCount = 0;

  queryRaw.mockImplementation(() => {
    queryCallCount += 1;

    if (queryCallCount === 1) {
      return Promise.resolve([{ locked: lockAcquired }]);
    }

    return Promise.resolve(expiredBookings);
  });

  return {
    queryRaw,
    step: async (cb: Function) =>
      cb({
        $queryRaw: queryRaw,
      }),
  };
}

function makePerHoldStep(plan: PerHoldPlan = {}) {
  const executeRaw = jest.fn();
  let executeCallCount = 0;

  executeRaw.mockImplementation(() => {
    executeCallCount += 1;

    if (plan.failAt === "booking" && executeCallCount === 1) {
      throw plan.error ?? new Error("Booking update failed");
    }

    if (executeCallCount === 1) {
      return Promise.resolve(plan.bookingUpdateCount ?? 1);
    }

    if (plan.failAt === "listing" && executeCallCount === 2) {
      throw plan.error ?? new Error("Listing update failed");
    }

    return Promise.resolve(1);
  });

  return {
    executeRaw,
    step: async (cb: Function) =>
      cb({
        $executeRaw: executeRaw,
      }),
  };
}

function setupTransactions(opts: {
  lockAcquired?: boolean;
  expiredBookings?: ExpiredHold[];
  perHoldPlans?: PerHoldPlan[];
}) {
  const discovery = makeDiscoveryStep({
    lockAcquired: opts.lockAcquired,
    expiredBookings: opts.expiredBookings,
  });
  const holdSteps = (opts.perHoldPlans ?? []).map((plan) => makePerHoldStep(plan));

  installTransactionQueue([discovery.step, ...holdSteps.map((step) => step.step)]);

  return {
    discoveryQueryRaw: discovery.queryRaw,
    holdExecuteRaws: holdSteps.map((step) => step.executeRaw),
  };
}

function findLogCall(mockFn: jest.Mock, message: string) {
  return mockFn.mock.calls.find((call) => call[0] === message);
}

describe("GET /api/cron/sweep-expired-holds", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (validateCronAuth as jest.Mock).mockReturnValue(null);
    Object.defineProperty(features, "softHoldsEnabled", {
      value: true,
      writable: true,
    });
    Object.defineProperty(features, "softHoldsDraining", {
      value: false,
      writable: true,
    });
    (applyInventoryDeltas as jest.Mock).mockResolvedValue(undefined);
    (logBookingAudit as jest.Mock).mockResolvedValue(undefined);
    (markListingDirtyInTx as jest.Mock).mockResolvedValue(undefined);
    (createInternalNotification as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  it("returns 401 when cron auth validation fails", async () => {
    const authErrorResponse = {
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
      headers: new Map(),
    };
    (validateCronAuth as jest.Mock).mockReturnValue(authErrorResponse);

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns skipped when soft holds are disabled", async () => {
    Object.defineProperty(features, "softHoldsEnabled", {
      value: false,
      writable: true,
    });
    Object.defineProperty(features, "softHoldsDraining", {
      value: false,
      writable: true,
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        expired: 0,
        selected: 0,
        failed: 0,
        stale: 0,
        skipped: true,
        reason: "soft_holds_disabled",
      })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("skips sweep when advisory lock is already held", async () => {
    const { discoveryQueryRaw } = setupTransactions({
      lockAcquired: false,
      expiredBookings: [],
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        expired: 0,
        selected: 0,
        failed: 0,
        stale: 0,
        skipped: true,
        reason: "lock_held",
      })
    );
    expect(discoveryQueryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns zero counts when no expired holds are found", async () => {
    setupTransactions({
      lockAcquired: true,
      expiredBookings: [],
      perHoldPlans: [],
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        expired: 0,
        selected: 0,
        failed: 0,
        stale: 0,
        skipped: false,
      })
    );
    expect(createInternalNotification).not.toHaveBeenCalled();
    expect(markListingDirtyInTx).not.toHaveBeenCalled();
  });

  it("expires one hold in its own transaction and sends notifications after commit", async () => {
    const hold = makeExpiredHold({
      id: "booking-success",
      listingId: "listing-success",
      slotsRequested: 2,
      version: 7,
    });
    const discovery = makeDiscoveryStep({
      lockAcquired: true,
      expiredBookings: [hold],
    });
    const perHold = makePerHoldStep();
    const callOrder: string[] = [];

    installTransactionQueue([
      discovery.step,
      async (cb: Function) => {
        const result = await perHold.step(cb);
        callOrder.push("tx-complete");
        return result;
      },
    ]);

    (createInternalNotification as jest.Mock).mockImplementation(async () => {
      callOrder.push("notification");
      return { success: true };
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        expired: 1,
        selected: 1,
        failed: 0,
        stale: 0,
        skipped: false,
      })
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(callOrder.indexOf("tx-complete")).toBeLessThan(
      callOrder.indexOf("notification")
    );

    const bookingUpdateSqlParts = perHold.executeRaw.mock.calls[0][0];
    const bookingUpdateSql = Array.isArray(bookingUpdateSqlParts)
      ? bookingUpdateSqlParts.join("?")
      : String(bookingUpdateSqlParts);
    expect(bookingUpdateSql).toContain("version = ?");
    expect(bookingUpdateSql).toContain('"heldUntil" <= NOW()');

    const listingUpdateSqlParts = perHold.executeRaw.mock.calls[1][0];
    const listingUpdateSql = Array.isArray(listingUpdateSqlParts)
      ? listingUpdateSqlParts.join("?")
      : String(listingUpdateSqlParts);
    expect(listingUpdateSql.toUpperCase()).toContain("LEAST");

    expect(applyInventoryDeltas).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        listingId: hold.listingId,
        startDate: hold.startDate,
        endDate: hold.endDate,
        totalSlots: hold.totalSlots,
        heldDelta: -hold.slotsRequested,
      })
    );
    expect(logBookingAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bookingId: hold.id,
        action: "EXPIRED",
        previousStatus: "HELD",
        newStatus: "EXPIRED",
        actorType: "SYSTEM",
      })
    );
    expect(createInternalNotification).toHaveBeenCalledTimes(2);
    expect(markListingDirtyInTx).toHaveBeenCalledWith(
      expect.anything(),
      hold.listingId,
      "booking_hold_expired"
    );
  });

  it("rolls the per-hold dirty mark back atomically when the enclosing tx fails mid-hold (CFM-405c)", async () => {
    const hold = makeExpiredHold({
      id: "booking-doomed",
      listingId: "listing-doomed",
    });
    const discovery = makeDiscoveryStep({
      lockAcquired: true,
      expiredBookings: [hold],
    });

    // Simulate a mid-tx failure: after the hold-status update and the in-tx
    // dirty mark both run, applyInventoryDeltas throws. The expected
    // behavior is that the enclosing prisma.$transaction rethrows, the
    // dirty mark rolls back with the transaction, and the route reports
    // the hold as failed rather than expired.
    (applyInventoryDeltas as jest.Mock).mockRejectedValueOnce(
      new Error("simulated inventory write failure mid-tx")
    );

    const perHold = makePerHoldStep();
    installTransactionQueue([discovery.step, perHold.step]);

    const response = await GET(createRequest());
    const data = await response.json();

    // The route reports 500 because every selected hold failed (matches
    // existing behavior at "returns 500 only when every selected hold
    // fails unexpectedly"). No notification is sent, the hold is not
    // counted as expired, and the in-tx dirty mark rolls back with the
    // enclosing transaction.
    expect(response.status).toBe(500);
    expect(data).toEqual(
      expect.objectContaining({
        success: false,
      })
    );
    expect(createInternalNotification).not.toHaveBeenCalled();
  });

  it("continues processing later holds when a middle hold fails", async () => {
    const holdA = makeExpiredHold({ id: "hold-a", listingId: "listing-a" });
    const holdB = makeExpiredHold({ id: "hold-b", listingId: "listing-b" });
    const holdC = makeExpiredHold({ id: "hold-c", listingId: "listing-c" });
    const trackers = setupTransactions({
      lockAcquired: true,
      expiredBookings: [holdA, holdB, holdC],
      perHoldPlans: [
        {},
        { failAt: "listing", error: new Error("INVENTORY_DELTA_CONFLICT") },
        {},
      ],
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        expired: 2,
        selected: 3,
        failed: 1,
        stale: 0,
        skipped: false,
      })
    );
    expect(trackers.holdExecuteRaws).toHaveLength(3);
    expect(trackers.holdExecuteRaws[2]).toHaveBeenCalled();
    expect(applyInventoryDeltas).toHaveBeenCalledTimes(2);
    expect(logBookingAudit).toHaveBeenCalledTimes(2);
    expect(createInternalNotification).toHaveBeenCalledTimes(4);
    expect(markListingDirtyInTx).toHaveBeenCalledWith(
      expect.anything(),
      "listing-a",
      "booking_hold_expired"
    );
    expect(markListingDirtyInTx).toHaveBeenCalledWith(
      expect.anything(),
      "listing-c",
      "booking_hold_expired"
    );
    expect(
      findLogCall(
        logger.sync.warn as jest.Mock,
        "[sweep-expired-holds] Sweep completed with partial failures"
      )
    ).toBeDefined();
  });

  it("does not let a failed first hold block a later successful hold", async () => {
    const holdA = makeExpiredHold({ id: "hold-first-fail", listingId: "listing-a" });
    const holdB = makeExpiredHold({ id: "hold-second-ok", listingId: "listing-b" });

    setupTransactions({
      lockAcquired: true,
      expiredBookings: [holdA, holdB],
      perHoldPlans: [
        { failAt: "booking", error: new Error("Serialization failure") },
        {},
      ],
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        expired: 1,
        selected: 2,
        failed: 1,
        stale: 0,
        skipped: false,
      })
    );
    expect(createInternalNotification).toHaveBeenCalledTimes(2);
    expect(markListingDirtyInTx).toHaveBeenCalledWith(
      expect.anything(),
      "listing-b",
      "booking_hold_expired"
    );
  });

  it("counts stale holds when the guarded booking update affects zero rows", async () => {
    const hold = makeExpiredHold({ id: "hold-stale", listingId: "listing-stale" });
    setupTransactions({
      lockAcquired: true,
      expiredBookings: [hold],
      perHoldPlans: [{ bookingUpdateCount: 0 }],
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        expired: 0,
        selected: 1,
        failed: 0,
        stale: 1,
        skipped: false,
      })
    );
    expect(applyInventoryDeltas).not.toHaveBeenCalled();
    expect(logBookingAudit).not.toHaveBeenCalled();
    expect(createInternalNotification).not.toHaveBeenCalled();
    expect(markListingDirtyInTx).not.toHaveBeenCalled();
  });

  it("returns 500 only when every selected hold fails unexpectedly", async () => {
    const holdA = makeExpiredHold({ id: "hold-fail-a", listingId: "listing-a" });
    const holdB = makeExpiredHold({ id: "hold-fail-b", listingId: "listing-b" });

    setupTransactions({
      lockAcquired: true,
      expiredBookings: [holdA, holdB],
      perHoldPlans: [
        { failAt: "listing", error: new Error("Projection conflict") },
        { failAt: "listing", error: new Error("Scalar cache conflict") },
      ],
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual(
      expect.objectContaining({
        success: false,
        error: "Sweeper failed",
        expired: 0,
        selected: 2,
        failed: 2,
        stale: 0,
        skipped: false,
      })
    );
    expect(createInternalNotification).not.toHaveBeenCalled();
    expect(markListingDirtyInTx).not.toHaveBeenCalled();
    expect(
      findLogCall(
        logger.sync.error as jest.Mock,
        "[sweep-expired-holds] Sweep failed"
      )
    ).toBeDefined();
  });

  it("treats notification errors as non-fatal and records them in logs", async () => {
    const hold = makeExpiredHold({ id: "hold-notif", listingId: "listing-notif" });
    setupTransactions({
      lockAcquired: true,
      expiredBookings: [hold],
      perHoldPlans: [{}],
    });
    (createInternalNotification as jest.Mock).mockRejectedValueOnce(
      new Error("SMTP unavailable")
    );

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        expired: 1,
        selected: 1,
        failed: 0,
        stale: 0,
        skipped: false,
      })
    );
    expect(
      findLogCall(
        logger.sync.error as jest.Mock,
        "[sweep-expired-holds] Notification failed"
      )
    ).toBeDefined();

    const summaryCall = findLogCall(
      logger.sync.info as jest.Mock,
      "[sweep-expired-holds] Sweep complete"
    );
    expect(summaryCall).toBeDefined();
    expect(summaryCall?.[1]).toEqual(
      expect.objectContaining({
        notificationFailures: 1,
      })
    );
  });
});
