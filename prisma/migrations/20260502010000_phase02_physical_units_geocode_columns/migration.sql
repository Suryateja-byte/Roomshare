-- Phase 02: Add geocode output columns to physical_units
-- All columns are nullable; safe to add to existing rows (all NULL initially).
-- Rollback: ALTER TABLE physical_units DROP COLUMN exact_point, public_point, public_cell_id, public_area_name;

-- Attempt to install PostGIS; safe no-op if already present; silently skipped in PGlite.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
  -- PostGIS not available in this environment (e.g., PGlite test DB).
  -- Columns will be added as TEXT NULL below instead of GEOGRAPHY.
  NULL;
END;
$$;

-- Add exact_point: GEOGRAPHY if PostGIS available, TEXT fallback otherwise
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'geography'
  ) THEN
    EXECUTE 'ALTER TABLE "physical_units" ADD COLUMN IF NOT EXISTS "exact_point" GEOGRAPHY(Point,4326) NULL';
  ELSE
    EXECUTE 'ALTER TABLE "physical_units" ADD COLUMN IF NOT EXISTS "exact_point" TEXT NULL';
  END IF;
END;
$$;

-- Add public_point: GEOGRAPHY if PostGIS available, TEXT fallback otherwise
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'geography'
  ) THEN
    EXECUTE 'ALTER TABLE "physical_units" ADD COLUMN IF NOT EXISTS "public_point" GEOGRAPHY(Point,4326) NULL';
  ELSE
    EXECUTE 'ALTER TABLE "physical_units" ADD COLUMN IF NOT EXISTS "public_point" TEXT NULL';
  END IF;
END;
$$;

-- Add public_cell_id: TEXT in all environments (H3 cell ID string)
ALTER TABLE "physical_units" ADD COLUMN IF NOT EXISTS "public_cell_id" TEXT NULL;

-- Add public_area_name: TEXT in all environments (human-readable area name)
ALTER TABLE "physical_units" ADD COLUMN IF NOT EXISTS "public_area_name" TEXT NULL;
