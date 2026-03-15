-- Fix: Cast numeric(10,2) columns to float8 in RETURNS TABLE functions.
-- PostgreSQL requires exact type match between SELECT columns and RETURNS TABLE declarations.
-- listing_search_docs.price is numeric(10,2) but RETURNS TABLE declares double precision.
-- ROLLBACK: Re-run original CREATE OR REPLACE from migration 20260314000000.
-- DATA-SAFETY: DDL only, no data changes.

-- Fix 1: search_listings_semantic — cast sd.price to float8
DROP FUNCTION IF EXISTS search_listings_semantic(vector, text, float, float, float, float, numeric, numeric, text[], text[], text, text, text, text, int, text, timestamptz, text[], float, int, int, int);

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
  filtered AS (
    SELECT
      sd.id,
      sd.embedding,
      sd.search_tsv
    FROM listing_search_docs sd
    WHERE sd.status = 'ACTIVE'
      AND sd.embedding IS NOT NULL
      AND sd.price BETWEEN min_price AND max_price
      AND (
        bound_min_lat IS NULL
        OR sd.location_geog && ST_MakeEnvelope(
          bound_min_lng, bound_min_lat, bound_max_lng, bound_max_lat, 4326
        )::geography
      )
      AND (filter_amenities IS NULL OR sd.amenities_lower @> filter_amenities)
      AND (filter_house_rules IS NULL OR sd.house_rules_lower @> filter_house_rules)
      AND (filter_languages IS NULL OR sd.household_languages_lower && filter_languages)
      AND (filter_room_type IS NULL OR sd.room_type = filter_room_type)
      AND (filter_lease_duration IS NULL OR sd.lease_duration = filter_lease_duration)
      AND (filter_gender_preference IS NULL OR filter_gender_preference = 'any' OR sd.gender_preference = filter_gender_preference)
      AND (filter_household_gender IS NULL OR filter_household_gender = 'any' OR sd.household_gender = filter_household_gender)
      AND (filter_booking_mode IS NULL OR filter_booking_mode = 'any' OR sd.booking_mode = filter_booking_mode)
      AND sd.available_slots >= COALESCE(filter_min_available_slots, 1)
      AND (filter_move_in_date IS NULL OR sd.move_in_date IS NULL OR sd.move_in_date <= filter_move_in_date)
  ),
  semantic_results AS (
    SELECT
      f.id,
      ROW_NUMBER() OVER (ORDER BY f.embedding <=> query_embedding) AS rank,
      1 - (f.embedding <=> query_embedding) AS similarity
    FROM filtered f
    ORDER BY f.embedding <=> query_embedding
    LIMIT (match_count + result_offset) * 3
  ),
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
  SELECT
    sd.id,
    sd.title,
    sd.description,
    sd.price::float8,
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

-- Fix 2: get_similar_listings — cast sd.price to float8
DROP FUNCTION IF EXISTS get_similar_listings(text, int, float);

CREATE OR REPLACE FUNCTION get_similar_listings(
  target_listing_id text,
  match_count int DEFAULT 6,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id text,
  title text,
  description text,
  price double precision,
  images text[],
  city text,
  state text,
  room_type text,
  available_slots int,
  total_slots int,
  amenities text[],
  household_languages text[],
  avg_rating double precision,
  review_count int,
  similarity float
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  target_embedding vector(768);
BEGIN
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
    sd.description,
    sd.price::float8,
    sd.images,
    sd.city,
    sd.state,
    sd.room_type,
    sd.available_slots,
    sd.total_slots,
    sd.amenities,
    sd.household_languages,
    sd.avg_rating,
    sd.review_count::int,
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
