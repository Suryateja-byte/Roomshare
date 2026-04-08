/**
 * Unit tests for idempotency.ts
 *
 * Covers:
 *  - withIdempotency: first-time request, cached replay, key-reuse rejection,
 *    row-not-found (500), null resultData (500), operation throws,
 *    serialization retry with backoff, exhausted retries
 *  - idempotencyResponse: success, cached success (replay header),
 *    error variants (400 / 409 / 500)
 *
 * The existing booking/idempotency.test.ts covers core happy-path and hash
 * determinism.  This file covers the remaining behaviors including
 * idempotencyResponse and edge-case error paths.
 */

// Must mock before imports
jest.mock("server-only", () => ({}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    },
  },
}));

import crypto from "crypto";
import { withIdempotency, idempotencyResponse } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the SHA-256 hash that withIdempotency computes internally for a
 * flat-object request body.  stableStringify sorts keys alphabetically, so
 * JSON.stringify with sorted keys produces the identical string for flat
 * objects with primitive values.
 */
function hashBody(body: Record<string, unknown>): string {
  const sortedKeys = Object.keys(body).sort();
  const stable = JSON.stringify(body, sortedKeys);
  return crypto.createHash("sha256").update(stable).digest("hex");
}

/** Factory: a minimal mock transaction client. */
function createMockTx(
  overrides: Partial<{
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  }> = {}
) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn(),
    ...overrides,
  };
}

const KEY = "client-key-abc";
const USER = "user-001";
const ENDPOINT = "createBooking";
const BODY = { amount: 100 };
const BODY_HASH = hashBody(BODY);

// ─────────────────────────────────────────────────────────────────────────────
// withIdempotency
// ─────────────────────────────────────────────────────────────────────────────

