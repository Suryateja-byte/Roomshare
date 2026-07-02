/**
 * Regression: the owner DELETE path must enforce the same moderation write-lock
 * that every other listing mutation enforces. A listing frozen by an admin
 * (statusReason ADMIN_PAUSED) or suppressed (SUPPRESSED) must not be
 * hard-deleted by the host — doing so would destroy evidence and defeat the
 * moderation hold. See full-site review 2026-06-26, top risk #1.
 */
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
}));

jest.mock("@/lib/csrf", () => ({
  validateCsrf: jest.fn().mockReturnValue(null),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/listing-language-guard", () => ({
  checkListingLanguageCompliance: jest.fn().mockReturnValue({ allowed: true }),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest
    .fn()
    .mockImplementation((_error: unknown, _context: unknown) => {
      const { NextResponse } = jest.requireMock("next/server");
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
    },
  },
}));

jest.mock("@/lib/env", () => ({
  features: {
    semanticSearch: false,
    get moderationWriteLocks() {
      return process.env.FEATURE_MODERATION_WRITE_LOCKS === "true";
    },
    get googleAddressValidation() {
      return process.env.FEATURE_GOOGLE_ADDRESS_VALIDATION === "true";
    },
  },
}));

jest.mock("@/lib/embeddings/sync", () => ({
  syncListingEmbedding: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/listings/canonical-lifecycle", () => ({
  syncListingLifecycleProjectionInTx: jest.fn().mockResolvedValue({
    action: "synced",
  }),
  tombstoneCanonicalInventoryInTx: jest.fn().mockResolvedValue({
    action: "tombstoned",
  }),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        remove: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  })),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headers = new Map(Object.entries(init?.headers || {}));
      return {
        status: init?.status || 200,
        json: async () => data,
        headers,
      };
    },
  },
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

import { DELETE } from "@/app/api/listings/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import {
  syncListingLifecycleProjectionInTx,
  tombstoneCanonicalInventoryInTx,
} from "@/lib/listings/canonical-lifecycle";

// Session with a fresh authTime so the (passwordless) freshness gate passes.
const ownerSession = {
  user: { id: "owner-123" },
  authTime: Math.floor(Date.now() / 1000),
};

function lockedDeleteRow(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: "owner-123",
    images: [] as string[],
    version: 3,
    statusReason: null as string | null,
    ...overrides,
  };
}

function mockDeleteTransaction({
  lockedRows = [lockedDeleteRow()],
  reportCount = 0,
}: { lockedRows?: unknown[]; reportCount?: number } = {}) {
  const queryRaw = jest.fn().mockResolvedValue(lockedRows);
  const reportCountFn = jest.fn().mockResolvedValue(reportCount);
  const update = jest.fn().mockResolvedValue({});
  const del = jest.fn().mockResolvedValue({});

  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
    callback({
      $queryRaw: queryRaw,
      report: { count: reportCountFn },
      listing: { update, delete: del },
    })
  );

  return { queryRaw, reportCountFn, update, del };
}

function deleteRequest() {
  return new Request("http://localhost/api/listings/listing-abc", {
    method: "DELETE",
  });
}

describe("DELETE /api/listings/[id] moderation write-lock", () => {
  const originalModerationWriteLocks =
    process.env.FEATURE_MODERATION_WRITE_LOCKS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FEATURE_MODERATION_WRITE_LOCKS;
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    // Passwordless account → DELETE uses the session-freshness gate.
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ password: null });
  });

  afterEach(() => {
    if (originalModerationWriteLocks === undefined) {
      delete process.env.FEATURE_MODERATION_WRITE_LOCKS;
    } else {
      process.env.FEATURE_MODERATION_WRITE_LOCKS = originalModerationWriteLocks;
    }
  });

  it("blocks hard-delete of an ADMIN_PAUSED listing even when locks are disabled", async () => {
    const { update, del } = mockDeleteTransaction({
      lockedRows: [lockedDeleteRow({ statusReason: "ADMIN_PAUSED" })],
      reportCount: 0,
    });

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: "listing-abc" }),
    });

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      code: "LISTING_LOCKED",
      lockReason: "ADMIN_PAUSED",
    });
    // Neither the hard-delete nor the suppress branch may run.
    expect(tombstoneCanonicalInventoryInTx).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("blocks delete of a SUPPRESSED listing", async () => {
    const { update, del } = mockDeleteTransaction({
      lockedRows: [lockedDeleteRow({ statusReason: "SUPPRESSED" })],
      reportCount: 0,
    });

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: "listing-abc" }),
    });

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      code: "LISTING_LOCKED",
      lockReason: "SUPPRESSED",
    });
    expect(tombstoneCanonicalInventoryInTx).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("still hard-deletes a normal listing with no reports (happy path)", async () => {
    const { update, del } = mockDeleteTransaction({
      lockedRows: [lockedDeleteRow({ statusReason: null })],
      reportCount: 0,
    });

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: "listing-abc" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(tombstoneCanonicalInventoryInTx).toHaveBeenCalledWith(
      expect.any(Object),
      "listing-abc",
      "TOMBSTONE"
    );
    expect(del).toHaveBeenCalledWith({ where: { id: "listing-abc" } });
    expect(update).not.toHaveBeenCalled();
  });

  it("still suppresses a reported listing (happy path)", async () => {
    const { update, del } = mockDeleteTransaction({
      lockedRows: [lockedDeleteRow({ statusReason: null })],
      reportCount: 2,
    });

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: "listing-abc" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-abc" },
        data: expect.objectContaining({
          status: "PAUSED",
          statusReason: "SUPPRESSED",
        }),
      })
    );
    expect(markListingDirtyInTx).toHaveBeenCalledWith(
      expect.any(Object),
      "listing-abc",
      "status_changed"
    );
    expect(syncListingLifecycleProjectionInTx).toHaveBeenCalled();
    expect(tombstoneCanonicalInventoryInTx).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
