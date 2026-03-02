-- Enum CHECK constraints for defense-in-depth (SCHEMA-H1)
-- These fields use string columns but only accept specific values per the Zod schemas.
-- Adding DB-level constraints prevents invalid data from direct SQL access.
--
-- Rollback: ALTER TABLE "Listing" DROP CONSTRAINT "Listing_leaseDuration_check";
--           ALTER TABLE "Listing" DROP CONSTRAINT "Listing_roomType_check";
--           ALTER TABLE "Listing" DROP CONSTRAINT "Listing_genderPreference_check";
--           ALTER TABLE "Listing" DROP CONSTRAINT "Listing_householdGender_check";
-- Data safety: NOT VALID avoids full table scan; VALIDATE is a separate non-blocking step.

ALTER TABLE "Listing" ADD CONSTRAINT "Listing_leaseDuration_check"
  CHECK ("leaseDuration" IS NULL OR "leaseDuration" IN ('Month-to-month','3 months','6 months','12 months','Flexible')) NOT VALID;
ALTER TABLE "Listing" VALIDATE CONSTRAINT "Listing_leaseDuration_check";

ALTER TABLE "Listing" ADD CONSTRAINT "Listing_roomType_check"
  CHECK ("roomType" IS NULL OR "roomType" IN ('Private Room','Shared Room','Entire Place')) NOT VALID;
ALTER TABLE "Listing" VALIDATE CONSTRAINT "Listing_roomType_check";

ALTER TABLE "Listing" ADD CONSTRAINT "Listing_genderPreference_check"
  CHECK ("genderPreference" IS NULL OR "genderPreference" IN ('MALE_ONLY','FEMALE_ONLY','NO_PREFERENCE')) NOT VALID;
ALTER TABLE "Listing" VALIDATE CONSTRAINT "Listing_genderPreference_check";

ALTER TABLE "Listing" ADD CONSTRAINT "Listing_householdGender_check"
  CHECK ("householdGender" IS NULL OR "householdGender" IN ('ALL_MALE','ALL_FEMALE','MIXED')) NOT VALID;
ALTER TABLE "Listing" VALIDATE CONSTRAINT "Listing_householdGender_check";
