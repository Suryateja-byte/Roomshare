/**
 * IDOR & Data Exposure Prevention Tests — Phase 2
 *
 * Covers gaps not in idor-comprehensive.test.ts:
 * - Saved search IDOR (delete/toggle/rename another user's search)
 * - Notification IDOR (mark-read/delete another user's notification)
 * - Review response IDOR (create/update/delete on reviews you don't own)
 * - getUserSettings does NOT return password hash to client
 * - auth.ts getUser() uses select (structural assertion)
 */

jest.mock("@/lib/prisma", () => {
  const mockPrisma: Record<string, any> = {
    user: { findUnique: jest.fn() },
    savedSearch: {
      findMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    notification: {
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    review: { findUnique: jest.fn() },
    reviewResponse: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    listing: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  return { prisma: mockPrisma };
});

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: {
    sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    debug: jest.fn().mockResolvedValue(undefined),
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ success: true, remaining: 10, resetAt: new Date() }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    notifications: { limit: 60, windowMs: 60000 },
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  checkServerComponentRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const mockPrisma = prisma as unknown as Record<
  string,
  Record<string, jest.Mock>
>;

const ALICE = { user: { id: "alice-id", name: "Alice" } };

describe("IDOR & Data Exposure Prevention — Phase 2", () => {
  beforeEach(() => jest.clearAllMocks());

  // ──────────────────────────────────────────────
  // Saved Search IDOR
  // ──────────────────────────────────────────────
  describe("Saved Search IDOR", () => {
    it("deleteSavedSearch rejects when userId does not match (Prisma compound WHERE)", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      // Prisma throws P2025 when compound WHERE (id + userId) finds nothing
      mockPrisma.savedSearch.delete.mockRejectedValue(
        Object.assign(new Error("Record to delete does not exist."), {
          code: "P2025",
        })
      );

      const { deleteSavedSearch } = await import("@/app/actions/saved-search");
      const result = await deleteSavedSearch("bob-search-id");
      expect(result).toEqual({ error: expect.stringContaining("delete") });

      // Verify the WHERE clause includes userId
      expect(mockPrisma.savedSearch.delete).toHaveBeenCalledWith({
        where: { id: "bob-search-id", userId: "alice-id" },
      });
    });

    it("toggleSearchAlert rejects when userId does not match", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      mockPrisma.savedSearch.update.mockRejectedValue(
        Object.assign(new Error("Record not found"), { code: "P2025" })
      );

      const { toggleSearchAlert } = await import("@/app/actions/saved-search");
      const result = await toggleSearchAlert("bob-search-id", true);
      expect(result).toEqual({ error: expect.stringContaining("alert") });

      expect(mockPrisma.savedSearch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "bob-search-id", userId: "alice-id" },
          data: { alertEnabled: true },
          select: expect.objectContaining({
            id: true,
            alertEnabled: true,
            alertFrequency: true,
          }),
        })
      );
    });

    it("updateSavedSearchName rejects when userId does not match", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      mockPrisma.savedSearch.update.mockRejectedValue(
        Object.assign(new Error("Record not found"), { code: "P2025" })
      );

      const { updateSavedSearchName } =
        await import("@/app/actions/saved-search");
      const result = await updateSavedSearchName(
        "bob-search-id",
        "Hacked Name"
      );
      expect(result).toEqual({ error: expect.stringContaining("search name") });

      expect(mockPrisma.savedSearch.update).toHaveBeenCalledWith({
        where: { id: "bob-search-id", userId: "alice-id" },
        data: { name: "Hacked Name" },
      });
    });
  });

  // ──────────────────────────────────────────────
  // Notification IDOR
  // ──────────────────────────────────────────────
  describe("Notification IDOR", () => {
    it("markNotificationAsRead uses compound WHERE with userId", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      // Prisma throws when compound WHERE doesn't match (notification belongs to Bob)
      mockPrisma.notification.update.mockRejectedValue(
        Object.assign(new Error("Record not found"), { code: "P2025" })
      );

      const { markNotificationAsRead } =
        await import("@/app/actions/notifications");
      const result = await markNotificationAsRead("bob-notification-id");
      expect(result).toEqual({ error: expect.any(String) });

      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: {
          id: "bob-notification-id",
          userId: "alice-id",
        },
        data: { read: true },
      });
    });

    it("deleteNotification uses compound WHERE with userId", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      mockPrisma.notification.delete.mockRejectedValue(
        Object.assign(new Error("Record not found"), { code: "P2025" })
      );

      const { deleteNotification } =
        await import("@/app/actions/notifications");
      const result = await deleteNotification("bob-notification-id");
      expect(result).toEqual({ error: expect.any(String) });

      expect(mockPrisma.notification.delete).toHaveBeenCalledWith({
        where: {
          id: "bob-notification-id",
          userId: "alice-id",
        },
      });
    });
  });

  // ──────────────────────────────────────────────
  // Review Response IDOR
  // ──────────────────────────────────────────────
  describe("Review Response IDOR", () => {
    it("createReviewResponse rejects non-listing-owner", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      mockPrisma.review.findUnique.mockResolvedValue({
        id: "review-1",
        listing: { ownerId: "bob-id" }, // Bob owns the listing, Alice is trying
      });

      const { createReviewResponse } =
        await import("@/app/actions/review-response");
      const result = await createReviewResponse("review-1", "Nice try");
      expect(result).toEqual({ error: expect.stringContaining("owner") });
    });

    it("updateReviewResponse rejects non-listing-owner", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      mockPrisma.reviewResponse.findUnique.mockResolvedValue({
        id: "response-1",
        reviewId: "review-1",
        review: { listing: { ownerId: "bob-id" } },
      });

      const { updateReviewResponse } =
        await import("@/app/actions/review-response");
      const result = await updateReviewResponse("response-1", "Edited");
      expect(result).toEqual({ error: expect.stringContaining("owner") });
    });

    it("deleteReviewResponse rejects non-listing-owner", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      mockPrisma.reviewResponse.findUnique.mockResolvedValue({
        id: "response-1",
        reviewId: "review-1",
        review: { listing: { ownerId: "bob-id" } },
      });

      const { deleteReviewResponse } =
        await import("@/app/actions/review-response");
      const result = await deleteReviewResponse("response-1");
      expect(result).toEqual({ error: expect.stringContaining("owner") });
    });
  });

  // ──────────────────────────────────────────────
  // Data Exposure — getUserSettings
  // ──────────────────────────────────────────────
  describe("getUserSettings data exposure", () => {
    it("returns hasPassword boolean, NOT the password hash", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      mockPrisma.user.findUnique
        // First call: user data (no password field)
        .mockResolvedValueOnce({
          id: "alice-id",
          name: "Alice",
          email: "alice@example.com",
          notificationPreferences: null,
        })
        // Second call: password check
        .mockResolvedValueOnce({ password: "$2a$12$hashvalue" });

      const { getUserSettings } = await import("@/app/actions/settings");
      const result = await getUserSettings();

      expect(result).not.toBeNull();
      expect(result!.hasPassword).toBe(true);
      // password hash must never appear in the return value
      expect(result).not.toHaveProperty("password");
      expect(JSON.stringify(result)).not.toContain("$2a$");
    });

    it("returns hasPassword=false for OAuth-only accounts", async () => {
      (auth as jest.Mock).mockResolvedValue(ALICE);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: "alice-id",
          name: "Alice",
          email: "alice@example.com",
          notificationPreferences: null,
        })
        .mockResolvedValueOnce({ password: null });

      const { getUserSettings } = await import("@/app/actions/settings");
      const result = await getUserSettings();

      expect(result!.hasPassword).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Structural — auth.ts getUser() uses select
  // ──────────────────────────────────────────────
  describe("auth.ts getUser() defense-in-depth", () => {
    it("uses select clause (not bare findUnique)", async () => {
      // Read the actual auth.ts source and verify select is present
      const fs = require("fs");
      const authSource = fs.readFileSync(
        require("path").resolve(__dirname, "../../auth.ts"),
        "utf8"
      );

      // Ensure getUser uses select (defense-in-depth)
      const getUserBlock = authSource.match(
        /async function getUser[\s\S]*?return user;/
      );
      expect(getUserBlock).not.toBeNull();
      expect(getUserBlock![0]).toContain("select:");
      expect(getUserBlock![0]).toContain("password: true");
      expect(getUserBlock![0]).toContain("id: true");
    });
  });
});
