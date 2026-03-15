/**
 * Backfill embeddings for all active listings in listing_search_docs.
 * Run: npx tsx scripts/backfill-embeddings.ts
 *
 * Safe to re-run — skips completed listings.
 * Uses keyset pagination (not OFFSET) to avoid row-skipping bugs.
 * Supports multimodal (text + images) when ENABLE_IMAGE_EMBEDDINGS=true.
 * Per-listing calls (not batch) to support multimodal content.
 */
import { prisma } from "../src/lib/prisma";
import pgvector from "pgvector";
import { generateEmbedding, generateMultimodalEmbedding, EMBEDDING_MODEL } from "../src/lib/embeddings/gemini";
import { composeListingText } from "../src/lib/embeddings/compose";
import { fetchAndProcessListingImages, computeImageHash } from "../src/lib/embeddings/images";

const BATCH_SIZE = 20;
const DELAY_MS = 1500; // ~40 RPM, safe for free tier (100 RPM limit)
const IMAGE_EMBEDDINGS = process.env.ENABLE_IMAGE_EMBEDDINGS === "true";

interface BackfillRow {
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
  booking_mode: string | null;
  images: string[];
}

async function main() {
  console.log(`Starting embedding backfill (model: ${EMBEDDING_MODEL}, images: ${IMAGE_EMBEDDINGS})...\n`);

  let lastId: string | null = null;
  let processed = 0;
  let failed = 0;
  let withImages = 0;

  while (true) {
    const cursorId: string | null = lastId;
    const rows: BackfillRow[] = await prisma.$queryRaw<BackfillRow[]>`
      SELECT id, title, description, price, room_type, amenities,
             house_rules, lease_duration, gender_preference, household_gender,
             household_languages, primary_home_language,
             available_slots, total_slots, city, state, address,
             move_in_date, booking_mode, images
      FROM listing_search_docs
      WHERE status = 'ACTIVE'
        AND (embedding IS NULL
             OR embedding_status IN ('PENDING', 'FAILED', 'PARTIAL')
             OR embedding_model IS DISTINCT FROM ${EMBEDDING_MODEL})
        AND embedding_attempts < 3
        AND (${cursorId}::text IS NULL OR id > ${cursorId})
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    `;

    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;

    // Process each listing individually (multimodal can't batch)
    for (const row of rows) {
      try {
        // Claim row for processing
        const claimed = await prisma.$executeRaw`
          UPDATE listing_search_docs
          SET embedding_status = 'PROCESSING',
              embedding_updated_at = NOW()
          WHERE id = ${row.id}
            AND embedding_status != 'PROCESSING'
        `;
        if (claimed === 0) continue;

        const text = composeListingText({
          title: row.title,
          description: row.description,
          price: row.price,
          roomType: row.room_type,
          amenities: row.amenities,
          houseRules: row.house_rules,
          leaseDuration: row.lease_duration,
          genderPreference: row.gender_preference,
          householdGender: row.household_gender,
          householdLanguages: row.household_languages,
          primaryHomeLanguage: row.primary_home_language,
          availableSlots: row.available_slots,
          totalSlots: row.total_slots,
          city: row.city ?? undefined,
          state: row.state ?? undefined,
          address: row.address ?? undefined,
          moveInDate: row.move_in_date,
          bookingMode: row.booking_mode,
        });

        const imageUrls: string[] = (row.images as string[]) || [];
        const imageHash = imageUrls.length > 0 ? computeImageHash(imageUrls) : null;

        // Fetch and process images if enabled
        let imageParts: { base64: string; mimeType: string }[] = [];
        if (IMAGE_EMBEDDINGS && imageUrls.length > 0) {
          try {
            imageParts = await fetchAndProcessListingImages(imageUrls);
          } catch {
            imageParts = [];
          }
        }

        // Generate embedding
        const embedding = imageParts.length > 0
          ? await generateMultimodalEmbedding(text, imageParts)
          : await generateEmbedding(text, "RETRIEVAL_DOCUMENT");

        const vecSql = pgvector.toSql(embedding);
        const imageCount = imageParts.length;

        await prisma.$executeRaw`
          UPDATE listing_search_docs
          SET embedding = ${vecSql}::vector,
              embedding_text = ${text},
              embedding_image_hash = ${imageHash},
              embedding_image_count = ${imageCount},
              embedding_model = ${EMBEDDING_MODEL},
              embedding_status = 'COMPLETED',
              embedding_updated_at = NOW(),
              embedding_attempts = 0
          WHERE id = ${row.id}
        `;

        processed++;
        if (imageCount > 0) withImages++;
      } catch (err) {
        console.error(`Failed for listing ${row.id}:`, err instanceof Error ? err.message : err);
        await prisma.$executeRaw`
          UPDATE listing_search_docs
          SET embedding_status = 'FAILED',
              embedding_updated_at = NOW(),
              embedding_attempts = COALESCE(embedding_attempts, 0) + 1
          WHERE id = ${row.id}
        `.catch(() => {});
        failed++;
      }
    }

    console.log(
      `Batch done. Processed: ${processed}, With images: ${withImages}, Failed: ${failed}`
    );

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(
    `\nBackfill complete. Processed: ${processed}, With images: ${withImages}, Failed: ${failed}`
  );

  // Rebuild HNSW index for optimal recall with new vector distribution
  if (processed > 0) {
    console.log("\nRebuilding HNSW index (CONCURRENTLY — non-blocking)...");
    await prisma.$executeRawUnsafe(
      `REINDEX INDEX CONCURRENTLY idx_search_docs_embedding_hnsw`
    );
    console.log("HNSW index rebuild complete.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