describe("withIdempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("first-time request (processing row inserted)", () => {
    it("runs the operation and returns success with cached=false", async () => {
      const opResult = { reservationId: "res-1" };
      const operation = jest.fn().mockResolvedValue(opResult);

      const tx = createMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            {
              id: "idem-1",
              status: "processing",
              requestHash: BODY_HASH,
              resultData: null,
            },
          ]),
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(tx)
      );

      const result = await withIdempotency(
        KEY,
        USER,
        ENDPOINT,
        BODY,
        operation
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual(opResult);
        expect(result.cached).toBe(false);
      }
      expect(operation).toHaveBeenCalledTimes(1);
      // The UPDATE (mark completed) must also have been called
      expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it("passes the transaction client into the operation callback", async () => {
      const operation = jest.fn().mockResolvedValue({ ok: true });
      const tx = createMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            {
              id: "idem-2",
              status: "processing",
              requestHash: BODY_HASH,
              resultData: null,
            },
          ]),
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(tx)
      );

      await withIdempotency(KEY, USER, ENDPOINT, BODY, operation);

      expect(operation).toHaveBeenCalledWith(tx);
    });
  });

  describe("replay with same request body (completed row)", () => {
    it("returns the cached result with cached=true without calling the operation", async () => {
      const cached = { reservationId: "res-1" };
      const operation = jest.fn();

      const tx = createMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            {
              id: "idem-1",
              status: "completed",
              requestHash: BODY_HASH,
              resultData: cached,
            },
          ]),
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(tx)
      );

      const result = await withIdempotency(
        KEY,
        USER,
        ENDPOINT,
        BODY,
        operation
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual(cached);
        expect(result.cached).toBe(true);
      }
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe("key reused with different request body", () => {
    it("returns success=false with status 400 and an error mentioning 'reused'", async () => {
      const operation = jest.fn();
      const differentHash =
        "0000000000000000000000000000000000000000000000000000000000000000";

      const tx = createMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            {
              id: "idem-1",
              status: "completed",
              requestHash: differentHash,
              resultData: {},
            },
          ]),
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(tx)
      );

      const result = await withIdempotency(
        KEY,
        USER,
        ENDPOINT,
        BODY,
        operation
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(400);
        expect(result.error).toMatch(/reused/i);
      }
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe("defensive: row not found after INSERT", () => {
    it("returns success=false with status 500 when SELECT FOR UPDATE returns empty", async () => {
      const operation = jest.fn();

      const tx = createMockTx({
        $queryRaw: jest.fn().mockResolvedValue([]), // no row
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(tx)
      );

      const result = await withIdempotency(
        KEY,
        USER,
        ENDPOINT,
        BODY,
        operation
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(500);
      }
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe("completed row but resultData is null", () => {
    it("returns success=false with status 500 and an error mentioning 'missing'", async () => {
      const operation = jest.fn();

      const tx = createMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            {
              id: "idem-1",
              status: "completed",
              requestHash: BODY_HASH,
              resultData: null,
            },
          ]),
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(tx)
      );

      const result = await withIdempotency(
        KEY,
        USER,
        ENDPOINT,
        BODY,
        operation
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(500);
        expect(result.error).toMatch(/missing/i);
      }
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe("operation throws", () => {
    it("propagates the error so the transaction rolls back", async () => {
      const operationError = new Error("constraint violation");
      const operation = jest.fn().mockRejectedValue(operationError);

      const tx = createMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            {
              id: "idem-1",
              status: "processing",
              requestHash: BODY_HASH,
              resultData: null,
            },
          ]),
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(tx)
      );

      await expect(
        withIdempotency(KEY, USER, ENDPOINT, BODY, operation)
      ).rejects.toThrow("constraint violation");

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe("serialization error retry (P2034)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("retries up to MAX_SERIALIZATION_RETRIES and succeeds on the last attempt", async () => {
      const opResult = { ok: true };
      const operation = jest.fn().mockResolvedValue(opResult);

      const serializationError = Object.assign(
        new Error("Transaction serialization failure"),
        { code: "P2034" }
      );

      let callCount = 0;
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        callCount++;
        if (callCount < 3) {
          throw serializationError;
        }
        const tx = createMockTx({
          $queryRaw: jest
            .fn()
            .mockResolvedValue([
              {
                id: "idem-1",
                status: "processing",
                requestHash: BODY_HASH,
                resultData: null,
              },
            ]),
        });
        return fn(tx);
      });

      // Advance all timers so backoff resolves immediately
      const promise = withIdempotency(KEY, USER, ENDPOINT, BODY, operation);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    });

    it("also detects serialization errors via SQLSTATE message (40001)", async () => {
      const opResult = { ok: true };
      const operation = jest.fn().mockResolvedValue(opResult);

      const sqlstateError = new Error(
        "ERROR 40001: could not serialize access"
      );

      let callCount = 0;
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        callCount++;
        if (callCount === 1) throw sqlstateError;
        const tx = createMockTx({
          $queryRaw: jest
            .fn()
            .mockResolvedValue([
              {
                id: "idem-1",
                status: "processing",
                requestHash: BODY_HASH,
                resultData: null,
              },
            ]),
        });
        return fn(tx);
      });

      const promise = withIdempotency(KEY, USER, ENDPOINT, BODY, operation);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });

    it("throws after MAX_SERIALIZATION_RETRIES (3) consecutive serialization failures", async () => {
      const serializationError = Object.assign(
        new Error("Transaction serialization failure"),
        { code: "P2034" }
      );

      (prisma.$transaction as jest.Mock).mockImplementation(async () => {
        throw serializationError;
      });

      await expect(
        Promise.all([
          withIdempotency(KEY, USER, ENDPOINT, BODY, jest.fn()),
          jest.runAllTimersAsync(),
        ])
      ).rejects.toThrow("Transaction serialization failure");

      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it("does not retry on non-serialization errors", async () => {
      const nonRetryableError = new Error("Foreign key constraint failed");

      (prisma.$transaction as jest.Mock).mockImplementation(async () => {
        throw nonRetryableError;
      });

      await expect(
        withIdempotency(KEY, USER, ENDPOINT, BODY, jest.fn())
      ).rejects.toThrow("Foreign key constraint failed");

      // Should not retry — called exactly once
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// idempotencyResponse
// ─────────────────────────────────────────────────────────────────────────────

describe("idempotencyResponse", () => {
  describe("success result (not cached)", () => {
    it("returns status 200 with body containing success=true, data, and cached=false", () => {
      const response = idempotencyResponse({
        success: true,
        result: { reservationId: "res-1" },
        cached: false,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { reservationId: "res-1" },
        cached: false,
      });
    });

    it("does not set a replay header when cached=false", () => {
      const response = idempotencyResponse({
        success: true,
        result: { reservationId: "res-1" },
        cached: false,
      });

      expect(response.headers).toBeUndefined();
    });
  });

  describe("cached (replayed) success result", () => {
    it("returns status 200 with cached=true in body", () => {
      const response = idempotencyResponse({
        success: true,
        result: { reservationId: "res-1" },
        cached: true,
      });

      expect(response.status).toBe(200);
      expect((response.body as { cached: boolean }).cached).toBe(true);
    });

    it("sets the X-Idempotency-Replayed: 'true' header when cached=true", () => {
      const response = idempotencyResponse({
        success: true,
        result: { reservationId: "res-1" },
        cached: true,
      });

      expect(response.headers).toEqual({ "X-Idempotency-Replayed": "true" });
    });
  });

  describe("error results", () => {
    it.each([
      [400, "Idempotency key reused with different request body"],
      [409, "Request already in progress"],
      [500, "Internal idempotency error"],
    ])(
      "preserves status %d and includes error string in body",
      (status, error) => {
        const response = idempotencyResponse({ success: false, status, error });

        expect(response.status).toBe(status);
        expect(response.body).toEqual({ error });
      }
    );

    it("does not include a headers field on error responses", () => {
      const response = idempotencyResponse({
        success: false,
        status: 400,
        error: "key reused",
      });

      expect(response.headers).toBeUndefined();
    });
  });
});
