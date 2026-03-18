# Plan: PERF-DB-H1/H2/H3 — Database & Backend Performance (HIGH)

**Task type**: FIX / OPTIMIZE
**Confidence**: 🟢 4.6/5.0 (all evidence verified against code)
**Date**: 2026-03-17

---

## Executive Summary

Three database performance fixes targeting the cron search-doc pipeline and query indexes:

1. **H1**: Batch sequential `upsertSearchDoc` calls in the cron route (100 sequential awaits → concurrent with limit)
2. **H2**: Add composite indexes `[status, createdAt]` and `[status, price]` to the `Listing` model for V1 fallback queries
3. **H3**: Add `@@index([listingId])` to `SavedListing` — **conditional** (only one query benefits; partially speculative)

H2 and H3 share a single Prisma migration.

---

## Evidence Summary

### H1 — Sequential upserts in cron

**File**: `src/app/api/cron/refresh-search-docs/route.ts:269-279`
```ts
for (const listing of listings) {
  try {
    await upsertSearchDoc(listing);   // ← blocks before next
    upsertedCount++;
  } catch (error) {
    errors.push(`Listing ${listing.id}: ${sanitizeErrorMessage(error)}`);
  }
}
```

**What `upsertSearchDoc` does** (lines 122-198): A single `$executeRaw` INSERT...ON CONFLICT statement. Pure SQL, no transactions, no multi-step logic. The function also calls `computeRecommendedScore()` (pure function, ~0ms) and builds lowercase arrays in JS before the SQL call.

**Batch size**: `BATCH_SIZE` defaults to 100 (env `SEARCH_DOC_BATCH_SIZE`).

**Impact**: For 100 dirty listings, that's 100 sequential round-trips to DB. Each upsert is independent — no ordering dependency, no transaction wrapping. Per-listing error handling already exists (errors are collected, not thrown).

**Why NOT raw SQL multi-row INSERT**: The upsert uses 30+ columns including PostGIS `ST_SetSRID(ST_MakePoint(...))`. Building a multi-row VALUES clause with Prisma `$executeRaw` tagged template literals is not feasible — you can't dynamically build a variable-length VALUES list with tagged templates. `$executeRawUnsafe` would work but introduces SQL injection risk for array columns. The concurrency approach is safer and simpler.

### H2 — Composite indexes on Listing

**Schema** (`prisma/schema.prisma:135-137`):
```prisma
@@index([ownerId])
@@index([status])
@@index([createdAt])
```

**Missing**: `[status, createdAt]` and `[status, price]`.

**Queries that benefit** (all in `src/lib/data.ts`):
- `getMapListings` (line 766): `WHERE l.status = 'ACTIVE' ... ORDER BY l."createdAt" DESC` — uses Listing table directly
- `getListingsPaginated` (line 506+): same pattern with Listing table
- `getListingsByCity` (line 1042): same pattern
- `getHostListings` (line 1076): same pattern
- `getSavedListingMapPins` (line 1527): joins Listing with `l.status = 'ACTIVE'`

**Important context**: Most search queries now go through `listing_search_docs` (which already has `search_doc_active_available_price_idx` composite partial index). The Listing table queries are the **V1 fallback path** and **non-search pages** (host dashboard, saved listings, map listings). These still matter — the V1 fallback is active when `ENABLE_SEARCH_DOC=false`, and map/host pages always hit the Listing table.

**No queries do `status + price` on the Listing table directly** — the `status + price` composite is most useful on search_docs, where it already exists. However, adding `[status, price]` to Listing is still defensible for future-proofing the V1 fallback sort-by-price path. **Recommend `[status, createdAt]` as HIGH priority, `[status, price]` as MEDIUM.**

### H3 — SavedListing.listingId index

**Schema** (`prisma/schema.prisma:148`):
```prisma
@@unique([userId, listingId])
```
No standalone `listingId` index.

**Queries that use SavedListing**:
- `toggleSaveListing` (saved-listings.ts:32): `where: { userId, listingId }` — uses the compound unique, no benefit from standalone index
- `isListingSaved` (saved-listings.ts:73): `where: { userId_listingId: { userId, listingId } }` — uses compound unique
- `getSavedListings` (saved-listings.ts:96): `where: { userId }` — leading column of compound unique is userId, so this is covered
- `removeSavedListing` (saved-listings.ts:150): uses compound unique
- `GET /api/favorites` (favorites/route.ts:45): `where: { userId, listingId: { in: ids } }` — compound unique covers this
- `getSavedListingMapPins` (data.ts:1527): raw SQL `WHERE sl."userId" = ${userId}` — uses userId, covered by compound unique leading column

**Finding**: **No current query filters by `listingId` alone** without `userId`. The compound unique `[userId, listingId]` has userId as leading column, which covers all current query patterns.

