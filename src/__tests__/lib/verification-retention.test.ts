jest.mock("@/lib/prisma", () => ({
  prisma: {
    verificationRequest: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    verificationUpload: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/verification/storage", () => ({
  VERIFICATION_DOCUMENT_RETENTION_MS: 30 * 24 * 60 * 60 * 1000,
  deleteVerificationObjects: jest.fn().mockResolvedValue(0),
}));

import { prisma } from "@/lib/prisma";
import { cleanupExpiredVerificationDocumentsOnce } from "@/lib/verification/retention";
import { deleteVerificationObjects } from "@/lib/verification/storage";

describe("cleanupExpiredVerificationDocumentsOnce", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (arg: unknown) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return (arg as (tx: unknown) => Promise<unknown>)({
          $queryRaw: prisma.$queryRaw,
          verificationRequest: {
            updateMany: prisma.verificationRequest.updateMany,
            deleteMany: prisma.verificationRequest.deleteMany,
          },
          verificationUpload: {
            deleteMany: prisma.verificationUpload.deleteMany,
          },
        });
      }
    );
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    (deleteVerificationObjects as jest.Mock).mockResolvedValue(0);
  });

  it("deletes expired reviewed docs and expired staged uploads", async () => {
    const now = new Date("2026-05-01T00:00:00.000Z");
    (prisma.verificationRequest.findMany as jest.Mock).mockResolvedValue([
      {
        id: "request-1",
        documentPath: "user-1/document/doc.jpg",
        selfiePath: "user-1/selfie/selfie.jpg",
      },
    ]);
    (prisma.verificationUpload.findMany as jest.Mock).mockResolvedValue([
      { id: "upload-1", storagePath: "user-1/document/staged.jpg" },
    ]);
    (deleteVerificationObjects as jest.Mock).mockResolvedValue(3);
    (prisma.verificationRequest.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.verificationUpload.deleteMany as jest.Mock).mockResolvedValue({
      count: 1,
    });

    const result = await cleanupExpiredVerificationDocumentsOnce({ now });

    expect(deleteVerificationObjects).toHaveBeenCalledWith([
      "user-1/document/doc.jpg",
      "user-1/selfie/selfie.jpg",
      "user-1/document/staged.jpg",
    ]);
    expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["request-1"] } },
      data: {
        documentPath: null,
        selfiePath: null,
        documentMimeType: null,
        selfieMimeType: null,
        documentsDeletedAt: now,
      },
    });
    expect(prisma.verificationUpload.deleteMany).toHaveBeenCalledWith({
      where: { requestId: { in: ["request-1"] } },
    });
    expect(prisma.verificationUpload.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["upload-1"] } },
    });
    expect(result).toEqual({
      requestsProcessed: 1,
      pendingRequestsExpired: 0,
      stagedUploadsDeleted: 1,
      objectsDeleted: 3,
    });
  });

  it("expires pending requests after tombstoning and successful storage deletion", async () => {
    const now = new Date("2026-05-01T00:00:00.000Z");
    (prisma.verificationRequest.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      {
        id: "request-pending",
        documentPath: "user-2/document/doc.jpg",
        selfiePath: "user-2/selfie/selfie.jpg",
      },
    ]);
    (prisma.verificationUpload.findMany as jest.Mock).mockResolvedValue([]);
    (deleteVerificationObjects as jest.Mock).mockResolvedValue(2);
    (prisma.verificationRequest.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.verificationRequest.deleteMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.verificationUpload.deleteMany as jest.Mock).mockResolvedValue({
      count: 2,
    });

    const result = await cleanupExpiredVerificationDocumentsOnce({ now });

    expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["request-pending"] },
        documentsDeletedAt: null,
      },
      data: { documentsDeletedAt: now },
    });
    expect(deleteVerificationObjects).toHaveBeenCalledWith([
      "user-2/document/doc.jpg",
      "user-2/selfie/selfie.jpg",
    ]);
    expect(prisma.verificationUpload.deleteMany).toHaveBeenCalledWith({
      where: { requestId: { in: ["request-pending"] } },
    });
    expect(prisma.verificationRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["request-pending"] },
        status: "PENDING",
        documentsDeletedAt: { not: null },
      },
    });
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
    expect(result).toEqual({
      requestsProcessed: 0,
      pendingRequestsExpired: 1,
      stagedUploadsDeleted: 0,
      objectsDeleted: 2,
    });
  });

  it("keeps expired pending rows retryable when storage deletion fails", async () => {
    const now = new Date("2026-05-01T00:00:00.000Z");
    (prisma.verificationRequest.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      {
        id: "request-pending",
        documentPath: "user-2/document/doc.jpg",
        selfiePath: null,
      },
    ]);
    (prisma.verificationUpload.findMany as jest.Mock).mockResolvedValue([]);
    (deleteVerificationObjects as jest.Mock).mockRejectedValue(
      new Error("storage unavailable")
    );

    await expect(
      cleanupExpiredVerificationDocumentsOnce({ now })
    ).rejects.toThrow("storage unavailable");

    expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["request-pending"] },
        documentsDeletedAt: null,
      },
      data: { documentsDeletedAt: now },
    });
    expect(prisma.verificationRequest.deleteMany).not.toHaveBeenCalled();
    expect(prisma.verificationUpload.deleteMany).not.toHaveBeenCalled();
  });

  it("includes legacy pending rows with null document expiry in the cleanup lock", async () => {
    (prisma.verificationRequest.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    (prisma.verificationUpload.findMany as jest.Mock).mockResolvedValue([]);

    await cleanupExpiredVerificationDocumentsOnce({
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    const queryParts = (prisma.$queryRaw as jest.Mock).mock.calls[0][0] as
      | TemplateStringsArray
      | string[];
    expect(queryParts.join("")).toContain('"documentsExpireAt" IS NULL');
    expect(queryParts.join("")).toContain('"createdAt" <=');
  });
});
