/**
 * Tests for GET /api/cron/reconcile-slots route (Phase 5)
 *
 * Tests cron auth, advisory lock, host-managed skip behavior, drift detection/fix,
 * markListingsDirty call, and structured logging.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingsDirty: jest.fn(),
}));

jest.mock("@/lib/availability", () => ({
  getAvailability: jest.fn(),
  rebuildListingDayInventory: jest.fn(),
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

import { GET } from "@/app/api/cron/reconcile-slots/route";
import { prisma } from "@/lib/prisma";
import { validateCronAuth } from "@/lib/cron-auth";
import { markListingsDirty } from "@/lib/search/search-doc-dirty";
import {
  getAvailability,
  rebuildListingDayInventory,
} from "@/lib/availability";
import { NextRequest } from "next/server";

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers["authorization"] = authHeader;
  return new NextRequest("http://localhost:3000/api/cron/reconcile-slots", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/reconcile-slots", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateCronAuth as jest.Mock).mockReturnValue(null);
    (getAvailability as jest.Mock).mockResolvedValue({
      listingId: "listing-1",
      totalSlots: 3,
      effectiveAvailableSlots: 3,
      heldSlots: 0,
      acceptedSlots: 0,
      rangeVersion: 1,
      asOf: new Date().toISOString(),
    });
    (rebuildListingDayInventory as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns 401 without valid CRON_SECRET", async () => {
    const mockResp = {
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    };
    (validateCronAuth as jest.Mock).mockReturnValue(mockResp);

    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  it("runs unconditionally regardless of feature flags", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        $queryRaw: jest.fn().mockResolvedValueOnce([{ locked: true }]),
        listing: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      });
    });

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();
    expect(data.drifted).toBe(0);
    expect(data.reconciled).toBe(0);
  });

  it("skips when advisory lock not acquired", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        $queryRaw: jest.fn().mockResolvedValueOnce([{ locked: false }]),
      });
    });

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe("lock_held");
  });

  it("detects drift and fixes when delta <= 5", async () => {
    (getAvailability as jest.Mock).mockResolvedValue({
      listingId: "listing-1",
      totalSlots: 3,
      effectiveAvailableSlots: 2,
      heldSlots: 0,
      acceptedSlots: 1,
      rangeVersion: 1,
      asOf: new Date().toISOString(),
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValueOnce([{ locked: true }]),
        listing: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "listing-1",
              availableSlots: 3,
              availabilitySource: "LEGACY_BOOKING",
            },
          ]),
          update: jest.fn().mockResolvedValue({ id: "listing-1" }),
        },
      };
      return fn(tx);
    });

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();
    expect(data.drifted).toBe(1);
    expect(data.reconciled).toBe(1);
    expect(rebuildListingDayInventory).toHaveBeenCalledWith(
      expect.anything(),
      "listing-1",
      expect.any(Date)
    );
  });

  it("calls markListingsDirty after auto-fix", async () => {
    (getAvailability as jest.Mock).mockResolvedValue({
      listingId: "listing-1",
      totalSlots: 3,
      effectiveAvailableSlots: 2,
      heldSlots: 0,
      acceptedSlots: 1,
      rangeVersion: 1,
      asOf: new Date().toISOString(),
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValueOnce([{ locked: true }]),
        listing: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "listing-1",
              availableSlots: 3,
              availabilitySource: "LEGACY_BOOKING",
            },
          ]),
          update: jest.fn().mockResolvedValue({ id: "listing-1" }),
        },
      };
      return fn(tx);
    });

    await GET(createRequest("Bearer valid"));
    expect(markListingsDirty).toHaveBeenCalledWith(
      ["listing-1"],
      "reconcile_slots"
    );
  });

  it("reconciles any detected legacy drift and reports skipped host-managed listings", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValueOnce([{ locked: true }]),
        listing: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "listing-legacy",
              availableSlots: 5,
              availabilitySource: "LEGACY_BOOKING",
            },
            {
              id: "listing-host-managed",
              availableSlots: 1,
              availabilitySource: "HOST_MANAGED",
            },
          ]),
          update: jest.fn().mockResolvedValue({ id: "listing-legacy" }),
        },
      };
      return fn(tx);
    });
    (getAvailability as jest.Mock).mockResolvedValue({
      listingId: "listing-legacy",
      totalSlots: 5,
      effectiveAvailableSlots: 2,
      heldSlots: 0,
      acceptedSlots: 3,
      rangeVersion: 1,
      asOf: new Date().toISOString(),
    });

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();
    expect(data.drifted).toBe(1);
    expect(data.reconciled).toBe(1);
    expect(data.skippedHostManaged).toBe(1);
    expect(rebuildListingDayInventory).toHaveBeenCalledTimes(1);
    expect(getAvailability).toHaveBeenCalledTimes(1);
  });

  it("returns zero reconciled when no drift found", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValueOnce([{ locked: true }]),
        listing: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "listing-1",
              availableSlots: 3,
              availabilitySource: "LEGACY_BOOKING",
            },
          ]),
        },
      };
      return fn(tx);
    });

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();
    expect(data.reconciled).toBe(0);
    expect(data.drifted).toBe(0);
  });

  it("skips HOST_MANAGED listings entirely", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValueOnce([{ locked: true }]),
        listing: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "listing-host-managed",
              availableSlots: 1,
              availabilitySource: "HOST_MANAGED",
            },
          ]),
        },
      };
      return fn(tx);
    });

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data.drifted).toBe(0);
    expect(data.reconciled).toBe(0);
    expect(data.skippedHostManaged).toBe(1);
    expect(rebuildListingDayInventory).not.toHaveBeenCalled();
    expect(getAvailability).not.toHaveBeenCalled();
  });
});
