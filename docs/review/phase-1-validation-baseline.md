# Phase 1 Validation Baseline

## Context

- Timestamp: 2026-05-16T19:58:49-05:00
- Shell/path: WSL Ubuntu via `wsl -d Ubuntu --cd /home/surya/roomshare -- ...`
- Repo path confirmed by `pwd`: `/home/surya/roomshare`
- Branch: `codex/search-ux-fixes`
- Scope: validation baseline only; no app code fixes attempted.
- Allowed file changed by this task: `docs/review/phase-1-validation-baseline.md`

## Environment

| Command | Result |
| --- | --- |
| `pwd` | `/home/surya/roomshare` |
| `git branch --show-current` | `codex/search-ux-fixes` |
| `node --version` | `v22.22.0` |
| `pnpm --version` | `10.27.0` |
| `pnpm exec prisma --version` | Pass; Prisma `6.19.3`, `@prisma/client 6.19.3`, Linux x64, Node `v22.22.0` |
| `pnpm exec next --version` | `Next.js v16.2.4` |
| `pnpm exec eslint --version` | `v9.39.4` |
| `pnpm exec jest --version` | `30.2.0` |

Note: Prisma CLI reported that environment variables were loaded from `.env`, but no values were inspected or recorded.

## Command Results

| Order | Command | Exit | Classification | Result |
| --- | --- | ---: | --- | --- |
| 1 | `pnpm run typecheck` | 0 | Pass | Prisma Client generated, Next route types generated, `tsc --noEmit` completed. |
| 2 | `pnpm run lint` | 0 | Pass with warnings | ESLint completed with `0 errors, 19 warnings`. |
| 3 | `pnpm test -- --runInBand` | 1 | Config | Jest did not run tests because `--runInBand` was treated as a pattern and matched zero tests. |
| 4 | `pnpm run build` | 0 | Pass with warnings | Production build completed; warnings were emitted for custom Cache-Control headers, Sentry/OpenTelemetry dynamic dependency traces, and edge runtime static-generation behavior. |
| Optional | `pnpm scan:public-payload-pii` | Not run | Not applicable | Skipped because not all baseline checks passed. |

## First Real Blocker

`pnpm test -- --runInBand` failed before app tests ran.

Smallest useful excerpt:

```text
> NODE_OPTIONS=--experimental-vm-modules jest -- --runInBand

No tests found, exiting with code 1
Pattern: --runInBand - 0 matches
```

Classification: `config`.

Reasoning: the command reached WSL/Linux and launched Jest, but the project test script includes `jest --`, causing the forwarded `--runInBand` argument from `pnpm test -- --runInBand` to be interpreted as a test pattern instead of a Jest option.

## Trustworthiness

Validation is now trustworthy for WSL/Linux command execution: Node, pnpm, Prisma, Next, ESLint, Jest version checks, typecheck, lint, and build all ran from `/home/surya/roomshare`.

The overall baseline is only partially trustworthy because the Jest suite did not actually execute. This is not the previous Windows-side binary/script failure; it is a repo command/config invocation blocker.

## Remaining Unknowns

- Actual Jest suite health from WSL after `--runInBand` is passed to Jest correctly.
- Whether the 19 ESLint warnings are acceptable for the release baseline.
- Whether the build warnings indicate release risk or known framework/library noise.
- Whether `pnpm scan:public-payload-pii` exists and passes, because it was correctly skipped after the Jest baseline failed.
- Ownership and intended state of the pre-existing dirty worktree.

## Recommended Next Single Task

Fix the Jest baseline invocation so `--runInBand` reaches Jest as an option, then rerun only the Jest baseline from WSL before broadening validation.

## Git Status After Task

Recorded from WSL after creating this report:

