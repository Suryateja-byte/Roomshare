/**
 * Image processing pipeline for multimodal embeddings.
 *
 * Fetches listing photos from Supabase Storage, resizes with sharp,
 * converts to base64 for the Gemini embedding API.
 *
 * Security: URL allowlist prevents SSRF. Only our Supabase host is fetched.
 * Safety: Individual image failures are skipped — never blocks text embedding.
 */
import sharp from "sharp";
import { createHash } from "crypto";
import { logger } from "@/lib/logger";

export interface ImagePart {
  base64: string;
  mimeType: "image/jpeg";
}

/** Max images to include per embedding (API limit: 6 parts total, 1 text + 5 images) */
export const MAX_IMAGES_PER_EMBEDDING = 5;

const IMAGE_MAX_DIMENSION = 512;
const IMAGE_QUALITY = 85;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_DOWNLOAD_BYTES = 10_000_000; // 10MB

// SSRF protection: only fetch from our known Supabase host
const ALLOWED_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

function validateImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!ALLOWED_HOST || parsed.hostname !== ALLOWED_HOST) return false;
    if (!parsed.pathname.includes("/storage/")) return false;
    if (parsed.pathname.includes("..")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch, resize, and base64-encode listing photos for the embedding API.
 * Skips invalid URLs and failed fetches — returns only successful images.
 */
export async function fetchAndProcessListingImages(
  imageUrls: string[],
  maxImages = MAX_IMAGES_PER_EMBEDDING
): Promise<ImagePart[]> {
  const validUrls = imageUrls.slice(0, maxImages).filter(validateImageUrl);

  if (validUrls.length === 0) return [];

  const results = await Promise.allSettled(
    validUrls.map((url) => fetchAndPrepareImage(url))
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<ImagePart | null> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((v): v is ImagePart => v !== null);
}

async function fetchAndPrepareImage(url: string): Promise<ImagePart | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_BYTES)
      return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) return null;

    // Always output JPEG — handles WebP, PNG, HEIC, GIF, AVIF input
    const resized = await sharp(buffer)
      .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: IMAGE_QUALITY, mozjpeg: true })
      .toBuffer();

    return {
      base64: resized.toString("base64"),
      mimeType: "image/jpeg",
    };
  } catch (err) {
    logger.sync.warn("[embedding] image fetch/process failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** MD5 hash of sorted image URLs for change detection */
export function computeImageHash(imageUrls: string[]): string {
  const sorted = [...imageUrls].sort().join(",");
  return createHash("md5").update(sorted).digest("hex");
}

// Re-export validateImageUrl for testing
export { validateImageUrl as _validateImageUrl };
