# Roomshare v10 — Phase Decomposition

Master plan: `.orchestrator/master-plan.md` (v10.0, Unit + Inventory + Published Projection + Semantic Projection + Identity Lifecycle + SRE Hardening + Entitlement Monetization).

**Context**: Pre-launch, all dummy data (per memory: `project_data_status.md`). Destructive migrations are safe; data-loss/audit/retention objections do not apply. Code-level invariants still required.

**Current repo state at decomposition time**:
- Branch: `codex/contact-first-multislot` (HEAD `9e78c4e9 WIP: multi-slot availability presentation pipeline`)
- 27 Prisma models, 565-line `schema.prisma`
- Booking-first scaffolding present: `Booking`, `ListingDayInventory`, `BookingAuditLog`, `IdempotencyKey`, `AuditLog`, hold state machine (`src/lib/booking-state-machine.ts`), day-inventory migrations.
- Search/semantic infra partially present: pgvector, HNSW index, `search_doc` projection, `search-v2-service.ts`, `search-orchestrator.ts`, embedding model metadata column. But no unit/inventory/identity separation, no query_snapshots, no cache_invalidations, no outbox-event table.
- No Stripe, no entitlements, no contact_consumption, no paywall evaluator, no refunds/chargebacks infra.
- NextAuth v5 beta.30 + Google OAuth + credentials; rate limits via Upstash; Sentry.

**Phase count**: 10 (numbered 01–10). Phase 00 reserved for rejected pre-work. Each phase ends only when its acceptance gate passes with tests + flags.

**Global non-goals across all phases** (from §2 of master plan):
- Real-time booking, escrow, reservation locking semantics.
- Subscriptions, auto-renewal, transaction fees.
- Multi-currency beyond USD.
- Host-side monetization.
- Promo code UX (schema may prep, UI does not expose).
- Legal property-ownership verification beyond duplicate-signal workflows.

**Global flag defaults**: every new surface ships dark. All cutover flags default `false` and are enabled only in Phase 10 after its gates pass.

---

## Phase 01 — Foundations & Identity Lifecycle

**id**: 01
**slug**: foundations-identity-lifecycle
**goal**: Land canonical data separation (physical_units vs. host_unit_claims vs. listing_inventories) and versioned identity (unit_identity_epoch + identity_mutations) behind dark flags, without touching the public read path.

**In scope**
- New tables: `physical_units`, `host_unit_claims`, `listing_inventories`, `identity_mutations`, `cache_invalidations`, `outbox_events`, `audit_events` (or reuse existing `AuditLog` if fields align).
- Columns on all three: `unit_identity_epoch`, `source_version`, `row_version`, `canonical_address_hash`, `canonicalizer_version`, `privacy_version`, `supersedes_unit_ids`, `superseded_by_unit_id`, `lifecycle_status`, `publish_status`.
- Category matrix CHECK constraints for ENTIRE_PLACE / PRIVATE_ROOM / SHARED_ROOM (required vs. forced-null columns per §6.6).
- Canonical address normalization function + unique index keyed on `canonical_address_hash` + `canonical_unit`.
- `identity_mutations` append-only ledger with kinds `MERGE | SPLIT | CANONICALIZER_UPGRADE | MANUAL_MODERATION`.
- Idempotency-key admission (reuse `IdempotencyKey` model or split) for create/edit/contact.
- Moderation-precedence DB trigger: host-role writes cannot modify `lifecycle_status`, `publish_status`, or moderation metadata. Returns a structured error that the handler translates to 423 Locked.
- Advisory-lock wrapper helper for canonical-unit resolve-or-create.
- Feature flag scaffolding module (`src/lib/flags`) + kill switches (stubs only; no enforcement yet).

**Out of scope**
- Populating public projections (Phase 02).
- Semantic rebuild (Phase 03).
- Retiring `Booking` / `ListingDayInventory` tables (Phase 09 cutover).
- Any user-visible behavior change — these tables are write-only in this phase.
- Stripe, entitlements, paywall (Phase 07).

**Files likely touched**
- `prisma/schema.prisma` (new models, columns, indexes).
- `prisma/migrations/<new>_phase01_*` (destructive-safe migrations).
- `src/lib/identity/` (new module: epoch helpers, canonical-address hash, advisory lock wrapper).
- `src/lib/validation/` (category-matrix validators, discriminated union).
- `src/lib/idempotency.ts` (extend or wrap existing).
- `src/lib/flags/` (new flag module).
- `src/lib/prisma.ts` (moderation-precedence trigger install script if needed).
- `src/__tests__/lib/identity/` (new unit tests).
- `src/__tests__/prisma/` (new DB tests hitting real Postgres via test harness).
- Maybe `src/app/api/admin/identity/` for operator hooks (stubs).

