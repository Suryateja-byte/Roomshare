/**
 * Tests for GET /api/cron/embeddings-maintenance route
 */

jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest extends Request {
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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/embeddings/sync", () => ({
  recoverStuckEmbeddings: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  features: { semanticSearch: true },
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
  sanitizeErrorMessage: jest.fn((e: unknown) => String(e)),
}));

import { GET } from "@/app/api/cron/embeddings-maintenance/route";
import { prisma } from "@/lib/prisma";
import { validateCronAuth } from "@/lib/cron-auth";
import { recoverStuckEmbeddings } from "@/lib/embeddings/sync";
import { features } from "@/lib/env";
import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";

function createRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cron/embeddings-maintenance", {
    headers: { authorization: "Bearer mock-cron-secret" },
  });
}

describe("GET /api/cron/embeddings-maintenance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateCronAuth as jest.Mock).mockReturnValue(null);
    (recoverStuckEmbeddings as jest.Mock).mockResolvedValue(3);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { embedding_status: "DONE", count: BigInt(100) },
      { embedding_status: "PENDING", count: BigInt(5) },
    ]);
    // Ensure semanticSearch feature is enabled by default
    (features as { semanticSearch: boolean }).semanticSearch = true;
  });

  it("returns auth error response when cron auth fails", async () => {
    const authErrorResponse = {
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
      headers: new Map(),
    };
    (validateCronAuth as jest.Mock).mockReturnValue(authErrorResponse);

    const response = await GET(createRequest());

    expect(response).toBe(authErrorResponse);
    expect(recoverStuckEmbeddings).not.toHaveBeenCalled();
  });

  it("skips processing and returns skipped response when semanticSearch feature flag is disabled", async () => {
    (features as { semanticSearch: boolean }).semanticSearch = false;

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.skipped).toBe(true);
    expect(recoverStuckEmbeddings).not.toHaveBeenCalled();
  });

  it("recovers stuck embeddings and returns recovered count", async () => {
    (recoverStuckEmbeddings as jest.Mock).mockResolvedValue(7);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.recovered).toBe(7);
    expect(recoverStuckEmbeddings).toHaveBeenCalledWith(10);
  });

  it("returns correct total count from status rows", async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { embedding_status: "DONE", count: BigInt(80) },
      { embedding_status: "PENDING", count: BigInt(15) },
      { embedding_status: "PROCESSING", count: BigInt(5) },
    ]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(data.total).toBe(100);
    expect(data.status).toEqual({
      DONE: 80,
      PENDING: 15,
      PROCESSING: 5,
    });
  });

  it("returns 500 on error", async () => {
    (recoverStuckEmbeddings as jest.Mock).mockRejectedValue(
      new Error("Embedding service unavailable")
    );

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  it("captures exception to Sentry on failure", async () => {
    const serviceError = new Error("Embedding service unavailable");
    (recoverStuckEmbeddings as jest.Mock).mockRejectedValue(serviceError);

    await GET(createRequest());

    expect(Sentry.captureException).toHaveBeenCalledWith(
      serviceError,
      expect.objectContaining({ tags: { cron: "embeddings-maintenance" } })
    );
  });
});
