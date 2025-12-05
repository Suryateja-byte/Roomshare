-- Add CHECK constraint to prevent negative availableSlots
-- This is a defense-in-depth measure to prevent overselling rooms
ALTER TABLE "Listing" ADD CONSTRAINT "availableSlots_non_negative"
CHECK ("availableSlots" >= 0);
