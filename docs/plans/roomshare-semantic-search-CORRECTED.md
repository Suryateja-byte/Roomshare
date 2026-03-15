# RoomShare Semantic Search — Corrected Implementation Plan
## Gemini Embedding + pgvector + Prisma Raw SQL

*Corrected against the actual RoomShare codebase after deep code review and research. All column names, types, patterns, and integration points verified against source files.*

---

## Architecture Decision (unchanged — validated correct)

**Add the embedding column to `listing_search_docs`, NOT to the `Listing` model.**

Rationale (verified):
1. `listing_search_docs` is the denormalized read model — all search queries hit this one table
2. The sync hook (`upsertSearchDocSync` in `search-doc-sync.ts`) runs on create — we piggyback on it
3. `search-doc-queries.ts` SQL builders are the natural place for semantic ranking
4. No Prisma schema changes — `listing_search_docs` is managed via raw SQL migrations

---

## 1. Dependencies

```bash
pnpm add @google/genai pgvector
```

- `@google/genai` — Official Google Gen AI SDK (v1.x, TypeScript-first)
- `pgvector` — Provides `toSql()` for converting `number[]` to pgvector SQL format

---

## 2. Environment Variables

### 2a. Add to `.env` and `.env.example`

```bash
# --- AI / Embeddings ---
GEMINI_API_KEY=your-gemini-api-key     # https://aistudio.google.com/apikey
ENABLE_SEMANTIC_SEARCH=false           # Flip to true after backfill
```

### 2b. Register in `src/lib/env.ts` (Zod schema + features object)

Add to `serverEnvSchema`:

```typescript
GEMINI_API_KEY: z.string().min(1).optional(),
ENABLE_SEMANTIC_SEARCH: z.enum(["true", "false"]).optional(),
```

Add to `features` object:

```typescript
get semanticSearch() {
  return process.env.ENABLE_SEMANTIC_SEARCH === "true";
},
```

Add to `logStartupWarnings()`:

```typescript
if (features.semanticSearch && !process.env.GEMINI_API_KEY) {
  warnings.push("GEMINI_API_KEY not set — semantic search enabled but unavailable");
}
```

---

## 3. Prisma Migration (two files — second is non-transactional)

### Migration 1: `prisma/migrations/XXXXXXXX_add_pgvector_semantic_search/migration.sql`

