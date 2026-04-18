# rs-dedupe-plan — Execution Todo

**Source plan:** `.claude/artifacts/rs-dedupe-plan/FINAL-PLAN.md` (both planners signed 2026-04-18)
**Branch:** `codex/contact-first-multislot`
**Executor model:** Codex (generator) + Claude coordinator (commits) + critic pass between tasks

## Task sequence

Each task is a fresh Codex prompt. Critic pass between tasks. Coordinator commits after critic green-light.

- [x] **Task 1 — Foundation utilities (pure TS, no side effects)** — commit `361858bd` (2026-04-18). 19 tests pass. Critic APPROVE_WITH_NITS (non-blocking).
  - `src/lib/env.ts`: add `searchListingDedup`, `listingCreateCollisionWarn` flags (default OFF)
  - `src/lib/search/normalize-listing-title.ts` (new)
  - `src/lib/search/normalize-address.ts` (new, TS canonical per arch advisory)
  - `src/lib/search/dedup.ts` (new): `buildGroupKey()` + `groupListings()` pure functions
  - `src/lib/search-types.ts`: additive `GroupSummary` interface + optional `groupKey` / `groupSummary` on `ListingData`
  - Unit tests for all of the above (see FINAL-PLAN §7 invariants I1, I2, I3)
  - Acceptance: `pnpm lint && pnpm typecheck && pnpm test` green; all new tests cover invariants.
  - **No DB changes. No server wiring. No UI.** Pure foundation.

- [x] **Task 2 — Prisma migration (written, not applied)** — migration dir `20260418171531_add_listing_normalized_address`. Option B chosen: no SQL function, TS backfill. 6 tests pass. Critic APPROVE_WITH_NITS (2 non-blocking). **User gate pending: `prisma migrate deploy` against staging.**
  - `prisma/schema.prisma`: add `Listing.normalizedAddress String?`
  - `prisma/migrations/<timestamp>_add_listing_normalized_address/migration.sql`: ADD COLUMN + index + SQL function + chunked backfill skeleton
  - Rollback note + data-safety note
  - **USER GATE:** Coordinator runs `prisma migrate dev` only after user confirms staging-first run.

- [ ] **Task 3 — Server dedup wiring + cache-key isolation**
  - `src/lib/search/search-doc-queries.ts`: call `groupListings()` post-fetch when `searchListingDedup === true`, preserve ordering, emit `groupKey` + `groupSummary`
  - `expandWithNearMatches` + `findSplitStays`: skip by `groupKey`
  - Cache-key bump: add `dedup: "v1" | "off"` slot
  - Integration tests: T-06, T-07, T-09', T-10, T-11, T-12, T-15 server, T-21 (FINAL-PLAN §8.1)

- [ ] **Task 4 — Collision detection in createListingInTx**
  - `src/app/api/listings/route.ts`: `tx.$queryRaw` collision check inside tx, rate-limit 4/24h → `needsMigrationReview=true`
  - Write-path sync of `normalizedAddress`
  - Integration tests: I7, I8, I9, T-20 server, API-probe spec

- [ ] **Task 5 — List UI grouping**
  - `ListingCard.tsx`: "+N more dates" affordance
  - `GroupDatesPanel.tsx` (new): desktop inline expand
  - `GroupDatesModal.tsx` (new): mobile modal (no new bottom-sheet snap)
  - `SearchResultsClient.tsx`: pass summary, `seenGroupKeysRef`
  - Playwright: T-01, T-02 (the bug!), T-03, T-04, T-05, T-08, T-13, T-14, T-15 selectors

- [ ] **Task 6 — CreateCollisionModal + client retry**
  - `CreateCollisionModal.tsx` (new): 3 radios per §4.3 with `canUpdate` gating
  - Client POST /api/listings retries with `x-collision-ack: 1`
  - Playwright: T-16, T-17, T-18, T-19, T-20 visual

- [ ] **Task 7 — Seed purge dry-run script + runbook**
  - `scripts/cleanup-seed-duplicates.ts`: dry-run + apply modes, booking-FK check abort
  - Runbook per FINAL-PLAN §6.2
  - **USER GATE:** Coordinator runs `--apply` only after user provides owner/title scope + signs PR.

## Open questions queued for user

From FINAL-PLAN §12 / §14 advisory notes — will default if unanswered before the relevant task:

1. Seed-cleanup scope: which `ownerId` set or title prefix? *(Task 7 blocker)*
2. Duplex pre-select when unit token differs? *(Task 6, default: always force radio)*
3. Rate-limit collisions/24h? *(Task 4, default: 4)*
4. `"#4b"` vs `"unit 4b"` collide? *(Task 1, default: distinct)*
5. Hard `UNIQUE (ownerId, normalizedAddress)` constraint? *(Deferred 30d; Task 4 irrelevant)*

## Results + Verification story

_To be filled as tasks complete._
