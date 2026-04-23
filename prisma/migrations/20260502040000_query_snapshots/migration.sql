CREATE TABLE "query_snapshots" (
    "id" TEXT NOT NULL,
    "query_hash" TEXT NOT NULL,
    "backend_source" TEXT NOT NULL,
    "response_version" TEXT NOT NULL,
    "projection_version" INTEGER,
    "embedding_version" TEXT,
    "ranker_profile_version" TEXT,
    "ordered_listing_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "map_payload" JSONB,
    "total" INTEGER,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "query_snapshots_expires_at_idx"
    ON "query_snapshots"("expires_at");

CREATE INDEX "query_snapshots_query_hash_created_at_idx"
    ON "query_snapshots"("query_hash", "created_at");
