-- Normalize non-canonical lease duration values to match VALID_LEASE_DURATIONS
-- "1 year" was offered by EditListingForm but rejected by server schema (listingLeaseDurationSchema)
-- "1 year+" was offered by EditListingForm but rejected by server schema
-- This migration fixes the source of truth so search indexing and filters work correctly.
--
-- Rollback: UPDATE "Listing" SET "leaseDuration" = '1 year' WHERE "leaseDuration" = '12 months';
--           UPDATE "Listing" SET "leaseDuration" = '1 year+' WHERE "leaseDuration" = 'Flexible';
--           (Note: only roll back rows updated by this migration — use updatedAt timestamp filter)
--
-- Data safety: No schema change, no table lock, no backfill needed. Simple UPDATE with WHERE filter.

UPDATE "Listing" SET "leaseDuration" = '12 months' WHERE "leaseDuration" = '1 year';
UPDATE "Listing" SET "leaseDuration" = 'Flexible' WHERE "leaseDuration" = '1 year+';
