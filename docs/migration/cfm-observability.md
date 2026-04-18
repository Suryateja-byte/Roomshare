# CFM Migration Observability Plan

> **Scope**: authoritative observability spec for the contact-first multi-slot (CFM) migration (phases 0–10 of [`docs/plans/cfm-migration-plan.md`](../plans/cfm-migration-plan.md)).
>
> **Purpose**: define metrics, alerts, dashboards, log dimensions, and divergence queries so every P0/P1 failure mode has at least one observable signal before any public host-managed cutover.
>
> **Status**: spec only. Implementation tickets that light up these signals are CFM-003 (structured-log dimensions), CFM-801/802/803 (counters, dashboards, alerts), and CFM-904 (closing gaps).
>
> **Cross-links**:
> - [`docs/MONITORING.md`](../MONITORING.md) — existing Sentry/Prometheus observability stack.
> - [`docs/OPERATIONS.md`](../OPERATIONS.md) — alerting checklist, SLO targets, runbooks.
> - [`docs/search-contract.md`](../search-contract.md) — public search payload contract (§3.4 / §3.5 are the source of truth for the divergence signals in §3 below).
> - [`docs/host-managed-patch-contract.md`](../host-managed-patch-contract.md) — host-managed PATCH semantics (the source of truth for the host-managed invariant signals in §3).

---

## 1. Observability Backend

The existing stack (verified in `docs/MONITORING.md`) is:

- **Error tracking**: `@sentry/nextjs` across client/server/edge runtimes, release-tagged via `VERCEL_GIT_COMMIT_SHA`.
- **Metrics**: Prometheus text exposition at `GET /api/metrics/ops` (bearer-auth via `METRICS_SECRET`). In-process counters and summaries; reset on cold start, which is acceptable because the scraper (Prometheus / Grafana Agent / Datadog Agent) is the rate authority.
- **Structured logs**: `src/lib/logger.ts` emits JSON in production with automatic PII redaction (field-level and pattern-level). All migration signals MUST go through this logger; raw PII MUST NOT appear in metric labels or log metadata.
- **Privacy-safe metrics**: `POST /api/metrics` for client-side events with HMAC-hashed listing IDs.
- **Client search telemetry**: `POST /api/metrics/search` with a reason-code allowlist.

### CFM signals plug into this stack as:

| Signal class | Transport | Why |
|---|---|---|
| Counters / gauges / summaries | extend `/api/metrics/ops` via a new `cfm.*` namespace | Prometheus-scraped, already auth-protected, already in dashboards |
| Error-like anomalies (post-freeze writes, invariant violations) | `logger.error` + Sentry capture | Paging-grade; error-rate alerts already wired |
| Periodic divergence samples (doc vs row) | cron job writes gauge + dumps delta to logs | Hourly sample is enough; cron cadence is set by CFM-801 |
| Client abort / stale signals | existing `POST /api/metrics/search` | No new surface needed |

**No new observability backend is introduced for the migration.** Any ticket that proposes one must be explicit and go through architecture review.

---

## 2. Metric Naming Convention

All migration-owned metrics are namespaced under `cfm.` to avoid colliding with existing `search_*` and `nodejs_*` metrics. Naming follows:

```
cfm.{subsystem}.{object}.{action}_{unit}
```

- **subsystem**: `booking`, `search`, `listing`, `viewer_state`, `messaging`, `cron`, `availability`.
- **object**: the noun the metric counts or gauges (e.g. `doc`, `create`, `conv`, `pair`).
- **action**: the verb or event (`blocked`, `leaked`, `divergent`, `flipped`, `duplicate`, `clobbered`).
- **unit** (only for counts and latencies): `count` for counters and point-in-time gauges, `ms` for latency, `seconds` for age.

Labels are lowercase, use `_` as separator, and MUST NOT contain free-form user input. Permitted label values are enumerated per-metric in §3.

Current bounded search-URL legacy labels:

- `cfm.search.legacy_url_count{alias,surface}`:
  `alias ∈ {startDate,minBudget,maxBudget,minAvailableSlots,pageNumber,cursorStack,where}`
  and `surface ∈ {ssr,spa,saved-search}`.