**Acceptance criteria (all must pass; testable)**
1. Migration applies cleanly on empty DB and on dev DB; reverse plan documented even if destructive (pre-launch).
2. Invalid row shapes reject at the DB boundary: test proves `ENTIRE_PLACE` with non-null `total_beds` fails CHECK; `SHARED_ROOM` with null `open_beds` fails CHECK; `PRIVATE_ROOM` with non-null `total_beds` fails CHECK.
3. Moderation-precedence trigger rejects a host-role UPDATE that touches `publish_status`/`lifecycle_status`; test asserts trigger error reaches handler as `423 Locked`.
4. Canonical-unit uniqueness holds across whitespace/casing/empty-unit variants: test inserts 5 spelling variants of one address, all resolve to a single `physical_units.id`.
5. Advisory-lock wrapper serializes concurrent create-or-resolve: a concurrency test (10 parallel calls on the same address) yields exactly one insert; the other 9 observe the existing row.
6. `identity_mutations` ledger accepts MERGE/SPLIT entries and emits an `outbox_events` row in the same transaction (test reads both rows after commit).
7. `source_version` and `row_version` increment on every UPDATE; optimistic-concurrency test proves stale `If-Match` returns 409.
8. No read path references new tables yet; grep/LSP confirms `inventory_search_projection`, `unit_public_projection`, `semantic_inventory_projection` are not read by any route.
9. `pnpm lint` + `pnpm typecheck` + `pnpm test` pass; new unit/integration tests ≥90% coverage on `src/lib/identity/` and `src/lib/validation/` category modules.
10. Flag `phase01_canonical_writes_enabled` defined, defaults `false`; no public code path observes it yet.

**Dependencies**: none (entry point).

**Risks**
- DB-trigger semantics differ across Postgres versions; mitigate by scoping the trigger to a single schema and version-pinning in migration comment.
- Advisory-lock keyspace collision with existing code; mitigate by namespacing lock keys with a dedicated application prefix constant.

---

## Phase 02 — Outbox Pipeline & Filter Projections

**id**: 02
**slug**: outbox-filter-projections
**goal**: Make canonical writes produce durable outbox events and rebuild `inventory_search_projection` + `unit_public_projection` idempotently via workers; wire `cache_invalidations` fan-out.

**In scope**
- `inventory_search_projection` table (row-level, filterable, sanitized).
- `unit_public_projection` table (grouped unit rendering payload).
- Outbox worker(s) for `publish_normal`, `publish_high`, `cache_invalidate` queues.
- Tombstone fast lane (publish_high) with fan-out to both projections + cache_invalidations.
- Geocode worker reading `outbox_events` kind=`GEOCODE_NEEDED`; keeps listing in `PENDING_GEOCODE` on provider failure; never blocks write commit.
- Publish state machine implementation per §9.4: DRAFT → PENDING_GEOCODE → PENDING_PROJECTION → PENDING_EMBEDDING → PUBLISHED; STALE_PUBLISHED / PAUSED / SUPPRESSED / ARCHIVED terminals.
- Projection-lag metrics exported to existing Sentry + server-logger surface.
- DLQ routing with `max_attempts` and `dlq_reason` columns on outbox rows.
- `source_version`-ordered idempotent rebuild (old events lose to newer for same aggregate).
- Cron/trigger mechanism for outbox worker (Vercel cron or background route).

**Out of scope**
- Semantic projection (Phase 03).
- Query snapshots (Phase 04).
- Any client-cache push — only the server-side `cache_invalidations` queue is populated this phase; push delivery is Phase 08.
- Public read cutover — read paths still read legacy tables; projection tables populate in shadow.

**Files likely touched**
- `prisma/schema.prisma` (+ migrations for projection tables, outbox columns).
- `src/lib/outbox/` (worker harness, queue dispatch).
- `src/lib/projections/` (inventory + unit rebuild functions).
- `src/lib/geocoding.ts`, `src/lib/geocoding-cache.ts` (route through outbox).
- `src/app/api/cron/outbox/route.ts` (new) or extend `src/app/api/cron/daily-maintenance`.
- `src/__tests__/lib/outbox/`, `src/__tests__/lib/projections/` (idempotency, ordering, tombstone fast-lane tests).
- `src/lib/metrics/projection-lag.ts` (new).

**Acceptance criteria**
1. Creating an inventory via canonical write appends exactly one `outbox_events` row in the same transaction; test asserts both rows committed together.
2. Worker rebuilds projections idempotently: processing the same outbox event twice produces the same projection row (same `source_version`); test verifies.
3. Tombstone arriving after a publish removes rows from both `inventory_search_projection` and `unit_public_projection` within the test tick and emits a `cache_invalidations` row for the affected `unit_id`.
4. Tombstone fast lane bypasses normal queue: with N=100 pending `publish_normal` jobs, a `publish_high` suppression still completes first; test asserts queue priority.
5. Geocode failure leaves listing in `PENDING_GEOCODE`; write response returns `accepted_pending_publish` with `pending_projections=["PENDING_GEOCODE"]`.
6. Out-of-order events: an old `source_version` event received after a newer one does not overwrite the projection; test verifies winner is highest `source_version`.
7. Projection lag metric (`projection_lag_seconds`) is emitted per rebuild; alert threshold defined in a config file (no pager wired yet).
8. No public read path has been switched; legacy search still serves legacy data.
9. DLQ contains failed items with `attempt_count` and `dlq_reason`; test proves DLQ entry created after `max_attempts`.
10. `pnpm lint` + `pnpm typecheck` + `pnpm test` pass; added integration tests cover the outbox-to-projection flow end-to-end with a real Postgres.

**Dependencies**: Phase 01 (needs canonical tables and identity_mutations/outbox_events + cache_invalidations tables).

**Risks**
- Worker-at-a-time vs. worker-pool concurrency; start single-consumer, add `SKIP LOCKED` for queue tables only.
- Vercel cron jitter vs. SLO; document that SLO targets apply post-launch under real infra.

---

## Phase 03 — Semantic Projection (Versioned Embedding Index)

**id**: 03
**slug**: semantic-projection
**goal**: Introduce `semantic_inventory_projection` with `embedding_version`, shadow-build + atomic swap, and a tombstone fast lane; make semantic search read only PUBLISHED rows at the current version.

