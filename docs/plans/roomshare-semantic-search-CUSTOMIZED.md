# RoomShare Semantic Search — Codebase-Specific Implementation Plan
## Gemini Embedding 2 Preview + pgvector + Prisma Raw SQL

*Tailored to the actual RoomShare codebase: Prisma ORM, `listing_search_docs` denormalized table, `search-v2-service.ts`, PostGIS, pnpm, App Router.*

---

## Critical Architecture Decision

**Add the embedding column to `listing_search_docs`, NOT to the `Listing` model.**

Your codebase already has a denormalized search table (`listing_search_docs`) with tsvector FTS, PostGIS geography, GIN indexes, and a sync pipeline (`search-doc-sync.ts` → `search-doc-dirty.ts`). The embedding column belongs here because:

1. It follows the existing read-model pattern — search queries hit one table, not JOINs across `Listing` + `Location`
2. The sync hook (`upsertSearchDocSync`) already runs on create/update — we piggyback on it
3. The existing `search-doc-queries.ts` SQL builders are the natural place to add semantic ranking
4. No Prisma schema drift issues — `listing_search_docs` is already managed via raw SQL migrations

---

## 1. Dependencies to Install

```bash
pnpm add @google/genai pgvector
```

- `@google/genai` — Official Google Gen AI SDK (TypeScript-first, v1.44+)
- `pgvector` — Provides `toSql()` helper for Prisma `$queryRaw` / `$executeRaw`

**No Prisma schema changes needed** — the `vector` type is handled via raw SQL in the migration, just like PostGIS `geometry`.

---

## 2. Environment Variable

Add to `.env` and `.env.example`:

```bash
# --- AI / Embeddings ---
GEMINI_API_KEY=your-gemini-api-key     # Get from https://aistudio.google.com/apikey
```

Server-only (no `NEXT_PUBLIC_` prefix). Same pattern as `GROQ_API_KEY`.

---

## 3. Prisma Migration

Create a new Prisma migration with `--create-only`:

```bash
npx prisma migrate dev --create-only --name add_pgvector_semantic_search
```

Then edit the generated SQL file:

### `prisma/migrations/XXXXXXXX_add_pgvector_semantic_search/migration.sql`