**Forbidden label keys** (these are PII per CLAUDE.md non-negotiable #1 and are ALSO high-cardinality):

- `listing_id`, `user_id`, `host_id`, `conversation_id`, `email`, `phone`, `ip`, `address`, `query_text`.

For cardinality-bounded per-entity signals (e.g., one-off anomaly reports), emit a **structured log line** instead of a metric. The log line may include hashed identifiers (same HMAC pattern as `/api/metrics`) but never raw PII.

> **Downstream tickets that will reference this section**: CFM-003 (log dimensions), CFM-801 (counters), CFM-802 (dashboards), CFM-803 (alerts), CFM-904 (gap closure).

---

## 3. Failure-Mode → Signal Matrix

For every P0/P1 failure mode in the plan doc, at least one observable signal exists. Each row names: the Signal (metric or log query), the Threshold that warrants action, the Alert channel, and the Runbook anchor.

### P0 — Booking freeze leakage (post-CFM-101)

| Failure mode | Signal | Threshold | Alert channel | Runbook |
|---|---|---|---|---|
| `createBooking` succeeded after freeze | `cfm.booking.post_freeze_write_count{kind=booking}` (counter) | **> 0** at any time after freeze timestamp | Sentry high-priority + PagerDuty | §7.1 |
| `createHold` succeeded after freeze | `cfm.booking.post_freeze_write_count{kind=hold}` (counter) | **> 0** | Sentry high-priority + PagerDuty | §7.1 |
| `viewer-state` exposed `canBook=true` post-freeze | `cfm.viewer_state.can_book_true_count` (counter) | **> 0** | Sentry high-priority | §7.2 |
| `viewer-state` exposed `canHold=true` post-freeze | `cfm.viewer_state.can_hold_true_count` (counter) | **> 0** | Sentry high-priority | §7.2 |
| Contact-first gate blocked a create attempt | `cfm.booking.create_blocked_count{reason=contact_only\|host_managed,kind=booking\|hold}` (counter) | informational (expected > 0 by design) | dashboard only | n/a |

### P0 — Host-managed invariant violations (post-CFM-401/402)

| Failure mode | Signal | Threshold | Alert channel | Runbook |
|---|---|---|---|---|
| `HOST_MANAGED` listing with `openSlots > totalSlots` | `cfm.listing.host_managed_invariant_violation_count{invariant=slots_exceed_total}` (gauge, hourly cron sample) | **> 0** | Sentry + email | §7.3 |
| `HOST_MANAGED` listing with `availableUntil < moveInDate` | `cfm.listing.host_managed_invariant_violation_count{invariant=until_before_movein}` (gauge) | **> 0** | Sentry + email | §7.3 |
| `HOST_MANAGED` listing with non-terminal legacy bookings | `cfm.listing.host_managed_invariant_violation_count{invariant=open_legacy_booking}` (gauge) | **> 0** | Sentry + email | §7.3 |
| `ACTIVE` host-managed listing that is not marketable | `cfm.listing.host_managed_invariant_violation_count{invariant=active_not_marketable}` (gauge) | **> 0** | Sentry + email | §7.3 |
| Legacy repair loop touched a host-managed listing | `cfm.cron.host_managed_clobber_count{job=sweep-expired-holds|reconcile-slots|search-doc-sync}` (counter) | **> 0** | PagerDuty (Invariant #9 is non-negotiable) | §7.4 |

### P0 — Search contract / dirty-doc drift (post-CFM-403, CFM-405, CFM-406)

| Failure mode | Signal | Threshold | Alert channel | Runbook |
|---|---|---|---|---|
| Search doc projection behind listing row | `cfm.search.doc.divergence_count{reason=missing}` (gauge, hourly) | **> 10** sustained 30 min | email | §7.5 |
| Projection version skew | `cfm.search.doc.divergence_count{reason=version_skew}` (gauge) | **> 0** sustained 15 min after a version bump | Sentry | §7.5 |
| Stale doc by age | `cfm.search.doc.divergence_count{reason=stale}` (gauge) | **p95 age > 5 min** | Sentry | §7.5 |
| Dirty-doc backlog growth | `cfm.search.dirty_queue_age_seconds` (summary: p50/p95) | **p95 > 600** | Sentry | §7.5 |
| Search-doc repairs by reason | `cfm.search.doc.repaired_count{reason=missing\\|version_skew\\|stale}` (counter) | dashboard-only informational signal | dashboard | §7.5 |
| Concurrent writer lost CAS race | `cfm.search.doc.cas_suppressed_count{reason=older_source_version\\|older_projection_version}` (counter) | dashboard-only informational signal | dashboard | §7.5 |
| Map/list result-set disagreement | reuse existing `search_map_list_mismatch_total` (counter) for both `/api/map-listings` and `/api/search/v2` | `rate[15m] > 0.05` | Sentry | `MONITORING.md` §Alerting |
| Query-hash version bump did not invalidate caches | `cfm.search.query_hash_version_mismatch_count` (counter) | **> 0** | Sentry | §7.6 |
| Legacy search aliases still arriving | `cfm.search.legacy_url_count{alias,surface}` (counter) | dashboard-only until CFM-1002; precondition is 14-day p50 `< 1/min` per alias | dashboard | §7.6 |

### P0 — Messaging / contact CTA safety (pre-CFM-103 / CFM-1003 public cutover)

| Failure mode | Signal | Threshold | Alert channel | Runbook |
|---|---|---|---|---|
| Two conversations created for same `(listingId, participant_pair)` | `cfm.messaging.conv.duplicate_pair_count` (counter) | **> 0** | Sentry high-priority | §7.7 |
| Contact CTA click → conversation-start latency | `cfm.messaging.contact_cta.start_latency_ms` (summary) | `p95 > 1500` sustained 15 min | dashboard | — |
| Contact CTA → conversation-start success rate | `cfm.messaging.contact_cta.success_rate` (gauge, derived) | `< 0.98` sustained 30 min | Sentry | §7.7 |

### P1 — Freshness lifecycle drift (post-CFM-801)

| Failure mode | Signal | Threshold | Alert channel | Runbook |
|---|---|---|---|---|
| Per-bucket listing count | `cfm.listing.freshness_bucket_count{bucket=normal|reminder|warning|auto_paused}` (gauge, hourly) | baseline-relative: `auto_paused` growth `> 2x week-over-week` | email | §7.8 |
| Listings past 21d still in search | `cfm.listing.stale_in_search_count` (gauge) | **> 0** sustained 2 h | Sentry | §7.8 |
| Listings past 30d still `ACTIVE` | `cfm.listing.stale_still_active_count` (gauge) | **> 0** sustained 2 h | Sentry | §7.8 |
| Reminder/warning emails sent | `cfm.listing.freshness_notification_sent_count{kind=reminder|warning}` (counter) | informational | dashboard | — |
| Freshness cron emissions | `cfm.cron.freshness_reminder.emitted_count{kind=reminder|warning}` (counter) | informational | dashboard | §7.8 |
| Auto-paused listings | `cfm.listing.auto_paused_count` (counter) | informational | dashboard | §7.8 |
| Auto-pause cron emissions | `cfm.cron.stale_auto_pause.emitted_count` (counter) | informational | dashboard | §7.8 |
| Recovery: auto-paused → ACTIVE via reconfirm | `cfm.listing.freshness_recovered_count` (counter) | informational | dashboard | — |

### P1 — Cohort / migration write-time signals (CFM-501/502)

| Failure mode | Signal | Threshold | Alert channel | Runbook |
|---|---|---|---|---|
| `availabilitySource` flips | `cfm.availability.source_flip_count{from,to}` (counter, `from/to ∈ {LEGACY_BOOKING, HOST_MANAGED}`) | informational; `to=LEGACY_BOOKING` on migrated listing **> 0** is an alert | Sentry | §7.9 |
| Listings stuck in review bucket | `cfm.listing.needs_migration_review_count` (gauge, hourly) | static count > 2 days | email | §7.9 |
| Cohort backfill job error | `cfm.cron.cohort_backfill.error_count` (counter) | **> 0** | Sentry | §7.9 |
| Clean cohort converted during backfill | `cfm.backfill.converted` (structured log; one event per converted listing) | informational; must match the applied-count summary for a run | dashboard + log query | §7.9 |
| Blocked/manual legacy listing stamped for review | `cfm.backfill.review_flag_set` (structured log; one event per stamped listing) | informational; must match the stamped-count summary for a run | dashboard + log query | §7.9 |
| Listing skipped during re-check | `cfm.backfill.skipped` (structured log) | informational; investigate spikes above dry-run expectations | dashboard + log query | §7.9 |
| Listing deferred after bounded retries | `cfm.backfill.deferred` (structured log) | **> 0** on a canary or sustained full-run growth | email | §7.9 |
| Backfill mutation raised an error | `cfm.backfill.error` (structured log) | **> 0** | Sentry | §7.9 |
| Active backfill run heartbeat | `cfm.backfill.progress` (structured log) | no heartbeat for > 15 min during an active run | dashboard only | §7.9 |

### P1 — Review/trust policy (CFM-701)

| Failure mode | Signal | Threshold | Alert channel | Runbook |
|---|---|---|---|---|
| Review created without an accepted-booking row | `cfm.review.unauthorized_create_count` (counter) | **> 0** | Sentry | §7.10 |
| Contact-only user attempted a public review | `cfm.review.contact_only_attempt_count` (counter) | informational | dashboard | — |
| Private feedback submitted | `cfm.feedback.submission_count{category}` (`category ∈ {unresponsive_host, misleading_listing_details, pressure_tactics, general_concern}`) | informational | dashboard | CFM-703 |
| Private feedback denied by a trust gate | `cfm.feedback.denied_count{reason}` (`reason ∈ {duplicate, feature_disabled, has_accepted_booking, invalid_target, no_prior_conversation, rate_limit, self_target, suspended, unverified_email}`) | any unexpected spike over baseline | dashboard + Sentry trend review | CFM-703 |

### P1 — Legacy drain (CFM-901/902/903/904)

| Failure mode | Signal | Threshold | Alert channel | Runbook |
|---|---|---|---|---|
| Legacy bookings still open past drain deadline | `cfm.booking.legacy_open_count` (gauge, daily) | **static count for 3 days** | email | §7.11 |
| `/bookings` views emitted with history-first mode labels | `cfm.booking.history_first_view_count{mode=history_first\|escape_hatch}` (counter; emitted from `src/app/bookings/page.tsx`) | informational; expect monotonic growth in `mode=history_first` after flag flip | dashboard | §7.11 |
| `/bookings` reads served from history-first path | `cfm.booking.history_first_serve_ratio` (gauge) | `< 1.0` after CFM-902 | dashboard | §7.11 |

### P1 — Notification emission gate (CFM-903)

| Failure mode | Signal | Threshold | Alert channel | Runbook |
|---|---|---|---|---|
| Flag off: booking notification or email emission correctly blocked | `cfm.notifications.booking_emission_blocked_count{type,kind,source}` (counter) | informational; steady-state `> 0` is expected after the flag flips off | dashboard only | §7.11 |
| `BOOKING_REQUEST` reached the helper despite the contact-first freeze | `cfm.notifications.booking_emission_bypass_count{type}` (counter) | **> 0** after `ENABLE_CONTACT_FIRST_LISTINGS=true` | Sentry high-priority | §7.1 |
| `BOOKING_HOLD_REQUEST` reached the helper despite the contact-first freeze | `cfm.notifications.booking_emission_bypass_count{type}` (counter) | **> 0** after `ENABLE_CONTACT_FIRST_LISTINGS=true` | Sentry high-priority | §7.1 |

Labels:

- `type` for `kind=inapp` is bounded to `{BOOKING_REQUEST, BOOKING_HOLD_REQUEST, BOOKING_ACCEPTED, BOOKING_REJECTED, BOOKING_CANCELLED, BOOKING_EXPIRED, BOOKING_HOLD_EXPIRED}`.
- `type` for `kind=email` is bounded to `{bookingRequest, bookingAccepted, bookingRejected, bookingCancelled, bookingHoldRequest, bookingExpired, bookingHoldExpired}`.
- `kind` is bounded to `{inapp, email}`.
- `source` is bounded to `{batch}` when present and omitted for single-emitter helper calls.
- `cfm.notifications.booking_emission_bypass_count{type}` only accepts `{BOOKING_REQUEST, BOOKING_HOLD_REQUEST}` and carries `userIdHash` in structured-log metadata, never as a metric label.

---

## 4. Structured Log Dimensions

All `booking`, `hold`, `listing`, `search`, `viewer-state`, `messaging`, and `cron` log lines emitted during the migration MUST include the following fields on the structured-logger metadata (see `src/lib/logger.ts`). These are the fields CFM-003 formalizes on the logger base context.

| Field | Values | Source of truth |
|---|---|---|
| `listingId` | HMAC of the listing UUID (NOT the raw ID). Use the same HMAC scheme as `src/app/api/metrics/hmac.ts`. | computed at log time |
| `availabilitySource` | `LEGACY_BOOKING` \| `HOST_MANAGED` | listing row |
| `listingStatus` | `ACTIVE` \| `PAUSED` \| `RENTED` | listing row |
| `statusReason` | enum per [`docs/plans/cfm-migration-plan.md`](../plans/cfm-migration-plan.md#statusreason) or `null` | listing row |
| `queryHashVersion` | integer (current `SEARCH_QUERY_HASH_VERSION`) | `src/lib/search/query-hash.ts` |
| `searchContractVersion` | integer (current `SEARCH_CONTRACT_VERSION`) | `docs/search-contract.md` §3.3 |
| `legacyUrlAlias` | `startDate` \| `minBudget` \| `maxBudget` \| `minAvailableSlots` \| `pageNumber` \| `cursorStack` \| `where` \| `null` | legacy URL telemetry / canonicalizer path |
| `migrationPhase` | `0` — `10` (current plan phase) | env `CFM_MIGRATION_PHASE` (CFM-003) |
| `cohort` | `clean` \| `blocked` \| `review` \| `legacy_drain` \| `unknown` | listing row (`needsMigrationReview` + `availabilitySource`) |
| `reporterIdHash` | 16-hex HMAC or sha256 fallback token | `hashIdForLog` for CFM-703 feedback telemetry |
| `targetUserIdHash` | 16-hex HMAC or sha256 fallback token | `hashIdForLog` for CFM-703 feedback telemetry |
| `feedbackCategory` | `unresponsive_host` \| `misleading_listing_details` \| `pressure_tactics` \| `general_concern` \| `null` | CFM-703 private-feedback submission telemetry |
| `feedbackDeniedReason` | `duplicate` \| `feature_disabled` \| `has_accepted_booking` \| `invalid_target` \| `no_prior_conversation` \| `rate_limit` \| `self_target` \| `suspended` \| `unverified_email` \| `null` | CFM-703 private-feedback denial telemetry |

### Forbidden fields (non-negotiable #1)

- Raw `listingId`, `userId`, `hostId`, `conversationId`, `email`, `phone`, `ip`, `address`, message/listing body, query text, filters containing free-form text.
- The structured logger's existing pattern-level redaction (email, phone, address, JWT) is the last line of defense; the migration MUST NOT rely on it as primary protection.

### How to attach dimensions

Prefer the child-logger pattern already documented in `MONITORING.md`:

```ts
const listingLogger = logger.child({
  listingId: hashListingId(listing.id),
  availabilitySource: listing.availabilitySource,
  listingStatus: listing.status,
  statusReason: listing.statusReason,
  migrationPhase: getCfmMigrationPhase(),
  cohort: getListingCohort(listing),
});
await listingLogger.info("listing.patched", { diff: ... });
```

This way all downstream log lines inherit the migration context with no per-call boilerplate.

### CFM-502 backfill event schema

All listing-scoped CFM-502 backfill events emit `listingIdHash`, produced by
`hashIdForLog` in `src/lib/messaging/cfm-messaging-telemetry.ts`. The value is a
deterministic 16-hex token, so dashboards and log queries can correlate a
listing's backfill lifecycle without exposing raw IDs.

| Event | Required fields | Notes |
|---|---|---|
| `cfm.backfill.converted` | `listingIdHash`, `runId`, `cohort="clean_auto_convert"`, `fromSource`, `toSource`, `previousVersion`, `nextVersion`, `actor` | Emitted by `applyHostManagedMigrationBackfillForListing` after the atomic listing update + dirty mark succeeds. |
| `cfm.backfill.review_flag_set` | `listingIdHash`, `runId`, `cohort`, `reasons`, `fromSource`, `toSource`, `previousVersion`, `nextVersion`, `actor` | Emitted by `applyNeedsReviewFlagForListing` when only `needsMigrationReview` is stamped. `fromSource` and `toSource` should both remain `LEGACY_BOOKING`. |
| `cfm.backfill.skipped` | `listingIdHash`, `runId`, `cohort`, `reasons`, `outcome`, `previousVersion`, `nextVersion`, `fromSource`, `toSource`, `actor` | `outcome ∈ {already_host_managed, already_flagged, blocked_has_been_reclassified}`. |
| `cfm.backfill.deferred` | `listingIdHash`, `runId`, `attempts`, `lastErrorCode`, `actor` | Emitted by the script after bounded version-conflict retries are exhausted for a row. |
| `cfm.backfill.error` | `listingIdHash`, `runId`, `message`, `actor` | Message must stay redacted through the existing logger sanitization path. |
| `cfm.backfill.progress` | `runId`, `appliedCount`, `stampedCount`, `skippedCount`, `deferredCount`, `batchCursor`, `actor` | Heartbeat for an active run; this event is intentionally listing-free and does not emit a listing-scoped identifier. |

---

## 5. Dashboards Spec

Five Grafana dashboards (or the Datadog equivalent). Each implementable directly from the metric names in §3 without re-reading the plan doc.

### 5.1 Freeze Gate Dashboard (owner: backend)

Must-have panels:

1. **Booking/hold leak counter** — `cfm.booking.post_freeze_write_count` split by `kind`. Goal line: **0**.
2. **Viewer-state leak counter** — `cfm.viewer_state.can_book_true_count` + `cfm.viewer_state.can_hold_true_count`. Goal line: **0**.
3. **Create-attempt rate** — `rate(cfm.booking.create_blocked_count[15m])` by `reason`. Expected non-zero; indicates clients still hitting the old endpoint.
4. **Contact-first conversion** — `cfm.messaging.contact_cta.success_rate`.
5. **Single-stat**: time since last leak event (should read "never" in green).

### 5.2 Host-Managed Invariant Tripwire (owner: backend)

Must-have panels:

1. **Invariant violation count by type** — `cfm.listing.host_managed_invariant_violation_count` grouped by `invariant`.
2. **Repair-loop clobber counter** — `cfm.cron.host_managed_clobber_count` grouped by `job`.
3. **Sources-flips heatmap** — `cfm.availability.source_flip_count{from,to}`.
4. **Stuck-in-review** — `cfm.listing.needs_migration_review_count`, sparkline over 7 days.

### 5.3 Freshness Lifecycle Funnel (owner: backend)

Must-have panels:

1. **Bucket counts** — `cfm.listing.freshness_bucket_count` as a stacked gauge.
2. **Funnel** — daily transitions: normal → reminder → warning → auto_paused, computed from `cfm.listing.freshness_notification_sent_count`.
3. **Search-leakage tripwires** — `cfm.listing.stale_in_search_count`, `cfm.listing.stale_still_active_count`.
4. **Cron health** — `cfm.cron.freshness_reminder.emitted_count`, `cfm.cron.freshness_reminder.error_count`, `cfm.cron.freshness_reminder.lock_held_count`, `cfm.cron.stale_auto_pause.emitted_count`, `cfm.cron.stale_auto_pause.error_count`, `cfm.cron.stale_auto_pause.lock_held_count`.
5. **Recovery rate** — `rate(cfm.listing.freshness_recovered_count[24h])`.

### 5.4 Search Consistency (owner: search)

Must-have panels:

1. **Dirty-queue age** — `cfm.search.dirty_queue_age_seconds{quantile="0.95"}`. Goal: p95 < 60s.
2. **Doc/row divergence** — `cfm.search.doc.divergence_count` stacked by `reason` (`missing|version_skew|stale`).
3. **Map/list mismatch rate** — `rate(search_map_list_mismatch_total[15m])` (existing metric from `MONITORING.md`).
4. **Query-hash version mismatch** — `cfm.search.query_hash_version_mismatch_count` (should read 0 after a version bump has had 1 cache-TTL worth of time).
5. **Legacy URL alias rate** — `rate(cfm.search.legacy_url_count[1h])` split by `alias`. Goal: monotonic decay after CFM-604; CFM-1002 precondition is 14-day p50 `< 1/min` per alias.
6. **Backfill run overlay** — correlate `cfm.backfill.progress`, `cfm.backfill.deferred`, and `cfm.backfill.error` with search-divergence spikes during cohort-backfill windows.
7. **Repair volume** — `rate(cfm.search.doc.repaired_count[15m])` split by `reason`; informational only, paired with the divergence gauge.

### 5.5 Messaging Safety (owner: product/messaging)

Must-have panels:

1. **Duplicate-conversation counter** — `cfm.messaging.conv.duplicate_pair_count`.
2. **Contact CTA click rate** — existing product analytics, overlaid.
3. **Conversation-start latency** — `cfm.messaging.contact_cta.start_latency_ms{quantile="0.95"}`.
4. **Contact-to-conversation funnel** — click → conversation_created → first_message_sent.

---

## 6. Divergence Detection Queries

Read-only SQL that can run from admin UI or cron. Each query is annotated `cron-safe` (bounded, indexed, safe at scrape cadence) or `admin-only` (expensive / full-scan / incident-only).

### 6.1 Legacy creates after freeze `cron-safe`

```sql
SELECT COUNT(*) AS leaked_count
FROM "Booking"
WHERE "createdAt" > :freeze_timestamp
  AND "origin" <> 'LEGACY_DRAIN';
```

Emits into `cfm.booking.post_freeze_write_count`. Threshold: any row ≠ 0 is a paging incident.

### 6.2 Host-managed with non-terminal legacy bookings `cron-safe`

```sql
SELECT l.id
FROM "Listing" l
WHERE l."availabilitySource" = 'HOST_MANAGED'
  AND EXISTS (
    SELECT 1 FROM "Booking" b
    WHERE b."listingId" = l.id
      AND b."status" IN ('PENDING', 'ACCEPTED', 'HELD')
  );
```

Emits into `cfm.listing.host_managed_invariant_violation_count{invariant=open_legacy_booking}`.

### 6.3 Host-managed slot/date invariants `cron-safe`

```sql
SELECT
  SUM(CASE WHEN l."openSlots" > l."totalSlots" THEN 1 ELSE 0 END) AS slots_exceed_total,
  SUM(CASE WHEN l."availableUntil" IS NOT NULL AND l."availableUntil" < l."moveInDate" THEN 1 ELSE 0 END) AS until_before_movein
FROM "Listing" l
WHERE l."availabilitySource" = 'HOST_MANAGED';
```

Emits into `cfm.listing.host_managed_invariant_violation_count`.

### 6.4 Search doc / listing row divergence `cron-safe`

```sql
SELECT COUNT(*)
FROM "Listing" l
JOIN "listing_search_docs" d ON d."listingId" = l.id
WHERE l."version" > d."sourceVersion"
   OR d."projectionVersion" < :current_projection_version;
```

Emits into `cfm.search.doc.divergence_count{reason=version_skew}`. See `src/lib/search/search-doc-sync.ts` (`SEARCH_DOC_PROJECTION_VERSION`).

### 6.5 Stale-listing leakage `cron-safe`

```sql
SELECT
  SUM(CASE WHEN l."lastConfirmedAt" < now() - interval '21 days'
           AND d."listingId" IS NOT NULL THEN 1 ELSE 0 END) AS stale_in_search,
  SUM(CASE WHEN l."lastConfirmedAt" < now() - interval '30 days'
           AND l."status" = 'ACTIVE' THEN 1 ELSE 0 END) AS stale_still_active
FROM "Listing" l
LEFT JOIN "listing_search_docs" d ON d."listingId" = l.id;
```

### 6.6 Duplicate conversation pairs `admin-only` (full-scan on Conversation)

```sql
SELECT "listingId", array_agg(id) AS conv_ids
FROM "Conversation"
GROUP BY "listingId", least("userAId", "userBId"), greatest("userAId", "userBId")
HAVING COUNT(*) > 1;
```

Emits into `cfm.messaging.conv.duplicate_pair_count`.

### 6.7 Legacy open bookings past drain deadline `cron-safe`

```sql
SELECT COUNT(*) AS legacy_open_count
FROM "Booking"
WHERE "status" IN ('PENDING', 'ACCEPTED', 'HELD')
  AND "createdAt" < :drain_deadline_timestamp;
```

---

## 7. Failure-Mode Runbook Anchors

Each signal above points at a runbook anchor. The anchors below are stubs; full content is owned by CFM-803 (runbook ticket). They appear here so CFM-801 can link from alert descriptions.

- **§7.1 Freeze leak** — suspected CFM-101 bypass. Actions: (1) confirm via query 6.1, (2) capture a bypassing stack trace in Sentry, (3) disable the writing endpoint at the edge if leak rate is sustained.
- **§7.2 Viewer-state leak** — client received `canBook=true`. Actions: identify caller via Sentry trace, confirm viewer-state path is on current freeze contract.
- **§7.3 Host-managed invariant violation** — a write slipped past host-managed validation. Actions: pause affected listings, run 6.2 / 6.3 to enumerate, do NOT attempt automatic correction (non-negotiable #9).
- **§7.4 Repair-loop clobber** — sweep-expired-holds or reconcile-slots ran on a host-managed listing. Actions: disable cron via `vercel.json` crons entry, diff last run's effects, revert any clobbered row from audit log.
- **§7.5 Search divergence / dirty-doc backlog** — enqueue full reprojection (cron ticket CFM-406), verify via query 6.4.
- **§7.6 Query-hash version mismatch** — CDN/edge cache did not invalidate. Actions: verify `SEARCH_QUERY_HASH_VERSION` bumped, confirm any external cache TTL has elapsed, force-purge if necessary.
- **§7.7 Messaging duplicate** — two conversations for same participant pair. Actions: merge via admin tool, verify dedup key in messaging contact handler.
- **§7.8 Stale listing** — expected to be empty after CFM-801. Actions: verify the freshness cron ran during the 09:02-09:04 UTC daily window, confirm `cfm.cron.freshness_reminder.emitted_count` is moving over the last 24 hours, inspect per-bucket counts, and re-run `/api/cron/freshness-reminders` manually with `CRON_SECRET` if needed. If `cfm.cron.freshness_reminder.error_count{stage="email"}` climbs, inspect the email circuit breaker state before retrying.
- **§7.8 Stale auto-pause** — informational-only today. Actions: verify `cfm.listing.auto_paused_count` or `cfm.cron.stale_auto_pause.emitted_count` moved in the same 09:02-09:04 UTC window after `freshness-reminders`, and re-run `/api/cron/stale-auto-pause` manually with `CRON_SECRET` if stale day-30 listings remain `ACTIVE`. All logs must continue to use hashed listing IDs only.
- **§7.9 Cohort backfill** — stuck review bucket. Actions: follow the [`CFM backfill runbook`](./cfm-backfill-runbook.md), inspect the `Run ID`-correlated `cfm.backfill.*` log stream, rerun deferred rows, and use the review export only for listings that remain blocked after the backfill rerun.
- **§7.10 Unauthorized review** — review created without accepted booking. Actions: delete review, identify bypass, harden review eligibility (CFM-701).
- **§7.11 Legacy drain** — open bookings past deadline. Actions: list via 6.7, nudge hosts to terminate, force-terminate per legal-safe policy.

---

## 8. Invariant & Gate Coverage Table

Every non-negotiable invariant and cross-cutting acceptance gate from the plan doc has at least one observable signal. Gaps are called out explicitly so CFM-904 can close them.

### Non-Negotiable Invariants

| # | Invariant | Signal | Gap? |
|---|---|---|---|
| 1 | One authoritative availability model per listing | `cfm.availability.source_flip_count{from,to}` (forbidden flips); query 6.2 (terminal/non-terminal mix) | — |
| 2 | `HOST_MANAGED` never derives from bookings | `cfm.cron.host_managed_clobber_count` | — |
| 3 | No post-freeze bookings/holds | `cfm.booking.post_freeze_write_count` | — |
| 4 | Historical accepted bookings remain review-eligible | `cfm.review.unauthorized_create_count` (inverse: positive signal via dashboard panel of eligible reviews) | partial — needs CFM-904 positive-signal counter `cfm.review.legacy_eligible_count` |
| 5 | Search/map/facets/card/detail/saved-search share one contract | `cfm.search.query_hash_version_mismatch_count`, existing `search_map_list_mismatch_total` | — |
| 6 | `0 <= openSlots <= totalSlots` | query 6.3 → `cfm.listing.host_managed_invariant_violation_count{invariant=slots_exceed_total}` | — |
| 7 | `availableUntil` null or ≥ `moveInDate` | query 6.3 → `{invariant=until_before_movein}` | — |
| 8 | `ACTIVE` host-managed must be marketable | `{invariant=active_not_marketable}` | partial — `marketable` predicate still to be formalized in CFM-801 |
| 9 | Dirty-doc repair must not overwrite host-managed | `cfm.cron.host_managed_clobber_count{job=search-doc-sync}` | — |
| 10 | Rollback is reader/UI/operational only | **cannot be observed as a counter** — mitigation: pre-flight test suite (CFM-901) + documented in runbook §7.8. Explicit gap; no runtime signal. | **GAP (accepted)** |

### Cross-Cutting Acceptance Gates

| Gate | Signal(s) |
|---|---|
| Search/UI Consistency | `cfm.search.query_hash_version_mismatch_count`, `search_map_list_mismatch_total` (existing), `cfm.search.doc.divergence_count`, saved-URL reopen smoke test (E2E, not a metric) |
| Booking Freeze | `cfm.booking.post_freeze_write_count`, `cfm.viewer_state.can_book_true_count`, `cfm.viewer_state.can_hold_true_count` |
| Host-Managed Invariant | `cfm.listing.host_managed_invariant_violation_count` (all `invariant=` labels) |
| Review & Trust | `cfm.review.unauthorized_create_count`, `cfm.review.contact_only_attempt_count` |
| Freshness | `cfm.listing.freshness_bucket_count`, `cfm.listing.stale_in_search_count`, `cfm.listing.stale_still_active_count`, `cfm.listing.freshness_notification_sent_count`, `cfm.cron.freshness_reminder.emitted_count`, `cfm.listing.auto_paused_count`, `cfm.cron.stale_auto_pause.emitted_count`, `cfm.listing.freshness_recovered_count` |
| Operational Safety | `cfm.search.dirty_queue_age_seconds`, `cfm.search.doc.divergence_count`, `cfm.messaging.conv.duplicate_pair_count`, `cfm.messaging.contact_cta.start_latency_ms` |

---

## 9. Phase Exit Gates (Rollout Readiness)

Each phase closes only when its corresponding observable signal is live AND at baseline. This binds the observability spec to the plan doc's per-phase acceptance criteria.

| Phase | Exit gate (from plan) | Observable signal required live |
|---|---|---|
| 0 | Planning complete | this document exists and is cross-linked from plan doc |
| 1 | Freeze rolled out | `cfm.booking.post_freeze_write_count`, `cfm.viewer_state.can_book_true_count` live AND reading **0** for 24 h |
| 2 | Additive schema migrated | `cfm.availability.source_flip_count` live (any row will have `availabilitySource` set) |
| 3 | Shared write validation live | `cfm.listing.host_managed_invariant_violation_count` live; baseline established |
| 4 | Search contract normalized | `cfm.search.query_hash_version_mismatch_count`, `cfm.search.doc.divergence_count` live; `search_map_list_mismatch_total` rate below threshold for 7 days |
| 5 | Host cohort backfilled | `cfm.listing.needs_migration_review_count` live; no stuck-in-review over 2 days; `cfm.cron.cohort_backfill.error_count` = 0 |
| 6 | Public cutover | all Phase 4 signals + full Host-Managed Invariant Gate signals green for 48 h |
| 7 | UI cleanup + review policy | `cfm.review.unauthorized_create_count` = 0 for 7 days |
| 8 | Freshness jobs on | full §5.3 dashboard live; `cfm.listing.stale_in_search_count` = 0, `cfm.listing.stale_still_active_count` = 0 |
| 9 | Legacy drain | `cfm.booking.legacy_open_count` trending to 0; `cfm.booking.history_first_serve_ratio` = 1.0 |
| 10 | Final cleanup | all `cfm.*` dashboards green; Invariant #10 smoke tests pass |

**Phase 1 Exit is a hard gate**: at minimum the freeze leak counter + viewer-state leak counter MUST be live and reading 0 for 24 h before CFM-101 can merge. This is the observability precondition explicit in the CFM-004 plan doc's Risks section.

---

## 10. Verification Notes (per-signal "how you'd test this fires")

Each signal above has a concrete verification path that can be executed before rollout:

- **`cfm.booking.post_freeze_write_count`** — inject a post-freeze `createBooking` via DB manipulation in staging; counter should increment within 1 min of scrape cadence.
- **`cfm.viewer_state.can_book_true_count`** — fabricate a viewer-state response with `canBook=true` in staging; counter should increment.
- **`cfm.listing.host_managed_invariant_violation_count`** — manually set `openSlots = totalSlots + 1` on a `HOST_MANAGED` staging row; hourly cron should surface in next scrape.
- **`cfm.cron.host_managed_clobber_count`** — run `sweep-expired-holds` against a staging `HOST_MANAGED` listing; counter should increment.
- **`cfm.search.doc.divergence_count{reason=version_skew}`** — bump `listing.version` without touching `listing_search_docs.sourceVersion`; next cron sample should increment `version_skew`.
- **`cfm.search.query_hash_version_mismatch_count`** — send a search request with a stale `queryHashVersion` header; counter should increment.
- **`cfm.messaging.conv.duplicate_pair_count`** — create two conversations for the same `(listingId, userA, userB)` tuple via direct DB insert; next admin query (§6.6) should surface.
- **`cfm.listing.freshness_bucket_count`** — backdate `lastConfirmedAt` on a test listing; hourly cron should move it into the correct bucket.
- **`cfm.availability.source_flip_count`** — flip `availabilitySource` in a staging row; counter should increment with correct `from`/`to` labels.
- **`cfm.booking.legacy_open_count`** — count returns static number equal to the number of non-terminal legacy bookings in staging.

---

## 11. Changelog

| Date | Change |
|---|---|
| 2026-04-16 | Initial version (CFM-004). Defines metric namespace, log dimensions, failure-mode matrix, dashboards, divergence SQL, invariant/gate coverage, and phase exit gates. |
| 2026-04-17 | Added the CFM-502 `cfm.backfill.*` structured-log events, the runbook link for §7.9, and the search-dashboard overlay reference for cohort backfill monitoring. |
| 2026-04-17 | CFM-803 wired `cfm.search.doc.divergence_count`, `cfm.search.dirty_queue_age_seconds`, and `cfm.search.doc.repaired_count` into `/api/metrics/ops`, and added the bounded dirty-doc rescan plus CAS-safe repair loop. |
