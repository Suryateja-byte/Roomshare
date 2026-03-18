/**
 * Tests for GET /api/bookings/[id]/audit route (Phase 5)
 *
 * Tests feature flag, auth, input validation, authorization (tenant/host/admin),
 * response shape, chronological order, and PII exclusion.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: jest.fn(),
    },
    bookingAuditLog: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  features: {
    bookingAudit: true,
  },
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

import { GET } from "@/app/api/bookings/[id]/audit/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { features } from "@/lib/env";
import { NextRequest } from "next/server";

function createRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/bookings/booking-1/audit", {
    method: "GET",
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/bookings/[id]/audit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (features as any).bookingAudit = true;
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "tenant-1", isAdmin: false },
    });
  });

  it("returns 404 when feature flag off", async () => {
    (features as any).bookingAudit = false;
    const response = await GET(createRequest(), makeParams("booking-1"));
    expect(response.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    const response = await GET(createRequest(), makeParams("booking-1"));
    expect(response.status).toBe(401);
  });

  it("returns 400 for empty bookingId", async () => {
    const response = await GET(createRequest(), makeParams(""));
    expect(response.status).toBe(400);
  });

  it("returns 400 for bookingId longer than 30 chars", async () => {
    const longId = "a".repeat(31);
    const response = await GET(createRequest(), makeParams(longId));
    expect(response.status).toBe(400);
  });

  it("returns 404 when booking not found", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(null);
    const response = await GET(createRequest(), makeParams("booking-1"));
    expect(response.status).toBe(404);
  });

  it("returns 403 when user is neither tenant, host, nor admin", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "stranger-1", isAdmin: false },
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: "booking-1",
      tenantId: "tenant-1",
      listing: { ownerId: "host-1" },
    });

    const response = await GET(createRequest(), makeParams("booking-1"));
    expect(response.status).toBe(403);
  });

  it("returns audit entries for tenant", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: "booking-1",
      tenantId: "tenant-1",
      listing: { ownerId: "host-1" },
    });
    (prisma.bookingAuditLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: "audit-1",
        action: "CREATED",
        previousStatus: null,
        newStatus: "PENDING",
        actorType: "USER",
        actorId: "tenant-1",
        details: { slotsRequested: 1 },
        createdAt: new Date("2026-03-12T00:00:00Z"),
      },
    ]);

    const response = await GET(createRequest(), makeParams("booking-1"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.bookingId).toBe("booking-1");
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].action).toBe("CREATED");
  });

  it("returns audit entries for host (listing owner)", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "host-1", isAdmin: false },
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: "booking-1",
      tenantId: "tenant-1",
      listing: { ownerId: "host-1" },
    });
    (prisma.bookingAuditLog.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(createRequest(), makeParams("booking-1"));
    expect(response.status).toBe(200);
  });

  it("returns audit entries for admin", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: "booking-1",
      tenantId: "tenant-1",
      listing: { ownerId: "host-1" },
    });
    (prisma.bookingAuditLog.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(createRequest(), makeParams("booking-1"));
    expect(response.status).toBe(200);
  });

  it("Prisma select excludes actorId (PII protection)", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: "booking-1",
      tenantId: "tenant-1",
      listing: { ownerId: "host-1" },
    });
    (prisma.bookingAuditLog.findMany as jest.Mock).mockResolvedValue([]);

    await GET(createRequest(), makeParams("booking-1"));

    const findManyCall = (prisma.bookingAuditLog.findMany as jest.Mock).mock
      .calls[0][0];
    expect(findManyCall.select).toBeDefined();
    expect(findManyCall.select.actorId).toBeUndefined();
    // Also verify ipAddress is excluded (PII)
    expect(findManyCall.select.ipAddress).toBeUndefined();
  });

  it("entries ordered by createdAt ASC", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: "booking-1",
      tenantId: "tenant-1",
      listing: { ownerId: "host-1" },
    });

    await GET(createRequest(), makeParams("booking-1"));

    expect(prisma.bookingAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
      })
    );
  });
});