**However**: When a listing is CASCADE-deleted, Postgres must scan `SavedListing` to find rows referencing that listing. Without an index on `listingId`, this requires a sequential scan. For tables with many saved listings, this can cause slow deletes and lock contention. This is the **real justification** — FK cascade performance, not query performance.

**Also**: The Prisma `@relation(fields: [listingId], references: [id], onDelete: Cascade)` creates an implicit FK constraint. PostgreSQL does NOT auto-create indexes for FKs. On CASCADE DELETE of a popular listing, PG scans the entire SavedListing table.

**Verdict**: Add the index. It's cheap (small table), prevents a real FK scan issue, and enables future "who saved this listing" queries.

---

## Implementation Plan

### Step 1: PERF-DB-H1 — Batch cron upserts with concurrency limit

**File**: `src/app/api/cron/refresh-search-docs/route.ts`

**Approach**: Replace sequential `for...of` loop with `Promise.allSettled` + concurrency limiter. Use a simple chunk-based approach (no external deps).

**1.1** Add a concurrency-limited batch helper at the top of the file:

```ts
/**
 * Process items with a concurrency limit using Promise.allSettled.
 * Returns { fulfilled: T[], rejected: { item: I, error: Error }[] }
 */
async function processWithConcurrency<I, T>(
  items: I[],
  fn: (item: I) => Promise<T>,
  concurrency: number,
): Promise<{ fulfilled: T[]; rejected: { item: I; error: unknown }[] }> {
  const fulfilled: T[] = [];
  const rejected: { item: I; error: unknown }[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map(fn));
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        fulfilled.push(result.value);
      } else {
        rejected.push({ item: chunk[j], error: result.reason });
      }
    }
  }

  return { fulfilled, rejected };
}
```

**1.2** Replace the sequential loop (lines 266-279) with:

```ts
// 3. Upsert search docs with concurrency limit
const UPSERT_CONCURRENCY = 10; // 10 concurrent upserts
const { fulfilled, rejected } = await processWithConcurrency(
  listings,
  async (listing) => {
    await upsertSearchDoc(listing);
    return listing.id;
  },
  UPSERT_CONCURRENCY,
);

const upsertedCount = fulfilled.length;
const errors: string[] = rejected.map(
  ({ item, error }) => `Listing ${item.id}: ${sanitizeErrorMessage(error)}`,
);
```

**1.3** Update the `processedIds` computation (lines 282-284) to use `fulfilled` directly:

```ts
// 4. Clear dirty flags for successfully processed listings
const processedIds = fulfilled; // Already contains only successful listing IDs
await clearDirtyFlags(processedIds);
```

**Concurrency value**: 10 is safe — each upsert is a single INSERT...ON CONFLICT, and the cron runs every 5 minutes. PG connection pool (typically 10-20 connections for Vercel) won't be exhausted since the cron is the only caller in this window.

**Risk**: Low. Each upsert is independent, error handling is preserved per-listing, and `Promise.allSettled` never throws.

**Testing**:
- Unit test: mock `upsertSearchDoc` to verify concurrent execution (timing check or call-order check)
- Unit test: verify error isolation — one failed upsert doesn't prevent others
- Unit test: verify `processedIds` only contains successful IDs

### Step 2: PERF-DB-H2 + H3 — Add indexes (single migration)

**2.1** Update `prisma/schema.prisma`:

In the `Listing` model (after line 137):
```prisma
@@index([status, createdAt])
@@index([status, price])
```

In the `SavedListing` model (after line 148):
```prisma
@@index([listingId])
```

**2.2** Create migration:

```bash
pnpm prisma migrate dev --name add_listing_composite_and_savedlisting_indexes
```

**2.3** Verify the generated migration SQL contains:

```sql
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");
CREATE INDEX "Listing_status_price_idx" ON "Listing"("status", "price");
CREATE INDEX "SavedListing_listingId_idx" ON "SavedListing"("listingId");
```

**2.4** Add header comments to the migration file:

```sql
-- Composite indexes for Listing table:
--   [status, createdAt]: Covers WHERE status='ACTIVE' ORDER BY createdAt DESC
--     queries in data.ts (getMapListings, getListingsPaginated fallback)
--   [status, price]: Covers WHERE status='ACTIVE' ORDER BY price
--     queries in V1 fallback search path
--
-- SavedListing.listingId index:
--   Covers FK cascade deletes (Listing CASCADE → SavedListing scan)
--   No current queries filter by listingId alone, but FK scan is real
--
-- Rollback: Reversible — DROP INDEX on each index name
-- Data safety:
--   Standard CREATE INDEX acquires SHARE lock (blocks writes for ~seconds on small tables)
--   Listing table: ~hundreds to low-thousands of rows — lock duration negligible
--   SavedListing table: similarly small
--   For production with large tables, manually replace with:
--     CREATE INDEX CONCURRENTLY "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");
--   (Prisma migrations don't support CONCURRENTLY; use raw SQL migration if needed)
```

