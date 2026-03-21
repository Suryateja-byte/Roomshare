/**
 * Tests for query-timeout.ts - statement timeout wrapper for raw SQL queries
 */

// Mock server-only before anything else
jest.mock("server-only", () => ({}));

// Use jest.fn() directly in the mock factory to avoid hoisting issues
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(0);
const mockQueryRawUnsafe = jest.fn().mockResolvedValue([{ id: 1 }]);

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { queryWithTimeout } from "@/lib/query-timeout";

const mockTransaction = prisma.$transaction as jest.Mock;

describe("queryWithTimeout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Simulate prisma.$transaction: call the callback with a mock tx
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        $executeRawUnsafe: mockExecuteRawUnsafe,
        $queryRawUnsafe: mockQueryRawUnsafe,
      };
      return cb(tx);
    });
  });

  it("sets statement_timeout before executing query", async () => {
    const callOrder: string[] = [];
    mockExecuteRawUnsafe.mockImplementation(async () => {
      callOrder.push("executeRaw");
      return 0;
    });
    mockQueryRawUnsafe.mockImplementation(async () => {
      callOrder.push("queryRaw");
      return [{ id: 1 }];
    });

    await queryWithTimeout("SELECT * FROM t WHERE id = $1", [42]);

    expect(callOrder).toEqual(["executeRaw", "queryRaw"]);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL statement_timeout = 5000"
    );
    expect(mockQueryRawUnsafe).toHaveBeenCalledWith(
      "SELECT * FROM t WHERE id = $1",
      42
    );
  });

  it("uses default timeout of 5000ms", async () => {
    await queryWithTimeout("SELECT 1", []);

    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL statement_timeout = 5000"
    );
  });

  it("accepts custom timeout", async () => {
    await queryWithTimeout("SELECT 1", [], 10000);

    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL statement_timeout = 10000"
    );
  });

  it("spreads params into $queryRawUnsafe", async () => {
    await queryWithTimeout("SELECT * FROM t WHERE a = $1 AND b = $2", [
      "foo",
      123,
    ]);

    expect(mockQueryRawUnsafe).toHaveBeenCalledWith(
      "SELECT * FROM t WHERE a = $1 AND b = $2",
      "foo",
      123
    );
  });

  it("returns the query result", async () => {
    const expected = [{ id: 1, name: "test" }];
    mockQueryRawUnsafe.mockResolvedValue(expected);

    const result = await queryWithTimeout("SELECT 1", []);

    expect(result).toEqual(expected);
  });

  it("propagates transaction errors", async () => {
    mockTransaction.mockRejectedValue(new Error("connection lost"));

    await expect(queryWithTimeout("SELECT 1", [])).rejects.toThrow(
      "connection lost"
    );
  });

  it("propagates query errors from inside transaction", async () => {
    mockQueryRawUnsafe.mockRejectedValue(
      new Error("canceling statement due to statement timeout")
    );

    await expect(
      queryWithTimeout("SELECT pg_sleep(30)", [])
    ).rejects.toThrow("canceling statement due to statement timeout");
  });
});