```sql
-- =============================================================================
-- Migration: Add pgvector semantic search to listing_search_docs
-- PURPOSE: Enable AI-powered semantic search using Gemini Embedding 2 vectors
-- ROLLBACK: ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS embedding,
--           DROP COLUMN IF EXISTS embedding_text,
--           DROP COLUMN IF EXISTS embedding_status,
--           DROP COLUMN IF EXISTS embedding_updated_at;
--           DROP INDEX IF EXISTS idx_search_docs_embedding_hnsw;
--           DROP FUNCTION IF EXISTS search_listings_semantic;
--           DROP FUNCTION IF EXISTS get_similar_listings;
--           -- NOTE: Do not drop the vector extension if other tables use it
-- DATA-SAFETY: Additive only. No existing columns modified or dropped.
-- FEATURE-FLAG: ENABLE_SEMANTIC_SEARCH (default false, opt-in)
-- =============================================================================

-- Step 1: Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Add embedding columns to the denormalized search table
-- Using vector(768) — Gemini Embedding 2 with MRL truncation to 768 dims
-- (1/4 storage of full 3072-dim, <1% quality loss per Google MTEB benchmarks)
ALTER TABLE listing_search_docs
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_text text,
  ADD COLUMN IF NOT EXISTS embedding_status text DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- Step 3: HNSW index for fast approximate nearest neighbor search
-- Using cosine distance (vector_cosine_ops) — standard for normalized embeddings
-- m=16, ef_construction=64 are pgvector defaults — optimal for <1M rows
CREATE INDEX IF NOT EXISTS idx_search_docs_embedding_hnsw
  ON listing_search_docs
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Step 4: Index on embedding_status for the background processing queue
CREATE INDEX IF NOT EXISTS idx_search_docs_embedding_status
  ON listing_search_docs (embedding_status)
  WHERE embedding_status IN ('pending', 'failed');

-- Step 5: Hybrid search function (semantic + keyword + geo + filters)
-- Called from search-v2-service.ts via prisma.$queryRaw
CREATE OR REPLACE FUNCTION search_listings_semantic(
  query_embedding vector(768),
  query_text text DEFAULT '',
  bound_sw_lat float DEFAULT NULL,
  bound_sw_lng float DEFAULT NULL,
  bound_ne_lat float DEFAULT NULL,
  bound_ne_lng float DEFAULT NULL,
  min_price numeric DEFAULT 0,
  max_price numeric DEFAULT 99999,
  filter_amenities text[] DEFAULT NULL,
  filter_house_rules text[] DEFAULT NULL,
  filter_room_type text DEFAULT NULL,
  filter_lease_duration text DEFAULT NULL,
  filter_gender_preference text DEFAULT NULL,
  filter_household_gender text DEFAULT NULL,
  filter_available_slots int DEFAULT NULL,
  semantic_weight float DEFAULT 0.6,
  match_count int DEFAULT 20,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  listing_id text,
  title text,
  description text,
  price numeric,
  images text[],
  room_type text,
  lease_duration text,
  available_slots int,
  total_slots int,
  amenities text[],
  house_rules text[],
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  owner_id text,
  owner_name text,
  owner_image text,
  avg_rating double precision,
  review_count int,
  semantic_similarity float,
  keyword_rank float,
  combined_score float
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Step A: Apply all hard filters (geo bounds, price, amenities, etc.)
  filtered AS (
    SELECT
      sd.*,
      sd.embedding AS emb,
      sd.search_tsv AS fts
    FROM listing_search_docs sd
    WHERE sd.status = 'ACTIVE'
      AND sd.embedding IS NOT NULL
      AND sd.price BETWEEN min_price AND max_price
      -- Geographic bounding box (same pattern as search-doc-queries.ts)
      AND (
        bound_sw_lat IS NULL
        OR ST_Intersects(
          sd.location,
          ST_MakeEnvelope(bound_sw_lng, bound_sw_lat, bound_ne_lng, bound_ne_lat, 4326)
        )
      )
      -- Array containment filters
      AND (filter_amenities IS NULL OR sd.amenities @> filter_amenities)
      AND (filter_house_rules IS NULL OR sd.house_rules @> filter_house_rules)
      -- Scalar filters
      AND (filter_room_type IS NULL OR sd.room_type = filter_room_type)
      AND (filter_lease_duration IS NULL OR sd.lease_duration = filter_lease_duration)
      AND (filter_gender_preference IS NULL OR sd.gender_preference = filter_gender_preference)
      AND (filter_household_gender IS NULL OR sd.household_gender = filter_household_gender)
      AND (filter_available_slots IS NULL OR sd.available_slots >= filter_available_slots)
  ),
  -- Step B: Semantic ranking via cosine similarity
  semantic_results AS (
    SELECT
      f.listing_id,
      ROW_NUMBER() OVER (ORDER BY f.emb <=> query_embedding) AS rank,
      1 - (f.emb <=> query_embedding) AS similarity
    FROM filtered f
    ORDER BY f.emb <=> query_embedding
    LIMIT match_count * 3
  ),
  -- Step C: Keyword ranking via existing tsvector (if query provided)
  keyword_results AS (
    SELECT
      f.listing_id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(f.fts, websearch_to_tsquery('english', query_text)) DESC
      ) AS rank,
      ts_rank_cd(f.fts, websearch_to_tsquery('english', query_text)) AS kw_score
    FROM filtered f
    WHERE query_text IS NOT NULL
      AND query_text != ''
      AND f.fts @@ websearch_to_tsquery('english', query_text)
    ORDER BY ts_rank_cd(f.fts, websearch_to_tsquery('english', query_text)) DESC
    LIMIT match_count * 3
  ),
  -- Step D: Reciprocal Rank Fusion
  fused AS (
    SELECT
      COALESCE(s.listing_id, k.listing_id) AS listing_id,
      (
        semantic_weight * COALESCE(1.0 / (rrf_k + s.rank), 0) +
        (1 - semantic_weight) * COALESCE(1.0 / (rrf_k + k.rank), 0)
      ) AS score,
      COALESCE(s.similarity, 0) AS sem_sim,
      COALESCE(k.kw_score, 0) AS kw_rank_score
    FROM semantic_results s
    FULL OUTER JOIN keyword_results k ON s.listing_id = k.listing_id
  )
  -- Step E: Join back for full listing data
  SELECT
    sd.listing_id,
    sd.title,
    sd.description,
    sd.price,
    sd.images,
    sd.room_type,
    sd.lease_duration,
    sd.available_slots,
    sd.total_slots,
    sd.amenities,
    sd.house_rules,
    sd.address,
    sd.city,
    sd.state,
    sd.zip,
    ST_Y(sd.location::geometry)::double precision AS lat,
    ST_X(sd.location::geometry)::double precision AS lng,
    sd.owner_id,
    sd.owner_name,
    sd.owner_image,
    sd.avg_rating::double precision,
    sd.review_count::int,
    fused.sem_sim::float AS semantic_similarity,
    fused.kw_rank_score::float AS keyword_rank,
    fused.score::float AS combined_score
  FROM fused
  JOIN listing_search_docs sd ON sd.listing_id = fused.listing_id
  ORDER BY fused.score DESC
  LIMIT match_count;
END;
$$;

-- Step 6: Similar listings function (k-NN for listing detail page)
CREATE OR REPLACE FUNCTION get_similar_listings(
  target_listing_id text,
  match_count int DEFAULT 6,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  listing_id text,
  title text,
  price numeric,
  images text[],
  city text,
  state text,
  room_type text,
  available_slots int,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    sd.listing_id,
    sd.title,
    sd.price,
    sd.images,
    sd.city,
    sd.state,
    sd.room_type,
    sd.available_slots,
    (1 - (sd.embedding <=> (
      SELECT embedding FROM listing_search_docs WHERE listing_id = target_listing_id
    )))::float AS similarity
  FROM listing_search_docs sd
  WHERE sd.listing_id != target_listing_id
    AND sd.status = 'ACTIVE'
    AND sd.embedding IS NOT NULL
    AND 1 - (sd.embedding <=> (
      SELECT embedding FROM listing_search_docs WHERE listing_id = target_listing_id
    )) > similarity_threshold
  ORDER BY sd.embedding <=> (
    SELECT embedding FROM listing_search_docs WHERE listing_id = target_listing_id
  )
  LIMIT match_count;
$$;
```

