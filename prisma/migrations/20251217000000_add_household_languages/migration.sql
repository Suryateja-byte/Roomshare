-- Migration: Add Household Languages Feature
-- Description: Add household_languages and primary_home_language columns to Listing

-- Step 1: Add household_languages column (TEXT[] with default empty array)
ALTER TABLE "Listing" ADD COLUMN "household_languages" TEXT[] DEFAULT '{}';

-- Step 2: Add GIN index for efficient array overlap queries
-- This enables fast filtering using the && (overlap) operator
CREATE INDEX "Listing_household_languages_idx" ON "Listing" USING GIN ("household_languages");

-- Step 3: Add optional primary_home_language column
ALTER TABLE "Listing" ADD COLUMN "primary_home_language" TEXT;
