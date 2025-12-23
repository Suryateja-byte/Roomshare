-- Add subscriptionTier to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionTier" TEXT NOT NULL DEFAULT 'free';

-- Create NeighborhoodCache table
CREATE TABLE IF NOT EXISTS "NeighborhoodCache" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "radiusMeters" INTEGER NOT NULL,
    "searchMode" TEXT NOT NULL,
    "poisJson" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "closestMiles" DOUBLE PRECISION NOT NULL,
    "farthestMiles" DOUBLE PRECISION NOT NULL,
    "radiusUsed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeighborhoodCache_pkey" PRIMARY KEY ("id")
);

-- Create indexes for NeighborhoodCache
CREATE UNIQUE INDEX IF NOT EXISTS "NeighborhoodCache_listingId_normalizedQuery_radiusMeters_searchMode_key"
    ON "NeighborhoodCache"("listingId", "normalizedQuery", "radiusMeters", "searchMode");
CREATE INDEX IF NOT EXISTS "NeighborhoodCache_expiresAt_idx" ON "NeighborhoodCache"("expiresAt");
CREATE INDEX IF NOT EXISTS "NeighborhoodCache_listingId_idx" ON "NeighborhoodCache"("listingId");
