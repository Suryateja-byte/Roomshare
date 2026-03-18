/**
 * Integration tests for POST/DELETE /api/upload
 *
 * Tests the actual route handlers with mocked dependencies:
 *   - Auth (401 for unauthenticated)
 *   - Missing file / invalid MIME / size limit / magic bytes mismatch
 *   - Successful upload (mock Supabase storage)
 *   - Supabase failure → 500
 *   - DELETE path traversal prevention
 *   - DELETE success
 */

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
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
  apiErrorResponse: jest.fn(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({
          data: { path: "listings/user-123/123-abc.jpg" },
          error: null,
        }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: {
            publicUrl:
              "https://test.supabase.co/storage/v1/object/public/images/listings/user-123/123-abc.jpg",
          },
        }),
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

// Set env vars for Supabase
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

import { auth } from "@/auth";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// JPEG magic bytes: FF D8 FF
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
// PNG magic bytes (available for PNG upload tests)
// const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function makeUploadRequest(file: File | null, type = "listing"): Request {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  formData.append("type", type);

  // Create a mock request with explicit formData() support
  // (Request.formData() may not work in Jest's Node.js environment)
  const request = new Request("http://localhost/api/upload", {
    method: "POST",
  });
  // Override formData to return our form data directly
  (request as any).formData = async () => formData;
  return request;
}

