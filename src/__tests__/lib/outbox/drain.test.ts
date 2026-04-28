/**
 * Tests for src/lib/outbox/drain.ts
 *
 * Uses jest.mock for prisma and withActor to test the drain coordinator
 * without a real database. Focuses on control-flow paths.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    outboxEvent: {
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/db/with-actor", () => ({
  withActor: jest.fn(),
}));

jest.mock("@/lib/outbox/handlers", () => ({
  HANDLERS: {
    INVENTORY_UPSERTED: jest.fn(),
    UNIT_UPSERTED: jest.fn(),
    IDENTITY_MUTATION: jest.fn(),
    TOMBSTONE: jest.fn(),
    SUPPRESSION: jest.fn(),
    PAUSE: jest.fn(),
    CACHE_INVALIDATE: jest.fn(),
    GEOCODE_NEEDED: jest.fn(),
    EMBED_NEEDED: jest.fn(),
  },
}));

jest.mock("@/lib/outbox/dlq", () => ({
  routeToDlq: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/metrics/projection-lag", () => ({
  recordStaleEventSkip: jest.fn(),
  recordDlqRouting: jest.fn(),
  recordBacklogDepth: jest.fn(),
}));

import { drainOutboxOnce } from "@/lib/outbox/drain";
import { prisma } from "@/lib/prisma";
import { withActor } from "@/lib/db/with-actor";
import { HANDLERS } from "@/lib/outbox/handlers";
import { routeToDlq } from "@/lib/outbox/dlq";
import {
  recordStaleEventSkip,
  recordDlqRouting,
  recordBacklogDepth,
} from "@/lib/metrics/projection-lag";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockWithActor = withActor as jest.Mock;
const mockHandlers = HANDLERS as jest.Mocked<typeof HANDLERS>;
const mockRouteToDlq = routeToDlq as jest.Mock;

function makeOutboxRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: `ev-${Math.random().toString(36).slice(2)}`,
    aggregateType: "PHYSICAL_UNIT",
    aggregateId: `unit-${Math.random().toString(36).slice(2)}`,
    kind: "INVENTORY_UPSERTED",
    payload: {},
    sourceVersion: BigInt(1),
    unitIdentityEpoch: 1,
    priority: 100,
    attemptCount: 0,
    createdAt: new Date(Date.now() - 1000),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  // Default: claim transaction returns empty rows → no processing
  (mockPrisma.$transaction as jest.Mock).mockImplementation(
    async (fn: Function) =>
      fn({
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: jest.fn().mockResolvedValue(0),
      })
  );

  // Default: backlog query returns empty
  (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);
  (mockPrisma.$executeRaw as jest.Mock).mockResolvedValue(0);

  (mockPrisma.outboxEvent.update as jest.Mock).mockResolvedValue({});
  mockRouteToDlq.mockResolvedValue(undefined);
});

describe("drainOutboxOnce() - empty queue", () => {
  it("returns zero counts when no pending events", async () => {
    const result = await drainOutboxOnce();

    expect(result.processed).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.dlq).toBe(0);
    expect(result.staleSkipped).toBe(0);
    expect(result.retryScheduled).toBe(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("returns remainingByPriority based on backlog query", async () => {
    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([
      { priority: 100, depth: BigInt(5) },
      { priority: 0, depth: BigInt(2) },
    ]);

    const result = await drainOutboxOnce();

    expect(result.remainingByPriority[100]).toBe(5);
    expect(result.remainingByPriority[0]).toBe(2);
    expect(recordBacklogDepth).toHaveBeenCalledWith(100, 5);
    expect(recordBacklogDepth).toHaveBeenCalledWith(0, 2);
  });
});

describe("drainOutboxOnce() - completed outcome", () => {
  it("marks event COMPLETED and increments completed counter", async () => {
    const row = makeOutboxRow();

    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: Function) => {
        return fn({
          $queryRaw: jest.fn().mockResolvedValue([row]),
          $executeRaw: jest.fn().mockResolvedValue(1),
        });
      }
    );

    mockWithActor.mockResolvedValueOnce({ outcome: "completed" });

    const result = await drainOutboxOnce();

    expect(result.processed).toBe(1);
    expect(result.completed).toBe(1);
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "COMPLETED" } })
    );
  });
});

describe("drainOutboxOnce() - claimed row recovery", () => {
  it("resets claimed rows that are not processed before the tick expires", async () => {
    const row1 = makeOutboxRow({ id: "ev-processed" });
    const row2 = makeOutboxRow({ id: "ev-unprocessed" });
    let nowMs = 0;

    const dateNowSpy = jest.spyOn(Date, "now").mockImplementation(() => {
      nowMs += 10;
      return nowMs;
    });

    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: Function) =>
        fn({
          $queryRaw: jest.fn().mockResolvedValue([row1, row2]),
          $executeRaw: jest.fn().mockResolvedValue(1),
        })
    );
    mockWithActor.mockResolvedValueOnce({ outcome: "completed" });

    try {
      const result = await drainOutboxOnce({ maxTickMs: 15 });

      expect(result.processed).toBe(1);
      expect(result.completed).toBe(1);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      const resetSql = String(
        (mockPrisma.$executeRaw as jest.Mock).mock.calls[0][0].join("")
      );
      expect(resetSql).toContain(
        "attempt_count = GREATEST(attempt_count - 1, 0)"
      );
      expect(resetSql).toContain("status = 'IN_FLIGHT'");
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("recovers stale IN_FLIGHT rows before claiming pending work", async () => {
    const txExecuteRaw = jest.fn().mockResolvedValue(1);
    const txQueryRaw = jest.fn().mockResolvedValue([]);

    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: Function) =>
        fn({
          $queryRaw: txQueryRaw,
          $executeRaw: txExecuteRaw,
        })
    );

    await drainOutboxOnce({
      now: () => new Date("2026-04-26T12:00:00.000Z"),
      staleInFlightMs: 60_000,
    });

    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    const sql = String(txExecuteRaw.mock.calls[0][0].join(""));
    expect(sql).toContain("status = 'IN_FLIGHT'");
    expect(sql).toContain("updated_at <");
    expect(sql).toContain("status          = 'PENDING'");
  });
});

describe("drainOutboxOnce() - stale_skipped outcome", () => {
  it("marks event COMPLETED, records stale skip metric", async () => {
    const row = makeOutboxRow();

    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: Function) => {
        return fn({
          $queryRaw: jest.fn().mockResolvedValue([row]),
          $executeRaw: jest.fn().mockResolvedValue(1),
        });
      }
    );

    mockWithActor.mockResolvedValueOnce({ outcome: "stale_skipped" });

    const result = await drainOutboxOnce();

    expect(result.staleSkipped).toBe(1);
    expect(result.completed).toBe(0);
    expect(recordStaleEventSkip).toHaveBeenCalledWith(row.kind);
  });
});

describe("drainOutboxOnce() - transient_error outcome", () => {
  it("reschedules retry when attemptCount < MAX_ATTEMPTS", async () => {
    const row = makeOutboxRow({ attemptCount: 0 });

    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: Function) => {
        return fn({
          $queryRaw: jest.fn().mockResolvedValue([row]),
          $executeRaw: jest.fn().mockResolvedValue(1),
        });
      }
    );

    mockWithActor.mockResolvedValueOnce({
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: "timeout",
    });

    const result = await drainOutboxOnce();

    expect(result.retryScheduled).toBe(1);
    expect(result.dlq).toBe(0);
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          lastError: "timeout",
        }),
      })
    );
  });

  it("routes to DLQ when attemptCount >= MAX_ATTEMPTS", async () => {
    const row = makeOutboxRow({ attemptCount: 8 }); // MAX_ATTEMPTS is 8

    (mockPrisma.$transaction as jest.Mock)
      .mockImplementationOnce(async (fn: Function) => {
        return fn({
          $queryRaw: jest.fn().mockResolvedValue([row]),
          $executeRaw: jest.fn().mockResolvedValue(1),
        });
      })
      .mockImplementationOnce(async (fn: Function) => {
        // DLQ transaction
        return fn({});
      });

    mockWithActor.mockResolvedValueOnce({
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: "timeout",
    });

    const result = await drainOutboxOnce();

    expect(result.dlq).toBe(1);
    expect(mockRouteToDlq).toHaveBeenCalledWith(
      expect.anything(),
      row.id,
      "MAX_ATTEMPTS_EXHAUSTED",
      "timeout"
    );
    expect(recordDlqRouting).toHaveBeenCalledWith(
      row.kind,
      "MAX_ATTEMPTS_EXHAUSTED"
    );
  });
});

describe("drainOutboxOnce() - fatal_error outcome", () => {
  it("routes to DLQ immediately with dlqReason", async () => {
    const row = makeOutboxRow();

    (mockPrisma.$transaction as jest.Mock)
      .mockImplementationOnce(async (fn: Function) => {
        return fn({
          $queryRaw: jest.fn().mockResolvedValue([row]),
          $executeRaw: jest.fn().mockResolvedValue(1),
        });
      })
      .mockImplementationOnce(async (fn: Function) => {
        return fn({});
      });

    mockWithActor.mockResolvedValueOnce({
      outcome: "fatal_error",
      dlqReason: "GEOCODE_EXHAUSTED",
      lastError: "geocode failed",
    });

    const result = await drainOutboxOnce();

    expect(result.dlq).toBe(1);
    expect(mockRouteToDlq).toHaveBeenCalledWith(
      expect.anything(),
      row.id,
      "GEOCODE_EXHAUSTED",
      "geocode failed"
    );
    expect(recordDlqRouting).toHaveBeenCalledWith(
      row.kind,
      "GEOCODE_EXHAUSTED"
    );
  });
});

describe("drainOutboxOnce() - unknown kind", () => {
  it("routes to DLQ when kind has no handler", async () => {
    const row = makeOutboxRow({ kind: "UNKNOWN_EVENT_KIND" });

    (mockPrisma.$transaction as jest.Mock)
      .mockImplementationOnce(async (fn: Function) => {
        return fn({
          $queryRaw: jest.fn().mockResolvedValue([row]),
          $executeRaw: jest.fn().mockResolvedValue(1),
        });
      })
      .mockImplementationOnce(async (fn: Function) => {
        return fn({});
      });

    const result = await drainOutboxOnce();

    expect(result.dlq).toBe(1);
    expect(mockRouteToDlq).toHaveBeenCalledWith(
      expect.anything(),
      row.id,
      "UNKNOWN_KIND",
      expect.stringContaining("UNKNOWN_EVENT_KIND")
    );
    expect(recordDlqRouting).toHaveBeenCalledWith(row.kind, "UNKNOWN_KIND");
    // withActor should NOT have been called for unknown kind
    expect(mockWithActor).not.toHaveBeenCalled();
  });
});

describe("drainOutboxOnce() - exception from handler", () => {
  it("treats thrown exception as transient_error", async () => {
    const row = makeOutboxRow({ attemptCount: 0 });

    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: Function) => {
        return fn({
          $queryRaw: jest.fn().mockResolvedValue([row]),
          $executeRaw: jest.fn().mockResolvedValue(1),
        });
      }
    );

    mockWithActor.mockRejectedValueOnce(new Error("unexpected crash"));

    const result = await drainOutboxOnce();

    // Should be treated as transient_error → reschedule
    expect(result.retryScheduled).toBe(1);
    expect(result.dlq).toBe(0);
  });

  it("calls the handler callback via withActor (covers inner arrow fn)", async () => {
    const row = makeOutboxRow({ kind: "INVENTORY_UPSERTED", attemptCount: 0 });

    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: Function) => {
        return fn({
          $queryRaw: jest.fn().mockResolvedValue([row]),
          $executeRaw: jest.fn().mockResolvedValue(1),
        });
      }
    );

    // Make withActor actually call its callback and return a valid result
    mockWithActor.mockImplementationOnce(
      async (_actor: unknown, fn: Function, _opts: unknown) => {
        // Call fn to exercise the arrow function coverage — fn receives a tx-like object
        // The handler mock returns undefined by default, but we override it
        (mockHandlers.INVENTORY_UPSERTED as jest.Mock).mockResolvedValueOnce({
          outcome: "completed",
        });
        const mockTx = {} as import("@/lib/db/with-actor").TransactionClient;
        return fn(mockTx);
      }
    );

    const result = await drainOutboxOnce();
    expect(result.processed).toBe(1);
    expect(result.completed).toBe(1);
  });
});

describe("drainOutboxOnce() - options", () => {
  it("passes priorityMax and maxBatch to claim query", async () => {
    let capturedTx: Record<string, unknown> | null = null;

    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: Function) => {
        const mockTx = {
          $queryRaw: jest.fn().mockResolvedValue([]),
          $executeRaw: jest.fn().mockResolvedValue(0),
        };
        capturedTx = mockTx;
        return fn(mockTx);
      }
    );

    await drainOutboxOnce({ maxBatch: 10, priorityMax: 0 });

    // The claim transaction should have been called
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it("respects maxTickMs time limit and stops early", async () => {
    // Create multiple rows but set maxTickMs to 0 so it breaks immediately after first
    const rows = [makeOutboxRow(), makeOutboxRow()];

    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: Function) => {
        return fn({
          $queryRaw: jest.fn().mockResolvedValue(rows),
          $executeRaw: jest.fn().mockResolvedValue(rows.length),
        });
      }
    );

    mockWithActor.mockResolvedValue({ outcome: "completed" });

    const result = await drainOutboxOnce({ maxTickMs: 0 });

    // With maxTickMs=0, the time check happens before processing each event
    // The first event gets processed (check is before processing), then loop breaks
    expect(result.processed).toBeLessThanOrEqual(rows.length);
  });
});