**In scope**
- `semantic_inventory_projection` table with `embedding_version`, `sanitized_content_hash`, `embedding_vector` (pgvector), `coarse_filter_attrs`, `publish_status`, `last_built_at`.
- `embed_publish` worker consuming outbox `EMBED_NEEDED` events; writes at current `embedding_version` only.
- Shadow-build pipeline: build new-version rows into a shadow table, coherence check, atomic `publish_status` swap.
- Semantic tombstone fast lane on the same `publish_high` queue; applies to both active and shadow versions during swap window.
- Per-minute token budget for embedding API; worker-local circuit breaker.
- Query path updates: semantic candidate generation only returns rows matching target `embedding_version`.
- Version tracker / `last_embedded_version` on `listing_inventories`.
- Kill switches wired: `disable_semantic_search`, `pause_embed_publish`, `rollback_embedding_version`.

**Out of scope**
- Query snapshots / pagination pinning (Phase 04 uses the version field produced here).
- Autocomplete projection (Phase 05).
- Swapping the live search route to read from the new projection (Phase 04 does that together with snapshot work).

**Files likely touched**
- `prisma/schema.prisma` + migrations.
- `src/lib/embeddings/` (extend existing).
- `src/lib/search/search-v2-service.ts` (read target embedding_version only; gated by flag).
- `src/lib/projections/semantic.ts` (new).
- `src/lib/flags/` (add kill switches).
- `src/__tests__/lib/embeddings/`, `src/__tests__/lib/projections/semantic.test.ts`.
- Script: `scripts/embedding-shadow-swap.ts` (new) for operator-driven swap drill.

**Acceptance criteria**
1. New listing hits `PENDING_EMBEDDING` after filter projection publishes; embed worker moves it to PUBLISHED only when `semantic_inventory_projection.publish_status=PUBLISHED` at current `embedding_version`.
2. Cross-version search isolation: a query at embedding_version `v3` cannot return candidates from version `v2`; test proves version pinning in WHERE clause.
3. Shadow-build drill: script loads N=50 sample inventories under a new `embedding_version`, runs a coherence check comparing top-K overlap with the active version above threshold, then atomically swaps `publish_status`; integration test exercises this with two synthetic versions.
4. Tombstone during swap: a suppression arriving mid-swap tombstones both active and shadow rows; test verifies both.
5. `disable_semantic_search` flag causes semantic queries to fall back to filter-only with the documented UI cue; test asserts response shape.
6. `pause_embed_publish` halts new embeddings without affecting the active projection; existing rows remain queryable.
7. `rollback_embedding_version` flag points reads at the prior PUBLISHED version; test proves query uses the target version.
8. Provider-down simulation: embedding API fails; listing stays in `PENDING_EMBEDDING`; filter search still returns the listing; semantic search excludes it.
9. Per-minute token cap honored: embed worker refuses to exceed budget; excess items requeue with jitter.
10. All tests pass; shadow-swap drill runbook committed under `docs/runbooks/embedding-swap.md`.

**Dependencies**: Phase 02 (outbox + projections).

**Risks**
- pgvector index maintenance during swap; document concurrent-index-build plan in the runbook and test it.
- Shadow-build storage cost; time-box shadow retention to post-swap + 24 h.

---

## Phase 04 — Search, Grouped Render, Snapshots & Pagination

**id**: 04
**slug**: search-grouped-render-snapshots
**goal**: Cut search over to projection reads, group results per `unit_id` at current epoch, pin pagination/map to `query_snapshots` with epoch + model versions, and ship snapshot-expired UX without silent duplication.

**In scope**
- `query_snapshots` table (ordered `unit_id` array + `query_hash`, `projection_epoch`, `embedding_version`, `ranker_profile_version`, `unit_identity_epoch_floor`, TTL).
- SearchSpec validator (admission clamps: occupants, max_gap_days, radius, deep paging cap).
- Inventory-level matching → group by `unit_id@active_epoch` → join `unit_public_projection` for card + map payload.
- Filter + semantic paths share one snapshot + one grouped contract; list and map responses return identical `query_snapshot_id`.
- `snapshot_expired` structured response + client refresh cue (UI copy + telemetry event).
- Hole backfill: tombstoned units between snapshot creation and render are filtered out and backfilled up to `page_size`; `snapshot_hole_ratio` metric.
- Cluster-only mode on very large viewports; `force_list_only` + `force_clusters_only` kill switches.
- Cursor module rewrite keyed by `(query_snapshot_id, page)`.

**Out of scope**
- Private-schema separation (assumed already handled in Phase 01).
- Client cache coherence / ETags (Phase 08).
- Contact-host flow, phone reveal (Phase 05 / Phase 06).
- Saved-search alerts (Phase 06 handles alert-time revalidation).

**Files likely touched**
- `src/lib/search/search-v2-service.ts`, `search-orchestrator.ts`, `search-query.ts`, `cursor.ts`, `query-hash.ts`, `search-doc-queries.ts`, `search-response.ts`.
- `src/app/api/search/route.ts`, `src/app/api/map-listings/route.ts`, `src/app/api/search-count/route.ts`.
- `src/components/search/SearchResultsClient.tsx` (snapshot_expired handling + refresh cue).
- `src/__tests__/lib/search/`, `src/__tests__/app/search/`.
- `src/lib/flags/` (add `force_list_only`, `force_clusters_only`).
- `prisma/schema.prisma` (+ migration for `query_snapshots`).

