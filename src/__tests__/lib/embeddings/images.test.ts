/**
 * Unit tests for src/lib/embeddings/images.ts
 *
 * Covers: URL validation (SSRF allowlist), image hash computation,
 * fetch+process pipeline (happy path, failures, limits), and
 * the internal fetchAndPrepareImage behaviour via indirect testing.
 *
 * No real network calls; no real sharp processing.
 */

// ── env BEFORE any imports ────────────────────────────────────────────────────
// jest.env.js already sets NEXT_PUBLIC_SUPABASE_URL globally; we re-assert here
// to document that images.ts reads ALLOWED_HOST at module-load time from this var.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";

// ── Sentry (virtual – not a real dep in this worktree) ───────────────────────
jest.mock("@sentry/nextjs", () => ({ addBreadcrumb: jest.fn() }), {
  virtual: true,
});

// ── Logger ────────────────────────────────────────────────────────────────────
// Mutable container avoids TDZ (jest.mock factory is hoisted)
const loggerMocks = { warn: jest.fn() };
jest.mock("@/lib/logger", () => ({
  logger: { sync: { warn: (...args: unknown[]) => loggerMocks.warn(...args) } },
}));

// ── sharp – mutable container pattern (avoids TDZ; jest.mock is hoisted) ─────
// The factory captures `sharpMocks` by reference; individual jest.fn()s on the
// container are replaced / cleared in beforeEach.
const sharpMocks = {
  toBuffer: jest.fn(),
  jpeg: jest.fn(),
  resize: jest.fn(),
};
// The mocked sharp module is a function that returns a chainable object.
jest.mock("sharp", () => {
  return jest.fn().mockImplementation(() => ({
    resize: (...args: unknown[]) => {
      sharpMocks.resize(...args);
      return {
        jpeg: (...jArgs: unknown[]) => {
          sharpMocks.jpeg(...jArgs);
          return { toBuffer: () => sharpMocks.toBuffer() };
        },
      };
    },
  }));
});

// ── fetch ─────────────────────────────────────────────────────────────────────
const fetchMocks = { fetch: jest.fn() };
global.fetch = (...args: Parameters<typeof fetch>) => fetchMocks.fetch(...args);

// ── Imports (after all mocks) ─────────────────────────────────────────────────
import {
  _validateImageUrl,
  computeImageHash,
  fetchAndProcessListingImages,
} from "@/lib/embeddings/images";

// ── Shared constants ──────────────────────────────────────────────────────────
const VALID_URL =
  "https://test-project.supabase.co/storage/v1/object/public/images/listings/user1/photo.jpg";

