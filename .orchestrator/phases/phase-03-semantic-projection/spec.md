# Phase 03: Semantic Projection

## Goal

Introduce a dark, versioned `semantic_inventory_projection` pipeline that can
build and swap embedding versions without cutting live public search reads over
until Phase 04.

## Scope

- Additive pgvector-backed semantic projection schema.
- `EMBED_NEEDED` outbox event handling.
- `PENDING_PROJECTION` to `PENDING_EMBEDDING` publication handoff when Phase 03
  projection writes are enabled.
- Dark candidate helper pinned to one `embedding_version`.
- Semantic tombstone fan-out for active and shadow rows.
- Shadow-swap script and runbook.

## Acceptance Criteria

1. Filter projection publish moves eligible inventories to `PENDING_EMBEDDING`
   and enqueues `EMBED_NEEDED`.
2. Embed handling writes a `PUBLISHED` semantic projection row at the build
   embedding version, updates `last_embedded_version`, and moves inventory to
   `PUBLISHED`.
3. Semantic writes are source-version ordered; stale events do not overwrite
   newer rows.
4. Provider or budget failures leave inventory in `PENDING_EMBEDDING` for retry.
5. `pause_embed_publish` requeues embedding work without deleting active rows.
6. Candidate reads include only `PUBLISHED` rows at the selected read version.
7. Tombstones remove semantic rows for both active and shadow versions.
8. Shadow swap publishes the target version and marks the prior version stale.
9. Live search services do not read `semantic_inventory_projection` in Phase 03.
10. Phase 03 focused tests, Phase 02 focused tests, embedding tests,
    `pnpm typecheck`, and `pnpm lint` pass before approval.