**Acceptance criteria**
1. Page 1 → Page 2 stability: with a mid-query embedding-version bump, pagination still reads the same snapshot and returns the expected next slice (no skips/dupes); test asserts.
2. Two visually-identical queries across model versions have different `query_hash` values; test verifies hash-normalization includes all four version tokens.
3. List and map responses for the same query return identical `query_snapshot_id`, identical ordered unit array up to their shared prefix; test verifies.
4. Snapshot TTL expiry returns a `snapshot_expired` shape with canonical hash; client rebuilds transparently with a visible refresh cue; e2e test (Playwright) asserts the cue renders.
5. Hole backfill: deleting a unit mid-pagination leaves no short page; test inserts a tombstone between page-1 and page-2 fetches and asserts page size unchanged.
6. Admission clamps reject pathological payloads with 400 and a structured error; `requested_occupants>20`, `max_gap_days>180`, and unbounded radius are rejected.
7. Cluster-only fallback at the documented zoom-level threshold; `force_clusters_only` flag forces it regardless of zoom.
8. Deep-paging cap enforced (e.g., page > 20 rejects with a structured capped-result response).
9. `snapshot_hole_ratio` metric exposed; threshold alert documented.
10. All affected Jest + Playwright suites pass; `filter-regression` guard still green.

**Dependencies**: Phase 02 (filter projections) and Phase 03 (semantic projection + `embedding_version`).

**Risks**
- Existing `SearchResultsClient` pagination uses `seenIdsRef` + `searchParamsString` keying (per CLAUDE.md §Search pagination invariants). Snapshot-based cursors change invariants; update docs and tests alongside.
- Clamp thresholds must match existing values used by filter-regression tests; audit before changing.

---

## Phase 05 — Privacy, Autocomplete, Contact Flow & Host-Ghost

**id**: 05
**slug**: privacy-contact-host-ghost
**goal**: Enforce structural privacy (public_point, public_cell_id, autocomplete projection), deliver the primary contact-host action path, add the reveal-phone audit path, add moderation-precedence + host-blocking checks, and wire host-ghost SLA restoration timers (credit issuance arrives in Phase 06).

**In scope**
- Stable `public_point` + `public_cell_id` + `public_area_name` persistence per `physical_units.privacy_mode`; density-aware coarsening table with `privacy_version`.
- Approximate search filtering + rendering use the same public geometry — no exact-point rendering unless `privacy_mode=EXACT`.
- Autocomplete projection: public area labels + sanitized tokens only; no raw-address lookups.
- Contact-host route: admission → idempotency → `unit_identity_epoch_observed` check → pre-condition checks (host not banned, no block, host not mass-deactivating) → durable contact_attempt record. Credit consumption path is stubbed for Phase 06.
- Phone-reveal route: dedicated rate-limited audit path; `disable_phone_reveal` kill switch; fail-closed on rate-limiter outage.
- Moderation-precedence already enforced at DB (Phase 01) but handler returns 423 Locked with sanitized suppression reason here.
- Host blocking/read-blocking checks: `BlockedUser` (already exists) integrates into contact + reveal paths with neutral "host not accepting contact" response.
- Host-ghost detection: timer job monitors read-receipts per listing message; qualifying events enqueue `restoration.HOST_GHOST_SLA` outbox items (consumer in Phase 06).
- Host mass-deactivation detector (scheduled job).
- Outbound-message content guard: regex flag for phone-number/email leakage → soft flag for review, not hard block.

**Out of scope**
- Credit ledger, entitlement state, paywall (Phase 06).
- Stripe Checkout (Phase 06).
- Cache-invalidation push / service-worker floor (Phase 08).
- Email/SMS transport pipeline beyond existing adapter (reuse `src/lib/email.ts`).

**Files likely touched**
- `prisma/schema.prisma` + migration (public geometry fields, autocomplete_projection).
- `src/lib/geo/`, `src/lib/geocoding.ts`, `src/lib/locations/`.
- `src/lib/places/`, `src/lib/nearby-categories.ts`, `src/lib/nearby-intent.ts`.
- `src/app/api/autocomplete/route.ts` (new; or extend existing places route).
- `src/app/api/contact/route.ts` (new), `src/app/api/phone-reveal/route.ts` (new).
- `src/lib/messaging/`, `src/lib/messages.ts`.
- `src/lib/flags/` (`disable_phone_reveal`).
- `src/__tests__/lib/privacy/`, `src/__tests__/api/contact/`, `src/__tests__/api/phone-reveal/`.
- Runbooks: `docs/runbooks/privacy-audit.md` (new).

**Acceptance criteria**
1. Approximate listing payloads never contain `exact_point`, `unit_number`, or raw `address_line_1` outside the private schema; static analysis (grep script) asserts no public route selects those fields.
2. Autocomplete returns only area labels + sanitized tokens for 100% of test inputs including raw addresses; privacy-violation counter stays at 0.
3. Contact-host happy path: durable `contact_attempts` row inserted with `client_idempotency_key`, `unit_identity_epoch_observed`, `contact_kind`; double-submit returns success idempotently.
4. Stale unit reference: client submits with an old `unit_identity_epoch_observed`; if merged → server rewrites to successor and proceeds; if split → server returns 409 with refresh prompt. Both paths tested.
5. Blocked user: blocked-user contact returns neutral response, no `contact_attempts` row, no block disclosure leaked. Test verifies response body + absence of audit disclosure.
6. Phone reveal fails closed on rate-limiter/redaction outage (flag + simulated outage); test asserts fail-closed.
7. `disable_phone_reveal` flag returns unavailable while contact-host still works; test proves both behaviors.
8. Moderation-precedence: host edit on a SUPPRESSED row returns 423 Locked with sanitized reason; test asserts response body structure.
9. Host-ghost timer enqueues `RESTORED_HOST_GHOST_SLA` event after the 48-h SLA with zero read-receipt activity on any listing message; test uses fake clock and asserts outbox row appears.
10. Outbound-message content scan soft-flags obvious phone/email leakage in a sample corpus; hard-block disabled; test asserts flag-not-block behavior.

