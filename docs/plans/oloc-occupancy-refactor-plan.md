# One-Listing-One-Card (OLOC) + Occupancy Model — Implementation Plan

**Status**: v1.3 — Execution-ready (3 review rounds layered: internal critic + Codex pass 1 + Codex pass 2)
**Branch target**: `codex/contact-first-multislot` (or new branch `oloc/one-listing-one-card`)
**Updated**: 2026-04-19
**Planning mode**: Multi-agent deliberation (Architect · Domain-Dev · UX · QA+Security · Critic-pending)
**Execution**: Per `feedback_cfm_workflow.md` — Opus plans/critiques, Codex generates, sandbox blocks commits → coordinator commits.

---

## 1. Executive Summary

Fix the "2 markers on map, 4 cards in list per physical home" bug and introduce a per-room `maxOccupancy` filter so whole-room listings match group-size queries correctly. Ship in 3 phases behind 2 new feature flags. Most of the needed infrastructure (dedup pipeline, `groupKey`/`groupSummary`, ListingCard's "+N more dates" UI) **already exists** — the plan is 70% "wire up the gap" and 30% new schema + UX polish.

### TL;DR architecture

- **Bug root cause**: `/api/map-listings/route.ts:207-221` and both map data functions (`getMapListings` at `data.ts:432`, `getSearchDocMapListings` at `search-doc-queries.ts:1265`) attach `groupKey`/`groupSummary` metadata to every row but **never collapse siblings**. List-path dedup already works (flag-gated); map-path dedup is missing entirely. V1 search fallback also misses dedup.
- **Schema delta**: new `RoomType` enum (`WHOLE_ROOM | PRIVATE_ROOM | SHARED_ROOM`) replacing free-form `Listing.roomType String?`; new nullable `maxOccupancy Int?` column; 4 CHECK constraints.
- **State machine delta**: NONE for public flows. CFM contact-first direction (per `docs/plans/cfm-migration-plan.md:26-28`) means partial-occupancy booking conflicts are off-platform messaging concerns, not code concerns.
- **Booking/Alice-vs-Bob policy**: Resolved by host via messaging. No platform-enforced conflict policy.
- **Pricing**: Host-set flat total; secondary "≈ $X/person if split N ways" microcopy on card + detail. Splitting is explicitly tenant-group responsibility.

### Rollout ordering
1. **Phase 1 — Map dedup fix (days 1-3)**: Flag `FEATURE_SEARCH_MAP_DEDUP`. No schema changes. Independent & reversible.
2. **Phase 2 — Schema + host form (days 4-7)**: `RoomType` enum + `maxOccupancy` column + host listing-create/edit form. Flag `FEATURE_ROOM_OCCUPANCY_MODEL`.
3. **Phase 3 — Search filter + UX polish (days 8-12)**: room-type chip row, slot-filter semantics, mixed-availability card state, detail page slot-picker, sibling→canonical redirect.

### Confidence: 🟢 **HIGH (4.6/5)** v1.3 — 3 review rounds layered (internal critic + Codex pass 1 + Codex pass 2); 2 🔴 + 8 🟠 findings all mitigated (§13, §14, §15)

| Dimension | Weight | Score | Notes |
|---|---|---|---|
| Research grounding | 15% | 4 | Codebase-deep; minimal external research needed (domain is mature) |
| Codebase accuracy | 25% | 4 | Critic B-1 caught stale EC-012 claim re `seenGroupKeysRef`; patched + re-verified |
| Assumption freedom | 20% | 4 | Corrected mid-plan: CFM contact-first changed scope; cleanup-seed path corrected; F5 gating corrected post-critic |
| Completeness | 15% | 5 | 10 deliverables covered; pre-mortem updated; rollout runbook added |
| Harsh critic verdict | 15% | 4 | FAIL→CONDITIONAL PASS after B-1/B-2 + M-1..M-5 mitigations (see §13) |
| Specificity | 10% | 5 | Every step file:line anchored; flag gating explicit; adapter function named |

---

## 2. Product Question Resolutions (Q1–Q6)

| Q | Decision | Rationale |
|---|---|---|
| **Q1** Whole-room in same list vs. separate tab | **Same list + prominent room-type chip row above grid** (single-select: Any · Private · Shared · Whole place). Chip state in URL as `?roomType=WHOLE_ROOM`. | Mobile vertical-space; single-result truth prevents hosts misclassifying to double-appear; CFM contact-first model handles nuance via conversation. Ranking sort uses a per-person-equivalent price for whole-place rows to prevent sort distortion (display unchanged). |
| **Q2** Partial-occupancy booking conflict | **No on-platform policy. Off-platform host decision.** | CFM direction (`cfm-migration-plan.md:26-28`) deprecates public booking/hold creation. "Alice has 1 slot, Bob+gf wants 2" is resolved via messaging. No `PARTIAL_HOLD` state, no group-preference algorithm. Existing `ListingDayInventory` retained for history. |
| **Q3** Whole-room pricing model | **Host sets flat total. Platform displays `$X /mo total` + `≈ $Y/person if split N ways` microcopy when `maxOccupancy ≥ 2`.** | Honest to host intent; avoids platform-implied split promises; contact-first offloads negotiation to tenant group. Explicit copy: "Host sets the total; split is between you and your housemates." |
| **Q4** `maxOccupancy` upper bound | **Form soft-warn at 5, hard-block at 11. DB `CHECK BETWEEN 1 AND 20` (admin-override headroom).** Moderation queue flag at ≥6 for unverified hosts. | Fire-code rationale: US bedroom occupancy convention ≤ 2/bedroom; whole-place > 6 is rare/suspicious. Hard DB cap 20 catches extreme seed errors. Soft cap gives moderators a gentle signal without false-positive-blocking group houses. |
| **Q5** Mixed-availability card display | **Dual signal: SlotBadge carries availability nuance ("1 open now · 2 other dates"); price stays clean ($X /mo total).** Never "From $X" (implies bookability we don't support in CFM). | Preserves price-as-host-commitment; SlotBadge already has `partial`/`full` variants — add new `"neutral-with-alternatives"` variant mapping to info-blue. |
| **Q6** Room-type enum vs. extend `bookingMode` | **New Postgres enum `RoomType`**. `bookingMode` unchanged (`SHARED`/`WHOLE_UNIT`). | `roomType` feeds `buildGroupKey` (`dedup.ts:164-180`); string drift silently breaks grouping. `bookingMode` is transaction semantics (atomic vs per-slot); `roomType` is physical-room attribute. Do not conflate. Dummy-data status makes enum rename free. |

### User-discoverability question (from user prompt)

> "Should a single-slot searcher see WHOLE_ROOM listings since they have capacity?"

**Decision**: YES, but ranking-penalized. A WHOLE_ROOM with `maxOccupancy=3` appearing in `slot=1` results is valid inventory, but a ranking penalty `(maxOccupancy - slot) / maxOccupancy` down-ranks it so diverse inventory surfaces. Separate tab is rejected (see Q1). Users who explicitly want a private room pick the `Private` chip.

---

## 3. Architecture — Schema & Migration

### 3.1 Prisma diff (`prisma/schema.prisma:103-159`)

```prisma
// NEW enum
enum RoomType {
  WHOLE_ROOM
  PRIVATE_ROOM
  SHARED_ROOM
}

model Listing {
  // ... existing fields unchanged
- roomType                String?
+ roomType                RoomType?                // NULL only during backfill window
+ maxOccupancy            Int?                     // nullable during Phase 2 backfill; set NOT NULL via second migration at end of Phase 3 (§9.2 D12)
  // bookingMode, totalSlots, availableSlots, openSlots, moveInDate, availableUntil — UNCHANGED
+ @@index([roomType, status])                     // powers roomType facet queries + filters
+ @@index([maxOccupancy])                         // supports maxOccupancy >= requestedSlots scans
}
```

**No changes** to `Booking`, `ListingDayInventory`, `BookingAuditLog`, `Conversation`, `Message`, enum values `BookingStatus`, `ListingStatus`, `NotificationType`. CFM Invariant #CFM-1003 (no DROP on booking/audit tables) preserved.

### 3.2 Semantics by room type

| `roomType` | `bookingMode` | `maxOccupancy` | `totalSlots` |
|---|---|---|---|
| `WHOLE_ROOM` | `SHARED` | N = "up to N people can live here" | N (must match) |
| `WHOLE_ROOM` | `WHOLE_UNIT` | N = advertised sleep capacity (display only) | 1 (atomic whole-unit invariant) |
| `PRIVATE_ROOM` | `SHARED` | 1 (enforced) | 1 (enforced) |
| `SHARED_ROOM` | `SHARED` | N = beds in shared room | N (must match) |

### 3.3 Migration SQL

File: `prisma/migrations/<ts>_oloc_room_type_occupancy/migration.sql`

```sql
BEGIN;

-- STEP 1 (ADDITIVE, REVERSIBLE)
CREATE TYPE "RoomType" AS ENUM ('WHOLE_ROOM', 'PRIVATE_ROOM', 'SHARED_ROOM');

ALTER TABLE "Listing"
  ADD COLUMN "roomType_new" "RoomType",
  ADD COLUMN "maxOccupancy" INTEGER;

-- STEP 2 (BACKFILL — dummy data only; see .claude/memory/project_data_status.md)
UPDATE "Listing" SET "roomType_new" = 'WHOLE_ROOM'   WHERE "roomType" = 'Entire Place';
UPDATE "Listing" SET "roomType_new" = 'PRIVATE_ROOM' WHERE "roomType" = 'Private Room';
UPDATE "Listing" SET "roomType_new" = 'SHARED_ROOM'  WHERE "roomType" = 'Shared Room';
UPDATE "Listing" SET "needsMigrationReview" = TRUE
  WHERE "roomType" IS NOT NULL AND "roomType_new" IS NULL;

UPDATE "Listing" SET "maxOccupancy" = GREATEST("totalSlots", 1);
UPDATE "Listing"
  SET "maxOccupancy" = 1, "totalSlots" = 1, "availableSlots" = LEAST("availableSlots", 1)
  WHERE "roomType_new" = 'PRIVATE_ROOM';

-- STEP 3 (DESTRUCTIVE — dummy data only)
ALTER TABLE "Listing" DROP COLUMN "roomType";
ALTER TABLE "Listing" RENAME COLUMN "roomType_new" TO "roomType";

-- STEP 4 (CONSTRAINTS)
ALTER TABLE "Listing" ADD CONSTRAINT "listing_max_occupancy_positive"
  CHECK ("maxOccupancy" IS NULL OR "maxOccupancy" BETWEEN 1 AND 20);
ALTER TABLE "Listing" ADD CONSTRAINT "listing_private_room_solo"
  CHECK ("roomType" <> 'PRIVATE_ROOM' OR ("maxOccupancy" = 1 AND "totalSlots" = 1));
ALTER TABLE "Listing" ADD CONSTRAINT "listing_whole_unit_atomic"
  CHECK ("booking_mode" <> 'WHOLE_UNIT' OR "totalSlots" = 1);
ALTER TABLE "Listing" ADD CONSTRAINT "listing_capacity_bounds"
  CHECK ("maxOccupancy" IS NULL OR "maxOccupancy" >= "totalSlots");

-- Codex v2-M3 fix: enforce the semantics table §3.2 exactly.
-- SHARED_ROOM: totalSlots MUST equal maxOccupancy (beds in shared room).
ALTER TABLE "Listing" ADD CONSTRAINT "listing_shared_room_capacity_match"
  CHECK ("roomType" <> 'SHARED_ROOM' OR "maxOccupancy" IS NULL OR "maxOccupancy" = "totalSlots");
-- WHOLE_ROOM with SHARED booking mode: totalSlots MUST equal maxOccupancy (N people share whole room).
-- WHOLE_ROOM with WHOLE_UNIT booking mode: totalSlots = 1 (enforced by listing_whole_unit_atomic),
-- maxOccupancy is advertised sleep capacity and CAN exceed 1 — allow the >= relationship from listing_capacity_bounds.
ALTER TABLE "Listing" ADD CONSTRAINT "listing_whole_room_shared_capacity_match"
  CHECK ("roomType" <> 'WHOLE_ROOM' OR "booking_mode" <> 'SHARED' OR
         "maxOccupancy" IS NULL OR "maxOccupancy" = "totalSlots");

-- STEP 5 (INDEXES)
CREATE INDEX "Listing_roomType_status_idx" ON "Listing" ("roomType", "status");
CREATE INDEX "Listing_maxOccupancy_idx"    ON "Listing" ("maxOccupancy");

COMMIT;
```

**Rollback**: Dummy-data — canonical rollback = restore-from-snapshot + `prisma migrate reset` + re-seed. Reverse-migration SQL documented in `prisma/migrations/<ts>_oloc_room_type_occupancy/README.md` but not auto-executed.

**Data safety**: Table locks are metadata-only ALTER; backfill <1s on dummy data. No concurrent-migration considerations given pre-launch state.

### 3.4a Backward compatibility — roomType string → enum migration (Codex v2-M1 fix)

The plan's v1.2 draft switched search URL params + API semantics to enum values (`WHOLE_ROOM`/`PRIVATE_ROOM`/`SHARED_ROOM`) but missed that 5 touch-points still canonicalize on legacy `"Private Room"`/`"Shared Room"`/`"Entire Place"` strings:

| File | Line | Current behavior | Breaks if untouched |
|---|---|---|---|
| `src/lib/filter-schema.ts` | 65, 80-97 | Alias map produces `"Private Room"` display strings from short keys | Filter chip + URL round-trip returns pre-enum label |
| `src/components/search/CategoryTabs.tsx` | 5 | Hardcoded legacy strings for tab labels | UI mismatch w/ new enum |
| `src/components/filters/filter-chip-utils.ts` | 145 | Chip-render switches on legacy strings | Chips fail to render |
| `src/lib/search/saved-search-parser.ts` | 26, 102 | `roomType: z.string().optional()` — accepts anything, passed through | Old SavedSearch.filters rows still carry `"Private Room"`; no parser layer converts |
| `src/lib/search-alerts.ts` | 57, 216, 399 | Direct DB filter `whereClause.roomType = filters.roomType` | Alert queries against enum DB column with legacy string → zero-match silent breakage |

**Fix — three-part compat layer**:

1. **Bidirectional alias map** (new file `src/lib/search/room-type-aliases.ts`):
   ```
   export const ROOM_TYPE_ENUM_VALUES = ['WHOLE_ROOM', 'PRIVATE_ROOM', 'SHARED_ROOM'] as const;
   export type RoomTypeEnum = typeof ROOM_TYPE_ENUM_VALUES[number];
   
   export const LEGACY_TO_ENUM: Record<string, RoomTypeEnum> = {
     'Private Room': 'PRIVATE_ROOM', 'private': 'PRIVATE_ROOM', 'private_room': 'PRIVATE_ROOM',
     'Shared Room':  'SHARED_ROOM',  'shared':  'SHARED_ROOM',  'shared_room':  'SHARED_ROOM',
     'Entire Place': 'WHOLE_ROOM',   'entire':  'WHOLE_ROOM',   'entire_place': 'WHOLE_ROOM',
     'whole': 'WHOLE_ROOM', 'studio': 'WHOLE_ROOM',
   };
   
   export function toRoomTypeEnum(input: string | null | undefined): RoomTypeEnum | null {
     if (!input) return null;
     if ((ROOM_TYPE_ENUM_VALUES as readonly string[]).includes(input)) return input as RoomTypeEnum;
     return LEGACY_TO_ENUM[input.trim()] ?? null;
   }
   ```

2. **Update each touch-point** to call `toRoomTypeEnum()` before DB query:
   - `filter-schema.ts`: output enum values from the alias map (not "Private Room").
   - `saved-search-parser.ts:26`: replace `z.string()` with `z.string().transform(toRoomTypeEnum).pipe(z.enum(ROOM_TYPE_ENUM_VALUES).nullable())`.
   - `search-alerts.ts:216, 399`: wrap `filters.roomType` in `toRoomTypeEnum()` before filter build.
   - `CategoryTabs.tsx:5`, `filter-chip-utils.ts:145`: update labels to derive from enum via a shared `ROOM_TYPE_DISPLAY_LABELS` map.

3. **Data backfill migration** (Phase 2 D5, new step): `SavedSearch.filters` is a JSON column. Add a follow-up to the main migration:
   ```sql
   -- Backfill existing SavedSearch rows to use enum values
   UPDATE "SavedSearch"
     SET filters = jsonb_set(filters, '{roomType}',
       to_jsonb(CASE filters->>'roomType'
         WHEN 'Private Room' THEN 'PRIVATE_ROOM'
         WHEN 'Shared Room'  THEN 'SHARED_ROOM'
         WHEN 'Entire Place' THEN 'WHOLE_ROOM'
         ELSE filters->>'roomType'
       END))
     WHERE filters ? 'roomType' AND filters->>'roomType' IN ('Private Room','Shared Room','Entire Place');
   ```
   Verify post-migration: `SELECT COUNT(*) FROM "SavedSearch" WHERE filters->>'roomType' IN ('Private Room','Shared Room','Entire Place');` must return 0.

4. **Tests** (EC-046, EC-047 added to §6 matrix):
   - EC-046 (P0, unit): `room-type-aliases.test.ts` — `toRoomTypeEnum` maps every documented legacy string + all alias variants + returns null on garbage.
   - EC-047 (P0, integration): load a SavedSearch row with legacy `filters.roomType = 'Private Room'` pre-migration → run backfill → assert parser yields `PRIVATE_ROOM` post-migration + alert query runs without error.

**Phase ordering implication**: the alias layer (§3.4a step 1-2) must ship in Phase 2 D5 BEFORE flipping `FEATURE_ROOM_OCCUPANCY_MODEL` in Phase 3. Otherwise the new chip row (Phase 3 D8) emits enum values that `filter-schema.ts` still canonicalizes to legacy strings → SavedSearch saves mangled values.

### 3.4 Cross-owner duplicate policy

Two hosts claiming same `normalizedAddress` is **legitimate** (two landlords in one building, primary host + sublet, host-transfer in progress). Plan does **NOT** add cross-owner uniqueness to `buildGroupKey` or to the Postgres partial index.

**Post-dummy-data handling**: Moderation queue via future `checkCrossOwnerCollision` in `src/lib/listings/collision-detector.ts` (deferred — separate ticket). For the current refactor, cross-owner seed dupes are cleaned via `scripts/cfm/cleanup-seed-duplicates.ts --apply` (corrected path per Domain-Dev verification; NOT `src/scripts/`).

---

## 4. Dedup Fix — Data-Layer Blueprint

### 4.1 Audit summary

| Route / function | Dedup today | File:line | Fix |
|---|---|---|---|
| `/api/map-listings` | ❌ | `route.ts:207-221` | Depends on data-layer fix (F1) |
| `/api/search/v2` (map path) | ❌ | `search-v2-service.ts:567-572, 742` | Depends on F1 |
| `/api/search/v2` (list path) | ✅ | flag `searchListingDedup` | No change |
| `/api/search/listings` v2 | ✅ | flag `searchListingDedup` | No change |
| `/api/search/listings` v1 fallback | ❌ | `route.ts:254` | **OUT OF SCOPE** per Codex P1-A reconciliation: V1 is a degraded circuit-breaker path; do NOT add dedup here. Accept visible duplicates during outage; monitor via `search.v1_fallback_active` telemetry. |
| `/api/search/facets` | N/A | — | Deferred (`COUNT(DISTINCT groupKey)` is a future optimization) |

### 4.2 Data-layer fixes (single source, all callers benefit)

**F1 — `src/lib/search/search-doc-queries.ts` `getSearchDocMapListingsInternal` (~line 1265)**

```
BEFORE: fetchLimit = MAX_MAP_MARKERS + 1; return every row with attached groupKey metadata
AFTER:  fetchLimit = MAX_MAP_MARKERS + SEARCH_DEDUP_LOOK_AHEAD + 1 when flag on;
        applyServerDedup({enabled, limit: MAX_MAP_MARKERS, lookAhead: 16});
        return canonicals only (≤200 rows)
```

Implementation notes:
- Line 1299: bump `fetchLimit` conditionally on `features.searchMapDedup`.
- Line 1347: new helper `dedupeMapListings(rows)` parallels `dedupeListingRows` in same file (line 386); takes `MapListingData[]`, returns canonical `MapListingData[]` with preserved group metadata.
- Truncation detection (line 1342): `truncated = raw.length > MAX_MAP_MARKERS + SEARCH_DEDUP_LOOK_AHEAD` (lookAhead extras are expected, not overflow).

**F2 — `src/lib/data.ts` `getMapListings` (~line 432) — REVISED per critic M-4**

Critic M-4 correctly flagged that F1 operates on pre-mapping raw rows while `getMapListings` already has `sanitizedListings = sanitizeMapListings(mappedListings)` at line 737 — calling `applyServerDedup` on `MapListingData[]` requires an adapter because `applyServerDedup` signature (`dedup-pipeline.ts:49`) takes `SearchRowForDedup[]` which includes `location, price, roomType` fields.

**Revised F2**:
1. Create adapter `toSearchRowFromMapListing(m: MapListingData): SearchRowForDedup` in NEW `src/lib/search/map-listing-dedup-adapter.ts`. Unit test `map-listings-dedup-adapter.test.ts` asserts round-trip field preservation and covers nullable `location` / `price=0` / `availabilitySource` branches.
2. In `getMapListings` after line 738 `buildGroupMetadataById`:
   ```
   if (features.searchMapDedup) {
     const rows = sanitizedListings.map(toSearchRowFromMapListing);
     const { canonicals } = applyServerDedup(rows, {
       enabled: true,
       limit: MAX_MAP_MARKERS,
       lookAhead: SEARCH_DEDUP_LOOK_AHEAD,
       priceBucketCents: 2500,     // F5 gate — only when flag on
     });
     const canonicalIds = new Set(canonicals.map(c => c.id));
     sanitizedListings = sanitizedListings.filter(l => canonicalIds.has(l.id));
   }
   ```
3. Line 665 SQL `LIMIT` bump to `MAX_MAP_MARKERS + SEARCH_DEDUP_LOOK_AHEAD + 1` when flag on.

**F3 — `src/app/api/search/listings/route.ts` V1 fallback (~line 254)**

```
BEFORE: getListingsPaginated → return paginatedResult verbatim
AFTER:  when features.searchListingDedup ON:
          const deduped = applyServerDedup(
            paginatedResult.items.map(toSearchRowForDedup),
            { enabled: true, limit: DEFAULT_PAGE_SIZE, lookAhead: SEARCH_DEDUP_LOOK_AHEAD }
          );
          paginatedResult.items = filterToCanonicalAndAttach(paginatedResult.items, deduped.canonicals);
          paginatedResult.total = deduped.metrics.groupsOut;
```

**F4 — `SearchResultsClient.tsx` `seenGroupKeysRef` regression guard (REVISED after critic B-1)**

**⚠️ CORRECTION**: Earlier draft claimed `seenIdsRef` dedupes only by listingId and needs refactor. **False.** Verified at `src/components/search/SearchResultsClient.tsx:164-167, 325-326, 370-371, 524-538`: both `seenIdsRef` AND `seenGroupKeysRef` already exist and are applied. Filter chain at lines 524-538 checks `hasSeenId || (item.groupKey && seenGroupKeysRef.current.has(item.groupKey))`. Helper: `getSeenGroupKeys(initialListings)` at line 167.

**Actual F4 (new)**: No refactor needed. Add ONE regression test asserting the existing `seenGroupKeysRef` path continues to work after F6 canonical-promotion lands, since F6 can change which listing is canonical. Test: append a page-1 canonical with groupKey=X, then page-2 response contains a sibling of that same group with the SAME groupKey=X but different `listingId` — assert it's dropped.

**F5 — `buildGroupKey` price-bucketing — FLAG-GATED (REVISED after critic B-2)**

Critic B-2: unconditional change to `buildGroupKey` breaks the "Phase 1 reversible" claim because (a) it modifies groupKey for 100% of callers including list-path dedup (already live under `FEATURE_SEARCH_LISTING_DEDUP`), (b) `seenGroupKeysRef` caches hashes within client sessions — mid-rollout users see inconsistency, (c) `cleanup-seed-duplicates.ts --apply` dry-runs vs applies under different hashes if F5 lands between them.

**Revised F5**:
```
SIGNATURE: buildGroupKey({ ownerId, normalizedAddress, priceCents, normalizedTitle, roomType, priceBucketCents? })
BEHAVIOR: when priceBucketCents supplied → Math.round(priceCents / priceBucketCents) * priceBucketCents
          when undefined (default) → priceCents used as-is (today's behavior, unchanged)
CALLERS PASS priceBucketCents ONLY WHEN `features.searchMapDedup` is true AND the call site is map or list dedup.
```

And re-ordering **§9.2**: `cleanup-seed-duplicates.ts --dry-run/--apply` now runs **AFTER** F5 lands, so dry-run and apply use identical hash logic.

Trade-off statement preserved: once `FEATURE_SEARCH_MAP_DEDUP=true`, legit $1025 vs $1000 listings collapse — acceptable because siblings surface via "+N more dates" panel, AND the flag can be disabled for rollback without touching client-session caches (they flush on filter change per `searchParamsString` key remount).

**F6 — Slot-filter group-first semantics with stable groupKey (EC-042 + REVISED per critic M-3)**

When slot filter is active AND grouping is applied, the canonical listing might not match but a sibling might. Two options:
- **Option A (rejected)**: Apply slot filter in SQL `WHERE`, then group. If canonical is filtered out, the whole group is dropped — misses valid inventory.
- **Option B (plan)**: Fetch without slot filter, group, then filter groups by `MAX(member.openSlots) >= N` or `MAX(member.maxOccupancy) >= N`. Promote best-matching member as canonical when original canonical doesn't match.

**Decision**: Option B. Implement via predicate parameter on `groupListings(listings, { filterPredicate })`. Canonical-promotion logic: if `filterPredicate(canonical) === false` but any member passes, swap the winning member into the canonical slot **but PRESERVE the original groupKey** — emit `groupKey = originalGroupKey` regardless of which row physically holds the canonical position. Rationale (critic M-3): `seenGroupKeysRef` in `SearchResultsClient.tsx:167` caches groupKeys across pages; if canonical-swap changed the emitted groupKey, the client would see two distinct canonicals on page 1 and page 2 for the same group (the exact "Load more dup" bug this work is supposed to prevent).

**New test** (EC-043, P0): `slot-filter-semantics.test.ts` → "canonical swap preserves original groupKey". Assert `groupListings(rows, { filterPredicate })` emits the pre-swap groupKey on both the canonical AND sibling members when a promotion occurs.

**F6 count-drift + short-page mitigation (Codex P0-B fix)**

Post-group slot filtering drops whole groups when no member matches. Current fetch window `limit + SEARCH_DEDUP_LOOK_AHEAD + 1` was sized for sibling-collapse overfetch, not for group elimination. Additionally, `searchdoc-limited-count` at `search-doc-queries.ts:1094-1101` counts SQL-filtered raw rows — it will DRIFT from post-group canonical count once F6 ships.

**Three-part fix**:
1. **Push a permissive slot predicate to SQL**: `WHERE ("openSlots" >= $N OR ("roomType" = 'WHOLE_ROOM' AND "maxOccupancy" >= $N))`. This keeps every row that could contribute to a surviving group, making Option A ≡ Option B for correctness (any-sibling-passes → group survives). Fetch window stays bounded at `+lookAhead`.
2. **Post-group canonical promotion still applies** to pick the best-matching member as canonical when the "first seen" canonical doesn't match. Original groupKey preserved (M-3).
3. **Count path (`searchdoc-limited-count`)** — **REVISED per Codex v2-M2**: original plan said "SQL `COUNT(DISTINCT group_key)`", but `groupKey` is JS-computed via `normalizeListingTitle()` (`src/lib/search/normalize-listing-title.ts`) and is NOT available as a DB column (materialization deferred per §12 #1). SQL can't produce the same hash without a Postgres function mirroring the JS logic (parity-drift risk). Three realistic options:
   - **(a) App-side grouped count (recommended, chosen)**: Raise the raw-count SQL `LIMIT` to `HIGH_COUNT_CAP = 500` (configurable). Fetch those rows (id+ownerId+normalizedAddress+priceCents+normalizedTitle+roomType only — narrow projection, cheap). Run `applyServerDedup` in-memory. Return `metrics.groupsOut`. If raw result hits `HIGH_COUNT_CAP`, UI shows `"500+ matches"` (matches today's convention for capped results). New cache entry `["searchdoc-limited-count-grouped-v1", cacheKey, dedupFlagValue]` with revalidate 60.
   - **(b) Materialize `groupKey` on `listing_search_docs`**: explicit Phase 4 follow-up (§12 #1). Enables true SQL `COUNT(DISTINCT)` with no cap. Not in this plan's scope.
   - **(c) Postgres function `build_group_key(...)`**: mirrors JS logic. Rejected — every change to JS `normalizeListingTitle` would need identical SQL update, silent drift is certain.
   
   **Chosen: (a)**. Rationale: small narrow-projection query, sub-10ms p95, no parity risk, bounded count accuracy (500+ is an acceptable UI compromise today). Materialization (b) is tracked as a follow-up for when the count cap becomes a user complaint.

**New edge cases** (additive to §6 matrix):
- **EC-044** (P0, integration): pathological case — 70 rows SQL-match permissive predicate, post-group only 5 canonicals pass strict predicate → short page + count drift. Expect: `pageSize=60` returns 5 canonicals + `hasMore=false`; count reflects the 5, not 70.
- **EC-045** (P1, unit): `COUNT(DISTINCT group_key)` equivalence — for a fixture with known group structure, the grouped count equals `applyServerDedup(...).metrics.groupsOut`.

Trade-off accepted: the count is bounded to `lookAhead`-sized over-fetch window. If more groups exist beyond that window, count shows "60+" (our current convention for capped results) rather than a precise number. This is a soft accuracy loss consistent with today's behavior.

**F7 — `unstable_cache` key bifurcation on dedup flag (Codex P0-A fix)**

Cache wrappers at `search-doc-queries.ts:1098-1101, 1373-1376, 1635-1638` use `[key, cacheKey]` tuples where `cacheKey` is derived from `params` only. `features.searchMapDedup` is read INSIDE the memoized function — so post-flip, the cache serves pre-flip payloads for up to 60s.

**Fix**: include the flag value in the cache key tuple AND the `cacheKey` hash.

```
BEFORE: unstable_cache(fn, ["searchdoc-map-listings", cacheKey], { revalidate: 60 })
AFTER:  unstable_cache(fn,
          ["searchdoc-map-listings", cacheKey, features.searchMapDedup ? "dedup-v1" : "raw"],
          { revalidate: 60 })
```

And `createSearchDocMapCacheKey` / `createSearchDocListCacheKey` / `createSearchDocCountCacheKey` should accept a `dedupFingerprint` parameter and include it in their hash output, so the cache KEY hash is also flag-aware (defense-in-depth — some Next.js versions flatten the key tuple into a single hash).

**Why both CDN AND unstable_cache fixes are needed**:
- CDN cache purge on `s-maxage=60` (per §9.2 runbook) handles edge-cached responses.
- `unstable_cache` is an IN-PROCESS server-side cache. CDN purge doesn't touch it.
- Without F7, post-flag-flip the map server returns still-cached raw responses until the 60s TTL expires PER CACHE KEY — which for busy keys could be immediate, but for tail-of-distribution queries could be unbounded if no request refreshes them.
- F7 makes the flag change a "new cache key space" — pre-flip cache entries become inaccessible, post-flip entries populate cleanly.

**Test**: `search-doc-cache-key-bifurcation.test.ts` — asserts that toggling `features.searchMapDedup` produces distinct `unstable_cache` keys for the same params input. Must use Node `perf_hooks` or mock clock since Next's `unstable_cache` is time-sensitive.

### 4.3 `Map.tsx` + `marker-utils.ts`: NO CHANGES

Client already consumes `groupKey`/`groupSummary`/`groupContext` through `sanitize-map-listings.ts:136-138`. `groupExactMapListingClones()` (`marker-utils.ts:101-129`) becomes a safety-net no-op for same-owner groups (canonicals already unique post-dedup) but still catches cross-owner same-coord clones — keep as-is.

### 4.4 Sibling details for "+N more dates" panel

`groupSummary.members[]` already carries `listingId, availableFrom, availableUntil, startDate, endDate, openSlots, totalSlots, isCanonical, roomType` per member (`dedup.ts:104-115`). **No new API endpoint needed** for the panel. Deep-link clicks navigate to `/listings/<canonical_id>?startDate=&endDate=` and the detail page fetches the full slot-group.

---

## 5. UX Deliverables

### 5.1 Card state variants (8)

Implemented in `src/components/listings/ListingCard.tsx` (already consumes `groupSummary`). For each state:

| # | State | SlotBadge | Title | Price | Secondary | +N Button |
|---|---|---|---|---|---|---|
| 1 | SHARED · 1 slot · open | `1 spot open` (success) | `Shared Room · City, ST` | `$900 /mo` | `Available Jun 15 · 6 mo lease` | hidden |
| 2 | SHARED · 3 identical slots · all open | `3 spots open` | `Shared Room · City, ST` | `$900 /mo` | `Available Jun 15` | hidden |
| 3 | SHARED · mixed (1 open, 1 sibling Jul 1) | `1 open now · 1 other date` (info) | `Shared Room · City, ST` | `$900 /mo` | `Available Jun 15` | `+1 more date` |
| 4 | PRIVATE · typical | `1 spot open` | `Private Room · City, ST` | `$1,300 /mo` | `Available Jul 1 · 12 mo lease` | hidden |
| 5 | WHOLE · maxOccupancy=1 | `Available` (no count) | `Whole place · City, ST` | `$1,800 /mo` | `Available Aug 1` | hidden |
| 6 | WHOLE · maxOcc≥2, multiple date groups | `Fits 3 · Aug 1 · 1 other date` (info; capacity moved to badge per critic N-1) | `Whole place · City, ST` (no "fits" suffix, avoids `line-clamp-1` truncation at `ListingCard.tsx:562`) | `$2,400 /mo` | `≈ $800/person if split 3 ways` | `+1 more date` |
| 7 | Any · PAUSED | `Paused by host` (neutral) | unchanged | dimmed | `Host paused this listing — check back soon` | hidden |
| 8 | Any · RENTED | `No longer available` (neutral) | strikethrough | dimmed | `Rented · see similar` | hidden |

New additions to existing code:
- `SlotBadge.tsx:54-69` — new variant `"neutral-with-alternatives"` → info-blue.
- `availability-presentation.ts` — new `"partial-with-alternatives"` state emits a `secondaryGroupLabel` usable for both badge and aria.
- `ListingCard.tsx:427` aria-label must integrate the new badge copy.

### 5.2 Filter panel (`src/components/search/FilterModal.tsx` + new chip row)

**Room-type**: promote from `FilterModal.tsx:322-350` drawer Select to a **prominent chip row above results grid** (new component `RoomTypeChipRow.tsx`). Single-select. Chips: `Any · Private · Shared · Whole place`. URL: `?roomType=WHOLE_ROOM`.

Keep Select in drawer for parity.

**Slot slider** (`FilterModal.tsx:352-399`, currently label "Minimum Open Spots"):
- Rename to `Group size (min open spots you need)`.
- Helper text is `roomType`-aware:
  - `Any`/`PRIVATE_ROOM`: `Show listings with at least this many open spots`
  - `SHARED_ROOM`: `Show shared rooms with at least N open beds`
  - `WHOLE_ROOM`: `Show whole places that fit at least N people`
- Range for WHOLE_ROOM: `1..10` (currently `2..10`, line 366/386).

**API contract by combo**:

| `roomType` | `minSlots=N` | Server filter (applied group-first per F6) |
|---|---|---|
| unset / Any | N | `openSlots >= N` |
| PRIVATE_ROOM | N (usually 1) | `openSlots >= N AND roomType='PRIVATE_ROOM'`; info text when `N≥2` |
| SHARED_ROOM | N | `openSlots >= N AND roomType='SHARED_ROOM'` |
| WHOLE_ROOM | N | `maxOccupancy >= N AND roomType='WHOLE_ROOM'` |

### 5.3 Listing detail slot picker (`src/app/listings/[id]/ListingPageClient.tsx`)

- Render `SlotPicker` section between gallery and `ContactHostButton` when `groupSummary.members.length > 1`.
- URL format: `/listings/<canonical_id>?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`. Missing dates → active = canonical.
- `/listings/<sibling_id>` client-side redirects (302 `router.replace`, not 301) to canonical URL with date params. Reversible if direction changes.
- Active slot updates price row context + pre-fills `ContactHostButton` message template with selected dates.
- Full rows are selectable; message template changes to "I know this slot is full, but please let me know…".

Mobile: bottom sheet listing (reuses `GroupDatesModal` pattern at `GroupDatesModal.tsx:48-80`).

### 5.4 Host listing create/edit form

`src/app/listings/create/CreateListingForm.tsx:1239-1248` — replace free-form `roomType` select with enum-backed options. Add `maxOccupancy` stepper (not free number text) with per-room-type defaults:
- `PRIVATE_ROOM` → locked at 1.
- `SHARED_ROOM` → default 2, min 2.
- `WHOLE_ROOM` → default 2, min 1.

Soft warning when `maxOccupancy ≥ 5`:
> "Places with more than 4 people fill slower and get more scrutiny from renters. You can still submit."

Hard block when `maxOccupancy ≥ 11`:
> "Max is 10. If you're renting a larger property, please contact support."

Server validation in `src/app/api/listings/route.ts` listing-POST + PATCH handlers mirrors the form limits.

**Edit-form coupling (M-2 fix)**: When host decreases `maxOccupancy` below current `totalSlots`, the DB CHECK `listing_capacity_bounds` would 500 the PATCH. To prevent: EditListingForm pre-submit handler checks `newMaxOccupancy < totalSlots` and EITHER (a) auto-clamps `totalSlots = newMaxOccupancy` with an inline info toast "Reduced available slots to match occupancy", OR (b) shows inline error "Reduce available slots first" on the slot input. Pick (a) — fewer steps, host intent is clear. Integration test: `listings-host-managed-patch.test.ts` asserts PATCH with decreasing `maxOccupancy` returns 200 and auto-clamped `totalSlots`, not 500.

---

## 6. Edge-Case Matrix (abridged — full 42-case table in Appendix A)

| ID | Category | Scenario | Severity | Test |
|---|---|---|---|---|
| EC-001 | Dedup | Map route returns N rows per group, not canonicals | P0 | `api/map-listings-dedup.test.ts` NEW |
| EC-003 | Dedup | Malformed `normalizedAddress` collapses ALL empty-address rows per owner | P0 | `dedup-pipeline-malformed-address.test.ts` NEW |
| EC-012 | Pagination | ~~`seenIdsRef` dedupes by `listingId`, not `groupKey`~~ **RESOLVED in existing code** (`SearchResultsClient.tsx:164-167`). Reframed: regression test that `seenGroupKeysRef` path survives F6 canonical-promotion. | P1 | extend `pagination-reset.spec.ts` |
| EC-043 | Dedup | F6 canonical-swap must preserve original groupKey | P0 | NEW `slot-filter-semantics.test.ts` case |
| EC-046 | Compat | `toRoomTypeEnum` maps all legacy strings + short keys → enum (Codex v2-M1) | P0 | NEW `room-type-aliases.test.ts` |
| EC-047 | Compat | SavedSearch backfill: legacy `'Private Room'` → `'PRIVATE_ROOM'` persisted + parser reads enum (Codex v2-M1) | P0 | NEW `saved-search-roomtype-migration.integration.test.ts` |
| EC-048 | Integrity | CHECK `listing_shared_room_capacity_match` rejects `SHARED_ROOM totalSlots=2, maxOccupancy=4` (Codex v2-M3) | P0 | extend `max-occupancy-validation.test.ts` |
| EC-016 | Saved search | Alerts use raw listing count → spam after dedup | P0 | extend `api/cron/search-alerts.test.ts` |
| EC-023 | Map marker | Canonical+sibling at same lat/lng render as 2 pins today | P0 | NEW `map-single-pin-multi-slot.dedupe.spec.ts` |
| EC-026 | Boundary | `maxOccupancy=0` rejected at validation schema | P0 | NEW `max-occupancy-validation.test.ts` |
| EC-029 | Boundary | `maxOccupancy=999` rejected; hard cap 20 | P0 | same |
| EC-031 | Integrity | `openSlots > totalSlots` data-bug → wrong aggregate | P0 | migration data-clean + CHECK |
| EC-039 | Dedup | Malformed `normalizedAddress` ≥20% of corpus → synthetic per-listing key | P0 | same as EC-003 |
| EC-040 | Security | `groupSummary.members[]` PII audit — no `ownerId`/email/phone | P0 | NEW `group-summary-pii-shape.test.ts` |
| EC-042 | Slot filter | Filter matches via sibling only → canonical promotion required | P0 | NEW `slot-filter-semantics.test.ts` |

**P1/P2 cases** (EC-002, EC-004, EC-005, EC-007–011, EC-013–015, EC-017–025, EC-027, EC-028, EC-030, EC-032–038, EC-041): see Appendix A.

---

## 7. Abuse & Security Mitigations

| ID | Vector | Mitigation | Code location |
|---|---|---|---|
| P-001 | `maxOccupancy` inflation (host sets 20 to saturate slot buckets) | Hard cap 20 at DB CHECK; form hard-block at 11; moderation flag ≥6 for unverified hosts; ranking penalty `(max-slot)/max` | `src/app/api/listings/route.ts` validation + new ranking hook |
| P-002 | Cross-owner collision spam | New `checkCrossOwnerCollision`: when count ≥3 same-address-any-owner in 24h AND neither verified → moderation queue (do not auto-suppress) | `src/lib/listings/collision-detector.ts` |
| P-003 | Address evasion (`123 Main St` vs `123 main street`) | Extend `normalizeAddress` with abbrev allowlist + NFKC (already partially done); fuzz test with diacritics/zero-width | `src/lib/search/normalize-address.ts` + NEW parity test |
| P-004 | GroupKey grinding via $1 price drift | Price-bucket `priceCents` to $25 in `buildGroupKey` (F5) | `src/lib/search/dedup.ts:164-180` |
| P-005 | Slot-filter domination by large `maxOccupancy` | Ranking penalty; group-first filter with best-member promotion (F6) | ranking hook post-dedup |
| P-006 | Saved-search alert spam post-dedup | Alerts consume canonical-count only; per-recipient 10/day cap | `src/lib/search-alerts.ts` + `api/cron/search-alerts.test.ts` |
| P-007 | PII via `groupSummary.members[]` | **Verified safe today.** Defense-in-depth contract test | NEW `group-summary-pii-shape.test.ts` |

---

## 8. Test Matrix (abridged — full mapping in Appendix B)

- **Unit**: extend `dedup-pipeline-*` tests (6 files) + NEW `dedup-pipeline-malformed-address.test.ts`, `dedup-pipeline-price-bucket.test.ts`, `dedup-group-key.test.ts`, `group-summary-pii-shape.test.ts`, `slot-filter-semantics.test.ts`, `max-occupancy-validation.test.ts`.
- **Integration** (real DB, no mocks): extend `api/map-listings.test.ts`, `api/search/v2/route.test.ts`, `api/search-count.test.ts`, `api/listings-post.test.ts`, `api/listings-host-managed-patch.test.ts`, `create-listing-collision-endpoint.integration.test.ts`, `api/cron/search-alerts.test.ts`. NEW `api/map-listings-dedup.test.ts`, `api/listings/listings-cross-owner-collision.test.ts`.
- **Component**: NEW `components/search/GroupDatesPanel.test.tsx`, `components/search/ListingCardCollapsed.test.tsx`.
- **E2E**: extend `tests/e2e/search-filters/filter-combinations.anon.spec.ts`, `pagination/pagination-reset.spec.ts`, `journeys/search-pagination-journey.spec.ts`, `map-filters.spec.ts`, `search-url-roundtrip.spec.ts`, `a11y/listing-detail-a11y.spec.ts`, `search-a11y-keyboard.anon.spec.ts`, `saved/saved-searches.spec.ts`. NEW `tests/e2e/dedupe/map-single-pin-multi-slot.dedupe.spec.ts`, `tests/e2e/dedupe/slot-filter-semantics.dedupe.spec.ts`.
- **Load**: NEW `scripts/load/dedup-perf-60-listings-same-group.ts` (EC-038 pathological-group perf).

**Obsolete under CFM contact-first** (keep in repo, `describe.skip` with pointer to `project_cfm_state.md` until CFM Wave 3g merges): `multi-slot-lifecycle.test.ts`, `multi-slot-concurrency.test.ts`, `multi-slot-feature-flags.test.ts`, `actions/booking-whole-unit.test.ts`. Salvage boundary math from `multi-slot-boundaries.test.ts` into NEW `host-managed-slot-math.test.ts`.

---

## 9. Feature Flag & Rollout Plan

### 9.1 New flags (matching codebase convention `FEATURE_*` → `features.*` at `src/lib/env.ts:540+`)

| Flag | Env var | Default | Phase | Gates |
|---|---|---|---|---|
| Existing | `FEATURE_SEARCH_LISTING_DEDUP` | `false` today → `true` end of Phase 1 | — | List-path dedup (already wired) |
| NEW | `FEATURE_SEARCH_MAP_DEDUP` | `false` | Phase 1 | Map-path dedup fix (F1/F2) + groupKey price-bucketing (F5) + F6 group-first slot filter + F7 unstable_cache key bifurcation. **NOT V1 fallback** (F3 dropped per Codex P1-A). |
| NEW | `FEATURE_ROOM_OCCUPANCY_MODEL` | `false` | Phase 2 → Phase 3 | Reads/writes of `maxOccupancy` in UI + slot-filter semantics. Schema + CHECKs ship earlier (dark). |

**CFM flag interactions**: None. Current CFM rollout and retirement flags (`ENABLE_CONTACT_FIRST_LISTINGS`, `ENABLE_BOOKING_RETIREMENT_FREEZE`, `ENABLE_BOOKING_NOTIFICATIONS`, `ENABLE_LEGACY_CRONS`) are orthogonal to OLOC. CHECK `listing_whole_unit_atomic` reinforces the existing code-level invariant at `booking.ts:216,879` without conflict.

### 9.2 Phase sequencing

**Phase 1 — Map dedup fix (days 1-3; flag `FEATURE_SEARCH_MAP_DEDUP`)**
1. D1: Implement F1/F2 (`dedupeMapListings` helper + `toSearchRowFromMapListing` adapter + callers in `data.ts`, `search-doc-queries.ts`).
2. D1: Implement F5 (price-bucketing as OPTIONAL parameter on `buildGroupKey`; passed only when `features.searchMapDedup` true — critic B-2 fix).
3. D1: F4 is NOW a regression test, not a refactor — `SearchResultsClient` already has `seenGroupKeysRef` (critic B-1). Write test asserting groupKey-dedup survives F6 canonical swap.
4. D1: Implement **F7** (`unstable_cache` key bifurcation on `features.searchMapDedup` — Codex P0-A fix). Touch `search-doc-queries.ts:1098-1101, 1373-1376, 1635-1638` + `createSearchDoc*CacheKey` functions. Add `search-doc-cache-key-bifurcation.test.ts`.
5. D2: F3 (V1 fallback dedup) — **OUT OF SCOPE** per Codex P1-A reconciliation. Add telemetry `search.v1_fallback_active` only, so duplicate UX during a V1-fallback outage is at least observable.
6. D2: Implement F6 (group-first slot filter with canonical promotion **preserving original groupKey**, permissive SQL predicate `openSlots >= N OR (roomType='WHOLE_ROOM' AND maxOccupancy >= N)`, parallel grouped-count cache entry — critic M-3 + Codex P0-B fixes). Add EC-043/EC-044/EC-045 tests.
7. D3: Extend unit + integration tests (EC-001, EC-003, EC-039, EC-040, EC-042, EC-043, EC-044, EC-045). Add NEW `map-listings-dedup.test.ts`, `map-listings-dedup-adapter.test.ts`, `search-doc-cache-key-bifurcation.test.ts`.
8. D3: Add Playwright `map-single-pin-multi-slot.dedupe.spec.ts`.
9. D3: Run `scripts/cfm/cleanup-seed-duplicates.ts --dry-run` (AFTER F5 has landed — critic B-2 sequence fix), review, then `--apply` so dry-run and apply use identical hash logic.
10. D3: **Flag-flip runbook (critic M-5 + Codex P0-A fixes)**:
    a. Ensure F7 deployed first so `unstable_cache` keys will bifurcate on flag flip.
    b. BEFORE flip: purge map-listings CDN edge cache. (With F7 landed, `unstable_cache` needs no purge — key space changes on flag value.)
    c. Flip `FEATURE_SEARCH_LISTING_DEDUP=true` + `FEATURE_SEARCH_MAP_DEDUP=true` atomically in preview env (not staggered — avoids mixed-path inconsistency where list is deduped but map isn't).
    d. Smoke-verify: map marker count == list canonical count on 3 sample queries at different bounds.
    e. Monitor `search_dedup_overflow_count`, `search.zero_results_rate`, AND new `search.page_short_rate` (EC-044) for 15 min before declaring Phase 1 complete.

**Phase 2 — Schema migration (days 4-7; flag `FEATURE_ROOM_OCCUPANCY_MODEL` dark)**
1. D4: Write migration SQL (§3.3).
2. D4: `pnpm prisma migrate dev` → verify locally with fresh seed + dummy-data backfill.
3. D4: **Post-migration gate (M-1 fix)**: run `SELECT COUNT(*) FROM "Listing" WHERE "needsMigrationReview" = TRUE`. Migration notes FAIL the deploy if count > 0 on preview/prod. Pre-launch posture: clean data is required before Phase 3 flips `FEATURE_ROOM_OCCUPANCY_MODEL` — any NULL-roomType rows would be silently excluded from the chip filter (shows under "Any" only). Add CI script `scripts/verify-migration-clean.ts` that asserts the same.
4. D5: Update host `CreateListingForm.tsx` with `RoomType` enum select + `maxOccupancy` stepper. Server-side validation in `POST /api/listings`.
5. D5: Update host `EditListingForm` (similar path) with M-2 auto-clamp when `maxOccupancy < totalSlots`.
5a. D5 (Codex v2-M1 compat layer): create `src/lib/search/room-type-aliases.ts` with `toRoomTypeEnum()`; wire into `filter-schema.ts:65,80-97`, `saved-search-parser.ts:26,102`, `search-alerts.ts:216,399`, `CategoryTabs.tsx:5`, `filter-chip-utils.ts:145`. Ship alias layer BEFORE Phase 3 chip-row flip to prevent round-trip breakage.
5b. D5 (Codex v2-M1 data migration): follow-up SQL UPDATE on `SavedSearch.filters` JSON to rewrite `'Private Room'` → `'PRIVATE_ROOM'` etc. (see §3.4a step 3). Verification query asserts 0 remaining legacy strings.
6. D6: Integration tests (EC-017, EC-018, EC-026–029, EC-041, + M-2 decrease-auto-clamp).
7. D6: E2E host-flow spec for create + edit with new fields.
8. D7: Deploy migration to preview.

**Phase 3 — Search filter + UX polish (days 8-12; flip `FEATURE_ROOM_OCCUPANCY_MODEL=true`)**
1. D8: Promote room-type from drawer to chip row above grid (new `RoomTypeChipRow.tsx`).
2. D8: Slot slider helper-text roomType-awareness + range=1-10 for WHOLE.
3. D9: New `SlotBadge` variant `"neutral-with-alternatives"` + availability-presentation state.
4. D9: Detail-page `SlotPicker` section + sibling→canonical 302 redirect.
5. D10: Integration tests for filter semantics (EC-006–010, EC-042) + slot filter ranking.
6. D10: A11y extensions (EC-020–022) + `GroupDatesPanel` component tests.
7. D11: E2E `slot-filter-semantics.dedupe.spec.ts` + saved-search round-trip (EC-014–016).
8. D11: Load test `dedup-perf-60-listings-same-group.ts`.
9. D12: Preview flip → monitor telemetry → prod flip.
10. D12 (post-soak, Codex P1-B fix): follow-up migration `prisma/migrations/<ts>_maxoccupancy_not_null/migration.sql`:
    ```sql
    BEGIN;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "Listing" WHERE "maxOccupancy" IS NULL AND "status" IN ('ACTIVE','PAUSED')) THEN
        RAISE EXCEPTION 'Cannot set NOT NULL — % active listings still have NULL maxOccupancy',
          (SELECT COUNT(*) FROM "Listing" WHERE "maxOccupancy" IS NULL AND "status" IN ('ACTIVE','PAUSED'));
      END IF;
    END $$;
    ALTER TABLE "Listing" ALTER COLUMN "maxOccupancy" SET NOT NULL;
    COMMIT;
    ```
    Run ONLY after (a) Phase 3 flip has soaked 7 days in prod, (b) host form has written `maxOccupancy` on every mutation path for the full soak, (c) `SELECT COUNT(*) FROM Listing WHERE maxOccupancy IS NULL` = 0. If any condition fails, keep nullable and update §3.1 comment to remove NOT NULL claim.

### 9.3 Rollback triggers

- `search_dedup_overflow_count > 1%` of map requests → bump `SEARCH_DEDUP_LOOK_AHEAD` or add `MAP_DEDUP_LOOK_AHEAD=32`.
- Map p95 latency regresses >50ms sustained → kill `FEATURE_SEARCH_MAP_DEDUP`.
- Sentry exception in `applyServerDedup` / `buildGroupMetadataById` path → kill-switch.
- A11y audit regression on detail-page slot picker → kill `FEATURE_ROOM_OCCUPANCY_MODEL`; UX falls back to today's behavior.

---

## 10. Pre-Mortem (Top 10 failure modes)

| # | Failure mode | Signal | Blast radius | Mitigation | Status |
|---|---|---|---|---|---|
| 1 | Map returns 0 pins while list returns 12 cards | `zero-results` rate spike on `/api/map-listings`; user complaints | All map views | EC-001 + map-filters.spec smoke | in plan |
| 2 | Developer "fixes" cross-owner dupes by removing `ownerId` from `buildGroupKey` → two legit hosts collapse | Host support "my listing vanished" | Revenue + trust | EC-002 unit + PR gate blocking groupKey payload reorder | in plan (needs PR reviewer checklist) |
| 3 | `maxOccupancy` inflation bypasses moderation (client-side check only) | Histogram anomaly; sudden mass at 20 | Search quality | EC-026/028/029 + P-001 server validation | in plan |
| 4 | Saved-search alerts spam users post-dedup | Unsubscribe rate ↑, email complaint rate ↑ | Deliverability + churn | EC-016 + P-006 | in plan |
| 5 | F6 canonical-promotion changes emitted `groupKey`, bypassing client-session `seenGroupKeysRef` → "Load more" dups | User report "same place twice on scroll" | UX | F6 must preserve original groupKey on swap (critic M-3); regression test EC-043 | in plan |
| 6 | DB CHECK constraint fails backfill on legacy `openSlots > totalSlots` rows | Migration fails in CI | Deploy blocker | Pre-CHECK data-clean in migration STEP 2 | in plan |
| 7 | Cross-owner collision flood at high-demand addresses (campus, venue) | Complaint volume tied to lat/lng cluster | Platform trust | P-002 cross-owner rate-limit + moderation queue | deferred (not Phase 1-3) |
| 8 | Slot filter over-matches WHOLE_ROOM, buries diverse inventory | Search-diversity metric drops; CTR skew | Marketplace health | P-005 ranking penalty + F6 group-first | in plan |
| 9 | Stale cached map response (60s) returns paused/edited listings | Click pin → detail shows unavailable | Minor UX | Accept 60s stale OR emit targeted purge on `PATCH /listings/:id` | deferred (acceptable trade) |
| 10 | A11y regression: screen reader misses "+N more dates"; ESC escapes | a11y audit fails; user reports via support | WCAG compliance | EC-020/021/022 + axe e2e | in plan |

---

## 11. Assumption Audit

- ✅ `bookingMode ∈ {SHARED, WHOLE_UNIT}` — verified `schema.prisma:135`.
- ✅ `roomType` is free-form `String?` today — verified `schema.prisma:113`.
- ✅ `maxOccupancy` does not exist — greenfield.
- ✅ Map route skips `applyServerDedup` — verified `/api/map-listings/route.ts:207-221`.
- ✅ Both map data functions attach group metadata but don't collapse — verified `data.ts:738`, `search-doc-queries.ts:1228`.
- ✅ `buildGroupKey` is same-owner (includes `ownerId`) — verified `dedup.ts:164-180`.
- ✅ `ListingCard` already renders "+N more dates" from `groupSummary` — verified lines 317-625.
- ✅ CFM contact-first deprecates public booking/hold creation — verified `cfm-migration-plan.md:26-28`.
- ✅ Cleanup script at `scripts/cfm/cleanup-seed-duplicates.ts` — Domain-Dev corrected path.
- ✅ Existing flag convention `FEATURE_*` + `features.*` at `src/lib/env.ts:540+` — verified.
- ✅ `SEARCH_DEDUP_LOOK_AHEAD = 16` — verified `search-doc-queries.ts:71`.
- ⚠️ UX Q2 (roomType chip without bounds-required gate) — **not verified**. Confirm during Phase 3 that `SearchForm.onApply` handles filter-only changes correctly.
- ✅ `seenGroupKeysRef` already exists and dedupes by groupKey — verified `SearchResultsClient.tsx:164-167, 325-326, 370-371, 524-538` (critic B-1 correction applied to plan).
- ⚠️ Facets route `COUNT(*)` today overcounts groups — **deferred** as follow-up ticket.

---

## 12. Open Follow-ups (out of scope for this refactor)

1. Materialize `groupKey` as a column on `listing_search_docs` → unlocks facets `COUNT(DISTINCT)` and removes per-request SHA256. Schema + trigger + backfill.
2. Host-dashboard map view showing siblings (current plan: consumer map is canonicals-only everywhere).
3. `CrossOwnerCollisionDetector` productionization + admin moderation queue UI.
4. `facets` route `COUNT(DISTINCT group_key)` switch.
5. Retire obsolete `multi-slot-*.test.ts` files once CFM Wave 3g merges (until then, `describe.skip` with pointer comment).

---

## Appendix A — Full 42-case Edge Matrix

(Copy of QA agent deliverable, unchanged — see `.deliberate-plan/artifacts/qa-edge-cases.md` for the full row-by-row table with Current/Expected/Severity/Test-type columns.)

## Appendix B — Full Test Matrix

(Copy of QA agent deliverable. Mapping of 42 cases → 39 test files across unit/integration/component/e2e/load.)

## Appendix C — Agent attribution

- **Architect** (Opus, agent `a72b21968a5ac3974`): schema diff, migration SQL, CHECK constraints, CFM flag interactions, state-machine delta analysis.
- **Domain Developer** (Opus, agent `acfcd16ec18282323`): dedup audit, F1–F6 fix design, performance analysis, flag consumption points, cross-owner handling.
- **UX/Product Designer** (Opus, agent `af19224eff2965882`): Q1/Q3/Q4/Q5 product decisions, 8 card state variants, filter chip row, detail slot picker, map canonical-only decision.
- **QA + Security Reviewer** (Opus, agent `a8800b7fdbf56b3d6`): 42 edge cases, 7 abuse vectors, 39-file test matrix, 10-item pre-mortem.
- **Harsh Critic** (pending).

---

**Plan authored**: 2026-04-19 by coordinator Opus 4.7 via multi-agent deliberation.

---

## 13. Critic Response — all 🔴/🟠 mitigations landed inline

Harsh critic (Opus 4.7, agent `a00e4a709411e08a4`) delivered **FAIL** verdict on v1.0 — 2 blockers + 5 majors + 1 minor. All amendments applied to v1.1 of this doc. Summary:

| ID | Severity | Critic finding | Mitigation location in this plan |
|---|---|---|---|
| **B-1** | 🔴 | EC-012/F4 targeted non-existent bug — `seenGroupKeysRef` already ships | §4.2 F4 reframed as regression test; EC-012 demoted P1 "RESOLVED in existing code"; §11 Assumption Audit updated to ✅; Pre-Mortem row 5 restated around real F6 risk |
| **B-2** | 🔴 | F5 price-bucketing would mutate `buildGroupKey` for all consumers, breaking "reversible Phase 1" claim | §4.2 F5 revised — `priceBucketCents` optional parameter on `buildGroupKey`, passed only when `features.searchMapDedup` true; cleanup-seed script reordered to run AFTER F5 in §9.2 so dry-run and apply use identical hash logic |
| **M-1** | 🟠 | Migration can leave NULL-roomType rows silently excluded from chip filter | §9.2 Phase 2 D4 adds post-migration gate `SELECT COUNT(*) ... WHERE needsMigrationReview = TRUE` failing deploy if >0; CI script `scripts/verify-migration-clean.ts` |
| **M-2** | 🟠 | PATCH `maxOccupancy < totalSlots` 500s on CHECK `listing_capacity_bounds` | §5.4 adds EditForm auto-clamp when `newMaxOccupancy < totalSlots` with integration test |
| **M-3** | 🟠 | F6 canonical-promotion changes emitted groupKey → breaks `seenGroupKeysRef` | §4.2 F6 requires preserving original groupKey on swap; NEW EC-043 P0 regression test |
| **M-4** | 🟠 | F2 "line 737 applyServerDedup" pointed at post-mapping code; adapter unspecified | §4.2 F2 names `toSearchRowFromMapListing` adapter + NEW `map-listing-dedup-adapter.ts` + test |
| **M-5** | 🟠 | 60s CDN cache + flag flip creates mixed-response window (map shows N pins, list shows canonicals) | §9.2 Phase 1 D3 step 9 adds flag-flip runbook: edge cache purge OR `Vary: x-search-dedup-enabled` header during 180s flip window; atomic flip of both list+map flags (not staggered); smoke-verify marker/canonical parity |
| **N-1** | 🟡 | Card state 6 title `... fits 3` truncated on mobile via `line-clamp-1` | §5.1 state 6 row updated — "fits N" moved to SlotBadge, removed from title |

**Additional scope reduction informed by critic**: F3 (V1 fallback dedup) **removed from Phase 1**. Critic's reasoning: V1 is a degraded circuit-breaker path; adding dedup work on an already-slow path worsens the outage window. New telemetry `search.v1_fallback_active` monitors so duplicate UX during fallback is at least visible.

**Re-run harsh critic after these patches**: not performed in this session — further critic passes should re-verify the 5 files touched by the mitigations against the amended plan before Codex handoff. Coordinator recommends the Phase 1 D1 implementer spot-check `SearchResultsClient.tsx:524-538` (F4), the new `buildGroupKey` signature (F5), and the `toSearchRowFromMapListing` adapter (F2) as a freshness gate before writing code.

**Final plan status**: v1.1 — ready for Codex execution under CFM workflow (planner sandbox reviews, coordinator commits). Ship Phase 1 behind `FEATURE_SEARCH_MAP_DEDUP=false` default; flip in preview first.

---

## 14. Codex Review Response — v1.2 amendments

Codex delivered a 6.5/10 second-pass review on v1.1. Four findings verified against code; all amendments landed in v1.2.

| ID | Severity | Codex finding | Independent verification | Mitigation |
|---|---|---|---|---|
| **P0-A** | 🔴 | `unstable_cache` keys only vary on `params`; `features.searchListingDedup` read INSIDE memoized fn → post-flag-flip, stale dedup-off payloads served up to 60s even after CDN purge. | **Confirmed** — `search-doc-queries.ts:1098-1101, 1373-1376, 1635-1638` show tuple `[label, cacheKey]` with cacheKey derived from params only. Flag read at lines 285, 394, 1513, 1727, 1930 happens inside the wrapped function. | NEW **F7 — unstable_cache key bifurcation** (§4.2). Include flag value in cache key tuple AND hash. Phase 1 D1 step 4. Test: `search-doc-cache-key-bifurcation.test.ts`. |
| **P0-B** | 🔴 | F6 post-group slot filter can drop whole groups; `SEARCH_DEDUP_LOOK_AHEAD=16` doesn't compensate for group elimination (only sibling collapse). `searchdoc-limited-count` (line 1094) counts SQL-filtered raw rows → count drift + short-page risk. | **Confirmed** — `searchdoc-limited-count` returns raw SQL count, not group-aware count. F6 drops groups post-dedup, no refill logic. | F6 revised (§4.2): permissive SQL predicate `openSlots >= N OR (roomType='WHOLE_ROOM' AND maxOccupancy >= N)` + parallel `searchdoc-limited-count-grouped` cache entry using `COUNT(DISTINCT ...)`. NEW tests EC-044 (short-page) and EC-045 (grouped-count equivalence). Telemetry `search.page_short_rate` monitored at flag flip. |
| **P1-A** | 🟠 | F3 (V1 fallback dedup) listed as in-scope at line 163 audit table + line 387 flag-gate table, BUT removed at line 398 + line 522. Self-contradictory. | **Confirmed** — both tables said "in scope" while Phase 1 body said "removed." | Lines 163 + 387 updated to "OUT OF SCOPE per Codex P1-A reconciliation." Phase 1 D2 step clarified: only V1 fallback telemetry (`search.v1_fallback_active`), no dedup logic. |
| **P1-B** | 🟠 | §3.1 says `maxOccupancy` becomes NOT NULL after Phase 3, but no migration step schedules it. | **Confirmed** — comment was documentation-only. | §3.1 column comment updated to reference §9.2 D12. §9.2 Phase 3 D12 step 10 added: follow-up migration `_maxoccupancy_not_null` with pre-check guard that RAISES EXCEPTION if any active listing still NULL, to be run only after 7-day soak. Alternative path (keep nullable) documented. |

**Confidence revision**: v1.2 → 🟢 **HIGH (4.5/5)**. Codex-review pass completed; v1.0→v1.1→v1.2 iterative hardening done. Plan is execution-ready under CFM workflow.

**Rating progression**:
- v1.0 (pre-critic): 4.1/5 self-rated
- v1.1 (post-internal critic): 4.3/5
- v1.2 (post-Codex review): 4.5/5, Codex estimated ~8.5/10 after these fixes

**Outstanding items not patched** (explicit deferrals):
- Facets route `COUNT(DISTINCT group_key)` switch — follow-up ticket (§12 item 4).
- Materialized `groupKey` column on `listing_search_docs` — follow-up ticket (§12 item 1).
- Cross-owner moderation queue productionization — follow-up ticket (§12 item 3).

Next step: hand off to Codex CLI for Phase 1 D1 implementation, starting with F1/F2/F5/F7 as a single coherent slice (they all touch `search-doc-queries.ts`). F6 follows in D2 as a separate PR to keep diff reviewable.

---

## 15. Codex v2 Second-Review Response — v1.3 amendments

Codex delivered a 6.5/10 THIRD-pass review on v1.2 (two Codex passes + one internal critic now layered). Three major findings, all verified against code, all patched in v1.3.

| ID | Severity | Finding | Independent verification | Mitigation in v1.3 |
|---|---|---|---|---|
| **v2-M1** | 🟠 Major | Room-type enum rollout missing backward-compat for filter-schema/CategoryTabs/filter-chip/saved-search-parser/search-alerts — all 5 still canonicalize on legacy strings | **Confirmed** — `filter-schema.ts:80-97` alias map outputs `"Private Room"` etc.; `saved-search-parser.ts:26,102` stores roomType verbatim; `search-alerts.ts:57,216,399` uses as direct DB filter key. Switching DB column to enum without compat layer silently breaks every SavedSearch row + quick filter + alert query. | NEW **§3.4a** backward-compat layer: `src/lib/search/room-type-aliases.ts` with `toRoomTypeEnum()`; wire into all 5 touch-points in Phase 2 D5a. SavedSearch.filters JSON backfill (Phase 2 D5b). NEW tests EC-046, EC-047. |
| **v2-M2** | 🟠 Major | Grouped-count fix said "SQL `COUNT(DISTINCT group_key)`" but `groupKey` is JS-computed (`normalize-listing-title.ts` + JS hash) — no DB column exists. Materialization deferred per §12. As written, a much bigger change than claimed. | **Confirmed** — `normalizeListingTitle` is JS-only; no Postgres function mirrors it; `listing_search_docs` has no materialized `groupKey` column. | F6 step 3 REVISED: explicit 3-option analysis → chose **(a) app-side grouped count** with narrow-projection query, `HIGH_COUNT_CAP=500`, `applyServerDedup` in-memory, "500+ matches" UI fallback. No SQL DISTINCT on groupKey, no Postgres function parity risk. Materialization remains §12 #1 future-ticket. |
| **v2-M3** | 🟠 Major | §3.2 semantics says `SHARED_ROOM` and `WHOLE_ROOM+SHARED` require `totalSlots = maxOccupancy`; §3.3 migration only enforces `maxOccupancy >= totalSlots` → `SHARED_ROOM totalSlots=2, maxOccupancy=4` passes CHECK but violates plan semantics. | **Confirmed** — §3.3 migration lacked the equality enforcement constraints. | Migration §3.3 gains 2 new CHECKs: `listing_shared_room_capacity_match` (`roomType <> 'SHARED_ROOM' OR maxOccupancy = totalSlots`) and `listing_whole_room_shared_capacity_match` (`roomType <> 'WHOLE_ROOM' OR booking_mode <> 'SHARED' OR maxOccupancy = totalSlots`). NEW test EC-048. |

**Confidence revision**: v1.3 → 🟢 **HIGH (4.6/5)**. Third review completed; plan is now thoroughly de-risked across schema-integrity, rollout-mechanics, compatibility, and observability dimensions.

**Rating progression**:
- v1.0 (pre-critic): 4.1/5 self-rated
- v1.1 (post-internal critic): 4.3/5
- v1.2 (post-Codex 1st review): 4.5/5
- **v1.3 (post-Codex 2nd review): 4.6/5**, Codex estimated ~8.5/10 after v1.2 fixes; these v1.3 additions should bring a fourth review ≥ 8.5.

**Still deferred (explicit — not patched in v1.3)**:
- Materialized `groupKey` column on `listing_search_docs` (§12 #1): the "500+ matches" cap from v2-M2 option (a) is acceptable until count accuracy becomes a user complaint, at which point this deferred migration unblocks true SQL `COUNT(DISTINCT)`.
- Facets route `COUNT(DISTINCT group_key)` (§12 #4): same dependency.
- Postgres function mirroring JS `normalizeListingTitle` — permanently rejected (v2-M2 option c) as parity-risky.

**Plan status**: v1.3 — execution-ready. Three rounds of review complete. Hand off to Codex CLI for Phase 1 D1 implementation.