```sql
-- =============================================================================
-- Migration: Add pgvector semantic search to listing_search_docs
-- PURPOSE: Enable AI-powered semantic search using Gemini embeddings
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS search_listings_semantic;
--   DROP FUNCTION IF EXISTS get_similar_listings;
--   DROP INDEX IF EXISTS idx_search_docs_embedding_status;
--   ALTER TABLE listing_search_docs DROP CONSTRAINT IF EXISTS search_doc_embedding_status_check;
--   ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS embedding;
--   ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS embedding_text;
--   ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS embedding_status;
--   ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS embedding_updated_at;
--   ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS embedding_attempts;
--   -- NOTE: Do NOT drop the vector extension without verifying no other tables use it
-- DATA-SAFETY: Additive only. No existing columns modified or dropped.
--   ADD COLUMN is instant (no table rewrite) on PostgreSQL 11+.
--   CHECK constraint uses NOT VALID then VALIDATE pattern to avoid full table lock.
-- FEATURE-FLAG: ENABLE_SEMANTIC_SEARCH (default false, opt-in)
-- =============================================================================

-- Step 1: Enable pgvector extension
-- Safe on Supabase, Neon, RDS (15.2+). Requires extension availability.
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Add embedding columns (separate ALTER statements for safety)
ALTER TABLE listing_search_docs
  ADD COLUMN IF NOT EXISTS embedding vector(768);

ALTER TABLE listing_search_docs
  ADD COLUMN IF NOT EXISTS embedding_text text;

ALTER TABLE listing_search_docs
  ADD COLUMN IF NOT EXISTS embedding_status text DEFAULT 'PENDING';

ALTER TABLE listing_search_docs
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

ALTER TABLE listing_search_docs
  ADD COLUMN IF NOT EXISTS embedding_attempts integer DEFAULT 0;

-- Step 3: Named CHECK constraint with NOT VALID/VALIDATE pattern
ALTER TABLE listing_search_docs
  ADD CONSTRAINT search_doc_embedding_status_check
  CHECK (embedding_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
  NOT VALID;

ALTER TABLE listing_search_docs
  VALIDATE CONSTRAINT search_doc_embedding_status_check;

-- Step 4: Partial index on embedding_status for queue processing
CREATE INDEX IF NOT EXISTS idx_search_docs_embedding_status
  ON listing_search_docs (embedding_status)
  WHERE embedding_status IN ('PENDING', 'FAILED');

-- Step 5: Hybrid search function (semantic + keyword + geo + filters)
-- Called from search-doc-queries.ts via queryWithTimeout
CREATE OR REPLACE FUNCTION search_listings_semantic(
  query_embedding vector(768),
  query_text text DEFAULT '',
  bound_min_lat float DEFAULT NULL,
  bound_min_lng float DEFAULT NULL,
  bound_max_lat float DEFAULT NULL,
  bound_max_lng float DEFAULT NULL,
  min_price numeric DEFAULT 0,
  max_price numeric DEFAULT 99999,
  filter_amenities text[] DEFAULT NULL,
  filter_house_rules text[] DEFAULT NULL,
  filter_room_type text DEFAULT NULL,
  filter_lease_duration text DEFAULT NULL,
  filter_gender_preference text DEFAULT NULL,
  filter_household_gender text DEFAULT NULL,
  filter_min_available_slots int DEFAULT 1,
  filter_booking_mode text DEFAULT NULL,
  filter_move_in_date timestamptz DEFAULT NULL,
  filter_languages text[] DEFAULT NULL,
  semantic_weight float DEFAULT 0.6,
  match_count int DEFAULT 20,
  result_offset int DEFAULT 0,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  id text,
  title text,
  description text,
  price double precision,
  images text[],
  room_type text,
  lease_duration text,
  available_slots int,
  total_slots int,
  amenities text[],
  house_rules text[],
  household_languages text[],
  primary_home_language text,
  gender_preference text,
  household_gender text,
  booking_mode text,
  move_in_date timestamptz,
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  owner_id text,
  avg_rating double precision,
  review_count int,
  view_count int,
  listing_created_at timestamptz,
  recommended_score double precision,
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
  -- Matches buildSearchDocWhereConditions() in search-doc-queries.ts
  filtered AS (
    SELECT
      sd.id,
      sd.embedding,
      sd.search_tsv
    FROM listing_search_docs sd
    WHERE sd.status = 'ACTIVE'
      AND sd.embedding IS NOT NULL
      AND sd.price BETWEEN min_price AND max_price
      -- Geographic bounding box (matches && operator pattern in search-doc-queries.ts)
      AND (
        bound_min_lat IS NULL
        OR sd.location_geog && ST_MakeEnvelope(
          bound_min_lng, bound_min_lat, bound_max_lng, bound_max_lat, 4326
        )::geography
      )
      -- Array containment filters (case-insensitive via _lower columns)
      AND (filter_amenities IS NULL OR sd.amenities_lower @> filter_amenities)
      AND (filter_house_rules IS NULL OR sd.house_rules_lower @> filter_house_rules)
      -- Languages: OR logic (overlap) — matches search-doc-queries.ts &&
      AND (filter_languages IS NULL OR sd.household_languages_lower && filter_languages)
      -- Scalar filters (skip 'any' sentinel values)
      AND (filter_room_type IS NULL OR sd.room_type = filter_room_type)
      AND (filter_lease_duration IS NULL OR sd.lease_duration = filter_lease_duration)
      AND (filter_gender_preference IS NULL OR filter_gender_preference = 'any' OR sd.gender_preference = filter_gender_preference)
      AND (filter_household_gender IS NULL OR filter_household_gender = 'any' OR sd.household_gender = filter_household_gender)
      AND (filter_booking_mode IS NULL OR filter_booking_mode = 'any' OR sd.booking_mode = filter_booking_mode)
      AND sd.available_slots >= COALESCE(filter_min_available_slots, 1)
      -- Move-in date: show listings available by the user's date (<=), or with no date set
      AND (filter_move_in_date IS NULL OR sd.move_in_date IS NULL OR sd.move_in_date <= filter_move_in_date)
  ),
  -- Step B: Semantic ranking via cosine similarity
  semantic_results AS (
    SELECT
      f.id,
      ROW_NUMBER() OVER (ORDER BY f.embedding <=> query_embedding) AS rank,
      1 - (f.embedding <=> query_embedding) AS similarity
    FROM filtered f
    ORDER BY f.embedding <=> query_embedding
    LIMIT (match_count + result_offset) * 3
  ),
  -- Step C: Keyword ranking via existing tsvector (if query provided)
  keyword_results AS (
    SELECT
      f.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(f.search_tsv, plainto_tsquery('english', query_text)) DESC
      ) AS rank,
      ts_rank_cd(f.search_tsv, plainto_tsquery('english', query_text)) AS kw_score
    FROM filtered f
    WHERE query_text IS NOT NULL
      AND query_text != ''
      AND f.search_tsv @@ plainto_tsquery('english', query_text)
    ORDER BY ts_rank_cd(f.search_tsv, plainto_tsquery('english', query_text)) DESC
    LIMIT (match_count + result_offset) * 3
  ),
  -- Step D: Reciprocal Rank Fusion (k=60, standard from Cormack et al. 2009)
  fused AS (
    SELECT
      COALESCE(s.id, k.id) AS id,
      (
        semantic_weight * COALESCE(1.0 / (rrf_k + s.rank), 0) +
        (1 - semantic_weight) * COALESCE(1.0 / (rrf_k + k.rank), 0)
      ) AS score,
      COALESCE(s.similarity, 0) AS sem_sim,
      COALESCE(k.kw_score, 0) AS kw_rank_score
    FROM semantic_results s
    FULL OUTER JOIN keyword_results k ON s.id = k.id
  )
  -- Step E: Join back for full listing data
  SELECT
    sd.id,
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
    sd.household_languages,
    sd.primary_home_language,
    sd.gender_preference,
    sd.household_gender,
    sd.booking_mode,
    sd.move_in_date,
    sd.address,
    sd.city,
    sd.state,
    sd.zip,
    sd.lat,
    sd.lng,
    sd.owner_id,
    sd.avg_rating,
    sd.review_count::int,
    sd.view_count::int,
    sd.listing_created_at,
    sd.recommended_score,
    fused.sem_sim::float AS semantic_similarity,
    fused.kw_rank_score::float AS keyword_rank,
    fused.score::float AS combined_score
  FROM fused
  JOIN listing_search_docs sd ON sd.id = fused.id
  ORDER BY fused.score DESC
  LIMIT match_count
  OFFSET result_offset;
END;
$$;

-- Step 6: Similar listings function (k-NN for listing detail page)
-- Materializes target embedding once to avoid repeated subqueries
CREATE OR REPLACE FUNCTION get_similar_listings(
  target_listing_id text,
  match_count int DEFAULT 6,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id text,
  title text,
  price double precision,
  images text[],
  city text,
  state text,
  room_type text,
  available_slots int,
  similarity float
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  target_embedding vector(768);
BEGIN
  -- Materialize target embedding once
  SELECT sd.embedding INTO target_embedding
  FROM listing_search_docs sd
  WHERE sd.id = target_listing_id;

  IF target_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sd.id,
    sd.title,
    sd.price,
    sd.images,
    sd.city,
    sd.state,
    sd.room_type,
    sd.available_slots,
    (1 - (sd.embedding <=> target_embedding))::float AS similarity
  FROM listing_search_docs sd
  WHERE sd.id != target_listing_id
    AND sd.status = 'ACTIVE'
    AND sd.embedding IS NOT NULL
    AND (1 - (sd.embedding <=> target_embedding)) > similarity_threshold
  ORDER BY sd.embedding <=> target_embedding
  LIMIT match_count;
END;
$$;
```