**Dependencies**: Phases 01–04 (epoch, projections, search-stable snapshots, canonical writes).

**Risks**
- Existing autocomplete route may already read `Location` directly; audit and refactor cleanly.
- Density-aware coarsening table must be reviewable for Fair Housing compliance — mark as non-deferred doc requirement per §8.

---

## Phase 06 — Monetization: Stripe, Entitlement, Paywall

**id**: 06
**slug**: monetization-stripe-entitlement
**goal**: Deliver canonical `stripe_events` / `payments` / `refunds` / `entitlements` ledgers and the derived `entitlement_state` projection; implement Checkout, webhook, paywall evaluator, automatic credit restoration, chargeback freeze/defrost, and banned-user in-flight auto-refund.

**In scope**
- Stripe SDK dep + env vars; server-only price catalog for `MINI_PACK_3` ($4.99) and `MOVERS_PASS_30D` ($9.99).
- Tables: `stripe_events` (ON CONFLICT id DO NOTHING), `payments`, `refunds`, `entitlements`, `entitlement_state`, `contact_consumption`.
- Webhook receiver with signature verification → `stripe_events` insert → `payment_webhook` outbox append in same tx → 200 early.
- Entitlement worker serialized per `user_id` with hot-user overflow queue on reserve capacity.
- Grant math: delta-tracked grants (`window_start_delta`, `window_end_delta`); pass-extension math produces the deterministic window union per §6.13.
- Refund math: subtract exactly the refunded grant's deltas; recompute projection from ledger truth.
- Chargeback: `dispute.created` → `freeze_reason=CHARGEBACK_PENDING` (blocks new gated actions only); `dispute.closed won` → defrost; `dispute.closed lost` → full revocation (retain freeze if `fraud_flag`).
- Paywall evaluator: order = freeze gate → active pass window → free credits → paid credits → 402 with paywall payload. Re-evaluated server-side at every gated action; client state never trusted.
- Contact-host credit consumption wired into the Phase 05 route; unique `(user_id, unit_id, contact_kind, unit_identity_epoch_written_at)` + `(user_id, client_idempotency_key)`.
- Automatic credit restoration consumers: `RESTORED_HOST_BOUNCE`, `RESTORED_HOST_BAN`, `RESTORED_HOST_MASS_DEACTIVATED`, `RESTORED_HOST_GHOST_SLA` (this last from Phase 05 timer), and `RESTORED_SUPPORT`.
- Banned-user in-flight auto-refund path.
- Free-credit farming controls: email normalization (lowercase + strip Gmail dots + strip +tags + disposable domain blocklist), device-fingerprint + IP-cluster heuristics for repeat-FREE throttle.
- Card-testing controls on Checkout creation: per-IP + per-fingerprint limiter; 3-fail window triggers temp block.
- Kill switches: `disable_payments`, `freeze_new_grants`, `emergency_open_paywall` (with forced post-flag `fraud_audit_after_flag_off` job).
- Alert-time publish-state revalidation for saved-search alerts (refuses to deliver to tombstoned targets).

**Out of scope**
- Subscriptions, auto-renew, escrow, multi-currency, host-side monetization, promo UI.
- Phase 08 client-cache coherence surfaces.

**Files likely touched**
- `prisma/schema.prisma` + several migrations.
- `src/lib/payments/` (new module tree: `stripe-client.ts`, `checkout.ts`, `webhook.ts`, `entitlement-worker.ts`, `paywall-evaluator.ts`, `restoration.ts`).
- `src/lib/normalize-email.ts` (extend: Gmail dots + tags; disposable domain list).
- `src/app/api/checkout/route.ts` (new), `src/app/api/webhook/stripe/route.ts` (new).
- `src/app/api/contact/route.ts` (add paywall call).
- `src/app/api/phone-reveal/route.ts` (add paywall call).
- `src/lib/search-alerts.ts` (deliver-time publish-state revalidation).
- `src/lib/flags/` (`disable_payments`, `freeze_new_grants`, `emergency_open_paywall`).
- `src/__tests__/lib/payments/` (hefty — grant math, refund math, pass-extension math, out-of-order events, chargeback flows, restoration flows).
- Playwright: `tests/e2e/payments/` (checkout happy path, webhook-post-confirm, paywall gating).
- Runbooks: `docs/runbooks/chargeback-defrost.md`, `docs/runbooks/emergency-open-paywall.md`.

