/**
 * Tests for verification server actions.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    verificationRequest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    verificationUpload: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

jest.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: {
    verificationSubmit: { limit: 5, windowMs: 86_400_000 },
    verificationCancel: { limit: 10, windowMs: 3_600_000 },
    adminWrite: { limit: 20, windowMs: 60_000 },
  },
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));

jest.mock("@/lib/verification/storage", () => ({
  VERIFICATION_DOCUMENT_RETENTION_MS: 30 * 24 * 60 * 60 * 1000,
  deleteVerificationObjects: jest.fn().mockResolvedValue(0),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/audit", () => ({
  logAdminAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
}));

import {
  approveVerification,
  cancelVerificationRequest,
  rejectVerification,
  submitVerificationRequest,
} from "@/app/actions/verification";
import { auth } from "@/auth";
import { logAdminAction } from "@/lib/audit";
import { sendNotificationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { deleteVerificationObjects } from "@/lib/verification/storage";
import { revalidatePath } from "next/cache";

describe("Verification Actions", () => {
  const mockSession = {
    user: { id: "user-123", name: "Test User", email: "test@example.com" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
    (deleteVerificationObjects as jest.Mock).mockResolvedValue(0);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (arg: unknown) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
    );
  });

  describe("submitVerificationRequest", () => {
    it("rejects the legacy client-chosen URL contract", async () => {
      const result = await submitVerificationRequest({
        documentType: "passport",
        documentUrl:
          "https://qolpgfdmkqvxraafucvu.supabase.co/storage/v1/object/public/verification/doc.jpg",
      } as never);

      expect(result).toEqual({ error: "Invalid verification input" });
      expect(prisma.verificationRequest.create).not.toHaveBeenCalled();
    });

    it("creates a request from owned, unconsumed upload ids only", async () => {
      (prisma.verificationRequest.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isVerified: false,
      });
      const future = new Date(Date.now() + 60_000);
      (prisma.verificationUpload.findMany as jest.Mock).mockResolvedValue([
        {
          id: "upload-doc",
          userId: "user-123",
          kind: "document",
          storagePath: "user-123/document/doc.jpg",
          mimeType: "image/jpeg",
          expiresAt: future,
          consumedAt: null,
          requestId: null,
        },
        {
          id: "upload-selfie",
          userId: "user-123",
          kind: "selfie",
          storagePath: "user-123/selfie/selfie.jpg",
          mimeType: "image/png",
          expiresAt: future,
          consumedAt: null,
          requestId: null,
        },
      ]);
      (prisma.verificationRequest.create as jest.Mock).mockResolvedValue({
        id: "request-new",
      });
      (prisma.verificationUpload.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      const result = await submitVerificationRequest({
        documentType: "driver_license",
        documentUploadId: "upload-doc",
        selfieUploadId: "upload-selfie",
      });

      expect(prisma.verificationRequest.create).toHaveBeenCalledWith({
        data: {
          userId: "user-123",
          documentType: "driver_license",
          documentUrl: null,
          selfieUrl: null,
          documentPath: "user-123/document/doc.jpg",
          selfiePath: "user-123/selfie/selfie.jpg",
          documentMimeType: "image/jpeg",
          selfieMimeType: "image/png",
          documentsExpireAt: expect.any(Date),
          documentsDeletedAt: null,
        },
        select: { id: true },
      });
      expect(prisma.verificationUpload.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["upload-doc", "upload-selfie"] },
          userId: "user-123",
          consumedAt: null,
          requestId: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: {
          consumedAt: expect.any(Date),
          requestId: "request-new",
        },
      });
      expect(result).toEqual({ success: true, requestId: "request-new" });
      expect(revalidatePath).toHaveBeenCalledWith("/verify");
    });

    it("rejects an upload id owned by another user", async () => {
      (prisma.verificationRequest.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isVerified: false,
      });
      (prisma.verificationUpload.findMany as jest.Mock).mockResolvedValue([
        {
          id: "upload-doc",
          userId: "other-user",
          kind: "document",
          storagePath: "other-user/document/doc.jpg",
          mimeType: "image/jpeg",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
          requestId: null,
        },
      ]);

      const result = await submitVerificationRequest({
        documentType: "passport",
        documentUploadId: "upload-doc",
      });

      expect(result).toEqual({
        error: "Document upload is invalid or expired",
      });
      expect(prisma.verificationRequest.create).not.toHaveBeenCalled();
    });

    it("returns a clean conflict when a pending request already exists", async () => {
      (prisma.verificationRequest.findFirst as jest.Mock).mockResolvedValue({
        id: "existing",
      });

      const result = await submitVerificationRequest({
        documentType: "passport",
        documentUploadId: "upload-doc",
      });

      expect(result).toEqual({
        error: "You already have a pending verification request",
        code: "PENDING_REQUEST_EXISTS",
      });
    });

    it("applies the verification submit rate limit", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValueOnce({ success: false });

      const result = await submitVerificationRequest({
        documentType: "passport",
        documentUploadId: "upload-doc",
      });

      expect(result).toEqual({
        error: "Too many requests. Please try again later.",
      });
    });
  });

  describe("approveVerification", () => {
    it("does not transition an already reviewed request", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        isAdmin: true,
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          id: "request-123",
          userId: "user-456",
          documentType: "passport",
          status: "REJECTED",
        },
      ]);

      const result = await approveVerification("request-123");

      expect(result).toEqual({
        error: "This verification request has already been reviewed.",
        code: "STATE_CONFLICT",
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.verificationRequest.update).not.toHaveBeenCalled();
    });

    it("approves a pending request inside the guarded transaction", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce({ isAdmin: true })
        .mockResolvedValueOnce({
          id: "user-456",
          name: "Target User",
          email: "target@example.com",
        });
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          id: "request-123",
          userId: "user-456",
          documentType: "passport",
          status: "PENDING",
          documentPath: "user-456/document/doc.jpg",
          documentsExpireAt: new Date(Date.now() + 60_000),
          documentsDeletedAt: null,
        },
      ]);

      const result = await approveVerification("request-123");

      expect(prisma.verificationRequest.update).toHaveBeenCalledWith({
        where: { id: "request-123" },
        data: {
          status: "APPROVED",
          reviewedAt: expect.any(Date),
          reviewedBy: "user-123",
          documentsExpireAt: expect.any(Date),
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-456" },
        data: { isVerified: true },
      });
      expect(sendNotificationEmail).toHaveBeenCalled();
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "VERIFICATION_APPROVED",
          targetId: "request-123",
        })
      );
      expect(result).toEqual({ success: true });
    });

    it.each([
      [
        "missing document path",
        {
          documentPath: null,
          documentsExpireAt: new Date(Date.now() + 60_000),
          documentsDeletedAt: null,
        },
      ],
      [
        "expired document",
        {
          documentPath: "user-456/document/doc.jpg",
          documentsExpireAt: new Date(Date.now() - 60_000),
          documentsDeletedAt: null,
        },
      ],
      [
        "deleted document",
        {
          documentPath: "user-456/document/doc.jpg",
          documentsExpireAt: new Date(Date.now() + 60_000),
          documentsDeletedAt: new Date(),
        },
      ],
    ])("does not approve a request with %s", async (_label, documentState) => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        isAdmin: true,
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          id: "request-123",
          userId: "user-456",
          documentType: "passport",
          status: "PENDING",
          ...documentState,
        },
      ]);

      const result = await approveVerification("request-123");

      expect(result).toEqual({
        error: "Verification document is unavailable or expired.",
        code: "DOCUMENT_UNAVAILABLE",
      });
      expect(prisma.verificationRequest.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(logAdminAction).not.toHaveBeenCalled();
    });

    it("applies the admin write rate limit", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        isAdmin: true,
      });
      (checkRateLimit as jest.Mock).mockResolvedValueOnce({ success: false });

      const result = await approveVerification("request-123");

      expect(result).toEqual({ error: "Too many requests. Please slow down." });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("rejectVerification", () => {
    it("validates rejection reasons", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        isAdmin: true,
      });

      const result = await rejectVerification("request-123", "<b>No</b>");

      expect(result).toEqual({ error: "Reason cannot contain HTML" });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects only pending requests", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce({ isAdmin: true })
        .mockResolvedValueOnce({
          id: "user-456",
          name: "Target User",
          email: "target@example.com",
        });
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          id: "request-123",
          userId: "user-456",
          documentType: "passport",
          status: "PENDING",
        },
      ]);

      const result = await rejectVerification("request-123", "Blurry image");

      expect(prisma.verificationRequest.update).toHaveBeenCalledWith({
        where: { id: "request-123" },
        data: {
          status: "REJECTED",
          adminNotes: "Blurry image",
          reviewedAt: expect.any(Date),
          reviewedBy: "user-123",
          documentsExpireAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe("cancelVerificationRequest", () => {
    it("deletes only transaction-confirmed pending request objects", async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          {
            id: "request-123",
            documentPath: "user-123/document/doc.jpg",
            selfiePath: "user-123/selfie/selfie.jpg",
          },
        ])
        .mockResolvedValueOnce([
          { id: "upload-1", storagePath: "user-123/document/doc.jpg" },
        ]);
      (prisma.verificationUpload.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.verificationRequest.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const result = await cancelVerificationRequest();

      expect(prisma.verificationUpload.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["upload-1"] },
          userId: "user-123",
        },
      });
      expect(prisma.verificationRequest.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["request-123"] },
          userId: "user-123",
          status: "PENDING",
        },
      });
      expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["request-123"] }, userId: "user-123" },
        data: { documentsDeletedAt: expect.any(Date) },
      });
      expect(deleteVerificationObjects).toHaveBeenCalledWith([
        "user-123/document/doc.jpg",
        "user-123/selfie/selfie.jpg",
        "user-123/document/doc.jpg",
      ]);
      expect(
        (prisma.verificationRequest.updateMany as jest.Mock).mock
          .invocationCallOrder[0]
      ).toBeLessThan(
        (deleteVerificationObjects as jest.Mock).mock.invocationCallOrder[0]
      );
      expect(
        (deleteVerificationObjects as jest.Mock).mock.invocationCallOrder[0]
      ).toBeLessThan(
        (prisma.verificationRequest.deleteMany as jest.Mock).mock
          .invocationCallOrder[0]
      );
      expect(result).toEqual({ success: true });
    });

    it("keeps tombstoned rows retryable when storage deletion fails", async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          {
            id: "request-123",
            documentPath: "user-123/document/doc.jpg",
            selfiePath: null,
          },
        ])
        .mockResolvedValueOnce([]);
      (deleteVerificationObjects as jest.Mock).mockRejectedValueOnce(
        new Error("storage unavailable")
      );

      const result = await cancelVerificationRequest();

      expect(result).toEqual({
        error: "Failed to cancel verification request",
      });
      expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["request-123"] }, userId: "user-123" },
        data: { documentsDeletedAt: expect.any(Date) },
      });
      expect(prisma.verificationRequest.deleteMany).not.toHaveBeenCalled();
      expect(prisma.verificationUpload.deleteMany).not.toHaveBeenCalled();
    });

    it("does not delete request storage when no pending row is locked", async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await cancelVerificationRequest();

      expect(prisma.verificationRequest.deleteMany).not.toHaveBeenCalled();
      expect(deleteVerificationObjects).toHaveBeenCalledWith([]);
      expect(result).toEqual({ success: true });
    });
  });
});
