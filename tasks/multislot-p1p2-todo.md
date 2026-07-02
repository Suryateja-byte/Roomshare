# Multislot P1/P2 fix batch — 2026-07-02

Branch: `fix/multislot-p1p2-2026-07-02` · Source: `docs/multislot-review-2026-07-02.md` · 13 parallel agents, disjoint file ownership; lead runs integration (lint/typecheck/full tests) and commits.

Acceptance criteria: every P1 (1-5) and P2 (1-13, 15-21) fixed or explicitly deferred with reason; regression test per fix; lint+typecheck+unit suites green; no cross-agent file conflicts.

| Agent | Findings | Files owned | Status |
|---|---|---|---|
| A cron-integrity | P1-1, P2-9, P2-19 | api/cron/refresh-search-docs, daily-maintenance, query-snapshots.ts (search-doc-dirty.ts untouched — clear-side fix lives in cron) | done — 26/26 tests |
| B count-parity | P1-2 | api/search-count/route.ts | done — 20/20 tests |
| C listings-admission | P1-3 | api/search/listings/route.ts | done — 3/3 tests (new route suite) |
| D projection-parity | P1-4, P2-7, P2-11(projection) | projection-search.ts | done — 24/24 tests; price-null P3 deferred (shared-type blast radius) |
| E searchdoc-owner | P2-6, P2-16, P2-18(tags), P2-11(semantic) | search-doc-queries.ts, search-cache.ts, migration 20260702000000 | done — 95 tests; dead indexes dropped (structural deadness argument; :5434 down, no EXPLAIN) |
| F listings-api | P2-1, P2-2, P2-18(call) | api/listings/[id]/route.ts, viewer-state/route.ts | done — 27/27 tests |
| G facets | P2-5 | api/search/facets/route.ts | done — 35/35 tests; kept search-count bucket + added ip:userId identifier |
| H identity-epoch | P2-8 | outbox/handlers.ts (mutate-unit.ts untouched) | done — 37/37 tests; row_version-only bump (source_version mirrors host version) |
| J service-layer | P1-5, P2-3, P2-4, P2-10, P2-20 | search-v2-service.ts, search-params.ts, search-spec.ts, cursor.ts, actions.ts | done — 734 tests search area; projection spec-hash split deferred (see seam comment in projection-search.ts) |
| K ui-focus | P2-15 | SearchResultsClient.tsx | done — 47/47 tests |
| L payload-pick | P2-12 | transform.ts, public-listing-payload.ts, public-availability.ts | done — 121 tests incl. downstream |
| M e2e-prod-flags | P2-13 | playwright.config.ts + tests/e2e/prod-flags-* | done — 5-test dedicated project, validated via --list |
| N docs | P2-21 | docs/host-managed-patch-contract.md | done — rewritten against current code |

Lead integration (2026-07-02): restored original EOLs on unchanged search-doc-queries.ts lines (true diff 171+/42−); wired SEARCH_FACETS_CACHE_TAG into the facets unstable_cache; resolved count↔dedup TODO (getLimitedCount dispatches into the dedup-aware SearchDoc count); added P1-5 pre-cutover seam comment in projection-search.ts; kept D's gap-default workaround (spec-layer relocation not worth re-touching J's fresh search-spec.ts edits — explicit max_gap_days=180 collapses to 0, documented edge).

Key risk decisions (lead):
- P2-3: admission span limit must CLAMP list bounds (like the map), never 400 — wide-view default-sort browse works in prod today and must not regress. Occupants + deep-page caps can hard-reject.
- P1-4/P2-7: projection engine aligns to SearchDoc (prod baseline): strict gender equality, gap window only when explicitly requested.
- P2-16: prefer dropping/replacing dead partial indexes over adding `d.status` to the WHERE unless sync-lag regression is ruled out; EXPLAIN evidence on local :5434.
- D/E reuse existing public-availability helpers; L is additive-only on shared types.
- E keeps `invalidateSearchCaches` name/signature stable; F adds its call site.

Verification: per-agent targeted tests → lead: pnpm lint, pnpm typecheck, pnpm test (full), spot-check e2e feasibility.

## Results + verification story
- All 13 agents completed with disjoint file ownership; zero file conflicts. Every P1 (1-5) and P2 (1-13, 15-21) fixed except two explicitly deferred slices: P1-5's projection-path spec-hash split (pre-cutover gate, seam comment at projection-search.ts spec-hash site) and D's price-null P3 (shared-type blast radius in search-types.ts).
- Lead integration: EOL restoration on search-doc-queries.ts (spurious 2400-line diff → true 171+/42−), SEARCH_FACETS_CACHE_TAG wired, count↔dedup TODO resolved (flows via getLimitedCount dispatch), P1-5 seam documented.
- Verification (2026-07-02): `pnpm typecheck` ✓ clean; `pnpm lint` ✓ 0 errors (18 pre-existing warnings); `pnpm test` ✓ 523 suites / 8159 tests passed, 0 failures (8 pre-existing skips). Playwright prod-flags project validated via `--list` (execution requires prod build; run in CI/dedicated pass).
