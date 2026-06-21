# /search Feature Audit — Fix Plan (2026-06-18)

Source: docs/search-audit-2026-06-18.md (49 confirmed defects; 0 critical/0 high; 10 medium, 23 low, 16 nit)
Baseline before work: lint PASS, typecheck PASS, search jest suites 2106 pass / 0 fail.

## Acceptance criteria
- All actioned fixes implemented surgically (no unrelated refactors).
- Regression test added for every behavioral change.
- Global verify green: `pnpm lint`, `pnpm typecheck`, search jest suites.
- Deferred items documented with rationale.

## Parallel fix groups (disjoint files)
- [ ] G1 sorting: projection-search.ts, projection-read-eligibility.ts, data.ts -> #3,#4,#16
- [ ] G2 ssr/seo: app/search/page.tsx, circuit-breaker.ts, app/search/actions.ts -> #2,#7,#45,#25
- [ ] G3 results-client: SearchResultsClient.tsx -> #5,#9,#17,#18,#19,#28,#33,U1
- [ ] G4 headings/wrapper/strip: SearchResultsMobileHeading.tsx, SearchResultsLoadingWrapper.tsx, InlineFilterStrip.tsx -> #48,#31,#1
- [ ] G5 map: Map.tsx, DynamicMap.tsx -> #20,#21,#22,#38,#39,#40
- [ ] G6 mobile sheet: SearchViewToggle.tsx, MobileBottomSheet.tsx, FloatingMapButton.tsx -> #6,#10,#43,#49,#42
- [ ] G7 filters: FilterModal.tsx, filter-chip-utils.ts, useBatchedFilters.ts, useDebouncedFilterCount.ts, useFacets.ts -> #15,#36,#37,#35,(#1 chip)
- [ ] G8 saved-search/fav: saved-search-canonical.ts, actions/saved-search.ts, api/favorites/route.ts -> #8,#30,#29
- [ ] G9 url/cache/const: SearchUrlCanonicalizer.tsx, PersistentMapWrapper.tsx, constants.ts -> #24,#23,#41
- [ ] G10 cards: SplitStayCard.tsx, ListingCardCarousel.tsx, ListingCardSkeleton.tsx, ListScrollBridge.tsx -> #27,#46,#47,#32
- [ ] G11 searchbar: DatePills.tsx, search-intent.ts, LocationSearchInput.tsx -> #11,#12,#13
- [ ] G12 telemetry: search-telemetry.ts, api/metrics/ops/route.ts -> #26

## Deferred (rationale)
- #44 redundant lat/lng+bounds -- cosmetic, center vs viewport both used -> WONTFIX
- #34 budget min>max swap -- intentional forgiving behavior (documented)
- #14 bookingMode UI -- half-wired; product decision. SEO over-count fixed via #2.
- U2 UTM stripping -- no analytics layer consumes UTM yet; revisit when added.

## Verification
- [x] Global lint (exit 0) / typecheck (exit 0)
- [x] Search jest suites: 7447 passed / 0 failed (467 suites; ~30 new regression tests)
- [x] Diff review per group (reviewed #7 cursor, sort eligibility, #18 loop, map viewedIds/popup)
- [x] EOL pollution fixed byte-level (data.ts 8/4, SplitStayCard 4/4)

## Results + verification story
All 12 groups landed (45 of 49 confirmed findings fixed; 4 deferred per rationale above).
Two integration issues caught by the global gate and fixed:
1. #25 (circuit-breaker threshold 3→1) broke `actions.test.ts` isolation (singleton trips after
   the V2-timeout test) AND was aggressive for prod → reverted threshold to 3, kept the
   per-lambda-instance doc comment.
2. #48 heading-id rename left the old id in `DesktopHeaderSearch.test.tsx` fixture + the
   `filter-chip-utils` endDate test used past dates (dropped by date normalization) → fixed
   the fixture id and added the fake-clock the sibling date tests use.
Deleted dead code: ListingCardCarousel.tsx, DatePills.tsx (+ orphaned doc refs).
NOT run locally: Playwright e2e (needs prod build + DB per project memory); the 6 e2e spec
edits are mechanical `#search-results-heading` → `-desktop`/`-mobile` selector updates.
NOT committed (on `main`; awaiting user go-ahead to branch + PR).
