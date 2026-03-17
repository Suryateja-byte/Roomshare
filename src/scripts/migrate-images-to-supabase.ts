/**
 * Migrate listing images from external URLs (picsum/unsplash) to Supabase Storage.
 *
 * 1. Fetches all unique image URLs from Listing table
 * 2. Downloads each image
 * 3. Uploads to Supabase Storage bucket "listing-images"
 * 4. Updates both Listing and listing_search_docs tables with new URLs
 *
 * Usage:
 *   npx tsx src/scripts/migrate-images-to-supabase.ts --dry-run
 *   npx tsx src/scripts/migrate-images-to-supabase.ts --i-understand
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "listing-images";
const BATCH_SIZE = 10; // concurrent downloads
const FETCH_TIMEOUT_MS = 15_000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Track URL mapping: old URL → new Supabase URL
const urlMap = new Map<string, string>();

function log(msg: string) {
  console.log(`[migrate-images] ${msg}`);
}

async function ensureBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10_000_000, // 10MB
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (error) throw new Error(`Failed to create bucket: ${error.message}`);
    log(`Created bucket "${BUCKET}"`);
  } else {
    log(`Bucket "${BUCKET}" already exists`);
  }
}

async function downloadImage(url: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      log(`  WARN: ${url} → HTTP ${res.status}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    log(`  WARN: ${url} → ${err instanceof Error ? err.message : "failed"}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadToSupabase(
  buffer: Buffer,
  originalUrl: string,
): Promise<string | null> {
  const ext = "jpg"; // picsum returns JPEG
  const filename = `seed/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) {
    log(`  WARN: Upload failed for ${originalUrl}: ${error.message}`);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

async function processBatch(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      if (urlMap.has(url)) return; // Already processed

      const buffer = await downloadImage(url);
      if (!buffer) return;

      const newUrl = await uploadToSupabase(buffer, url);
      if (newUrl) {
        urlMap.set(url, newUrl);
      }
    }),
  );
}

async function getAllUniqueUrls(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ url: string }[]>`
    SELECT DISTINCT unnest(images) as url FROM "Listing"
  `;
  return rows.map((r) => r.url);
}

async function updateListingImages(dryRun: boolean): Promise<number> {
  const listings = await prisma.$queryRaw<
    { id: string; images: string[] }[]
  >`SELECT id, images FROM "Listing"`;

  let updated = 0;
  for (const listing of listings) {
    const newImages = listing.images.map((url) => urlMap.get(url) ?? url);
    const changed = newImages.some((url, i) => url !== listing.images[i]);
    if (!changed) continue;

    if (!dryRun) {
      await prisma.$executeRaw`
        UPDATE "Listing" SET images = ${newImages} WHERE id = ${listing.id}
      `;
      await prisma.$executeRaw`
        UPDATE listing_search_docs SET images = ${newImages} WHERE id = ${listing.id}
      `;
    }
    updated++;
  }
  return updated;
}

async function resetEmbeddingsForResync(dryRun: boolean): Promise<number> {
  if (dryRun) return 0;
  const result = await prisma.$executeRaw`
    UPDATE listing_search_docs
    SET embedding_image_hash = NULL,
        embedding_status = 'PENDING'
    WHERE array_length(images, 1) > 0
  `;
  return typeof result === "number" ? result : 0;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const safetyFlag = process.argv.includes("--i-understand");

  console.log("═══════════════════════════════════════════════════");
  console.log(" Migrate listing images → Supabase Storage");
  console.log("═══════════════════════════════════════════════════\n");

  if (!dryRun && !safetyFlag) {
    console.error("❌ Use --dry-run to preview or --i-understand to execute.\n");
    process.exit(1);
  }

  log(`Mode: ${dryRun ? "DRY-RUN" : "LIVE"}`);

  // 1. Ensure bucket exists
  if (!dryRun) {
    await ensureBucket();
  }

  // 2. Get all unique URLs
  const urls = await getAllUniqueUrls();
  log(`Found ${urls.length} unique image URLs to migrate`);

  if (dryRun) {
    log(`Would download and upload ${urls.length} images`);
    log("Would update Listing + listing_search_docs tables");
    log("Would reset embedding status for re-sync with images");
    console.log("\n✅ DRY-RUN COMPLETE\n");
    process.exit(0);
  }

  // 3. Download and upload in batches
  let processed = 0;
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    await processBatch(batch);
    processed += batch.length;
    log(`Progress: ${processed}/${urls.length} (${urlMap.size} uploaded)`);
  }

  log(`\nUploaded ${urlMap.size}/${urls.length} images to Supabase`);

  // 4. Update DB with new URLs
  const updatedListings = await updateListingImages(false);
  log(`Updated ${updatedListings} listings with new image URLs`);

  // 5. Reset embeddings for re-sync
  const reset = await resetEmbeddingsForResync(false);
  log(`Reset ${reset} embeddings for re-sync with images`);

  console.log("\n═══════════════════════════════════════════════════");
  console.log(" SUMMARY");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Images uploaded: ${urlMap.size}/${urls.length}`);
  console.log(`  Listings updated: ${updatedListings}`);
  console.log(`  Embeddings reset: ${reset}`);
  console.log("\n✅ MIGRATION COMPLETE");
  console.log("Now run the embedding sync to generate multimodal embeddings.\n");

  process.exit(0);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