**Acceptance criteria**
1. Webhook replay: the same `stripe_events.id` processed twice yields exactly one grant; test asserts idempotency.
2. Pass-extension math: buying a second MOVERS_PASS_30D during an active pass extends `window_end = max(now, current_window_end) + 30d`; refunding any one grant subtracts exactly that grant's deltas; test verifies window union collapses deterministically.
3. Out-of-order events: refund arriving before its parent payment is held with backoff; late-arriving payment then both grant-and-revoke apply in source order; net state equivalent to in-order replay. Test covers.
4. Partial refund with 1-2 contacts used routes to manual-review surface; default posture is approve-minus-per-contact when policy permits; test asserts the decision row.
5. Chargeback flow: `dispute.created` sets `freeze_reason=CHARGEBACK_PENDING`; new gated actions return 402 without revoking past data; `dispute.closed won` clears freeze; `dispute.closed lost` applies full revocation. Three tests, one per branch.
6. Banned-user in-flight payment: record payment row, set `fraud_flag=true`, auto-refund via refund queue; never grant entitlement. Test asserts no `entitlements` grant row and refund row created.
7. Paywall evaluator p99 budget: synthetic 500-request load completes within p99 < 100 ms on the hot path (test harness; not a production SLO claim).
8. Free → Mini-pack spend order: FREE credits consumed before MINI_PACK credits when no active pass; pass-holder contact logs with `consumed_credit_from=NONE_PASS_UNLIMITED` but consumes 0 credits. Two tests.
9. Automatic restoration: synthetic host-bounce, host-ban, host-mass-deactivation, and host-ghost SLA each produce exactly one credit-back entitlement row, audit entry, and restoration event. Four tests.
10. Amount-tampering safety: webhook with amount mismatch vs. server-side price refuses the grant and pages operations; test asserts refusal + no grant + audit row.
11. `disable_payments` + `freeze_new_grants` + `emergency_open_paywall` behave per §15; `emergency_open_paywall` auto-schedules the post-flag fraud audit job.
12. All tests pass; payment model has ≥95% branch coverage on grant, refund, and restoration math.

**Dependencies**: Phase 05 (contact + host-ghost timer), Phase 02 (outbox workers), Phase 01 (canonical tables + identity epoch).

**Risks**
- Stripe test mode vs. live mode separation — `livemode=false` events must never grant; enforced in tests.
- Hot-user partitioning correctness under abuse — covered by explicit test.
- Email normalization correctness on real address variants; test with a curated fixture.

---

## Phase 07 — Saved Searches, Alerts & Deliver-Time Revalidation

**id**: 07
**slug**: saved-searches-alerts-revalidation
**goal**: Ship durable saved searches + alert subscriptions with `embedding_version_at_save` / `ranker_profile_version_at_save`, the alert matcher + deliver worker that always revalidates `publish_status` at send time, and pass-gated alert-delivery enforcement.

**In scope**
- Tables: `saved_searches` (+ `search_spec_hash`, version columns, `active`), `alert_subscriptions` (+ `channel=EMAIL`, `frequency=INSTANT|DAILY_DIGEST`, `last_delivered_at`).
- Alert matcher worker on `alert_match` queue: reverse-match new/updated inventory against `saved_searches`.
- Alert deliver worker on `alert_deliver` queue: deliver-time publish-state revalidation; drop with audit if any referenced unit is not PUBLISHED.
- Pass-gated evaluation at delivery: expired pass deactivates delivery but saved search record is preserved.
- Re-hash of saved spec under current `embedding_version`/`ranker_profile_version` when the matcher detects version advance since save.
- Saved-search rewrite during identity merge (Phase 01 event fan-out wiring here).
- `disable_alerts` kill switch.
- Email templates reuse `src/lib/email-templates.ts`.

**Out of scope**
- SMS/push channels (EMAIL only for Phase 1).
- Autocomplete changes (Phase 05).

