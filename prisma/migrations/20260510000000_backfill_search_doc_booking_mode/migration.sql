-- Backfill listing_search_docs.booking_mode from the canonical room type.
-- Rollback: UPDATE listing_search_docs SET booking_mode = 'SHARED';
-- Data safety: data-only update; no schema changes.

UPDATE listing_search_docs
SET booking_mode = CASE
  WHEN room_type = 'Entire Place' THEN 'WHOLE_UNIT'
  ELSE 'SHARED'
END
WHERE booking_mode IS DISTINCT FROM CASE
  WHEN room_type = 'Entire Place' THEN 'WHOLE_UNIT'
  ELSE 'SHARED'
END;
