-- Add CHECK constraint ensuring availableSlots never exceeds totalSlots
-- This prevents overselling at the database level
--
-- Rollback: ALTER TABLE "Listing" DROP CONSTRAINT "Listing_availableSlots_lte_totalSlots";
-- Data safety: NOT VALID avoids full table lock during creation; VALIDATE runs separately
-- Risk: Low — constraint only blocks invalid future writes, no existing data modified

ALTER TABLE "Listing" ADD CONSTRAINT "Listing_availableSlots_lte_totalSlots"
CHECK ("availableSlots" <= "totalSlots") NOT VALID;

ALTER TABLE "Listing" VALIDATE CONSTRAINT "Listing_availableSlots_lte_totalSlots";
