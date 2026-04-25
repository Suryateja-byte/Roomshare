# Embedding Shadow Swap Runbook

Phase 03 builds semantic rows dark in `semantic_inventory_projection`.
Live public search must not read this table until Phase 04 cutover.

## Preconditions

- `FEATURE_PHASE03_SEMANTIC_PROJECTION_WRITES=true` only in the environment running the build.
- `KILL_SWITCH_PAUSE_EMBED_PUBLISH` is not set.
- Target-version rows exist with `publish_status='SHADOW'`.
- Tombstone, suppression, and pause events have drained before the final swap check.

## Drill

1. Build target-version rows with the embedding worker.
2. Verify row counts and quality overlap externally.
3. Dry-run the swap:

```bash
npx tsx scripts/embedding-shadow-swap.ts --target=<new-version> --previous=<old-version> --min-rows=50 --dry-run
```

4. Execute the swap:

```bash
npx tsx scripts/embedding-shadow-swap.ts --target=<new-version> --previous=<old-version> --min-rows=50
```

5. Confirm only the target version has `PUBLISHED` rows for newly built inventory.

## Rollback

Set `KILL_SWITCH_ROLLBACK_EMBEDDING_VERSION=<old-version>` to point dark
candidate helpers back to the prior published version. If embed provider quality
or cost is degraded, also set `KILL_SWITCH_PAUSE_EMBED_PUBLISH=true`.
