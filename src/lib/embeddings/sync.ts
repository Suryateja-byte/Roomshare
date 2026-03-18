/**
 * Generate and store embedding for a listing in listing_search_docs.
 * Called from fireSideEffects() or the backfill script.
 *
 * Non-blocking by design — caller should fire-and-forget.
 * Uses structured logger (not console) per project rules.
 * Recovers from stuck 'PROCESSING' via attempt counter + timeout.
 */
import 'server-only';

import { prisma } from "@/lib/prisma";
import pgvector from "pgvector";
import { generateEmbedding, generateMultimodalEmbedding, EMBEDDING_MODEL } from "./gemini";
import { composeListingText } from "./compose";
import { fetchAndProcessListingImages, computeImageHash, type ImagePart } from "./images";
import { features } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Row shape from listing_search_docs for embedding composition */
interface SearchDocRow {
  id: string;
  title: string;
  description: string;
  price: number;
  room_type: string | null;
  amenities: string[];
  house_rules: string[];
  lease_duration: string | null;
  gender_preference: string | null;
  household_gender: string | null;
  household_languages: string[];
  primary_home_language: string | null;
  available_slots: number;
  total_slots: number;
  city: string | null;
  state: string | null;
  address: string | null;
  move_in_date: Date | null;
  booking_mode: string; // NOT NULL DEFAULT 'SHARED'
  images: string[];
  embedding_text: string | null;
  embedding_status: string | null;
  embedding_image_hash: string | null;
}

/** Add Sentry breadcrumb (lazy import, no-op in test) */
async function addBreadcrumb(data: { category: string; message: string; data: Record<string, unknown>; level: "info" | "error" }) {
  try { const Sentry = await import("@sentry/nextjs"); Sentry.addBreadcrumb(data); } catch { /* Sentry unavailable */ }
}

export async function syncListingEmbedding(listingId: string): Promise<void> {
  addBreadcrumb({ category: "embedding", message: "Starting embedding sync", data: { listingId }, level: "info" });
  try {
    const rows = await prisma.$queryRaw<SearchDocRow[]>`
      SELECT id, title, description, price, room_type, amenities,
             house_rules, lease_duration, gender_preference, household_gender,
             household_languages, primary_home_language, available_slots,
             total_slots, city, state, address, move_in_date, booking_mode,
             images, embedding_text, embedding_status, embedding_image_hash
      FROM listing_search_docs
      WHERE id = ${listingId}
    `;

    if (!rows.length) return;
    const doc = rows[0];

    // Compose the embedding text
    const embeddingText = composeListingText({
      title: doc.title,
      description: doc.description,
      price: doc.price,
      roomType: doc.room_type,
      amenities: doc.amenities,
      houseRules: doc.house_rules,
      leaseDuration: doc.lease_duration,
      genderPreference: doc.gender_preference,
      householdGender: doc.household_gender,
      householdLanguages: doc.household_languages,
      primaryHomeLanguage: doc.primary_home_language,
      availableSlots: doc.available_slots,
      totalSlots: doc.total_slots,
      city: doc.city ?? undefined,
      state: doc.state ?? undefined,
      address: doc.address ?? undefined,
      moveInDate: doc.move_in_date,
      bookingMode: doc.booking_mode,
    });

    // Image change detection
    const imageUrls: string[] = (doc.images as string[]) || [];
    const newImageHash = imageUrls.length > 0 ? computeImageHash(imageUrls) : null;

    // Skip if BOTH text AND images unchanged (dedup)
    if (doc.embedding_text === embeddingText && doc.embedding_image_hash === newImageHash) return;

    // Atomically claim the row for processing (prevents concurrent double-embeds)
    const claimed = await prisma.$executeRaw`
      UPDATE listing_search_docs
      SET embedding_status = 'PROCESSING',
          embedding_updated_at = NOW()
      WHERE id = ${listingId}
        AND embedding_status != 'PROCESSING'
    `;
    if (claimed === 0) return; // Already being processed

    // Fetch and process images (feature-gated, failures don't block text embedding)
    let imageParts: ImagePart[] = [];
    if (features.imageEmbeddings && imageUrls.length > 0) {
      try {
        imageParts = await fetchAndProcessListingImages(imageUrls);
      } catch {
        // Image failure → fall back to text-only (don't increment embedding_attempts)
        imageParts = [];
      }
    }

    // Generate embedding (multimodal if images available, text-only otherwise)
    const embedding = imageParts.length > 0
      ? await generateMultimodalEmbedding(embeddingText, imageParts)
      : await generateEmbedding(embeddingText, "RETRIEVAL_DOCUMENT");
    const vecSql = pgvector.toSql(embedding);

    // Determine status: COMPLETED if all images processed (or no images), PARTIAL if some failed
    const expectedImages = features.imageEmbeddings ? Math.min(imageUrls.length, 5) : 0;
    const embeddingStatus = (expectedImages > 0 && imageParts.length < expectedImages)
      ? "PARTIAL"
      : "COMPLETED";

    // Store embedding with metadata
    await prisma.$executeRaw`
      UPDATE listing_search_docs
      SET embedding = ${vecSql}::vector,
          embedding_text = ${embeddingText},
          embedding_image_hash = ${newImageHash},
          embedding_image_count = ${imageParts.length},
          embedding_model = ${EMBEDDING_MODEL},
          embedding_status = ${embeddingStatus},
          embedding_updated_at = NOW(),
          embedding_attempts = 0
      WHERE id = ${listingId}
    `;
    addBreadcrumb({ category: "embedding", message: "Embedding sync completed", data: { listingId, imageCount: imageParts.length }, level: "info" });
  } catch (err) {
    addBreadcrumb({ category: "embedding", message: "Embedding sync failed", data: { listingId, error: err instanceof Error ? err.message : "Unknown" }, level: "error" });
    // Log error without PII (listing ID is safe, not PII)
    logger.sync.error("[embedding] Failed for listing", {
      listingId,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    await prisma.$executeRaw`
      UPDATE listing_search_docs
      SET embedding_status = 'FAILED',
          embedding_updated_at = NOW(),
          embedding_attempts = COALESCE(embedding_attempts, 0) + 1
      WHERE id = ${listingId}
    `.catch(() => {}); // Don't throw on cleanup failure
  }
}

/**
 * Recover stuck 'PROCESSING' embeddings (call from cron or startup).
 * Resets rows stuck in PROCESSING for > staleMinutes back to PENDING.
 */
export async function recoverStuckEmbeddings(
  staleMinutes = 10
): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE listing_search_docs
    SET embedding_status = 'PENDING',
        embedding_updated_at = NOW()
    WHERE embedding_status = 'PROCESSING'
      AND embedding_updated_at < NOW() - INTERVAL '1 minute' * ${staleMinutes}
  `;
  return typeof result === "number" ? result : 0;
}
