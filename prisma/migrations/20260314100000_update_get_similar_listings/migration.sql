-- Expand get_similar_listings to return fields needed by ListingCard UI component.
-- REPLACES the function from 20260314000000. Parameters unchanged — safe for existing callers.
-- ROLLBACK: Re-run the original CREATE OR REPLACE from migration 20260314000000.
-- DATA-SAFETY: DDL only, no table changes, no locks, no backfill.

-- Must DROP first because PostgreSQL cannot ALTER return type via CREATE OR REPLACE
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
    sd.price,
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