---

## Migration Safety

| Property | Value |
|----------|-------|
| **Reversible?** | Yes — `DROP INDEX` for each index |
| **Locking risk** | SHARE lock during CREATE INDEX. For small tables (< 10K rows), lock duration is milliseconds. For large tables in production, consider replacing with `CREATE INDEX CONCURRENTLY` in the raw SQL. |
| **Backfill needed?** | No — indexes are built from existing data |
| **Downtime risk** | None for small tables. Negligible write pause (< 1s) during index creation. |
| **Data loss risk** | None — additive only |
| **Rollback command** | `DROP INDEX IF EXISTS "Listing_status_createdAt_idx"; DROP INDEX IF EXISTS "Listing_status_price_idx"; DROP INDEX IF EXISTS "SavedListing_listingId_idx";` |

---

## Dependency Graph

```
H2 + H3 (schema indexes) ─── independent ─── H1 (cron batching)
         │                                           │
         ├─ prisma migrate dev                       ├─ edit route.ts
         └─ verify with EXPLAIN ANALYZE              └─ add/update unit tests
```

H1 and H2/H3 are fully independent — can be implemented in parallel or any order.

---

## Test Strategy

### H1 — Cron batching
- **Unit test**: Mock `upsertSearchDoc`, verify all listings are processed
- **Unit test**: Inject one failure, verify other listings still succeed and `processedIds` excludes the failed one
- **Unit test**: Verify concurrency — pass 20 items with concurrency 5, confirm 4 chunks of 5
- **Integration test** (optional): Run the cron endpoint against test DB with 10 dirty listings, verify all docs upserted and dirty flags cleared

### H2/H3 — Indexes
- **Migration test**: `pnpm prisma migrate dev` succeeds without errors
- **Query verification**: Run `EXPLAIN ANALYZE` on representative queries to confirm index usage:
  ```sql
  EXPLAIN ANALYZE SELECT * FROM "Listing" WHERE status = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 20;
  EXPLAIN ANALYZE SELECT * FROM "Listing" WHERE status = 'ACTIVE' ORDER BY price ASC LIMIT 20;
  ```
- **Regression**: Existing test suites pass (`pnpm test`, `pnpm typecheck`, `pnpm lint`)

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| H1: Concurrency causes DB connection pool exhaustion | Low | Concurrency capped at 10; cron runs in isolation; Vercel pools typically 10-20 connections. Monitor connection usage after deploy. |
| H1: Concurrent upserts cause deadlocks | Very Low | Each upsert targets a different row (different listing ID). No cross-row dependencies. ON CONFLICT (id) locks only one row. |
| H2: Index creation blocks writes on large Listing table | Low | Table is small in current deployment. For large tables, replace with CREATE INDEX CONCURRENTLY in raw SQL migration. |
| H3: SavedListing index adds write overhead | Negligible | Index on single column, small table, infrequent writes (save/unsave actions). |
| H2: `[status, price]` index is partially speculative | Low | V1 fallback path sorts by price. Even if unused now, index is small and cheap. Document as "defensive" in migration comments. |

---

## Open Questions

1. **Connection pool size**: What is the current `connection_limit` in DATABASE_URL? If < 10, reduce `UPSERT_CONCURRENCY` to match. Default Prisma pool is 10 in serverless.
2. **Production table size**: If Listing table has > 100K rows, the standard CREATE INDEX will hold a SHARE lock for seconds. Consider CREATE INDEX CONCURRENTLY for production deployment.

---

## Rollback Plan

### H1 (cron batching)
Revert the single file `src/app/api/cron/refresh-search-docs/route.ts` to its previous version. No data changes, no migration.

### H2/H3 (indexes)
```bash
# Option A: Prisma rollback
pnpm prisma migrate resolve --rolled-back add_listing_composite_and_savedlisting_indexes

# Option B: Manual SQL
psql $DATABASE_URL -c 'DROP INDEX IF EXISTS "Listing_status_createdAt_idx"; DROP INDEX IF EXISTS "Listing_status_price_idx"; DROP INDEX IF EXISTS "SavedListing_listingId_idx";'
```

---

## Verification Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (including new/updated cron tests)
- [ ] `pnpm prisma migrate dev` succeeds
- [ ] EXPLAIN ANALYZE confirms index usage for composite queries
- [ ] Cron endpoint processes 10+ dirty listings in < 5s (was: ~10s sequential)
- [ ] No PII in logs
- [ ] Migration has rollback note and data-safety note