Then apply: `npx prisma migrate dev`

---

## 4. Core Library Files

### `src/lib/embeddings/gemini.ts` — Embedding generation service

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const MODEL = "gemini-embedding-2-preview";
const DIMENSIONS = 768;

type TaskType =
  | "RETRIEVAL_QUERY"
  | "RETRIEVAL_DOCUMENT"
  | "SEMANTIC_SIMILARITY"
  | "CLUSTERING";

/** L2 normalize — required for Gemini dims < 3072 */
function normalizeL2(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag === 0 ? vec : vec.map((v) => v / mag);
}

/** Generate embedding for a single text */
export async function generateEmbedding(
  text: string,
  taskType: TaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
  const res = await ai.models.embedContent({
    model: MODEL,
    contents: text,
    taskType,
    outputDimensionality: DIMENSIONS,
  });
  const values = res.embeddings?.[0]?.values;
  if (!values) throw new Error("No embedding returned from Gemini API");
  return normalizeL2(values);
}

/** Generate embedding optimized for search queries */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  return generateEmbedding(query, "RETRIEVAL_QUERY");
}

/** Batch embed multiple texts */
export async function generateBatchEmbeddings(
  texts: string[],
  taskType: TaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  const res = await ai.models.embedContent({
    model: MODEL,
    contents: texts,
    taskType,
    outputDimensionality: DIMENSIONS,
  });
  if (!res.embeddings) throw new Error("No embeddings returned");
  return res.embeddings.map((e) => normalizeL2(e.values));
}
```

### `src/lib/embeddings/compose.ts` — Listing text composer

```typescript
/**
 * Compose a semantically rich text from listing fields for embedding.
 * Front-loads title + description (highest signal), then structured attributes.
 *
 * Uses data from listing_search_docs or joined Listing + Location data.
 */