**Files likely touched**
- `prisma/schema.prisma` + migration.
- `src/lib/search-alerts.ts`, `src/lib/email.ts`, `src/lib/email-templates.ts`.
- `src/lib/saved-search-parser.ts` (query-hash normalization must match Phase 04's canonical form).
- `src/app/api/saved-searches/`, `src/app/saved-searches/`.
- `src/__tests__/lib/search-alerts/`, Playwright alert-flow smoke test.

**Acceptance criteria**
1. A saved search persists `search_spec_hash`, `embedding_version_at_save`, `ranker_profile_version_at_save`. Test verifies.
2. Matcher detects version advance: after an `embedding_version` bump, the saved spec is re-hashed under the new version before matching. Test covers.
3. Alert deliver refuses tombstoned targets: delivered-to-tombstoned-target counter stays at 0 when a listing is suppressed between match and deliver. Test injects a mid-flight tombstone and asserts drop-with-audit.
4. Expired pass deactivates delivery: saved search remains active but no email sent; `last_delivered_at` not updated. Test asserts.
5. Identity merge rewrites unit filters in saved searches; geometry filters untouched. Two tests.
6. `disable_alerts` pauses match + deliver without deleting records; enabling resumes from durable offsets.
7. Alert delivery e2e: Playwright triggers a matching publish and asserts an email is queued to the test user (stubbed transport).
8. All existing saved-search tests + new ones pass; no flakes.
9. DLQ routing on repeated deliver failures; `attempt_count` and `dlq_reason` populated.
10. `pnpm lint` + `pnpm typecheck` + `pnpm test` + affected Playwright suites green.

**Dependencies**: Phase 04 (canonical query-hash), Phase 06 (pass-gated evaluation).

---

## Phase 08 — Client Cache Coherence

**id**: 08
**slug**: client-cache-coherence
**goal**: Extend the consistency contract to edge + service-worker caches via epoch-scoped ETags, server-provided version floor, and cache-bust push on tombstone/identity-mutation.

**In scope**
- Public cacheable responses carry `projection_epoch` ETag; listing-detail responses additionally carry `unit_identity_epoch_written_at` and, when semantic-reached, `embedding_version`.
- Short `Cache-Control: stale-while-revalidate` on listing detail.
- `cache_invalidations` consumer fan-out via Web Push (where granted) + SSE foreground channel; evicts matching entries on receipt keyed to `unit_id`.
- Service worker refuses to serve cached responses whose `projection_epoch` is older than a server-provided floor; floor is delivered with every authenticated response.
- Semantic autocomplete & search-bar suggestions not cached beyond a single session.
- Integration with existing `public/sw.js` (or `src/pwa`) and Web Push registration.

**Out of scope**
- Paywall changes (Phase 06 already ships).
- Search snapshot behavior (Phase 04).

**Files likely touched**
- `public/sw.js` (or wherever the service worker lives).
- `src/app/` response headers utilities; dedicated `src/lib/cache-coherence/` module.
- `src/hooks/useCacheCoherence.ts` (or similar client).
- `src/app/api/push/route.ts` for Web Push subscription.
- Playwright/E2E: simulate mobile (Mobile Chrome / Mobile Safari project) and assert cache eviction on tombstone push.

**Acceptance criteria**
1. Every cacheable public response includes `ETag: epoch=<projection_epoch>`; test verifies header presence.
2. Listing detail response additionally includes `unit_identity_epoch_written_at`; and `embedding_version` when the request hit a semantic-reached page.
3. Tombstone push evicts matching cached entries on a real-device Playwright run; e2e test opens detail page, tombstones on server, and asserts next read bypasses stale cache.
4. Service worker rejects serving a cached response whose `projection_epoch` is older than the server-supplied floor; test simulates stale epoch and asserts revalidation fetch.
5. `Cache-Control` on listing detail uses `stale-while-revalidate`; test reads header.
6. Cache-bust push delivery latency inside the documented hide-SLA on a real-device simulation; test measures.
7. Autocomplete suggestions not persisted beyond session; test verifies storage absence after session-end simulation.
8. No epoch leaked on anonymous routes that should not carry one; test grep asserts absence on error pages.
9. All tests pass including the mobile-project Playwright suites.
10. Runbook: `docs/runbooks/cache-coherence-debug.md`.

**Dependencies**: Phases 02, 03, 04, 05.

---

## Phase 09 — Cutover: Retire Booking Model; Enable Contact-First Read Paths

**id**: 09
**slug**: cutover-retire-booking
**goal**: Retire the booking-era scaffolding (destructive migrations, since pre-launch dummy data), flip public read paths to the new projections, and prove rollback/degraded modes before launch hardening.

**In scope**
- Schema cleanup migration: drop `Booking`, `ListingDayInventory`, `BookingAuditLog`, hold-related columns, and any booking-coupled indexes.
- Route cleanup: remove `src/app/api/bookings/*`, `src/lib/booking-state-machine.ts`, booking-related components, tests, and playwright specs (or mark replaced).
- Flip all `phase0*_enabled` flags → defaults `true` for dev/staging; production defaults remain `false` until Phase 10.
- Shadow-read gate removal (if any was staged) — since pre-launch dummy data, no dual-write was needed; instead document a single-flag cutover.
- Full end-to-end smoke: create-unit → publish → search → contact → paywall → payment → restoration → alert.
- Remove stale references from `docs/` and CLAUDE.md mentions of booking flows (keep reliability rules section that generalizes beyond booking).
- Seed: `scripts/seed-e2e.js` refit for contact-first model.

**Out of scope**
- Launch gates (Phase 10).
- Retention policies / backups validation (Phase 10).

**Files likely touched**
- `prisma/schema.prisma` + destructive migration.
- `src/app/api/bookings/*` — delete.
- `src/lib/booking-*.ts` — delete.
- `src/app/bookings/*` — delete or redirect to replacement.
- `tests/e2e/*booking*` — delete or port.
- `scripts/seed-e2e.js` — rewrite.
- `docs/TROUBLESHOOTING.md`, `AGENTS.md` — prune booking refs.
- `src/components/search/*` — verify card/map match new projection contract.

**Acceptance criteria**
1. Destructive migration applies cleanly on dev DB; seed rebuilds a representative fixture (hosts, physical_units, listing_inventories, published projections, semantic projection, entitlements).
2. No code path references `Booking` / `ListingDayInventory` / booking-state-machine; LSP `findReferences` over these symbols returns zero callers.
3. Full e2e smoke passes on Playwright: create listing → publish → search (filter + semantic) → contact (free → paywall → Stripe test checkout → webhook → active entitlement) → host-ghost SLA restoration → alert delivery with tombstone drop.
4. Rollback drill: toggling `phase0*_enabled` flags back off returns the app to a documented degraded-safe mode (list-only, semantic disabled, no reveal, no new publish).
5. Booking-era Jest/Playwright suites removed or ported; `pnpm test` / `pnpm test:e2e:chromium` green.
6. `pnpm typecheck` + `pnpm lint` green.
7. `pnpm run seed:e2e` succeeds and produces a searchable fixture.
8. Docs updated: CLAUDE.md references booking rules generically only; `.claude/CLAUDE.md` reliability section generalized from holds/bookings → canonical state transitions.
9. Grep sweep: no `TODO.*booking` / `FIXME.*hold` strings left in active code.
10. Data-safety note recorded in migration comment: "pre-launch, dummy data only; destructive drop accepted".

**Dependencies**: Phases 01–08.

**Risks**
- CLAUDE.md explicitly calls out hold/booking reliability rules — must be rewritten, not just deleted, since the invariants generalize.
- Playwright dedupe and other WIP specs (see git status) may depend on booking scaffolding; audit before removal.

---

## Phase 10 — Launch Hardening: Runbooks, Kill Switches, Chaos & Drills

**id**: 10
**slug**: launch-hardening-drills
**goal**: Complete the Definition-of-Done checklist from §23 — runbooks, kill-switch exercise, chaos injection, identity drills, embedding swap drill, restore drill, post-emergency fraud audit — and sign off on launch gates.

**In scope**
- Per-kill-switch exercise log: `force_list_only`, `force_clusters_only`, `disable_semantic_search`, `pause_geocode_publish`, `pause_embed_publish`, `rollback_ranker_profile`, `rollback_embedding_version`, `pause_backfills_and_repairs`, `pause_identity_reconcile`, `disable_payments`, `freeze_new_grants`, `disable_alerts`, `emergency_open_paywall`, `disable_phone_reveal`, `disable_new_publication`.
- Runbooks under `docs/runbooks/`: incident, privacy-audit, chargeback-defrost, emergency-open-paywall, embedding-swap, cache-coherence-debug, identity-merge, identity-split, backup-restore, degraded-safe-mode.
- Chaos + load tests: 10x identical-query storm, geocoder outage, embedding-provider outage, embedding_version swap under load, projection-worker outage, Redis/limiter outage, duplicate create storm, conflicting edits, identity-mutation storm, webhook retry storm, hot-user partition saturation.
- Identity drills: synthetic merge (2→1) + synthetic split (1→2); verify contact_consumption, entitlements, saved items, reviews, search ordering stay coherent.
- Restore drills: DB restore + post-restore semantic smoke; outbox replay posture.
- `fraud_audit_after_flag_off` job implementation + synthetic exercise.
- Alert wiring: paging rules from §18.3 → Sentry alerts / PagerDuty stubs (or Vercel observability).
- Final SLO dashboards (if not already live): search availability, write success, projection/embedding/identity lag, snapshot hole ratio, alert delivery safety, webhook processing, paywall latency, ledger consistency.
- Public-payload PII scanner in CI: grep + static analysis pass that fails builds on raw-address leakage.

**Out of scope**
- Post-launch optimization work.
- Subscriptions / multi-currency (explicit non-goals).

**Files likely touched**
- `docs/runbooks/*` (many new files).
- `src/app/api/cron/*` (jobs for drills / fraud audit).
- `src/__tests__/chaos/` (new), `tests/load/*` (extend).
- `.github/workflows/*` or CI pipeline files (PII scanner, chaos-as-CI).
- `src/lib/metrics/*` (SLO dashboards wiring).

**Acceptance criteria**
1. Every kill switch from §15 has a runbook, a test, and a documented operator procedure. Inventory file `docs/runbooks/kill-switch-catalog.md` lists them all.
2. Identity drill: synthetic MERGE and SPLIT both complete; `contact_consumption` uniqueness and entitlement math remain coherent; test produces a diff report showing zero anomalies.
3. Embedding swap drill: shadow build + atomic swap + tombstone coverage during swap; test proves no observable ranking gap during the swap window.
4. Restore drill: backup → restore → semantic smoke test returns expected candidates at the post-restore `embedding_version`.
5. Chaos suite: all scenarios in scope produce documented degraded behaviors, no data corruption, and no privacy leaks. `chaos` job green in CI for at least one clean run.
6. SLO paging rules configured per §18.3; evidence is stored configuration (yaml or equivalent) under `ops/slo/`.
7. `emergency_open_paywall` exercise: flag on → gated action logs `EMERGENCY_GRANT` → flag off → `fraud_audit_after_flag_off` runs and produces an audit report. End-to-end test.
8. PII scanner CI check fails a synthetic PR that leaks `exact_point`; succeeds on clean PR. Two test cases.
9. Launch degraded-safe mode (list-only + semantic disabled + no reveal + no new publish) exercises cleanly as a single-switch bundle; documented in `docs/runbooks/degraded-safe-mode.md`.
10. Definition-of-Done checklist (§23) file in repo `docs/launch/definition-of-done.md` has every item checked with a linked test or runbook. Manager confirms.
11. All prior tests green; no new flakes introduced.

**Dependencies**: Phases 01–09.

---

## Cross-phase scheduling notes

- Phases 01 → 02 → 03 are strictly sequential (canonical schema → outbox + projections → semantic projection).
- Phase 04 depends on 02 and 03 but does not block Phase 05's non-pagination surfaces (privacy + autocomplete can proceed in parallel with 04 if two lanes are desired later; this orchestrator runs strictly sequential per the spec).
- Phase 06 assumes Phase 05's contact route exists so credit consumption can attach to it.
- Phase 07 depends on Phase 04 (canonical query hash) and Phase 06 (pass-gated eval).
- Phase 08 (client cache coherence) consumes signals from Phases 02, 04, 05.
- Phase 09 is the only phase that performs destructive retirement of the booking era.
- Phase 10 runs all launch drills and signs off §23.

## Decomposition review asks (raise before approval)

1. Confirm phase boundaries — any combination you want to merge or split further?
2. Confirm Phase 06 includes all four restoration reasons; any additional reason (e.g. support-manual) to include now vs. post-launch?
3. Confirm the order Phase 05 before Phase 06 (contact route precedes credit consumption). Alternative would be a fused Phase 05+06.
4. Confirm Phase 09 is allowed to run destructive migrations given pre-launch dummy data.
5. Confirm launch gate location — Phase 10 ends with a human sign-off, not an auto-merge.
