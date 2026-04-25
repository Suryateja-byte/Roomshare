# CFM Backfill Runbook

> **Scope**: operational runbook for `scripts/cfm-migration-backfill.ts` in CFM-502.
>
> **Purpose**: dry-run, apply, verify, and roll back the conservative host-managed backfill without widening scope beyond the approved clean-cohort conversion and blocked/manual review stamping paths.
>
> **Cross-links**:
> - [`docs/migration/cfm-observability.md`](./cfm-observability.md) — dashboard sections, `cfm.backfill.*` event schema, alert anchors.
> - [`docs/plans/cfm-migration-plan.md`](../plans/cfm-migration-plan.md#cfm-502---backfill-host-managed-fields-conservatively) — phase 5 intent and acceptance.

## 1. Preconditions

- Confirm the run owner and rollback approver before touching production. Default escalation remains backend/reliability on-call in `#cfm-migration`.
- Confirm the current `features.contactFirstListings` flag state and record it in the deployment note for the run.
- Run the backfill from the repo root with a clean checkout of the release commit you intend to ship.
- Treat dry-run as mandatory before every apply invocation, including single-listing retries.
- This ticket preserves classifier-approved `availableUntil` and `minStayMonths` values. There is no optional-field reset path in CFM-502.

## 2. CLI Invocations

Dry-run the full cohort scan:

```bash
pnpm exec ts-node scripts/cfm-migration-backfill.ts --dry-run --batch-size 500
```

Dry-run a single listing:

```bash
pnpm exec ts-node scripts/cfm-migration-backfill.ts --dry-run --listing-id <listing-id>
```

Apply the full backfill:

```bash
pnpm exec ts-node scripts/cfm-migration-backfill.ts --apply --i-understand --batch-size 500
```

Apply a single listing:

```bash
pnpm exec ts-node scripts/cfm-migration-backfill.ts --apply --i-understand --listing-id <listing-id>
```

## 3. Lock Model

- Convert path: `applyHostManagedMigrationBackfillForListing` re-reads the
  listing through `fetchLockedListingMigrationSnapshot`, which acquires
  `FOR UPDATE OF l`. That row lock is the serialization guard for the convert
  path; there is no separate version CAS on the `HOST_MANAGED` flip.
- Stamp path: `applyNeedsReviewFlagForListing` also re-reads under the same row
  lock, then re-classifies the listing before attempting the write. Only rows
  that remain stamp-eligible take the `where: { id, version }` optimistic check;
  rows that drift to a clean cohort skip instead of deferring.

## 4. Dry-Run Output

Every invocation prints a correlated `Run ID` plus the three-line write surface summary:

- `would_flip_to_host_managed`: clean `LEGACY_BOOKING` listings that will move to `HOST_MANAGED`.
- `would_stamp_needs_migration_review`: blocked/manual-review legacy listings that will stay `LEGACY_BOOKING` and only flip `needsMigrationReview=true`.
- `would_skip`: already-host-managed rows, already-flagged rows, and rows that reclassify out of either write path.

The three numbers must add up to `Listings scanned` before you proceed to `--apply`.

## 5. Apply Procedure

1. Run the dry-run command and capture the `Run ID`, cohort counts, and the three-line write summary in the change record.
2. Confirm the dry-run matches expectations for the intended environment and batch size.
3. Run the matching `--apply --i-understand` command.
4. Watch the `cfm.backfill.progress` heartbeat and the `cfm.backfill.deferred` / `cfm.backfill.error` streams for the same `Run ID`. Listing-scoped events now log `listingIdHash`, not raw IDs.
5. If the run ends with deferred rows, leave the exit code as success, inspect the affected `listingIdHash` values in logs, map them back to candidate listing IDs with `hashIdForLog(listing.id)`, and re-run the same command. Deferred rows are safe to pick up on the next run.

## 6. Verification SQL

Run these queries immediately after an apply canary and again after the full run.

```sql
-- V1: dual-write invariant
SELECT COUNT(*) FROM "Listing"
WHERE "availabilitySource"='HOST_MANAGED' AND "availableSlots" <> "openSlots";
-- expected: 0

-- V2: no host-managed listing with non-terminal pending/held bookings
SELECT COUNT(*) FROM "Listing" l
WHERE l."availabilitySource"='HOST_MANAGED'
  AND EXISTS (
    SELECT 1 FROM "Booking" b
    WHERE b."listingId"=l.id
      AND b.status IN ('PENDING','HELD')
      AND b."endDate"::date > CURRENT_DATE
  );
-- expected: 0

-- V3: no host-managed listing with future inventory rows
SELECT COUNT(*) FROM "Listing" l
WHERE l."availabilitySource"='HOST_MANAGED'
  AND EXISTS (
    SELECT 1 FROM listing_day_inventory ldi
    WHERE ldi.listing_id=l.id AND ldi.day >= CURRENT_DATE
  );
-- expected: 0

-- V4: blocked/manual legacy rows are stamped for review
SELECT COUNT(*) FROM "Listing"
WHERE "availabilitySource"='LEGACY_BOOKING'
  AND "needsMigrationReview"=false
  AND (
    EXISTS (
      SELECT 1 FROM "Booking" b
      WHERE b."listingId"="Listing".id
        AND b.status IN ('PENDING','HELD','ACCEPTED')
        AND b."endDate"::date > CURRENT_DATE
    )
    OR EXISTS (
      SELECT 1 FROM listing_day_inventory ldi
      WHERE ldi.listing_id="Listing".id
        AND ldi.day >= CURRENT_DATE
    )
  );
-- expected: 0

-- V5: coarse cohort distribution sanity check
SELECT "availabilitySource", "needsMigrationReview", COUNT(*) FROM "Listing"
GROUP BY 1,2 ORDER BY 1,2;

-- V6: schema invariant remains live
SELECT COUNT(*) FROM "Listing" WHERE "openSlots" IS NOT NULL AND "openSlots" > "totalSlots";
-- expected: 0
```

## 7. Observability

Use the `Run ID` printed by the script to correlate every log line for a single invocation.

- Structured log events: `cfm.backfill.converted`, `cfm.backfill.review_flag_set`, `cfm.backfill.skipped`, `cfm.backfill.deferred`, `cfm.backfill.error`, `cfm.backfill.progress`.
- For listing-level correlation, query `listingIdHash` rather than raw listing IDs. Compute the token with `hashIdForLog(listing.id)` from `src/lib/messaging/cfm-messaging-telemetry.ts`.
- Dashboard references:
  - [`docs/migration/cfm-observability.md` §5.2](./cfm-observability.md#52-host-managed-invariant-tripwire-owner-backend) for `cfm.availability.source_flip_count` and `cfm.listing.needs_migration_review_count`.
  - [`docs/migration/cfm-observability.md` §5.4](./cfm-observability.md#54-search-consistency-owner-search) for search-consistency overlays during active backfill windows.
- Alert anchors:
  - [`docs/migration/cfm-observability.md` §7.9](./cfm-observability.md#7-failure-mode-runbook-anchors) for cohort-backfill incident response.

## 8. Rollback Procedure

Rollback stays manual and row-granular. Export the affected `listingIdHash`
values from the structured logs for the `Run ID` you are reverting, then map
them back to listing IDs in an app shell with `hashIdForLog` before running the
SQL below.

Rollback converted listings from a canary:

```sql
BEGIN;

UPDATE "Listing"
SET "availabilitySource"='LEGACY_BOOKING',
    "openSlots"=NULL,
    "needsMigrationReview"=false,
    "version"="version"+1
WHERE id = ANY(ARRAY[
  '<listing-id-1>',
  '<listing-id-2>'
]::text[]);

COMMIT;
```

Rollback review-flag-only writes:

```sql
UPDATE "Listing"
SET "needsMigrationReview"=false,
    "version"="version"+1
WHERE id = ANY(ARRAY[
  '<listing-id-1>',
  '<listing-id-2>'
]::text[])
  AND "availabilitySource"='LEGACY_BOOKING';
```

Notes:

- These templates intentionally preserve `availableSlots` unchanged.
- Only clean-cohort conversions are eligible for the first rollback template. Blocked/manual rows should remain on the legacy path.
- If you need to revert more than a canary set, stop and escalate to backend/reliability before proceeding.

## 8. Cohort Examples

- `clean_auto_convert`: `LEGACY_BOOKING`, `openSlots=NULL`, `availableSlots=totalSlots`, valid `moveInDate`, no pending/accepted/held bookings, no future inventory rows.
- `blocked_legacy_state`: still `LEGACY_BOOKING`, but an active pending/accepted/held booking or future inventory row exists. CFM-502 stamps `needsMigrationReview=true` and leaves availability sourcing untouched.
- `manual_review`: still `LEGACY_BOOKING`, but shadow host-managed fields or other classifier blockers exist. CFM-502 stamps `needsMigrationReview=true` if it is not already set.
- `manual_review` with `availabilitySource='HOST_MANAGED'`: idempotent skip. The script emits `cfm.backfill.skipped` and does not restamp the listing.

## 9. Operator Checklist

- Dry-run completed and recorded.
- Apply run recorded with `Run ID`.
- `cfm.backfill.error` stayed at `0` for the canary or was investigated before scale-up.
- Verification SQL V1-V4 returned `0`.
- Any deferred rows were re-run or explicitly handed off with their `Run ID` and listing IDs.