export function composeListingText(listing: {
  title: string;
  description: string;
  price: number | string;
  roomType?: string | null;
  amenities?: string[];
  houseRules?: string[];
  leaseDuration?: string | null;
  genderPreference?: string | null;
  householdGender?: string | null;
  householdLanguages?: string[];
  primaryHomeLanguage?: string | null;
  availableSlots?: number;
  totalSlots?: number;
  address?: string;
  city?: string;
  state?: string;
  moveInDate?: Date | string | null;
}): string {
  const parts: string[] = [];

  parts.push(listing.title);
  parts.push(listing.description);

  if (listing.roomType) {
    parts.push(`Room type: ${listing.roomType}.`);
  }
  parts.push(`$${listing.price} per month.`);

  if (listing.availableSlots && listing.totalSlots) {
    parts.push(
      `${listing.availableSlots} of ${listing.totalSlots} slots available.`
    );
  }

  if (listing.amenities?.length) {
    parts.push(`Amenities: ${listing.amenities.join(", ")}.`);
  }

  if (listing.houseRules?.length) {
    parts.push(`House rules: ${listing.houseRules.join(", ")}.`);
  }

  if (listing.leaseDuration) {
    parts.push(`Lease: ${listing.leaseDuration}.`);
  }

  if (listing.genderPreference) {
    parts.push(`Gender preference: ${listing.genderPreference}.`);
  }

  if (listing.householdGender) {
    parts.push(`Household gender: ${listing.householdGender}.`);
  }

  if (listing.householdLanguages?.length) {
    parts.push(`Languages spoken: ${listing.householdLanguages.join(", ")}.`);
  }

  if (listing.city && listing.state) {
    parts.push(`Located in ${listing.city}, ${listing.state}.`);
  } else if (listing.address) {
    parts.push(`Address: ${listing.address}.`);
  }

  if (listing.moveInDate) {
    const date = typeof listing.moveInDate === "string"
      ? listing.moveInDate
      : listing.moveInDate.toISOString().split("T")[0];
    parts.push(`Available from ${date}.`);
  }

  return parts.filter(Boolean).join(" ");
}
```

### `src/lib/embeddings/sync.ts` — Embedding sync (called from search-doc-sync)

```typescript
import { prisma } from "@/lib/prisma";
import pgvector from "pgvector";
import { generateEmbedding } from "./gemini";
import { composeListingText } from "./compose";

/**
 * Generate and store embedding for a listing in listing_search_docs.
 * Called from fireSideEffects() or the backfill script.
 * 
 * Non-blocking by design — caller should fire-and-forget.
 */