```text
 M .gitignore
 M AGENTS.md
 M docs/features/documentation-inventory.md
 M docs/features/search-map/02-user-flows.md
 M docs/features/search-map/03-interaction-census.md
 M docs/features/search-map/05-api-contracts.md
 M docs/features/search-map/06-data-model-and-invariants.md
 M docs/features/search-map/07-state-management.md
 M docs/features/search-map/08-auth-security-permissions.md
 M docs/features/search-map/09-errors-empty-loading-edge-cases.md
 M docs/features/search-map/10-performance-observability.md
 M docs/features/search-map/11-test-traceability-matrix.md
 M docs/features/search-map/12-gaps-unknowns-and-questions.md
 M docs/features/search-map/13-url-search-param-reference.md
 M docs/features/search-map/README.md
 M docs/features/search-map/evidence-register.md
 M docs/features/search-map/human-review-notes.md
 M docs/features/search-map/manifest.json
 M docs/features/search-map/phase-4/01-ui-interaction-census.md
 M docs/features/search-map/phase-4/02-api-data-flow.md
 M docs/features/search-map/phase-4/04-auth-security-permissions.md
 M docs/features/search-map/phase-4/05-test-traceability.md
 M docs/features/search-map/round-trip-review.md
 M docs/features/search-map/runtime-verification.md
 M docs/features/search-map/unknowns.md
 M docs/features/search-map/verification.json
 M scripts/seed-listings.js
 M src/__tests__/api/geocoding/autocomplete/route.test.ts
 M src/__tests__/api/listings-post.test.ts
 M src/__tests__/components/CreateListingForm.test.tsx
 M src/__tests__/components/ListingCard.test.tsx
 M src/__tests__/components/LocationSearchInput/LocationSearchInput.sanitization.test.tsx
 M src/__tests__/components/Map.test.tsx
 M src/__tests__/components/PersistentMapWrapper.networking.test.tsx
 M src/__tests__/components/SearchForm.test.tsx
 M src/__tests__/components/listings/ImageCarousel.test.tsx
 M src/__tests__/components/listings/SlotBadge.test.tsx
 M src/__tests__/components/search/DesktopHeaderSearch.test.tsx
 M src/__tests__/components/search/FilterModal.test.tsx
 M src/__tests__/components/search/InlineFilterStrip.test.tsx
 M src/__tests__/components/search/MobileSearchOverlay.test.tsx
 M src/__tests__/components/search/SearchResultsClient.test.tsx
 M src/__tests__/components/ui/button.test.tsx
 M src/__tests__/components/ui/input.test.tsx
 M src/__tests__/db/semantic-embedding-isolation-migration.test.ts
 M src/__tests__/lib/create-listing-schema.test.ts
 M src/__tests__/lib/geocoding.test.ts
 M src/__tests__/lib/geocoding/nominatim-api.test.ts
 M src/__tests__/lib/geocoding/public-autocomplete.test.ts
 M src/__tests__/lib/maps/marker-utils.test.ts
 M src/__tests__/lib/projections/geocode-worker.test.ts
 M src/__tests__/lib/search/search-v2-service.test.ts
 M src/app/api/geocoding/autocomplete/route.ts
 M src/app/listings/[id]/edit/EditListingForm.tsx
 M src/app/listings/create/CreateListingForm.tsx
 M src/app/listings/create/ProfileWarningBanner.tsx
 M src/components/LocationSearchInput.tsx
 M src/components/Map.tsx
 M src/components/NavbarClient.tsx
 M src/components/NotificationCenter.tsx
 M src/components/PersistentMapWrapper.tsx
 M src/components/SaveSearchButton.tsx
 M src/components/SearchForm.tsx
 M src/components/SearchHeaderWrapper.tsx
 M src/components/ZeroResultsSuggestions.tsx
 M src/components/filters/AppliedFilterChips.tsx
 M src/components/listings/ImageCarousel.tsx
 M src/components/listings/ListScrollBridge.tsx
 M src/components/listings/ListingCard.tsx
 M src/components/listings/SlotBadge.tsx
 M src/components/map/MapEmptyState.tsx
 M src/components/map/MobileMapStatusCard.tsx
 M src/components/search/DesktopHeaderSearch.tsx
 M src/components/search/FilterModal.tsx
 M src/components/search/InlineFilterStrip.tsx
 M src/components/search/MobileSearchOverlay.tsx
 M src/components/search/SearchResultsClient.tsx
 M src/components/search/SearchUrlCanonicalizer.tsx
 M src/components/search/SplitStayCard.tsx
 M src/components/skeletons/PageSkeleton.tsx
 M src/components/skeletons/Skeleton.tsx
 M src/components/ui/badge.tsx
 M src/components/ui/button.tsx
 M src/components/ui/input.tsx
 M src/contexts/SearchTransitionContext.tsx
 M src/hooks/useBatchedFilters.ts
 M src/lib/geocoding.ts
 M src/lib/geocoding/autocomplete.ts
 M src/lib/geocoding/nominatim.ts
 M src/lib/geocoding/photon.ts
 M src/lib/geocoding/public-autocomplete.ts
 M src/lib/maps/marker-utils.ts
 M src/lib/projections/geocode-worker.ts
 M src/lib/schemas.ts
 M src/lib/search-types.ts
 M src/lib/search/search-doc-queries.ts
 M src/lib/search/testing/search-scenarios.ts
 M tests/e2e/create-listing/create-listing.spec.ts
 M tests/e2e/create-listing/create-listing.visual.spec.ts
 M tests/e2e/create-listing/create-listing.visual.spec.ts-snapshots/create-listing-errors-desktop-chromium-linux.png
 M tests/e2e/create-listing/create-listing.visual.spec.ts-snapshots/create-listing-errors-mobile-chromium-linux.png
 M tests/e2e/create-listing/create-listing.visual.spec.ts-snapshots/create-listing-filled-desktop-chromium-linux.png
 M tests/e2e/create-listing/create-listing.visual.spec.ts-snapshots/create-listing-progress-partial-chromium-linux.png
 M tests/e2e/dedupe/create-collision-cross-owner-no-modal.dedupe.spec.ts
 M tests/e2e/dedupe/create-collision-fourth-gated.dedupe.spec.ts
 M tests/e2e/dedupe/create-collision-helpers.ts
 M tests/e2e/dedupe/create-collision-modal-add-date.dedupe.spec.ts
 M tests/e2e/dedupe/create-collision-modal-create-separate.dedupe.spec.ts
 M tests/e2e/dedupe/create-collision-modal-update.dedupe.spec.ts
 M tests/e2e/dedupe/search-list-4-clone-grouping.dedupe.spec.ts
 M tests/e2e/dedupe/search-list-canonical-routing.dedupe.spec.ts
 M tests/e2e/dedupe/search-list-expand-panel.dedupe.spec.ts
 M tests/e2e/dedupe/search-list-keyboard-contract.dedupe.spec.ts
 M tests/e2e/dedupe/search-list-selectors-map-list-parity.dedupe.spec.ts
 M tests/e2e/helpers/filter-helpers.ts
 M tests/e2e/helpers/mobile-helpers.ts
 M tests/e2e/helpers/pagination-mock-factory.ts
 M tests/e2e/listing-edit/listing-edit.spec.ts
 M tests/e2e/map-errors-a11y.anon.spec.ts
 M tests/e2e/map-features.anon.spec.ts
 M tests/e2e/map-search-results.anon.spec.ts
 M tests/e2e/page-objects/create-listing.page.ts
 M tests/e2e/pages/SearchPage.ts
 D tests/e2e/search-filters/filter-category-bar.anon.spec.ts
 M tests/e2e/search-filters/filter-chips.anon.spec.ts
 M tests/e2e/search-filters/filter-combinations.anon.spec.ts
 M tests/e2e/search-filters/filter-near-matches.anon.spec.ts
 M tests/e2e/search-filters/filter-pagination-interaction.anon.spec.ts
 M tests/e2e/search-filters/filter-persistence.anon.spec.ts
 M tests/e2e/search-filters/filter-race-conditions.anon.spec.ts
 D tests/e2e/search-filters/filter-recommended.anon.spec.ts
 M tests/e2e/search-filters/filter-reset.anon.spec.ts
 M tests/e2e/search-filters/filter-room-type.anon.spec.ts
 M tests/e2e/search-filters/filter-url-desync.anon.spec.ts
 M tests/e2e/search-filters/filter-validation.anon.spec.ts
 M tests/e2e/search-map-list-sync.anon.spec.ts
 M tests/e2e/semantic-search/semantic-search-results.anon.spec.ts
 M tests/e2e/semantic-search/semantic-search-similar-listings.anon.spec.ts
?? .repomixignore
?? docs/ai/
?? docs/create-listing-e2e-test-matrix.md
?? docs/features/contact-host-slot-availability/
?? docs/review/code_review.md
?? docs/review/phase-1-validation-baseline.md
?? docs/review/risk_register.md
?? docs/review/system_map.md
?? docs/search-e2e-test-matrix.md
?? playwright/.cache/
?? prisma/migrations/20260515030000_fix_semantic_score_casts/
?? scripts/ai/
?? src/__tests__/app/listings/ProfileWarningBanner.test.tsx
?? src/__tests__/components/LowResultsGuidance.test.tsx
?? src/__tests__/components/skeletons/PageSkeleton.test.tsx
?? src/__tests__/components/ui/status-notice.test.tsx
?? src/__tests__/scripts/seed-e2e.test.ts
?? src/components/search/HeaderFilterDrawer.tsx
?? src/components/ui/status-notice.tsx
?? src/lib/search/pending-search-navigation.ts
?? tests/e2e/create-listing/create-listing-api-security.spec.ts
?? tests/e2e/create-listing/create-listing-auth-gates.spec.ts
?? tests/e2e/create-listing/create-listing-booking-languages.spec.ts
?? tests/e2e/create-listing/create-listing-draft-guard.spec.ts
?? tests/e2e/create-listing/create-listing-image-advanced.spec.ts
?? tests/e2e/create-listing/create-listing-post-publish-search.spec.ts
?? tests/e2e/create-listing/create-listing.visual.spec.ts-snapshots/create-listing-images-desktop-chromium-linux.png
?? tests/e2e/dedupe/create-collision-modal-cancel.dedupe.spec.ts
?? tests/e2e/fixtures/auth.fixture.ts
?? tests/e2e/fixtures/mapbox.fixture.ts
?? tests/e2e/fixtures/network-errors.fixture.ts
?? tests/e2e/listing-edit/listing-management-actions.spec.ts
?? tests/e2e/listing-edit/seed-manifest.ts
?? tests/e2e/pages/FilterModal.ts
?? tests/e2e/pages/ListingCard.ts
?? tests/e2e/pages/MobileSearchOverlay.ts
?? tests/e2e/pages/SavedSearchModal.ts
?? tests/e2e/search/search-budget-validation.spec.ts
?? tests/e2e/search/search-filters.spec.ts
?? tests/e2e/search/search-listing-card.spec.ts
?? tests/e2e/search/search-location.spec.ts
?? tests/e2e/search/search-map-mobile.spec.ts
?? tests/e2e/search/search-pagination.spec.ts
?? tests/e2e/search/search-results-states.spec.ts
?? tests/e2e/search/search-saved-listing.spec.ts
?? tests/e2e/search/search-saved-search.spec.ts
?? tests/e2e/search/search-security.spec.ts
?? tests/e2e/search/search-smoke.spec.ts
?? tests/e2e/search/search-url-state.spec.ts
?? tests/e2e/utils/cursorAssertions.ts
?? tests/e2e/utils/resetE2EData.ts
?? tests/e2e/utils/seedSearchData.ts
```
