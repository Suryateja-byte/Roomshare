-- Add CHECK constraint for totalSlots (must be positive and at most 20)
-- Rollback: ALTER TABLE "Listing" DROP CONSTRAINT "listing_total_slots_positive";
-- Data safety: Zod schema already enforces positive() on create, no existing violations expected
ALTER TABLE "Listing" ADD CONSTRAINT "listing_total_slots_positive"
  CHECK ("totalSlots" > 0 AND "totalSlots" <= 20);
