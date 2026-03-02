-- Add CHECK constraints matching Zod schema validation rules (M-D1)
-- Prevents invalid data from being written via direct DB access.
--
-- Rollback: ALTER TABLE "Listing" DROP CONSTRAINT chk_*; ALTER TABLE "Location" DROP CONSTRAINT chk_*;
-- Data safety: NOT VALID avoids full table scan lock on existing rows.
--              Run VALIDATE CONSTRAINT separately during low-traffic window.

-- Listing constraints
ALTER TABLE "Listing" ADD CONSTRAINT chk_title_length
    CHECK (char_length(title) >= 1 AND char_length(title) <= 100) NOT VALID;

ALTER TABLE "Listing" ADD CONSTRAINT chk_description_length
    CHECK (char_length(description) >= 10 AND char_length(description) <= 1000) NOT VALID;

ALTER TABLE "Listing" ADD CONSTRAINT chk_price_range
    CHECK (price > 0 AND price <= 50000) NOT VALID;

ALTER TABLE "Listing" ADD CONSTRAINT chk_total_slots_range
    CHECK ("totalSlots" >= 1 AND "totalSlots" <= 20) NOT VALID;

ALTER TABLE "Listing" ADD CONSTRAINT chk_images_count
    CHECK (array_length(images, 1) >= 1 AND array_length(images, 1) <= 10) NOT VALID;

-- Location constraints
ALTER TABLE "Location" ADD CONSTRAINT chk_address_length
    CHECK (char_length(address) >= 1 AND char_length(address) <= 200) NOT VALID;

ALTER TABLE "Location" ADD CONSTRAINT chk_city_length
    CHECK (char_length(city) >= 1 AND char_length(city) <= 100) NOT VALID;

ALTER TABLE "Location" ADD CONSTRAINT chk_state_length
    CHECK (char_length(state) >= 1 AND char_length(state) <= 50) NOT VALID;

ALTER TABLE "Location" ADD CONSTRAINT chk_zip_format
    CHECK (zip ~ '^\d{5}(-\d{4})?$') NOT VALID;