### Migration 2 (separate, non-transactional): `XXXXXXXX_add_embedding_hnsw_index/migration.sql`

```sql
-- =============================================================================
-- Migration: HNSW index for semantic search (non-transactional)
-- PURPOSE: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
--   Prisma migrations run in transactions by default, so this must be separate.
-- ROLLBACK: DROP INDEX CONCURRENTLY IF EXISTS idx_search_docs_embedding_hnsw;
-- DATA-SAFETY: CONCURRENTLY does not block reads or writes.
--   At <10K rows, build time is seconds.
-- =============================================================================

-- NOTE: This file CANNOT be applied via `prisma migrate dev` because
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction.
-- Apply manually: psql $DATABASE_URL -f this-file.sql
-- Or use: npx prisma db execute --file this-file.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_docs_embedding_hnsw
  ON listing_search_docs
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 4. Core Library Files

### 4a. `src/lib/embeddings/gemini.ts` — Embedding generation service

```typescript
/**
 * Gemini Embedding API wrapper.
 * Uses lazy-initialized singleton (same pattern as prisma.ts).
 * L2 normalizes truncated 768-dim embeddings per Google's guidance.
 */
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-embedding-001";
const DIMENSIONS = 768;
const MAX_RETRIES = 3;
const MAX_INPUT_LENGTH = 2000; // ~500 tokens, well within 2048 token limit

// --- Lazy singleton (survives HMR in dev, fresh in production) ---
const globalForGemini = globalThis as unknown as {
  geminiClient: GoogleGenAI | undefined;
};

function getClient(): GoogleGenAI {
  if (globalForGemini.geminiClient) return globalForGemini.geminiClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("[embedding] GEMINI_API_KEY is not configured");
  }

  const client = new GoogleGenAI({ apiKey });
  if (process.env.NODE_ENV !== "production") {
    globalForGemini.geminiClient = client;
  }
  return client;
}

// --- L2 normalization (required for dims < 3072) ---
function normalizeL2(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag === 0 ? vec : vec.map((v) => v / mag);
}

// --- Retry with exponential backoff + jitter ---
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      // Non-retryable: 400, 401, 403, 404
      if (status && [400, 401, 403, 404].includes(status)) throw err;
      if (attempt === MAX_RETRIES) throw err;
      // Exponential backoff: 1s, 2s, 4s + jitter
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 16000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Generate embedding for a single text (document indexing) */
export async function generateEmbedding(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
  const truncated = text.slice(0, MAX_INPUT_LENGTH);
  const res = await withRetry(() =>
    getClient().models.embedContent({
      model: MODEL,
      contents: truncated,
      config: { taskType, outputDimensionality: DIMENSIONS },
    })
  );
  // @google/genai v1.x: single call returns res.embedding (singular), not res.embeddings
  const values = res.embedding?.values;
  if (!values?.length) throw new Error("[embedding] No embedding returned from Gemini");
  return normalizeL2(values);
}

/** Generate embedding optimized for search queries */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  return generateEmbedding(query, "RETRIEVAL_QUERY");
}

/** Batch embed multiple texts (for backfill script) */
export async function generateBatchEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (!texts.length) return [];
  const truncated = texts.map((t) => t.slice(0, MAX_INPUT_LENGTH));
  // @google/genai v1.x: batch calls use batchEmbedContents, not embedContent
  const res = await withRetry(() =>
    getClient().models.batchEmbedContents({
      model: MODEL,
      requests: truncated.map((t) => ({
        content: { parts: [{ text: t }], role: "user" },
        config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: DIMENSIONS },
      })),
    })
  );
  if (!res.embeddings) throw new Error("[embedding] No embeddings returned");
  return res.embeddings.map((e) => {
    if (!e?.values?.length) throw new Error("[embedding] Empty embedding in batch");
    return normalizeL2(e.values);
  });
}
```

### 4b. `src/lib/embeddings/compose.ts` — Listing text composer

```typescript
/**
 * Compose semantically rich text from listing fields for embedding.
 * Front-loads title + description (highest signal), then structured attributes.
 *
 * Accepts data from listing_search_docs or joined Listing + Location.
 * Column names use camelCase to match the ListingSearchData interface
 * in search-doc-sync.ts.
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
  availableSlots?: number | null;
  totalSlots?: number | null;
  address?: string;
  city?: string;
  state?: string;
  moveInDate?: Date | string | null;
  bookingMode?: string | null;
}): string {
  const parts: string[] = [];

  parts.push(listing.title);
  parts.push(listing.description);

  if (listing.roomType) {
    parts.push(`Room type: ${listing.roomType}.`);
  }
  parts.push(`$${listing.price} per month.`);

  if (listing.availableSlots != null && listing.totalSlots != null) {
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

  if (listing.bookingMode) {
    parts.push(`Booking mode: ${listing.bookingMode}.`);
  }

  if (listing.city && listing.state) {
    parts.push(`Located in ${listing.city}, ${listing.state}.`);
  } else if (listing.address) {
    parts.push(`Address: ${listing.address}.`);
  }

  if (listing.moveInDate) {
    const date =
      typeof listing.moveInDate === "string"
        ? listing.moveInDate
        : listing.moveInDate.toISOString().split("T")[0];
    parts.push(`Available from ${date}.`);
  }

  return parts.filter(Boolean).join(" ");
}
```

### 4c. `src/lib/embeddings/sync.ts` — Embedding sync pipeline

```typescript
/**
 * Generate and store embedding for a listing in listing_search_docs.
 * Called from fireSideEffects() or the backfill script.
 *
 * Non-blocking by design — caller should fire-and-forget.
 * Uses structured logger (not console) per project rules.
 * Recovers from stuck 'PROCESSING' via attempt counter + timeout.
 */
