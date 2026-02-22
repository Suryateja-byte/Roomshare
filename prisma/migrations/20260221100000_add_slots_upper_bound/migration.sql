-- Rollback: ALTER TABLE "Listing" DROP CONSTRAINT "slots_upper_bound";
-- Data-safety: NOT VALID avoids full table lock; VALIDATE is a separate lightweight pass.
-- Risk: None — constraint only rejects future invalid writes.

ALTER TABLE "Listing"
  ADD CONSTRAINT "slots_upper_bound"
  CHECK ("availableSlots" <= "totalSlots")
  NOT VALID;

ALTER TABLE "Listing" VALIDATE CONSTRAINT "slots_upper_bound";
