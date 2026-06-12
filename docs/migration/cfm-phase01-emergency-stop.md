# CFM Phase 01 Canonical Writes — Emergency Stop Runbook

> **Flag**: `FEATURE_PHASE01_CANONICAL_WRITES`
>
> **Semantics**: emergency stop, NOT a cutover flag. Defaults **ON in every
> environment** (matching the always-on dark-write behavior shipped to date).
> Set to the literal string `false` to halt canonical writes. Any other value
> (including unset) means ON. Getter: `features.phase01CanonicalWrites`
> (`src/lib/env.ts`), read via `isPhase01CanonicalWritesEnabled()`
> (`src/lib/flags/phase01.ts`).
>
> **When to pull it**: the canonical sync is breaking host listing writes in
> production (e.g. `CanonicalInventorySyncError` 500s on listing create/PATCH)
> and a code fix can't ship immediately.

---

## What stops when the flag is `false`

Both producer seams early-return with a structured skip log:

- `syncCanonicalListingInventory` (`src/lib/listings/canonical-inventory.ts`)
  — skips unit resolve/create, `listing_inventories` upsert,
  `physical_units`/`host_unit_claims` writes, outbox appends
  (`INVENTORY_UPSERTED`, `UNIT_UPSERTED`, `GEOCODE_NEEDED`,
  `CACHE_INVALIDATE` from this path), and the inline projection rebuilds.
- `syncListingLifecycleProjectionInTx` (`src/lib/listings/canonical-lifecycle.ts`)
  — skips the lifecycle projection sync (including its internal tombstone path
  for paused/suppressed listings).

Skip signal (count it to size the repair backlog):

```
cfm.canonical.phase01_writes_skipped_count { reason: "flag_off", seam, listingId }
```

## What keeps running

- Host listing writes themselves (create/PATCH/status/delete) — the gate is
  inside the canonical sync, which is a sibling step in the host transaction.
- Search-doc dirty marking (`markListingDirtyInTx`) and search-doc sync — the
  v2 search read path is unaffected.
- **Payments** (`PAYMENT_WEBHOOK`) and **alert deliveries**
  (`ALERT_MATCH`/`ALERT_DELIVER`) — different producers, never gated.
- Identity-reconcile lane (`IDENTITY_MUTATION`).
- **Deletion-driven canonical teardown** (`tombstoneCanonicalInventoryInTx`)
  — deliberately ungated so deleting a listing can never strand a live
  projection row feeding the map read path.
- Outbox drain + `outbox-retention` cron task.

## Accepted degradation while the flag is off

Pause/suppress/availability transitions on existing listings do NOT propagate
to canonical tables or projections. If phase04 projection reads are enabled
anywhere, projections can serve stale data for listings modified during the
outage window.

## Recovery (after re-enabling the flag)

1. Remove the env var (or set `true`) and redeploy.
2. Re-sync listings modified during the window: any host/admin write to a
   listing re-runs the full canonical sync (a no-op edit is sufficient), or
   run the existing repair/backfill tooling for the affected listing IDs
   (collect them from the skip-log signal above).
3. Verify `outbox_events` accrues new `INVENTORY_UPSERTED` rows and (if
   phase02 is enabled) the drain completes them.

## Related kill switches (drain-side, unchanged by this runbook)

`KILL_SWITCH_DISABLE_NEW_PUBLICATION` also gates the **inline** projection
rebuild in `syncCanonicalListingInventory` (since H2): the outbox event is
still appended, so the drain converges projections once the switch lifts.
Tombstone/hide paths are never gated by it — the switch means "stop publishing
new data", never "stop hiding data".
