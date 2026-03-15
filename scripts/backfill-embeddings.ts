/**
 * Backfill embeddings for all active listings in listing_search_docs.
 * Run: npx tsx scripts/backfill-embeddings.ts
 *
 * Safe to re-run — skips completed listings.
 * Uses keyset pagination (not OFFSET) to avoid row-skipping bugs.
 * Respects Gemini free tier rate limits (~40 RPM with batching).
 * Imports composeListingText from compose.ts (no duplicated logic).
 */
import { prisma } from "../src/lib/prisma";
import pgvector from "pgvector";
import { generateBatchEmbeddings } from "../src/lib/embeddings/gemini";
import { composeListingText } from "../src/lib/embeddings/compose";
const BATCH_SIZE = 20;
const DELAY_MS = 1500; // ~40 RPM, safe for free tier (100 RPM limit)

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
}

async function main() {
  console.log("Starting embedding backfill...\n");

  let lastId: string | null = null;
  let processed = 0;
  let failed = 0;

  while (true) {
    // Keyset pagination: stable against concurrent modifications
    const cursorId: string | null = lastId;
    const rows: BackfillRow[] = await prisma.$queryRaw<BackfillRow[]>`
      SELECT id, title, description, price, room_type, amenities,
             house_rules, lease_duration, gender_preference, household_gender,
             household_languages, primary_home_language,
             available_slots, total_slots, city, state, address,
             move_in_date, booking_mode
      FROM listing_search_docs
      WHERE status = 'ACTIVE'
        AND (embedding IS NULL OR embedding_status IN ('PENDING', 'FAILED'))
        AND embedding_attempts < 3
        AND (${cursorId}::text IS NULL OR id > ${cursorId})
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    `;

    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;

    // Compose texts using the canonical function (no duplication)
    const texts = rows.map((row) =>
      composeListingText({
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
      })
    );

    try {
      const embeddings = await generateBatchEmbeddings(texts);

      for (let i = 0; i < rows.length; i++) {
        const vecSql = pgvector.toSql(embeddings[i]);
        await prisma.$executeRaw`
          UPDATE listing_search_docs
          SET embedding = ${vecSql}::vector,
              embedding_text = ${texts[i]},
              embedding_status = 'COMPLETED',
              embedding_updated_at = NOW(),
              embedding_attempts = 0
          WHERE id = ${rows[i].id}
        `;
        processed++;
      }

      console.log(
        `Batch done. Processed: ${processed}, Failed: ${failed}`
      );
    } catch (err) {
      console.error(`Batch failed at id ${lastId}:`, err);
      // Mark batch as failed (increment attempts)
      for (const row of rows) {
        await prisma.$executeRaw`
          UPDATE listing_search_docs
          SET embedding_status = 'FAILED',
              embedding_updated_at = NOW(),
              embedding_attempts = COALESCE(embedding_attempts, 0) + 1
          WHERE id = ${row.id}
        `.catch(() => {});
      }
      failed += rows.length;
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(
    `\nBackfill complete. Processed: ${processed}, Failed: ${failed}`
  );
}

main().catch(console.error).finally(() => prisma.$disconnect());