function makeDeleteRequest(body: unknown): Request {
  return new Request("http://localhost/api/upload", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function createFakeFile(
  content: Uint8Array | Buffer,
  name: string,
  type: string,
  size?: number
): File {
  const bytes = new Uint8Array(content);
  const blob = new Blob([bytes as BlobPart], { type });
  const file = new File([blob], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, "size", { value: size });
  }
  // Ensure arrayBuffer() works in Jest's Node.js environment
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
  (file as any).arrayBuffer = async () => arrayBuffer;
  return file;
}

const mockSession = {
  user: { id: "user-123", name: "Test User", email: "test@example.com" },
};

// ---------------------------------------------------------------------------
// We need to dynamically import POST and DELETE after mocks are set up.
// Jest hoists jest.mock() calls, but we import the route handlers below.
// ---------------------------------------------------------------------------
let POST: typeof import("@/app/api/upload/route").POST;
let DELETE: typeof import("@/app/api/upload/route").DELETE;

beforeAll(async () => {
  const mod = await import("@/app/api/upload/route");
  POST = mod.POST;
  DELETE = mod.DELETE;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
  });

  it("returns 401 when not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const file = createFakeFile(JPEG_MAGIC, "photo.jpg", "image/jpeg");
    const request = makeUploadRequest(file);
    const response = await POST(request as any);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when no file is provided", async () => {
    const request = makeUploadRequest(null);
    const response = await POST(request as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("No file provided");
  });

  it("returns 400 for invalid MIME type", async () => {
    const file = createFakeFile(
      Buffer.from("%PDF-1.4"),
      "document.pdf",
      "application/pdf"
    );
    const request = makeUploadRequest(file);
    const response = await POST(request as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid file type");
  });

  it("returns 400 when file exceeds 5MB size limit", async () => {
    // Create a file with valid JPEG magic bytes but oversized
    const file = createFakeFile(
      JPEG_MAGIC,
      "huge.jpg",
      "image/jpeg",
      6 * 1024 * 1024 // 6MB
    );
    const request = makeUploadRequest(file);
    const response = await POST(request as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("File too large");
  });

  it("returns 400 when magic bytes do not match declared MIME type", async () => {
    // Declare as PNG but content has JPEG magic bytes
    const file = createFakeFile(JPEG_MAGIC, "fake.png", "image/png");
    const request = makeUploadRequest(file);
    const response = await POST(request as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("does not match");
  });

  it("returns 200 with URL on successful upload", async () => {
    const file = createFakeFile(JPEG_MAGIC, "photo.jpg", "image/jpeg");
    const request = makeUploadRequest(file);
    const response = await POST(request as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toBeDefined();
    expect(body.path).toBeDefined();
  });

  it("returns 500 when Supabase upload fails", async () => {
    // Override the mock for this test to simulate upload failure
    const mockFrom = jest.fn(() => ({
      upload: jest.fn().mockResolvedValue({
        data: null,
        error: { name: "StorageError", message: "Upload failed" },
      }),
      getPublicUrl: jest.fn(),
      remove: jest.fn(),
    }));
    (createClient as jest.Mock).mockReturnValueOnce({
      storage: { from: mockFrom },
    });

    // Re-import to pick up the new mock
    jest.resetModules();

    // Set up mocks again after reset
    jest.doMock("@/auth", () => ({
      auth: jest.fn().mockResolvedValue(mockSession),
    }));
    jest.doMock("@/lib/with-rate-limit", () => ({
      withRateLimit: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock("@/lib/logger", () => ({
      logger: {
        info: jest.fn().mockResolvedValue(undefined),
        warn: jest.fn().mockResolvedValue(undefined),
        sync: { error: jest.fn(), warn: jest.fn() },
      },
    }));
    jest.doMock("@/lib/api-error-handler", () => ({
      captureApiError: jest.fn().mockImplementation(() => {
        const { NextResponse } = jest.requireMock("next/server");
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }),
      apiErrorResponse: jest.fn(),
    }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: jest.fn(() => ({
        storage: {
          from: jest.fn(() => ({
            upload: jest.fn().mockResolvedValue({
              data: null,
              error: { name: "StorageError", message: "Upload failed" },
            }),
            getPublicUrl: jest.fn(),
            remove: jest.fn(),
          })),
        },
      })),
    }));
    jest.doMock("next/server", () => ({
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

    const { POST: POST2 } = await import("@/app/api/upload/route");

    const file = createFakeFile(JPEG_MAGIC, "photo.jpg", "image/jpeg");
    const request = makeUploadRequest(file);
    const response = await POST2(request as any);

    expect(response.status).toBe(500);
    const body = await response.json();
    // After jest.resetModules(), the captureApiError mock returns 'Internal server error'
    // for caught exceptions, or the route returns 'Failed to upload' for Supabase errors
    expect(body.error).toMatch(/Failed to upload|Internal server error/);
  });
});

describe("DELETE /api/upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
  });

  it("returns 401 when not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const request = makeDeleteRequest({ path: "listings/user-123/photo.jpg" });
    const response = await DELETE(request as any);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for path traversal attempt (../../etc/passwd)", async () => {
    const request = makeDeleteRequest({ path: "../../etc/passwd" });
    const response = await DELETE(request as any);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when trying to delete another user's file", async () => {
    const request = makeDeleteRequest({
      path: "listings/other-user-456/photo.jpg",
    });
    const response = await DELETE(request as any);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 on successful deletion of own file", async () => {
    const request = makeDeleteRequest({ path: "listings/user-123/photo.jpg" });
    const response = await DELETE(request as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 200 for profile image deletion", async () => {
    const request = makeDeleteRequest({ path: "profiles/user-123/avatar.png" });
    const response = await DELETE(request as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 400 for invalid JSON payload", async () => {
    const request = new Request("http://localhost/api/upload", {
      method: "DELETE",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await DELETE(request as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON payload");
  });

  it("returns 400 for empty path", async () => {
    const request = makeDeleteRequest({ path: "" });
    const response = await DELETE(request as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid request payload");
  });

  it("returns 500 when Supabase delete fails", async () => {
    const mockFrom = jest.fn(() => ({
      remove: jest.fn().mockResolvedValue({
        error: { name: "StorageError", message: "Delete failed" },
      }),
    }));
    (createClient as jest.Mock).mockReturnValueOnce({
      storage: { from: mockFrom },
    });

    // Re-import to pick up the new mock
    jest.resetModules();

    jest.doMock("@/auth", () => ({
      auth: jest.fn().mockResolvedValue(mockSession),
    }));
    jest.doMock("@/lib/with-rate-limit", () => ({
      withRateLimit: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock("@/lib/logger", () => ({
      logger: {
        info: jest.fn().mockResolvedValue(undefined),
        warn: jest.fn().mockResolvedValue(undefined),
        sync: { error: jest.fn(), warn: jest.fn() },
      },
    }));
    jest.doMock("@/lib/api-error-handler", () => ({
      captureApiError: jest.fn().mockImplementation(() => {
        const { NextResponse } = jest.requireMock("next/server");
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }),
      apiErrorResponse: jest.fn(),
    }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: jest.fn(() => ({
        storage: {
          from: jest.fn(() => ({
            remove: jest.fn().mockResolvedValue({
              error: { name: "StorageError", message: "Delete failed" },
            }),
          })),
        },
      })),
    }));
    jest.doMock("next/server", () => ({
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

    const { DELETE: DELETE2 } = await import("@/app/api/upload/route");

    const request = makeDeleteRequest({ path: "listings/user-123/photo.jpg" });
    const response = await DELETE2(request as any);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("Failed to delete");
  });
});
