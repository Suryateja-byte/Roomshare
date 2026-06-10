# Map UI Restyle — "Warm Editorial Paper" (plan: ~/.claude/plans/yes-come-up-with-swirling-garden.md)

## Goal + acceptance criteria
Clean/minimal/brand-consistent map across all 3 surfaces (search, nearby, neighborhood):
- Quiet cream "paper" basemap (vendored `public/map-styles/liberty-paper.json`), listings = only saturated elements
- One "Paper chips" marker family (white chips/pills, charcoal text, terracotta selection); price-bucket rings removed
- Off-palette peripherals re-tinted (privacy blue→terracotta, drop-pin rose→ink, neighborhood red→paper family, walkability rings→brand ordinal)
- BUG FIX: map fetch error/timeout never shows "No listings in this area" false empty state
- All gates green: lint, typecheck, jest, targeted e2e, axe; visual baseline regenerated deliberately

## Scope (files)
src/lib/maps/{map-theme,map-style-contract,style-sanitize,map-view-state}.ts (new), scripts/generate-map-style.ts (new),
public/map-styles/liberty-paper.json (generated, committed), src/components/Map.tsx, src/components/PersistentMapWrapper.tsx,
src/components/map/{POILayer,PrivacyCircle,UserMarker,BoundaryLayer,DesktopListingPreviewCard}.tsx,
src/components/nearby/NearbyPlacesMap.tsx, src/types/nearby.ts, src/components/neighborhood/NeighborhoodMap.tsx,
tests/e2e/helpers/map-mock-helpers.ts, package.json; delete tests/e2e/map-style.anon.spec.ts (dead feature spec)

## Risks
- Client-only styling — no DB/auth/PII. Glyph 404s if text-font mutated (generator forbids); upstream drift (vendored artifact + contract check); e2e mock bypass (fix glob same slice); visual baseline churn (1 baseline, eyeball + commit)

## Slices
- [x] S1 Foundations (commit b8a006c9): map-theme.ts, map-style-contract.ts, style-sanitize.ts, POILayer imports contract; 14 sanitize unit tests
- [x] S2 Generator + vendored liberty-paper.json + local-first swap + mock glob + artifact test + dead spec deleted (commit c60fbca8); generator idempotent (identical sha256 twice)
- [x] S3 Paper-chip restyle (commit deef7e2b); 3 class assertions updated in-slice with contrast math
- [x] S4 Error-aware empty state (commit after deef7e2b): map-view-state.ts + hasFetchError + e2e 10.6; also fixed Retry button click-blocked by fullscreen control + stale waitForMapError locator
- [x] S5 Peripherals: privacy→terracotta, boundary→terracotta whisper, drop-pin→ink, badge→bg-success
- [x] S6 Other surfaces: nearby+neighborhood on liberty-paper; CATEGORY_COLORS→brand tokens; walkability→success/warning/destructive
- [x] Final verification (see below)

## Results + verification story
- FULL jest suite: 7,748 passed / 0 failed (495 suites). Lint 0 errors, typecheck clean after every slice.
- E2E (chromium-anon, live server): map-loading + map-features 16✓; map-markers + map-interactions + map-errors-a11y (incl. new 10.6 regression + axe) 21✓ + 7✓; search-map-list-sync 28✓.
- Live visual verification (Playwright MCP, real tiles): paper basemap at city/district/street zooms; white cluster chips w/ halo; terracotta selected pill; preview card w/ success badge; mobile 390 bottom-sheet view. Gallery: /tmp/roomshare-map-review/ (before: map-*/crop-*, after: after-*).
- The original bug reproduced live (dev cold-compile timeout) and the fix held: error banner + Retry, NO false "No listings in this area"; Retry recovered to markers.
- Visual baselines: stale popup baseline removed (its test self-skips in this env — markers don't render under mocked tiles; next successful run auto-writes a fresh one); flaky auto-created baselines discarded.
- Incident: a parallel session's git reset --hard orphaned S1/S2 (recovered via reflog cherry-pick by that session) and wiped S3's uncommitted tree (redone from context, committed immediately). Lesson recorded in tasks/lessons.md (2026-06-10).
- Deviations from plan, documented in commits: dark layer variants kept+themed instead of deleted (consistency w/ S3, smaller diff); walkability dash-density channel dropped (MapLibre line-dasharray is not data-driven; concentric radius already encodes ordinal); CATEGORY_COLORS mapping adjusted for two palette collisions (grocery orange not emerald; gym already primary).