/** Build a minimal successful fetch response wrapping the given Buffer */
function makeOkResponse(
  buffer: Buffer = Buffer.from("fake-image-bytes"),
  extraHeaders: Record<string, string> = {}
) {
  return {
    ok: true,
    arrayBuffer: async () =>
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ),
    headers: {
      get: (key: string) => extraHeaders[key.toLowerCase()] ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// describe: validateImageUrl
// ─────────────────────────────────────────────────────────────────────────────
describe("validateImageUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts a valid Supabase Storage URL", () => {
    expect(_validateImageUrl(VALID_URL)).toBe(true);
  });

  it("rejects HTTP (non-HTTPS) URLs", () => {
    const httpUrl =
      "http://test-project.supabase.co/storage/v1/object/public/images/listings/user1/photo.jpg";
    expect(_validateImageUrl(httpUrl)).toBe(false);
  });

  it("rejects URLs with a different hostname", () => {
    const wrongHost =
      "https://evil.example.com/storage/v1/object/public/images/listings/user1/photo.jpg";
    expect(_validateImageUrl(wrongHost)).toBe(false);
  });

  it("rejects URLs without /storage/ in the path", () => {
    const noStorage =
      "https://test-project.supabase.co/other/v1/object/public/images/photo.jpg";
    expect(_validateImageUrl(noStorage)).toBe(false);
  });

  it("rejects URLs containing path traversal (..)", () => {
    // URL constructor normalises the path, so we craft one that preserves ".."
    const traversal =
      "https://test-project.supabase.co/storage/v1/..%2Fetc/passwd";
    expect(_validateImageUrl(traversal)).toBe(false);
  });

  it("rejects an invalid URL string", () => {
    expect(_validateImageUrl("not-a-url")).toBe(false);
  });

  it("rejects all URLs when NEXT_PUBLIC_SUPABASE_URL is not set", () => {
    // ALLOWED_HOST is computed at module-load time, so we must isolate the module.
    const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      jest.resetModules();
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        _validateImageUrl: validateNoEnv,
      } = require("@/lib/embeddings/images");
      expect(validateNoEnv(VALID_URL)).toBe(false);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
      jest.resetModules();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describe: computeImageHash
// ─────────────────────────────────────────────────────────────────────────────
describe("computeImageHash", () => {
  it("produces a consistent hash for the same URLs", () => {
    const urls = [VALID_URL, VALID_URL.replace("photo.jpg", "photo2.jpg")];
    expect(computeImageHash(urls)).toBe(computeImageHash(urls));
  });

  it("is order-independent — ['b','a'] equals ['a','b']", () => {
    const a =
      "https://test-project.supabase.co/storage/v1/object/public/images/listings/u/a.jpg";
    const b =
      "https://test-project.supabase.co/storage/v1/object/public/images/listings/u/b.jpg";
    expect(computeImageHash([b, a])).toBe(computeImageHash([a, b]));
  });

  it("different URLs produce different hashes", () => {
    const url1 =
      "https://test-project.supabase.co/storage/v1/object/public/images/listings/u/1.jpg";
    const url2 =
      "https://test-project.supabase.co/storage/v1/object/public/images/listings/u/2.jpg";
    expect(computeImageHash([url1])).not.toBe(computeImageHash([url2]));
  });

  it("handles an empty array", () => {
    const hash = computeImageHash([]);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("handles a single URL", () => {
    const hash = computeImageHash([VALID_URL]);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describe: fetchAndProcessListingImages
// ─────────────────────────────────────────────────────────────────────────────
describe("fetchAndProcessListingImages", () => {
  const processedBuffer = Buffer.from("processed-jpeg");

  beforeEach(() => {
    jest.clearAllMocks();
    loggerMocks.warn.mockReset();
    // Default sharp: toBuffer resolves with a small processed buffer
    sharpMocks.toBuffer.mockResolvedValue(processedBuffer);
    // Default fetch: returns a valid small image
    fetchMocks.fetch.mockResolvedValue(
      makeOkResponse(Buffer.from("raw-image-bytes"))
    );
  });

  it("returns ImageParts for valid URLs (happy path)", async () => {
    const result = await fetchAndProcessListingImages([VALID_URL]);

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("image/jpeg");
    expect(result[0].base64).toBe(processedBuffer.toString("base64"));
  });

  it("returns an empty array for empty URL input", async () => {
    const result = await fetchAndProcessListingImages([]);

    expect(result).toEqual([]);
    expect(fetchMocks.fetch).not.toHaveBeenCalled();
  });

  it("filters out invalid URLs before fetching", async () => {
    const invalidUrl = "https://evil.com/storage/v1/object/public/photo.jpg";

    const result = await fetchAndProcessListingImages([VALID_URL, invalidUrl]);

    expect(fetchMocks.fetch).toHaveBeenCalledTimes(1);
    expect(fetchMocks.fetch).toHaveBeenCalledWith(
      VALID_URL,
      expect.any(Object)
    );
    expect(result).toHaveLength(1);
  });

  it("respects the maxImages limit", async () => {
    const urls = Array.from(
      { length: 10 },
      (_, i) =>
        `https://test-project.supabase.co/storage/v1/object/public/images/listings/u/${i}.jpg`
    );

    const result = await fetchAndProcessListingImages(urls, 2);

    expect(fetchMocks.fetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it("handles mixed valid/invalid URLs and returns only successful ImageParts", async () => {
    // HTTP URL is invalid (non-HTTPS)
    const invalidUrl =
      "http://test-project.supabase.co/storage/v1/object/public/photo.jpg";
    const validUrl2 =
      "https://test-project.supabase.co/storage/v1/object/public/images/listings/u/2.jpg";

    const result = await fetchAndProcessListingImages([
      VALID_URL,
      invalidUrl,
      validUrl2,
    ]);

    expect(result).toHaveLength(2);
  });

  it("returns an empty array when all fetches reject (network error)", async () => {
    fetchMocks.fetch.mockRejectedValue(new Error("Network failure"));

    const result = await fetchAndProcessListingImages([VALID_URL]);

    expect(result).toEqual([]);
  });

  it("partial success: 3 URLs, 1 fetch fails — returns 2 ImageParts", async () => {
    const url2 =
      "https://test-project.supabase.co/storage/v1/object/public/images/listings/u/2.jpg";
    const url3 =
      "https://test-project.supabase.co/storage/v1/object/public/images/listings/u/3.jpg";

    fetchMocks.fetch
      .mockResolvedValueOnce(makeOkResponse(Buffer.from("img1")))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce(makeOkResponse(Buffer.from("img3")));

    const result = await fetchAndProcessListingImages([VALID_URL, url2, url3]);

    expect(result).toHaveLength(2);
  });

  it("skips images with a non-200 (ok: false) response", async () => {
    fetchMocks.fetch.mockResolvedValue({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: { get: () => null },
    });

    const result = await fetchAndProcessListingImages([VALID_URL]);

    expect(result).toEqual([]);
  });

  it("skips images whose Content-Length exceeds 10 MB", async () => {
    fetchMocks.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "content-length" ? "10000001" : null,
      },
    });

    const result = await fetchAndProcessListingImages([VALID_URL]);

    expect(result).toEqual([]);
  });

  it("skips images where sharp throws during processing", async () => {
    fetchMocks.fetch.mockResolvedValue(
      makeOkResponse(Buffer.from("bad-image"))
    );
    sharpMocks.toBuffer.mockRejectedValue(
      new Error("Unsupported image format")
    );

    const result = await fetchAndProcessListingImages([VALID_URL]);

    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describe: fetchAndPrepareImage (tested indirectly through fetchAndProcessListingImages
// with single URLs — the private function is the per-image core)
// ─────────────────────────────────────────────────────────────────────────────
describe("fetchAndPrepareImage (indirect via fetchAndProcessListingImages)", () => {
  const processedBuffer = Buffer.from("jpeg-output");

  beforeEach(() => {
    jest.clearAllMocks();
    loggerMocks.warn.mockReset();
    sharpMocks.toBuffer.mockResolvedValue(processedBuffer);
  });

  it("returns JPEG base64 for a valid image", async () => {
    fetchMocks.fetch.mockResolvedValue(makeOkResponse(Buffer.from("raw")));

    const result = await fetchAndProcessListingImages([VALID_URL], 1);

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("image/jpeg");
    expect(result[0].base64).toBe(processedBuffer.toString("base64"));
  });

  it("returns null-equivalent (empty result) for a non-200 response", async () => {
    fetchMocks.fetch.mockResolvedValue({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: { get: () => null },
    });

    const result = await fetchAndProcessListingImages([VALID_URL], 1);

    expect(result).toEqual([]);
  });

  it("returns null-equivalent when Content-Length header exceeds 10 MB", async () => {
    fetchMocks.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(50),
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "content-length" ? "10000001" : null,
      },
    });

    const result = await fetchAndProcessListingImages([VALID_URL], 1);

    expect(result).toEqual([]);
  });

  it("returns null-equivalent when downloaded buffer exceeds 10 MB (no header)", async () => {
    const oversized = Buffer.alloc(10_000_001, 0x42);
    fetchMocks.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        oversized.buffer.slice(
          oversized.byteOffset,
          oversized.byteOffset + oversized.byteLength
        ),
      headers: { get: () => null },
    });

    const result = await fetchAndProcessListingImages([VALID_URL], 1);

    expect(result).toEqual([]);
  });

  it("returns null-equivalent when sharp throws", async () => {
    fetchMocks.fetch.mockResolvedValue(makeOkResponse(Buffer.from("corrupt")));
    sharpMocks.toBuffer.mockRejectedValue(new Error("sharp: decode failed"));

    const result = await fetchAndProcessListingImages([VALID_URL], 1);

    expect(result).toEqual([]);
  });

  it("returns null-equivalent when fetch aborts (AbortError / timeout)", async () => {
    const abortError = new DOMException(
      "The user aborted a request.",
      "AbortError"
    );
    fetchMocks.fetch.mockRejectedValue(abortError);

    const result = await fetchAndProcessListingImages([VALID_URL], 1);

    expect(result).toEqual([]);
  });

  it("always outputs mimeType 'image/jpeg'", async () => {
    fetchMocks.fetch.mockResolvedValue(
      makeOkResponse(Buffer.from("any-format"))
    );

    const result = await fetchAndProcessListingImages([VALID_URL], 1);

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("image/jpeg");
  });

  it("logs a warning via logger.sync.warn on failure", async () => {
    fetchMocks.fetch.mockRejectedValue(new Error("connection refused"));

    await fetchAndProcessListingImages([VALID_URL], 1);

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "[embedding] image fetch/process failed",
      expect.objectContaining({ error: "connection refused" })
    );
  });
});
