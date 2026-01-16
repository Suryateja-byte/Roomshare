-- ============================================================
-- SearchDoc: Denormalized Read Model for /api/search/v2
-- Purpose: Single indexed table replacing Listing + Location + Review joins
--
-- ROLLBACK: DROP TABLE "listing_search_doc_dirty"; DROP TABLE "listing_search_docs";
--           (Reversible - no data loss, regenerated from source tables)
--
-- DATA-SAFETY:
-- - Additive only: no changes to existing tables
-- - No locks on existing tables during creation
-- - Backfill runs separately via script (safe batch processing)
-- - Feature flag controls read path (ENABLE_SEARCH_DOC env var)
-- ============================================================

-- ============================================================
-- STEP 1: Create listing_search_docs table
-- Denormalized snapshot of Listing + Location + Review data
-- ============================================================
CREATE TABLE "listing_search_docs" (
  -- Primary key (same as Listing.id)
  "id" TEXT NOT NULL,

  -- From Listing table
  "owner_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "images" TEXT[] NOT NULL DEFAULT '{}',
  "amenities" TEXT[] NOT NULL DEFAULT '{}',
  "house_rules" TEXT[] NOT NULL DEFAULT '{}',
  "household_languages" TEXT[] NOT NULL DEFAULT '{}',
  "primary_home_language" TEXT,
  "lease_duration" TEXT,
  "room_type" TEXT,
  "move_in_date" TIMESTAMPTZ,
  "total_slots" INTEGER NOT NULL,
  "available_slots" INTEGER NOT NULL,
  "view_count" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "listing_created_at" TIMESTAMPTZ NOT NULL,

  -- From Location table (denormalized)
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "zip" TEXT NOT NULL,
  -- PostGIS geography for spatial queries
  "location_geog" geography(Point, 4326),
  -- Precomputed lat/lng for fast access (no ST_X/ST_Y at query time)
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,

  -- From Review aggregation (precomputed)
  "avg_rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "review_count" INTEGER NOT NULL DEFAULT 0,

  -- Precomputed for sorting (recommended score)
  -- Formula: avg_rating * 20 + view_count * 0.1 + review_count * 5
  "recommended_score" DOUBLE PRECISION NOT NULL DEFAULT 0,

  -- Case-insensitive filter columns (lowercase arrays for GIN containment)
  "amenities_lower" TEXT[] NOT NULL DEFAULT '{}',
  "house_rules_lower" TEXT[] NOT NULL DEFAULT '{}',
  "household_languages_lower" TEXT[] NOT NULL DEFAULT '{}',

  -- Freshness tracking
  "doc_created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "doc_updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "listing_search_docs_pkey" PRIMARY KEY ("id"),

  -- Basic constraints
  CONSTRAINT "search_doc_price_positive" CHECK ("price" >= 0),
  CONSTRAINT "search_doc_slots_valid" CHECK ("available_slots" >= 0 AND "total_slots" > 0),
  CONSTRAINT "search_doc_rating_valid" CHECK ("avg_rating" >= 0 AND "avg_rating" <= 5)
);

-- ============================================================
-- STEP 2: Create indexes for search queries
-- ============================================================

-- Primary spatial index (GIST) for bounding box queries
CREATE INDEX "search_doc_location_geog_idx"
  ON "listing_search_docs" USING GIST ("location_geog");

-- Status filter (only return ACTIVE listings)
CREATE INDEX "search_doc_status_idx"
  ON "listing_search_docs" ("status")
  WHERE "status" = 'ACTIVE';

-- Price range queries
CREATE INDEX "search_doc_price_idx"
  ON "listing_search_docs" ("price");

-- Sort by newest
CREATE INDEX "search_doc_created_at_idx"
  ON "listing_search_docs" ("listing_created_at" DESC);

-- Sort by recommended score (precomputed)
CREATE INDEX "search_doc_recommended_score_idx"
  ON "listing_search_docs" ("recommended_score" DESC);

-- Sort by rating
CREATE INDEX "search_doc_rating_idx"
  ON "listing_search_docs" ("avg_rating" DESC, "review_count" DESC);

-- GIN indexes for array containment queries (@> operator)
-- Case-insensitive: queries use LOWER() on input, docs store lowercase
CREATE INDEX "search_doc_amenities_gin_idx"
  ON "listing_search_docs" USING GIN ("amenities_lower");

CREATE INDEX "search_doc_house_rules_gin_idx"
  ON "listing_search_docs" USING GIN ("house_rules_lower");

CREATE INDEX "search_doc_languages_gin_idx"
  ON "listing_search_docs" USING GIN ("household_languages_lower");

-- Lease duration filter
CREATE INDEX "search_doc_lease_duration_idx"
  ON "listing_search_docs" ("lease_duration")
  WHERE "lease_duration" IS NOT NULL;

-- Room type filter
CREATE INDEX "search_doc_room_type_idx"
  ON "listing_search_docs" ("room_type")
  WHERE "room_type" IS NOT NULL;

-- Move-in date filter (before date)
CREATE INDEX "search_doc_move_in_date_idx"
  ON "listing_search_docs" ("move_in_date")
  WHERE "move_in_date" IS NOT NULL;

-- Available slots > 0 filter (common query pattern)
CREATE INDEX "search_doc_available_idx"
  ON "listing_search_docs" ("available_slots")
  WHERE "available_slots" > 0 AND "status" = 'ACTIVE';

-- ============================================================
-- STEP 3: Create dirty flag table for incremental updates
-- Dirty flag sweeper pattern: mark changed listings, cron processes
-- ============================================================
CREATE TABLE "listing_search_doc_dirty" (
  "listing_id" TEXT NOT NULL,
  "marked_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "reason" TEXT, -- Optional: 'listing_update', 'review_added', 'location_change'

  CONSTRAINT "listing_search_doc_dirty_pkey" PRIMARY KEY ("listing_id")
);

-- Index for cron batch processing (oldest first)
CREATE INDEX "dirty_marked_at_idx"
  ON "listing_search_doc_dirty" ("marked_at");

-- ============================================================
-- STEP 4: Foreign key to Listing (CASCADE on delete)
-- When a Listing is deleted, its SearchDoc is also deleted
-- ============================================================
ALTER TABLE "listing_search_docs"
  ADD CONSTRAINT "listing_search_docs_listing_fkey"
  FOREIGN KEY ("id") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dirty table FK: CASCADE delete when listing removed
ALTER TABLE "listing_search_doc_dirty"
  ADD CONSTRAINT "dirty_listing_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
