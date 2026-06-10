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
- [ ] S1 Foundations: map-theme.ts, map-style-contract.ts, style-sanitize.ts (pure move out of Map.tsx), POILayer imports contract; sanitize unit tests → lint/typecheck/jest + dev smoke
- [ ] S2 Generator + vendored liberty-paper.json + Map.tsx local-first swap + map-mock-helpers glob + artifact contract test + delete dead map-style spec → idempotence + e2e map-loading/map-features + POI toggle check
- [ ] S3 Paper-chip restyle (cluster layers, ring removal, MarkerPinContent, focus ring, dimmed) → jest + targeted e2e + visual baseline regen + axe
- [ ] S4 Error-aware empty state (map-view-state.ts + hasFetchError prop + wrapper wiring) + unit matrix + e2e 500-route regression
- [ ] S5 Peripherals (PrivacyCircle, UserMarker, BoundaryLayer, preview-card badge)
- [ ] S6 Other surfaces (NearbyPlacesMap, CATEGORY_COLORS, NeighborhoodMap incl. walkability)
- [ ] Final verification: full gates + before/after screenshot gallery (desktop 1440 / mobile 390, z9/z12/z15)

## Results + verification story
(fill as slices complete)
