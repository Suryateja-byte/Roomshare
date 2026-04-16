jest.mock("@/lib/prisma", () => ({
  prisma: {
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
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : "Unknown error"
  ),
}));

jest.mock("@/lib/search/search-doc-sync", () => ({
  projectSearchDocument: jest.fn(),
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

import { GET } from "@/app/api/cron/refresh-search-docs/route";
import { validateCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { projectSearchDocument } from "@/lib/search/search-doc-sync";
import { NextRequest } from "next/server";

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers.authorization = authHeader;
  }

  return new NextRequest(
    "http://localhost:3000/api/cron/refresh-search-docs",
    {
      method: "GET",
      headers,
    }
  );
}

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as jest.Mock;
const mockValidateCronAuth = validateCronAuth as jest.Mock;
const mockProjectSearchDocument = projectSearchDocument as jest.Mock;

describe("GET /api/cron/refresh-search-docs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateCronAuth.mockReturnValue(null);
    mockExecuteRaw.mockResolvedValue(1);
  });

  it("returns 401 when cron auth fails", async () => {
    const authResponse = {
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    };
    mockValidateCronAuth.mockReturnValue(authResponse);

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
  });

  it("returns zero counters when there is no dirty work", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 0,
      orphans: 0,
      suppressed: 0,
      deferred: 0,
      divergentMissingDoc: 0,
      divergentStaleDoc: 0,
      divergentVersionSkew: 0,
    });
    expect(mockProjectSearchDocument).not.toHaveBeenCalled();
  });

  it("counts version_skew divergences independently of stale_doc and missing_doc", async () => {
    mockQueryRaw.mockResolvedValue([
      { listing_id: "listing-a" },
      { listing_id: "listing-b" },
      { listing_id: "listing-c" },
    ]);
    mockProjectSearchDocument
      .mockResolvedValueOnce({
        listingId: "listing-a",
        outcome: "upsert",
        divergenceReason: "version_skew",
        hadExistingDoc: true,
      })
      .mockResolvedValueOnce({
        listingId: "listing-b",
        outcome: "upsert",
        divergenceReason: "version_skew",
        hadExistingDoc: true,
      })
      .mockResolvedValueOnce({
        listingId: "listing-c",
        outcome: "upsert",
        divergenceReason: "stale_doc",
        hadExistingDoc: true,
      });

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 3,
      orphans: 0,
      suppressed: 0,
      deferred: 0,
      divergentMissingDoc: 0,
      divergentStaleDoc: 1,
      divergentVersionSkew: 2,
    });
  });

  it("clears dirty flags for handled suppressions and true orphans", async () => {
    mockQueryRaw.mockResolvedValue([{ listing_id: "host-1" }, { listing_id: "gone-1" }]);
    mockProjectSearchDocument
      .mockResolvedValueOnce({
        listingId: "host-1",
        outcome: "suppress_delete",
        divergenceReason: "stale_doc",
        hadExistingDoc: true,
      })
      .mockResolvedValueOnce({
        listingId: "gone-1",
        outcome: "confirmed_orphan",
        divergenceReason: null,
        hadExistingDoc: false,
      });

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 0,
      orphans: 1,
      suppressed: 1,
      deferred: 0,
      divergentMissingDoc: 0,
      divergentStaleDoc: 1,
    });
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it("keeps dirty flags when projection must defer for retry", async () => {
    mockQueryRaw.mockResolvedValue([{ listing_id: "listing-1" }]);
    mockProjectSearchDocument.mockResolvedValue({
      listingId: "listing-1",
      outcome: "defer_retry",
      divergenceReason: "missing_doc",
      hadExistingDoc: false,
    });

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 0,
      orphans: 0,
      suppressed: 0,
      deferred: 1,
      divergentMissingDoc: 1,
      divergentStaleDoc: 0,
    });
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("mixes upsert, defer, suppression, and failures without losing eventual consistency", async () => {
    mockQueryRaw.mockResolvedValue([
      { listing_id: "upsert-1" },
      { listing_id: "defer-1" },
      { listing_id: "suppress-1" },
      { listing_id: "error-1" },
    ]);
    mockProjectSearchDocument
      .mockResolvedValueOnce({
        listingId: "upsert-1",
        outcome: "upsert",
        divergenceReason: "missing_doc",
        hadExistingDoc: false,
      })
      .mockResolvedValueOnce({
        listingId: "defer-1",
        outcome: "defer_retry",
        divergenceReason: "stale_doc",
        hadExistingDoc: true,
      })
      .mockResolvedValueOnce({
        listingId: "suppress-1",
        outcome: "suppress_delete",
        divergenceReason: null,
        hadExistingDoc: false,
      })
      .mockRejectedValueOnce(new Error("projection failed"));

    const response = await GET(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: false,
      processed: 1,
      orphans: 0,
      suppressed: 1,
      deferred: 1,
      divergentMissingDoc: 1,
      divergentStaleDoc: 1,
      errors: 1,
    });
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });
});
