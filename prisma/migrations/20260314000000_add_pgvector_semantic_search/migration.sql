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
