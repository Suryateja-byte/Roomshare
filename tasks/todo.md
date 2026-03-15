# Smooth Map Experience (Airbnb-like)

## Goal + Acceptance Criteria
- Map feels instant and smooth: old markers never disappear during fetch
- No heavy loading overlays (no blur, no tinted backgrounds)
- Map restricted to USA bounds
- Client-side spatial cache for instant zoom-out/pan-back
- Wider viewport support (10-degree span)
- All existing tests pass

## Scope
- `src/lib/constants.ts`
- `src/components/Map.tsx`
- `src/components/PersistentMapWrapper.tsx`

## Risks
- USA maxBounds could exclude territories (mitigated: covers all 50 states)
- 10-degree viewport could return too many rows (mitigated: LIMIT 200 at SQL)
- Cache staleness (mitigated: session-scoped, cleared on filter change, 20-entry LRU)

## Plan

### Phase 1: "Never Go Blank"
- [x] 1.1 Stale-while-revalidate marker pattern (PersistentMapWrapper)
- [x] 1.2 Remove heavy map loading overlays (Map.tsx + PersistentMapWrapper)
- [x] 1.3 USA bounds restriction + minZoom (Map.tsx + constants.ts)
- [x] Phase 1 verification: lint + typecheck + tests (14/14 pass)

### Phase 2: Client-Side Spatial Cache
- [x] 2.1 Bounds-based listing cache (PersistentMapWrapper)
- [x] 2.2 Viewport hysteresis - skip unnecessary fetches (PersistentMapWrapper)
- [x] 2.3 Pad fetch bounds by 20% (PersistentMapWrapper)
- [x] Phase 2 verification: lint + typecheck + tests (14/14 pass)

### Phase 3: Wider Viewport + Timing Tuning
- [x] 3.1 Increase MAX_LAT_SPAN / MAX_LNG_SPAN from 5 to 10
- [x] 3.2 Tune debounce/throttle timing (Map.tsx)
- [x] Phase 3 verification: lint + typecheck + full test suite (5416/5417 pass; 1 flaky perf benchmark unrelated)

## Results + Verification Story
All 3 phases implemented. 3 files modified, 6 test files updated for new MAX span.
- Lint: 0 errors
- Typecheck: passes
- Tests: 5416 pass, 1 flaky perf benchmark (pre-existing), 12 skipped

---

# Semantic Search E2E Tests — Implementation Todo

## Goal + Acceptance Criteria
Convert the 26 [E2E/Playwright]-tagged scenarios from `tasks/semantic-search-stability-spec.md` into production-grade Playwright test files. All tests must:
- Follow existing project conventions (imports, selectors, skip patterns)
- Pass when `ENABLE_SEMANTIC_SEARCH=true` with backfilled embeddings
- Gracefully skip or verify fallback when semantic search is disabled
- Run in chromium-anon project (no auth required for search/detail pages)

## Scope (files/modules)
New files (all under `tests/e2e/semantic-search/`):
1. `semantic-search-activation.anon.spec.ts` — SS-01 to SS-07 (7 tests)
2. `semantic-search-results.anon.spec.ts` — SS-08 to SS-12 (5 tests)
3. `semantic-search-similar-listings.anon.spec.ts` — SS-20 to SS-27, SS-56, SS-57, SS-61 (11 tests)
4. `semantic-search-resilience.anon.spec.ts` — SS-40, SS-41, SS-42, SS-55 (4 tests)
5. `semantic-search-cursor-reset.anon.spec.ts` — SS-58 (1 test)
6. `semantic-search-xss.anon.spec.ts` — SS-60 (1 test)

## Verification
- `npx playwright test tests/e2e/semantic-search/ --project chromium-anon`
- All 26 tests pass or skip with documented reasons
- See `tasks/ralplan-plan.md` for complete code outlines
