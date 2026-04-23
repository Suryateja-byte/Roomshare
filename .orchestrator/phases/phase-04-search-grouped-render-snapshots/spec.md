# Phase 04: Search, Grouped Render, Snapshots & Pagination

## Goal

Cut V2 search over to projection-backed reads behind `FEATURE_PHASE04_PROJECTION_READS`,
group public results by `unit_id` at the active identity epoch, and pin list/map/pagination
to `query_snapshots` containing projection epoch and model/ranker versions.

## Success Criteria

1. With the Phase 04 flag enabled, public V2 search reads `inventory_search_projection`,
   `unit_public_projection`, and, for semantic queries, `semantic_inventory_projection`.
2. Search results render one public card/map feature per `unit_id:unit_identity_epoch`.
3. List and map responses for the same query share the same `query_snapshot_id`.
4. Snapshot pagination is stable across embedding/ranker/projection version changes.
5. Expired or contract-mismatched snapshots return structured `snapshot_expired` responses.
6. Tombstoned/missing units are filtered during snapshot hydration and backfilled up to page size.
7. `force_list_only`, `force_clusters_only`, and semantic-disable kill switches are covered.
8. Required Phase 04, Phase 03, Phase 02, search, typecheck, lint, and Prisma checks pass.

## Ordered Slices

1. Schema and fixtures: additive Prisma migration, schema model updates, PGlite Phase 04 fixture,
   and schema regression tests.
2. Contracts: SearchSpec validator, version-aware query hash, snapshot helper extensions,
   cursor v4, and response metadata additions.
3. Projection reads: filter and semantic projection candidate helpers, active-epoch grouping,
   grouped list/map adapter, and no legacy search-doc reads when Phase 04 reads are enabled.
4. Routes and UI: shared snapshot behavior across list/map/count routes, snapshot-expired
   refresh cue, kill switches, and telemetry.
5. Artifacts and approval: implementation note, validation evidence, Critic verdict, approval
   marker, and state advancement to Phase 05 after approval.

## Target Subsystems

- `prisma/schema.prisma` and additive migrations for projection and snapshot columns.
- `src/lib/search/*` for spec validation, hash/cursor/snapshot contracts, projection reads,
  V2 orchestration, response metadata, and telemetry.
- `src/lib/env.ts` and `src/lib/flags/*` for Phase 04 flags and kill switches.
- `src/app/api/search/*`, `src/app/api/map-listings/route.ts`, and
  `src/app/api/search-count/route.ts` for shared projection snapshot behavior.
- `src/components/search/SearchResultsClient.tsx` for snapshot expiry UX and telemetry.
- `src/__tests__/*` for Phase 04 schema/contract/projection/route/UI coverage.

## Invariants

- Keep the cutover rollback-safe: `FEATURE_PHASE04_PROJECTION_READS=false` preserves the
  existing search-doc/legacy V2 behavior.
- Do not introduce production dependencies.
- Preserve unrelated dirty worktree changes and avoid broad refactors.
- Public search responses must not read raw address or exact coordinate fields when the
  Phase 04 projection path is enabled.
- Snapshot metadata must include the selected projection epoch, embedding version, ranker
  profile version, and identity epoch floor.

## Migration Notes

- Migration is expand-only: add nullable/card-safe columns to `unit_public_projection` and
  additive columns/indexes to `query_snapshots`.
- Existing rows remain valid via defaults and nullable columns.
- Rollback is column/index removal only:
  `DROP INDEX IF EXISTS ...; ALTER TABLE ... DROP COLUMN IF EXISTS ...`.

## Validation Commands

- `pnpm test -- --runTestsByPath <Phase 04 targeted set> --runInBand`
- `pnpm test -- --runTestsByPath <Phase 03 targeted set> --runInBand`
- `pnpm test -- --runTestsByPath <Phase 02 focused set> --runInBand`
- `pnpm test -- --runTestsByPath <search focused set> --runInBand`
- `pnpm exec prisma validate`
- `pnpm typecheck`
- `pnpm lint`
- Optional: `pnpm test --runInBand`, with known unrelated heap/OOM evidence recorded if it recurs.

## Research Summary

No external browsing was required. The implementation is based on the repo-local Phase 04
spec in `.orchestrator/phases.md`, master-plan v10, and existing Phase 02/03 projection
helpers and tests.
