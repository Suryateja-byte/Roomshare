// @ts-nocheck
/**
 * Re-sync embeddings for all PENDING listings (text + images).
 *
 * Usage:
 *   npx tsx src/scripts/resync-embeddings.ts
 */
import { PrismaClient } from "@prisma/client";
import { syncListingEmbedding } from "../lib/embeddings/sync";

const prisma = new PrismaClient();
const CONCURRENCY = 3; // Respect Gemini rate limits

async function main() {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM listing_search_docs
    WHERE embedding_status = 'PENDING'
    ORDER BY listing_created_at ASC
  `;

  console.log(`Found ${rows.length} listings to re-sync\n`);

  let done = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((r) => syncListingEmbedding(r.id)),
    );

    for (const r of results) {
      if (r.status === "rejected") failed++;
      else done++;
    }

    console.log(`Progress: ${done + failed}/${rows.length} (${failed} failed)`);
  }

  // Check final status
  const status = await prisma.$queryRaw<{ s: string; c: number }[]>`
    SELECT embedding_status as s, COUNT(*)::int as c
    FROM listing_search_docs
    GROUP BY embedding_status
  `;

  console.log("\nFinal status:");
  for (const row of status) {
    console.log(`  ${row.s}: ${row.c}`);
  }

  const withImages = await prisma.$queryRaw<[{ c: number }]>`
    SELECT COUNT(*)::int as c FROM listing_search_docs WHERE embedding_image_count > 0
  `;
  console.log(`\nListings with image embeddings: ${withImages[0].c}`);
  console.log("\n✅ DONE");
}

main()
  .catch((err) => {
    console.error("Re-sync failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