export async function syncListingEmbedding(listingId: string): Promise<void> {
  try {
    // Fetch from the search doc (already denormalized)
    const rows = await prisma.$queryRaw<Array<{
      listing_id: string;
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
      embedding_text: string | null;
    }>>`
      SELECT listing_id, title, description, price, room_type, amenities,
             house_rules, lease_duration, gender_preference, household_gender,
             household_languages, primary_home_language, available_slots,
             total_slots, city, state, address, embedding_text
      FROM listing_search_docs
      WHERE listing_id = ${listingId}
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
    });

    // Skip if text hasn't changed
    if (doc.embedding_text === embeddingText) return;

    // Mark as processing
    await prisma.$executeRaw`
      UPDATE listing_search_docs
      SET embedding_status = 'processing'
      WHERE listing_id = ${listingId}
    `;

    // Generate embedding via Gemini
    const embedding = await generateEmbedding(embeddingText, "RETRIEVAL_DOCUMENT");
    const vecSql = pgvector.toSql(embedding);

    // Store embedding
    await prisma.$executeRaw`
      UPDATE listing_search_docs
      SET embedding = ${vecSql}::vector,
          embedding_text = ${embeddingText},
          embedding_status = 'completed',
          embedding_updated_at = NOW()
      WHERE listing_id = ${listingId}
    `;
  } catch (err) {
    console.error(`[embedding] Failed for listing ${listingId}:`, err);
    await prisma.$executeRaw`
      UPDATE listing_search_docs
      SET embedding_status = 'failed'
      WHERE listing_id = ${listingId}
    `.catch(() => {}); // Don't throw on cleanup failure
  }
}
```

---

## 5. Integration Points in Existing Code

### 5a. Hook into `fireSideEffects()` — `src/app/api/listings/route.ts`

After `upsertSearchDocSync(listing.id)` completes (line ~345), add:

```typescript
// Inside fireSideEffects(), after upsertSearchDocSync:
import { syncListingEmbedding } from "@/lib/embeddings/sync";

// Fire-and-forget embedding generation (non-blocking)
if (process.env.ENABLE_SEMANTIC_SEARCH === "true") {
  syncListingEmbedding(listing.id).catch((err) =>
    console.error("[embedding] Side effect failed:", err)
  );
}
```

### 5b. Hook into update — `src/app/api/listings/[id]/route.ts`

After `markListingDirty(id, 'listing_updated')`, add the same pattern:

```typescript
if (process.env.ENABLE_SEMANTIC_SEARCH === "true") {
  syncListingEmbedding(id).catch((err) =>
    console.error("[embedding] Update side effect failed:", err)
  );
}
```

### 5c. Add semantic search to `src/lib/search/search-doc-queries.ts`

Add a new function alongside the existing query builders:

```typescript
import pgvector from "pgvector";
import { generateQueryEmbedding } from "@/lib/embeddings/gemini";

/**
 * Semantic search — called when user provides a natural language query
 * and ENABLE_SEMANTIC_SEARCH is true.
 *
 * Falls back to the existing FTS-based search if the feature flag is off
 * or if embedding generation fails.
 */
export async function semanticSearchQuery(
  params: SearchParams,  // your existing SearchParams type
  limit: number = 20
) {
  const queryText = params.query?.trim() || "";

  if (!queryText || queryText.length < 3) {
    return null; // Fall back to standard search
  }

  try {
    // Generate query embedding with RETRIEVAL_QUERY task type
    const embedding = await generateQueryEmbedding(queryText);
    const vecSql = pgvector.toSql(embedding);

    // Call the hybrid search SQL function
    const results = await prisma.$queryRaw`
      SELECT * FROM search_listings_semantic(
        ${vecSql}::vector,
        ${queryText},
        ${params.bounds?.sw.lat ?? null}::float,
        ${params.bounds?.sw.lng ?? null}::float,
        ${params.bounds?.ne.lat ?? null}::float,
        ${params.bounds?.ne.lng ?? null}::float,
        ${params.minPrice ?? 0}::numeric,
        ${params.maxPrice ?? 99999}::numeric,
        ${params.amenities?.length ? params.amenities : null}::text[],
        ${params.houseRules?.length ? params.houseRules : null}::text[],
        ${params.roomType ?? null}::text,
        ${params.leaseDuration ?? null}::text,
        ${params.genderPreference ?? null}::text,
        ${params.householdGender ?? null}::text,
        ${params.availableSlots ?? null}::int,
        0.6::float,
        ${limit}::int
      )
    `;

    return results;
  } catch (err) {
    console.error("[semantic-search] Failed, falling back to FTS:", err);
    return null; // Caller falls back to existing search
  }
}
```

### 5d. Wire into `src/lib/search/search-v2-service.ts`

In the main search service function, add a semantic search branch:

```typescript
import { semanticSearchQuery } from "./search-doc-queries";

// Inside the main search function:
if (
  process.env.ENABLE_SEMANTIC_SEARCH === "true" &&
  params.query &&
  params.query.length >= 3 &&
  params.sort === "recommended"  // Only use semantic for "recommended" sort
) {
  const semanticResults = await semanticSearchQuery(params, limit);
  if (semanticResults && semanticResults.length > 0) {
    // Transform to your existing ListingData / MapListingData shape
    return transformSemanticResults(semanticResults);
  }
}

// ... existing search logic as fallback ...
```

### 5e. Similar Listings on Detail Page — `src/app/listings/[id]/page.tsx`

Add a server component or server-side fetch:

```typescript
import pgvector from "pgvector";
import { prisma } from "@/lib/prisma";

async function getSimilarListings(listingId: string) {
  if (process.env.ENABLE_SEMANTIC_SEARCH !== "true") return [];

  try {
    const results = await prisma.$queryRaw`
      SELECT * FROM get_similar_listings(${listingId}, 6, 0.3)
    `;
    return results;
  } catch {
    return [];
  }
}

// In the page component:
const similarListings = await getSimilarListings(params.id);
// Pass to ListingPageClient or render a <SimilarListings> section
```

---

## 6. Backfill Script

### `scripts/backfill-embeddings.ts`

```typescript
/**
 * Backfill embeddings for all active listings in listing_search_docs.
 * Run with: npx tsx scripts/backfill-embeddings.ts
 *
 * Safe to re-run — skips listings that already have embeddings.
 * Respects Gemini API rate limits with batching + delays.
 */
import { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import pgvector from "pgvector";

const prisma = new PrismaClient();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const BATCH_SIZE = 20;
const DELAY_MS = 1200; // ~50 RPM safe margin
const DIMENSIONS = 768;

function normalizeL2(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag === 0 ? vec : vec.map((v) => v / mag);
}

function composeText(row: any): string {
  return [
    row.title,
    row.description,
    `$${row.price} per month. ${row.room_type || ""}.`,
    row.amenities?.length ? `Amenities: ${row.amenities.join(", ")}.` : "",
    row.city && row.state ? `${row.city}, ${row.state}.` : "",
    row.lease_duration ? `Lease: ${row.lease_duration}.` : "",
    row.gender_preference ? `Gender preference: ${row.gender_preference}.` : "",
    row.household_languages?.length
      ? `Languages: ${row.household_languages.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function main() {
  console.log("🔍 Starting embedding backfill...\n");

  let offset = 0;
  let processed = 0;
  let failed = 0;

  while (true) {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT listing_id, title, description, price, room_type, amenities,
             house_rules, lease_duration, gender_preference, household_gender,
             household_languages, primary_home_language,
             available_slots, total_slots, city, state, address
      FROM listing_search_docs
      WHERE status = 'ACTIVE'
        AND (embedding IS NULL OR embedding_status = 'failed')
      ORDER BY listing_id
      LIMIT ${BATCH_SIZE}
      OFFSET ${offset}
    `;

    if (!rows.length) break;

    const texts = rows.map(composeText);

    try {
      const res = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: texts,
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: DIMENSIONS,
      });

      if (!res.embeddings) throw new Error("No embeddings returned");

      for (let i = 0; i < rows.length; i++) {
        const vec = normalizeL2(res.embeddings[i].values);
        const vecSql = pgvector.toSql(vec);

        await prisma.$executeRaw`
          UPDATE listing_search_docs
          SET embedding = ${vecSql}::vector,
              embedding_text = ${texts[i]},
              embedding_status = 'completed',
              embedding_updated_at = NOW()
          WHERE listing_id = ${rows[i].listing_id}
        `;
        processed++;
      }

      console.log(`✅ Batch done. Total: ${processed} processed, ${failed} failed`);
    } catch (err) {
      console.error(`❌ Batch failed at offset ${offset}:`, err);
      failed += rows.length;
    }

    offset += BATCH_SIZE;
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n🏁 Backfill complete. Processed: ${processed}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(console.error);
```

---

## 7. Feature Flag

Add to `.env`:
```bash
ENABLE_SEMANTIC_SEARCH=false   # Flip to true after backfill is complete
```

This follows your existing pattern (`ENABLE_SEARCH_DOC=true`). The semantic search code is fully gated — when `false`, the codebase behaves exactly as it does today.

---

## 8. File Summary — What Goes Where

| File | Action | Purpose |
|------|--------|---------|
| `prisma/migrations/XXXX_add_pgvector_semantic_search/migration.sql` | **CREATE** | Enable pgvector, add columns + indexes + SQL functions |
| `src/lib/embeddings/gemini.ts` | **CREATE** | Gemini API wrapper (embed, batch embed, query embed) |
| `src/lib/embeddings/compose.ts` | **CREATE** | Listing → text composer for embedding |
| `src/lib/embeddings/sync.ts` | **CREATE** | Fetch listing data → generate → store embedding |
| `src/app/api/listings/route.ts` | **EDIT** | Add `syncListingEmbedding()` to `fireSideEffects()` |
| `src/app/api/listings/[id]/route.ts` | **EDIT** | Add `syncListingEmbedding()` after update |
| `src/lib/search/search-doc-queries.ts` | **EDIT** | Add `semanticSearchQuery()` function |
| `src/lib/search/search-v2-service.ts` | **EDIT** | Branch to semantic search when flag is on |
| `src/app/listings/[id]/page.tsx` | **EDIT** | Add `getSimilarListings()` + render section |
| `scripts/backfill-embeddings.ts` | **CREATE** | One-time backfill of existing listings |
| `.env` / `.env.example` | **EDIT** | Add `GEMINI_API_KEY` + `ENABLE_SEMANTIC_SEARCH` |

---

## 9. Phased Rollout

### Phase 1: Foundation (Day 1-2)
- [ ] `pnpm add @google/genai pgvector`
- [ ] Add `GEMINI_API_KEY` and `ENABLE_SEMANTIC_SEARCH=false` to `.env`
- [ ] Create + apply the Prisma migration
- [ ] Create `src/lib/embeddings/` (gemini.ts, compose.ts, sync.ts)
- [ ] Run `scripts/backfill-embeddings.ts`
- [ ] Verify: `SELECT COUNT(*) FROM listing_search_docs WHERE embedding IS NOT NULL`

### Phase 2: Wire It Up (Day 3-4)
- [ ] Hook `syncListingEmbedding` into `fireSideEffects()` and update route
- [ ] Add `semanticSearchQuery()` to `search-doc-queries.ts`
- [ ] Add semantic branch to `search-v2-service.ts`
- [ ] Set `ENABLE_SEMANTIC_SEARCH=true`
- [ ] Test: search "quiet room near downtown pet friendly" → verify semantic results

### Phase 3: Similar Listings (Day 5)
- [ ] Add `getSimilarListings()` to listing detail page
- [ ] Render `<SimilarListings>` component in `ListingPageClient.tsx`
- [ ] Test: visit any listing → verify 6 similar listings appear

### Phase 4: Polish (Week 2)
- [ ] Add search analytics (log queries + semantic scores to understand quality)
- [ ] Tune `semantic_weight` (0.6 is a safe start, may increase to 0.7-0.8)
- [ ] Add in-memory cache for query embeddings (same query = same vector)
- [ ] Monitor embedding coverage via admin dashboard query
- [ ] Add Sentry breadcrumbs around embedding API calls

### Phase 5: Multimodal Images (Week 3+)
- [ ] Send `listing.images[0]` URL to Gemini Embedding 2 alongside text
- [ ] Re-run backfill with multimodal composite embeddings
- [ ] A photo showing hardwood floors now matches "room with hardwood floors"

---

## 10. Key Differences From the Generic Plan

| Generic Plan | Your Codebase |
|-------------|---------------|
| Supabase data API + `rpc()` | **Prisma `$queryRaw` / `$executeRaw`** with `pgvector` npm package |
| `halfvec(768)` column | **`vector(768)`** — `pgvector` npm `toSql()` works with `vector` type; halfvec needs manual cast |
| Supabase Edge Functions | **Not needed** — embedding sync runs in Next.js API routes |
| Add column to `listings` table | **Add column to `listing_search_docs`** — follows denormalized read-model pattern |
| Supabase CLI migrations | **Prisma `--create-only` migration** with raw SQL |
| New search API route | **Extend existing `search-v2-service.ts`** — semantic search is a branch, not a replacement |
| pgmq + pg_cron queue | **Fire-and-forget from `fireSideEffects()`** — matches existing `markListingDirty` pattern |
| Feature flag: none | **`ENABLE_SEMANTIC_SEARCH` env var** — matches your `ENABLE_SEARCH_DOC` pattern |
