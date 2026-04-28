import type { NextRequest } from "next/server";

const mockStorageUpload = jest.fn();
const mockStorageRemove = jest.fn();
const mockSharpToBuffer = jest.fn();

function createMockPostRequest(formData: FormData): NextRequest {
  return {
    method: "POST",
    headers: new Headers({
      origin: "http://localhost",
      host: "localhost",
    }),
    formData: jest.fn().mockResolvedValue(formData),
    signal: { aborted: false },
  } as unknown as NextRequest;
}

function createMockGetRequest(): NextRequest {
  return {
    method: "GET",
    headers: new Headers(),
  } as unknown as NextRequest;
}

jest.mock("sharp", () =>
  jest.fn(() => ({
    rotate: jest.fn().mockReturnThis(),
    toBuffer: mockSharpToBuffer,
  }))
);

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: {
    verificationDocumentView: { limit: 60, windowMs: 3_600_000 },
  },
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
  getClientIP: jest.fn().mockReturnValue("127.0.0.1"),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    verificationRequest: {
      findUnique: jest.fn(),
    },
    verificationUpload: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/verification/storage", () => ({
  VERIFICATION_DOCUMENTS_BUCKET: "verification-documents",
  VERIFICATION_UPLOAD_TTL_MS: 3_600_000,
  buildVerificationStoragePath: jest
    .fn()
    .mockReturnValue("user-123/document/generated.jpg"),
  getVerificationStorageClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload: mockStorageUpload,
        remove: mockStorageRemove,
      })),
    },
  })),
  isVerificationMimeType: jest.fn((mimeType: string) =>
    ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
  ),
  validateVerificationMagicBytes: jest.fn().mockReturnValue(true),
  createVerificationSignedUrl: jest
    .fn()
    .mockResolvedValue("https://signed.example/private-doc?token=short"),
}));

jest.mock("@/lib/audit", () => ({
  logAdminAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
}));

import { POST } from "@/app/api/verification/upload/route";
import { GET } from "@/app/api/admin/verifications/[id]/documents/[kind]/route";
import { auth } from "@/auth";
import { logAdminAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createVerificationSignedUrl } from "@/lib/verification/storage";

describe("verification document APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-123" } });
    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageRemove.mockResolvedValue({ error: null });
    mockSharpToBuffer.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0x00]));
  });

  it("uploads verification images privately and returns only an upload id", async () => {
    const expiresAt = new Date("2026-05-01T00:00:00.000Z");
    (prisma.verificationUpload.create as jest.Mock).mockResolvedValue({
      id: "upload-1",
      kind: "document",
      expiresAt,
    });

    const formData = new FormData();
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const file = new File([jpegBuffer], "doc.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: jest.fn().mockResolvedValue(jpegBuffer),
    });
    formData.append("file", file);
    formData.append("kind", "document");

    const response = await POST(createMockPostRequest(formData));

    expect(response.status).toBe(200);
    expect(mockStorageUpload).toHaveBeenCalledWith(
      "user-123/document/generated.jpg",
      expect.any(Buffer),
      { contentType: "image/jpeg", upsert: false }
    );
    expect(prisma.verificationUpload.create).toHaveBeenCalledWith({
      data: {
        userId: "user-123",
        kind: "document",
        storagePath: "user-123/document/generated.jpg",
        mimeType: "image/jpeg",
        sizeBytes: jpegBuffer.length,
        expiresAt: expect.any(Date),
      },
      select: {
        id: true,
        kind: true,
        expiresAt: true,
      },
    });
  });

  it("rejects unsupported verification upload MIME types", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File([Buffer.from("%PDF")], "doc.pdf", {
        type: "application/pdf",
      })
    );
    formData.append("kind", "document");

    const response = await POST(createMockPostRequest(formData));

    expect(response.status).toBe(400);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it("redirects admins to a short-lived signed URL without exposing paths", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true });
    (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue({
      id: "request-123",
      userId: "user-456",
      documentType: "passport",
      documentPath: "user-456/document/private.jpg",
      selfiePath: null,
      documentsExpireAt: new Date(Date.now() + 60_000),
      documentsDeletedAt: null,
    });

    const response = await GET(createMockGetRequest(), {
      params: Promise.resolve({ id: "request-123", kind: "document" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://signed.example/private-doc?token=short"
    );
    expect(createVerificationSignedUrl).toHaveBeenCalledWith(
      "user-456/document/private.jpg"
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "VERIFICATION_DOCUMENT_VIEWED",
        details: {
          userId: "user-456",
          kind: "document",
          documentType: "passport",
        },
      })
    );
  });

  it("does not sign expired verification documents", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true });
    (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue({
      id: "request-123",
      userId: "user-456",
      documentType: "passport",
      documentPath: "user-456/document/private.jpg",
      selfiePath: null,
      documentsExpireAt: new Date(Date.now() - 60_000),
      documentsDeletedAt: null,
    });

    const response = await GET(createMockGetRequest(), {
      params: Promise.resolve({ id: "request-123", kind: "document" }),
    });

    expect(response.status).toBe(410);
    expect(createVerificationSignedUrl).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("does not sign deleted verification documents", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true });
    (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue({
      id: "request-123",
      userId: "user-456",
      documentType: "passport",
      documentPath: "user-456/document/private.jpg",
      selfiePath: null,
      documentsExpireAt: null,
      documentsDeletedAt: new Date(),
    });

    const response = await GET(createMockGetRequest(), {
      params: Promise.resolve({ id: "request-123", kind: "document" }),
    });

    expect(response.status).toBe(410);
    expect(createVerificationSignedUrl).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("blocks non-admins from signed document access", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: false });

    const response = await GET(createMockGetRequest(), {
      params: Promise.resolve({ id: "request-123", kind: "document" }),
    });

    expect(response.status).toBe(403);
    expect(createVerificationSignedUrl).not.toHaveBeenCalled();
  });
});