import { prisma } from "@/lib/prisma";
import pgvector from "pgvector";
import { generateEmbedding } from "./gemini";
import { composeListingText } from "./compose";
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
  embedding_text: string | null;
  embedding_status: string | null;
}

export async function syncListingEmbedding(listingId: string): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<SearchDocRow[]>`
      SELECT id, title, description, price, room_type, amenities,
             house_rules, lease_duration, gender_preference, household_gender,
             household_languages, primary_home_language, available_slots,
             total_slots, city, state, address, move_in_date, booking_mode,
             embedding_text, embedding_status
      FROM listing_search_docs
      WHERE id = ${listingId}
    `;

    if (!rows.length) return;
    const doc = rows[0];

    // Skip if already processing (prevents concurrent double-embeds)
    if (doc.embedding_status === "PROCESSING") return;

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

    // Skip if text hasn't changed (dedup)
    if (doc.embedding_text === embeddingText) return;

    // Mark as processing (with timestamp for stuck recovery)
    await prisma.$executeRaw`
      UPDATE listing_search_docs
      SET embedding_status = 'PROCESSING',
          embedding_updated_at = NOW()
      WHERE id = ${listingId}
    `;

    // Generate embedding via Gemini (with retry)
    const embedding = await generateEmbedding(embeddingText, "RETRIEVAL_DOCUMENT");
    const vecSql = pgvector.toSql(embedding);

    // Store embedding
    await prisma.$executeRaw`
      UPDATE listing_search_docs
      SET embedding = ${vecSql}::vector,
          embedding_text = ${embeddingText},
          embedding_status = 'COMPLETED',
          embedding_updated_at = NOW(),
          embedding_attempts = 0
      WHERE id = ${listingId}
    `;
  } catch (err) {
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
export async function recoverStuckEmbeddings(staleMinutes = 10): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE listing_search_docs
    SET embedding_status = 'PENDING',
        embedding_updated_at = NOW()
    WHERE embedding_status = 'PROCESSING'
      AND embedding_updated_at < NOW() - INTERVAL '1 minute' * ${staleMinutes}
  `;
  return typeof result === "number" ? result : 0;
}
```

---

## 5. Integration Points in Existing Code

### 5a. Hook into `fireSideEffects()` — `src/app/api/listings/route.ts` (line ~355)

After `upsertSearchDocSync(listing.id)` returns, add:

```typescript
import { syncListingEmbedding } from "@/lib/embeddings/sync";
import { features } from "@/lib/env";

// Inside fireSideEffects(), after upsertSearchDocSync:
if (features.semanticSearch) {
  syncListingEmbedding(listing.id).catch((err) =>
    logger.sync.error("[embedding] Side effect failed:", {
      listingId: listing.id,
      error: err instanceof Error ? err.message : "Unknown",
    })
  );
}
```

### 5b. Hook into PATCH handler — `src/app/api/listings/[id]/route.ts` (line ~579)

After `markListingDirty(id, 'listing_updated')`, add:

```typescript
if (features.semanticSearch) {
  syncListingEmbedding(id).catch((err) =>
    logger.sync.error("[embedding] Update side effect failed:", {
      listingId: id,
      error: err instanceof Error ? err.message : "Unknown",
    })
  );
}
```

### 5c. Add semantic search to `src/lib/search/search-doc-queries.ts`

Add alongside existing functions, using the same `queryWithTimeout` pattern:

```typescript
import pgvector from "pgvector";
import { generateQueryEmbedding } from "@/lib/embeddings/gemini";
import { sanitizeSearchQuery, isValidQuery } from "@/lib/search-types";
import { features } from "@/lib/env";
import { DEFAULT_PAGE_SIZE, MAX_QUERY_LENGTH } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { parseLocalDate } from "@/lib/utils";

/** Semantic search result row — matches search_listings_semantic() RETURNS TABLE */
interface SemanticSearchRow {
  id: string;
  title: string;
  description: string;
  price: number | string; // Prisma returns DECIMAL as string; use Number() in mapper
  images: string[];
  room_type: string | null;
  lease_duration: string | null;
  available_slots: number;
  total_slots: number;
  amenities: string[];
  house_rules: string[];
  household_languages: string[];
  primary_home_language: string | null;
  gender_preference: string | null;
  household_gender: string | null;
  booking_mode: string;
  move_in_date: Date | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  owner_id: string;
  avg_rating: number;
  review_count: number;
  view_count: number;
  listing_created_at: Date;
  recommended_score: number;
  semantic_similarity: number;
  keyword_rank: number;
  combined_score: number;
}

/**
 * Semantic search — called when user provides a natural language query
 * and ENABLE_SEMANTIC_SEARCH is true.
 *
 * Falls back to null (caller uses existing FTS search) if:
 * - Feature flag is off
 * - Query is too short
 * - Embedding generation fails
 * - SQL function fails
 *
 * Uses queryWithTimeout (5s statement_timeout) matching all other queries.
 */
export async function semanticSearchQuery(
  filterParams: FilterParams,
  limit: number = DEFAULT_PAGE_SIZE,
  offset: number = 0
): Promise<SemanticSearchRow[] | null> {
  if (!features.semanticSearch) return null;

  const rawQuery = filterParams.query?.trim() ?? "";
  const queryText = sanitizeSearchQuery(rawQuery);
  if (!isValidQuery(queryText) || queryText.length < 3) return null;

  // Cap query length to prevent cost amplification
  const cappedQuery = queryText.slice(0, MAX_QUERY_LENGTH);

  try {
    const embedding = await generateQueryEmbedding(cappedQuery);
    const vecSql = pgvector.toSql(embedding);

    // Lowercase array filters to match _lower columns
    const amenitiesLower = filterParams.amenities?.length
      ? filterParams.amenities.map((a) => a.toLowerCase())
      : null;
    const houseRulesLower = filterParams.houseRules?.length
      ? filterParams.houseRules.map((r) => r.toLowerCase())
      : null;
    const languagesLower = filterParams.languages?.length
      ? filterParams.languages.map((l) => l.toLowerCase())
      : null;

    const results = await queryWithTimeout<SemanticSearchRow>(
      `SELECT * FROM search_listings_semantic(
        $1::vector,
        $2,
        $3::float, $4::float, $5::float, $6::float,
        $7::numeric, $8::numeric,
        $9::text[], $10::text[],
        $11::text, $12::text, $13::text, $14::text,
        $15::int, $16::text, $17::timestamptz, $18::text[],
        0.6::float,
        $19::int,
        $20::int
      )`,
      [
        vecSql,
        cappedQuery,
        filterParams.bounds?.minLat ?? null,
        filterParams.bounds?.minLng ?? null,
        filterParams.bounds?.maxLat ?? null,
        filterParams.bounds?.maxLng ?? null,
        filterParams.minPrice ?? 0,
        filterParams.maxPrice ?? 99999,
        amenitiesLower,
        houseRulesLower,
        filterParams.roomType ?? null,
        filterParams.leaseDuration ?? null,
        filterParams.genderPreference === "any" ? null : (filterParams.genderPreference ?? null),
        filterParams.householdGender === "any" ? null : (filterParams.householdGender ?? null),
        filterParams.minAvailableSlots ?? 1,
        filterParams.bookingMode === "any" ? null : (filterParams.bookingMode ?? null),
        filterParams.moveInDate ? parseLocalDate(filterParams.moveInDate) : null,
        languagesLower,
        limit,
        offset,
      ]
    );

    return results.length > 0 ? results : null;
  } catch (err) {
    logger.sync.error("[semantic-search] Failed, falling back to FTS:", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return null; // Caller falls back to existing search
  }
}

/** Transform semantic search rows to ListingData[] */
export function mapSemanticRowsToListingData(
  rows: SemanticSearchRow[]
): ListingData[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    images: row.images,
    roomType: row.room_type,
    leaseDuration: row.lease_duration,
    availableSlots: row.available_slots,
    totalSlots: row.total_slots,
    amenities: row.amenities,
    houseRules: row.house_rules,
    householdLanguages: row.household_languages,
    primaryHomeLanguage: row.primary_home_language,
    genderPreference: row.gender_preference,
    householdGender: row.household_gender,
    moveInDate: row.move_in_date ?? undefined,
    ownerId: row.owner_id,
    location: {
      address: row.address,
      city: row.city,
      state: row.state,
      zip: row.zip,
      lat: row.lat ?? 0,
      lng: row.lng ?? 0,
    },
  }));
}
```

### 5d. Wire into `src/lib/search/search-v2-service.ts`

Inside the `listPromise` IIFE (around line 164), before the existing `getSearchDocListingsFirstPage` / `getSearchDocListingsWithKeyset` calls:

```typescript
import { semanticSearchQuery, mapSemanticRowsToListingData } from "./search-doc-queries";

// Inside the listPromise IIFE, after filterParams is resolved:
// Semantic search branch — only for text queries with "recommended" sort
// Variable names match actual search-v2-service.ts: decoded, sortOption, limit
if (
  features.semanticSearch &&
  filterParams.query &&
  filterParams.query.length >= 3 &&
  sortOption === "recommended"
) {
  const page = decoded?.type === "legacy" ? decoded.page : 1;
  const offset = (page - 1) * limit;
  const semanticRows = await semanticSearchQuery(filterParams, limit + 1, offset);

  if (semanticRows && semanticRows.length > 0) {
    const hasNextPage = semanticRows.length > limit;
    const items = mapSemanticRowsToListingData(semanticRows.slice(0, limit));
    const semanticPaginated: PaginatedResultHybrid<ListingData> = {
      items,
      total: null,
      page,
      limit,
      totalPages: null,
      hasNextPage,
      nextCursor: hasNextPage ? encodeCursor(page + 1) : null,
    };
    // Return shape must match listPromise IIFE: { listResult, nextCursor }
    return { listResult: semanticPaginated, nextCursor: semanticPaginated.nextCursor ?? null };
  }
  // Fall through to existing FTS search if semantic returns null
}
```

> **Note:** `encodeCursor` is imported from `@/lib/search/hash`. It handles HMAC
> signing when `CURSOR_SECRET` is set. Do NOT use raw `String(page+1)` — the signed
> cursor is required for `decodeCursorAny()` to accept it.
> The `decoded` variable (not `cursorResult`) is the actual variable name in `search-v2-service.ts`.

### 5e. Similar Listings on Detail Page — `src/app/listings/[id]/page.tsx`

Add to the existing `Promise.all` block:

```typescript
import { features } from "@/lib/env";

async function getSimilarListings(listingId: string) {
  if (!features.semanticSearch) return [];
  try {
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        price: number;
        images: string[];
        city: string;
        state: string;
        room_type: string | null;
        available_slots: number;
        similarity: number;
      }>
    >`SELECT * FROM get_similar_listings(${listingId}, 6, 0.3)`;
    return results;
  } catch {
    return [];
  }
}

// In the Promise.all:
const [coordinates, acceptedBookings, reviews, similarListings] = await Promise.all([
  // ... existing queries ...,
  getSimilarListings(params.id),
]);
// Pass similarListings to ListingPageClient as a prop
```

---

## 6. Backfill Script

### `scripts/backfill-embeddings.ts`

```typescript
/**
 * Backfill embeddings for all active listings in listing_search_docs.
 * Run: npx tsx scripts/backfill-embeddings.ts
 *
 * Safe to re-run — skips completed listings.
 * Uses keyset pagination (not OFFSET) to avoid row-skipping bugs.
 * Respects Gemini free tier rate limits (~50 RPM with batching).
 * Imports composeListingText from compose.ts (no duplicated logic).
 */
import { PrismaClient } from "@prisma/client";
import pgvector from "pgvector";
import { generateBatchEmbeddings } from "../src/lib/embeddings/gemini";
import { composeListingText } from "../src/lib/embeddings/compose";

const prisma = new PrismaClient();
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
    const rows = await prisma.$queryRaw<BackfillRow[]>`
      SELECT id, title, description, price, room_type, amenities,
             house_rules, lease_duration, gender_preference, household_gender,
             household_languages, primary_home_language,
             available_slots, total_slots, city, state, address,
             move_in_date, booking_mode
      FROM listing_search_docs
      WHERE status = 'ACTIVE'
        AND (embedding IS NULL OR embedding_status IN ('PENDING', 'FAILED'))
        AND embedding_attempts < 3
        AND (${lastId}::text IS NULL OR id > ${lastId})
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

      console.log(`Batch done. Processed: ${processed}, Failed: ${failed}`);
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

  console.log(`\nBackfill complete. Processed: ${processed}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(console.error);
```

---

## 7. Tests

### 7a. `src/__tests__/lib/embeddings/compose.test.ts` — Unit test for text composer

```typescript
import { composeListingText } from "@/lib/embeddings/compose";

describe("composeListingText", () => {
  it("includes title and description", () => {
    const text = composeListingText({
      title: "Sunny Room",
      description: "A bright room downtown",
      price: 800,
    });
    expect(text).toContain("Sunny Room");
    expect(text).toContain("A bright room downtown");
    expect(text).toContain("$800 per month");
  });

  it("handles zero available slots correctly", () => {
    const text = composeListingText({
      title: "Room",
      description: "Description",
      price: 500,
      availableSlots: 0,
      totalSlots: 3,
    });
    expect(text).toContain("0 of 3 slots available");
  });

  it("includes all optional fields when present", () => {
    const text = composeListingText({
      title: "Room",
      description: "Desc",
      price: 600,
      roomType: "PRIVATE",
      amenities: ["WiFi", "AC"],
      houseRules: ["No smoking"],
      leaseDuration: "MONTH_TO_MONTH",
      genderPreference: "ANY",
      householdGender: "MIXED",
      householdLanguages: ["English", "Spanish"],
      city: "Austin",
      state: "TX",
      moveInDate: "2026-04-01",
      bookingMode: "SHARED",
    });
    expect(text).toContain("Room type: PRIVATE");
    expect(text).toContain("Amenities: WiFi, AC");
    expect(text).toContain("House rules: No smoking");
    expect(text).toContain("Lease: MONTH_TO_MONTH");
    expect(text).toContain("Located in Austin, TX");
    expect(text).toContain("Available from 2026-04-01");
    expect(text).toContain("Languages spoken: English, Spanish");
    expect(text).toContain("Booking mode: SHARED");
  });

  it("omits null/undefined optional fields", () => {
    const text = composeListingText({
      title: "Room",
      description: "Desc",
      price: 500,
    });
    expect(text).not.toContain("Room type:");
    expect(text).not.toContain("Amenities:");
    expect(text).not.toContain("Located in");
  });
});
```

### 7b. `src/__tests__/lib/embeddings/gemini.test.ts` — Unit test for normalizeL2

```typescript
/**
 * Test the embedding module's normalization and error handling.
 * Gemini API calls are mocked — no real API key needed.
 *
 * Mock structure matches @google/genai v1.x:
 * - embedContent() returns { embedding: { values: number[] } } (singular)
 * - batchEmbedContents() returns { embeddings: [{ values: number[] }] } (plural)
 */

// Set env var BEFORE module load
process.env.GEMINI_API_KEY = "test-key";

const mockEmbedContent = jest.fn();
const mockBatchEmbedContents = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      embedContent: mockEmbedContent,
      batchEmbedContents: mockBatchEmbedContents,
    },
  })),
}));

import { generateEmbedding, generateQueryEmbedding } from "@/lib/embeddings/gemini";

describe("generateEmbedding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns L2-normalized vector", async () => {
    // Unnormalized vector [3, 4] should become [0.6, 0.8]
    mockEmbedContent.mockResolvedValueOnce({
      embedding: { values: [3, 4] },
    });

    const result = await generateEmbedding("test text");
    const magnitude = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  it("throws on empty embedding response", async () => {
    mockEmbedContent.mockResolvedValueOnce({ embedding: null });
    await expect(generateEmbedding("test")).rejects.toThrow("No embedding");
  });

  it("truncates input longer than MAX_INPUT_LENGTH", async () => {
    const longText = "a".repeat(5000);
    mockEmbedContent.mockResolvedValueOnce({
      embedding: { values: [1] },
    });

    await generateEmbedding(longText);

    const calledWith = mockEmbedContent.mock.calls[0][0];
    expect(calledWith.contents.length).toBeLessThanOrEqual(2000);
  });
});

describe("generateQueryEmbedding", () => {
  it("uses RETRIEVAL_QUERY task type", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embedding: { values: [1, 0] },
    });

    await generateQueryEmbedding("search query");

    expect(mockEmbedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ taskType: "RETRIEVAL_QUERY" }),
      })
    );
  });
});
```

---

## 8. File Summary — What Goes Where

| File | Action | Purpose |
|------|--------|---------|
| `prisma/migrations/XXXX_add_pgvector_semantic_search/migration.sql` | **CREATE** | Enable pgvector, add columns + named constraint + SQL functions |
| `prisma/migrations/XXXX_add_embedding_hnsw_index/migration.sql` | **CREATE** | HNSW index (non-transactional, CONCURRENTLY) |
| `src/lib/embeddings/gemini.ts` | **CREATE** | Gemini API wrapper (lazy init, retry, L2 normalize) |
| `src/lib/embeddings/compose.ts` | **CREATE** | Listing → text composer for embedding |
| `src/lib/embeddings/sync.ts` | **CREATE** | Fetch → generate → store embedding + stuck recovery |
| `src/lib/env.ts` | **EDIT** | Add `GEMINI_API_KEY`, `ENABLE_SEMANTIC_SEARCH` to Zod + features |
| `src/app/api/listings/route.ts` | **EDIT** | Add `syncListingEmbedding()` to `fireSideEffects()` |
| `src/app/api/listings/[id]/route.ts` | **EDIT** | Add `syncListingEmbedding()` after update |
| `src/lib/search/search-doc-queries.ts` | **EDIT** | Add `semanticSearchQuery()` + `mapSemanticRowsToListingData()` |
| `src/lib/search/search-v2-service.ts` | **EDIT** | Branch to semantic search for text+recommended |
| `src/app/listings/[id]/page.tsx` | **EDIT** | Add `getSimilarListings()` + pass to client |
| `scripts/backfill-embeddings.ts` | **CREATE** | Backfill with keyset pagination + canonical compose |
| `.env` / `.env.example` | **EDIT** | Add `GEMINI_API_KEY` + `ENABLE_SEMANTIC_SEARCH` |
| `src/__tests__/lib/embeddings/compose.test.ts` | **CREATE** | Unit tests for text composer |
| `src/__tests__/lib/embeddings/gemini.test.ts` | **CREATE** | Unit tests for embedding + normalization |

---

## 9. Phased Rollout

### Phase 1: Foundation (Day 1-2)
- [ ] `pnpm add @google/genai pgvector`
- [ ] Add env vars to `.env` and `.env.example`
- [ ] Edit `src/lib/env.ts` — add Zod schema + features getter
- [ ] Create Migration 1 (columns + SQL functions) — apply with `npx prisma migrate dev`
- [ ] Create Migration 2 (HNSW index) — apply separately
- [ ] Create `src/lib/embeddings/` (gemini.ts, compose.ts, sync.ts)
- [ ] Create tests (compose.test.ts, gemini.test.ts) — run with `pnpm test`
- [ ] Run `scripts/backfill-embeddings.ts`
- [ ] Verify: `SELECT COUNT(*) FROM listing_search_docs WHERE embedding_status = 'COMPLETED'`
- [ ] Verify: `SELECT COUNT(*) FROM listing_search_docs WHERE embedding_status IN ('PENDING', 'FAILED')`

### Phase 2: Wire It Up (Day 3-4)
- [ ] Hook `syncListingEmbedding` into `fireSideEffects()` (POST route)
- [ ] Hook `syncListingEmbedding` into PATCH handler
- [ ] Add `semanticSearchQuery()` + `mapSemanticRowsToListingData()` to `search-doc-queries.ts`
- [ ] Add semantic branch to `search-v2-service.ts`
- [ ] **Only after backfill shows >90% COMPLETED**: Set `ENABLE_SEMANTIC_SEARCH=true`
- [ ] Test: search "quiet room near downtown pet friendly" — verify semantic results
- [ ] Test: search "affordable studio with parking" — verify results rank correctly
- [ ] Verify no console errors, check Sentry for embedding failures

### Phase 3: Similar Listings (Day 5)
- [ ] Add `getSimilarListings()` to listing detail page
- [ ] Pass to `ListingPageClient` and render `<SimilarListings>` component
- [ ] Test: visit any listing with embedding → verify similar listings appear

### Phase 4: Polish (Week 2)
- [ ] Add in-memory LRU cache for query embeddings (same query = same vector)
- [ ] Add `recoverStuckEmbeddings()` to cron or startup
- [ ] Monitor embedding coverage via admin query
- [ ] Tune `semantic_weight` (0.6 start, A/B test 0.5 and 0.7)
- [ ] Add Sentry breadcrumbs around embedding API calls

---

## 10. Known Limitations (address in Phase 2+)

1. **Soft holds not subtracted from slot count** — When `ENABLE_SOFT_HOLDS` is active, the existing FTS search subtracts held bookings from `available_slots`. The semantic SQL function uses the raw `available_slots` column. TODO: Add a `Booking` subquery to the SQL function when soft holds go to production.

2. **Amenity matching is exact, not partial** — The existing FTS search uses `LIKE '%' || term || '%'` for amenity matching (e.g., "pool" matches "Pool Access"). The semantic SQL function uses `@>` (exact containment). This works only if amenity names are normalized on write. If partial matching is needed, the SQL function must be updated.

3. **No antimeridian handling** — The `&&` geo filter doesn't split bounds across the antimeridian. This is a rare edge case for a US-focused roommate app.

4. **Offset-based pagination for semantic results** — Unlike the keyset cursor system used by FTS, semantic search uses simple offset pagination. This is acceptable because: (a) the 60-item client cap limits total offset depth, and (b) RRF scores are not stable enough for keyset cursors.

---

## 11. Key Corrections From Original Plan

| Original Plan | Corrected Plan | Reason |
|--------------|---------------|--------|
| `sd.listing_id` | `sd.id` | Table PK is `id`, not `listing_id` |
| `sd.location` | `sd.location_geog` | Column is `location_geog` (geography type) |
| `ST_Intersects()` | `&& ... ::geography` | Matches existing `search-doc-queries.ts` pattern, uses GIST index |
| `owner_name`, `owner_image` in RETURNS | Removed | Columns don't exist in `listing_search_docs` |
| `SearchParams` type | `FilterParams` type | Actual type in codebase |
| `params.bounds.sw.lat` | `filterParams.bounds?.minLat` | Different bounds shape |
| `params.availableSlots` | `filterParams.minAvailableSlots` | Different field name |
| `process.env.ENABLE_SEMANTIC_SEARCH` | `features.semanticSearch` | Must use `env.ts` Zod pattern |
| Module-level `new GoogleGenAI()` | Lazy singleton `getClient()` | Avoid crash in CI/preview/test |
| `console.error` logging | `logger.sync.error` | Must use structured logger |
| OFFSET pagination in backfill | Keyset pagination (`id > lastId`) | OFFSET skips rows during concurrent updates |
| Duplicate `composeText()` in backfill | Import `composeListingText` | Prevent dedup check from re-embedding |
| No retry on Gemini failure | Exponential backoff (3 retries) | Handle transient 429/500 errors |
| No input length cap | `MAX_INPUT_LENGTH = 2000` + `MAX_QUERY_LENGTH` | Prevent cost amplification + PII leakage |
| `CREATE INDEX` (blocking) | `CREATE INDEX CONCURRENTLY` (separate migration) | No read/write blocking |
| Unnamed CHECK constraint | Named `search_doc_embedding_status_check` | Clean rollback |
| No stuck recovery | `recoverStuckEmbeddings()` | Recover from crashed workers |
| `availableSlots && totalSlots` | `availableSlots != null && totalSlots != null` | Handle 0 correctly |
| Lowercase status values | UPPERCASE (`PENDING`, `COMPLETED`) | Match codebase convention |
| No tests | compose.test.ts + gemini.test.ts | CLAUDE.md requires test-backed behavior |
| `prisma.$queryRaw` (no timeout) | `queryWithTimeout()` (5s timeout) | Match existing search query pattern |
| Missing filters | Added: `bookingMode`, `moveInDate`, `languages` | Match actual FilterParams fields |
| No pagination support | `result_offset` param + offset-based paging | Works with existing "Load more" pattern |
| `websearch_to_tsquery` | `plainto_tsquery` | Matches existing FTS pattern in search-doc-queries.ts |
| `res.embeddings[0].values` | `res.embedding.values` | @google/genai v1.x: `embedContent` returns singular `embedding` |
| `embedContent` with array | `batchEmbedContents` | @google/genai v1.x: batch requires separate method |
| `logger.search.error` | `logger.sync.error` | `logger.search` namespace doesn't exist |
| `cursorResult` variable | `decoded` variable | Actual variable name in search-v2-service.ts |
| `String(page+1)` cursor | `encodeCursor(page+1)` | Must match cursor decoder expectations |
| IIFE returns `PaginatedResult` | Returns `{ listResult, nextCursor }` | Must match listPromise IIFE return shape |
| Languages `@>` (AND) | `&&` (OR overlap) | Matches existing search behavior |
| `move_in_date >= date` | `move_in_date IS NULL OR <= date` | Matches existing "available by date" logic |
| `filter_min_available_slots DEFAULT NULL` | `DEFAULT 1` | Matches existing minimum of 1 slot |
| No `'any'` sentinel handling | Filter out `'any'` values | Matches existing gender/booking mode pattern |
| Missing `moveInDate` in mapper | Added `moveInDate` field | Included in `ListingData` type |
| Missing `parseLocalDate` for moveInDate | Added `parseLocalDate()` call | Matches existing date handling |
| `price: number` in SemanticSearchRow | `price: number \| string` | Prisma returns DECIMAL as string |
| `encodeLegacyCursor` (doesn't exist) | `encodeCursor` from `@/lib/search/hash` | Must use HMAC-signed cursor |
| `booking_mode: string \| null` in sync | `booking_mode: string` (NOT NULL) | Column is NOT NULL DEFAULT 'SHARED' |
