Roomshare Final Production Architecture Plan
Version 10.0
Unit + Inventory + Published Projection + Semantic Projection + Identity Lifecycle + SRE Hardening + Entitlement Monetization
Final source-of-truth plan for the no-booking Roomshare model with one-time contact entitlements. Primary conversion path: Contact Host with optional phone reveal. Monetization: 2 free contacts, Mini Pack of 3 contacts at $4.99, and a 30-day Mover’s Pass at $9.99. Goal: the most stable search, privacy, publication, and paywall flow possible under partial failure, mixed deploys, operational stress, identity mutation, and model-version drift.
Field
Value
Status
Final recommended implementation blueprint (v10.0)
Primary audience
Founder, product engineer, backend engineer, frontend engineer, DevOps/SRE reviewer
Supersedes
v9.0 and earlier plans that treated unit_id and embedding_version as static, left snapshot expiry undefined, relied on support-only refund for host ghosting, and did not specify client-cache coherence.
Delta from v9
Unit identity is now versioned and merge/split-aware. Semantic embedding index is a first-class projection with its own publish state. Query snapshots carry embedding and ranker versions. Pass extensions record deltas so partial refunds have deterministic math. Alert delivery revalidates publish state at send time. Host ghosting has automatic refund signals. Moderation writes have explicit precedence over host writes. Client caches are epoch-scoped. Email normalization closes cheap free-credit farming. Chargeback freeze has a defrost path.
Executive verdict. The correct end-state is not a single listings table with fuzzy card logic or a synchronous paywall, nor a system that assumes its unit ids and embedding models never change. The stable design separates physical units, rentable inventories, sanitized published projections, semantic projections, and rebuildable payment and entitlement ledgers; versions identity itself; publishes through transactional outboxes; paginates over query snapshots that are pinned to projection epoch, embedding version, and ranker profile; and treats privacy, degradation, rollout, recovery, client-cache coherence, and monetized contact actions as first-class design constraints.
1. Executive summary
This document is the final recommended implementation plan for Roomshare’s listing, search, map, and contact-host experience after removing booking from scope. The system no longer attempts reservation-grade consistency. Instead, it optimizes for correctness of discovery, privacy, deduplication, operational safety, graceful degradation, and economic truth.
The hardest product-model decision is fixed: physical location, rentable space, public search payload, and semantic search payload are four different concerns and are modeled separately. Physical unit identity is itself versioned, because canonicalization and duplicate-merge decisions are recurring operations, not a one-time pre-launch cleanup.
The other major change in v10 is operational honesty about two previously-silent surfaces. First, the semantic embedding index is a projection with its own publish state, version, and tombstone fast lane. Ignoring it would let moderated listings keep surfacing through vibe search and would silently break ranking on model upgrades. Second, the client cache, including service worker caches on mobile, is part of the consistency contract; a tombstone that stops at the server still shows a suppressed listing on a phone that opened it an hour ago.
Phase 1 monetized surface is unchanged in intent: 2 free contacts per verified account, a Mini Pack of 3 contacts at $4.99 with no expiry, and a 30-day Mover’s Pass at $9.99. Browsing, searching, and viewing listings remain free forever. The only paywalled actions are contact-host beyond the free allowance, phone reveal, and saved-search alerts. Payments are canonical. Entitlements are derived. Pass extensions are recorded as deltas so refunds produce deterministic windows. Paywall evaluation is a read-time operation. The free tier never depends on Stripe uptime.
Item
Decision
Primary objective
Make search, map, contact-host, and paywall flows stable and privacy-safe under normal load, partial dependency failure, mixed-version deploys, identity mutation, and model-version drift.
Business model assumption
No booking engine. Hosts publish availability windows and contact preferences. Users search, evaluate, and contact the host.
Success definition
One public unit card per physical unit at any given identity epoch, correct inventory matching, no exact-location leak for approximate listings, stable pagination pinned to projection epoch and model versions, safe publication semantics, client caches that honor tombstones, and low-blast-radius failure modes.
Monetization model
2 free contacts per verified account, a 3-contact Mini Pack at $4.99 with no expiry, and a 30-day Mover’s Pass at $9.99. Paywall only gates extra contact-host actions, phone reveal, and saved-search alerts.
Out of scope
Subscriptions and auto-renewal, escrow, transaction fees, multi-currency beyond USD, host-side monetization, and reservation locking semantics remain out of scope for Phase 1.
2. Product scope and non-goals
The platform supports ENTIRE_PLACE, PRIVATE_ROOM, and SHARED_ROOM inventory types inside a physical unit.
The primary call to action is Contact Host. Phone reveal is optional, rate-limited, and fail-closed.
A host may offer multiple inventories inside one unit, but public search groups results by unit to avoid card spam.
The search system is responsible for discovery quality across both filtered and semantic paths, not reservation enforcement.
Stripe Checkout integration, an entitlement ledger, a contact-consumption ledger, saved searches with email alerts, refund and chargeback handling, card-testing and multi-account fraud controls, and automatic credit restore on host-side failure are in scope.
Identity lifecycle operations (unit merge, unit split, canonicalizer upgrade, embedding model upgrade) are in scope with explicit reconciliation contracts.
Still out of scope:
Subscriptions and auto-renewal, transaction fees, and escrow.
Multi-currency support in Phase 1; USD only at launch.
Promo-code UX in Phase 1; the schema may support it later, but the public UI does not expose it.
Host-side monetization and broader marketplace take-rate features.
Real-time booking, escrow, and reservation locking semantics.
Guaranteeing that a listing is still open at the exact moment a user sees it, beyond the publication, freshness, and deliver-time revalidation guarantees defined elsewhere in this plan.
Legal identity verification of property ownership beyond moderation and duplicate-signal workflows, and unlimited deep paging of large metro-wide searches.
3. Reliability contract
Rule
Required behavior
Canonical writes are the only source of truth
A host write succeeds only if canonical data and the outbox event commit in the same transaction.
Public search is derived and replace-only
Anonymous search serves only published projections, including the semantic projection. New listings stay hidden until first publish across every projection required for their path. Existing listings keep the previous published version until replacement is ready.
Semantic index is a projection, not an afterthought
The embedding index has its own publish state, its own tombstone fast lane, its own version field, and its own lag SLO. A listing is not PUBLISHED for semantic queries until its embedding is indexed at the current embedding_version.
Unit identity is versioned
Every physical_units row carries a unit_identity_epoch that increments on merge, split, or canonicalizer upgrade. Every downstream row that references unit_id also records the epoch it was written under, so mutation events can reconcile deterministically.
External calls never run inside DB transactions
Geocoder, embedding API, email/SMS, analytics, and cache invalidation happen asynchronously from outbox-driven workers.
Privacy fails closed
If redaction, phone-reveal rate limiting, publish-state validation, or autocomplete projection is unhealthy, the system does not reveal exact location or phone data, and autocomplete falls back to public area labels only.
Search fails soft
Prefer cached or stale-safe results, clusters-only mode, list-only mode, or semantic-disabled mode over blind retries and cascading failure.
Payments are canonical
A Stripe payment is real only when a signature-verified webhook has been persisted and its business effect has been applied transactionally.
Entitlements are derived and delta-tracked
Entitlement state is a projection of payments, refunds, and consumption. Every grant contributes an explicit window_start and window_end delta so extensions and partial refunds have deterministic math.
Paywall never blocks the site
Paywall evaluation failures fail closed on gated actions and fail open on non-gated actions. The free tier continues to work when Stripe is down.
No grant before capture
Never grant entitlement before payment_intent.succeeded has been persisted. Optimistic grant is forbidden.
No client-trusted entitlement
The client may receive an entitlement summary for UI only. Every gated action is re-evaluated server-side from the ledger or entitlement projection.
Refunds, disputes, and host-side failures pass through the outbox
Refunds, chargebacks, revocations, and host-ghost auto-restores use the same durable pipeline as grants and must revoke or restore atomically with audit coverage.
Moderation writes have explicit precedence
Moderation holds lifecycle_status and publish_status. Host writes cannot overwrite either field. A host submit on a suppressed row returns 423 Locked with a sanitized suppression reason, never a silent no-op.
Client caches are epoch-scoped
Every cacheable public response carries a projection_epoch and, where relevant, unit_identity_epoch and embedding_version in its ETag or URL suffix. Tombstones emit cache-bust signals keyed to unit_id, and service workers refuse to serve a response whose epoch is older than the server’s current floor.
4. Core invariants
Invariant
Meaning
Why it matters
One physical unit at a given epoch = one unit_id
All address normalization converges to a single canonical unit identity for a given unit_identity_epoch.
Removes duplicate cards and inconsistent ownership joins while permitting deterministic reconciliation when canonicalization rules change.
Identity mutations are events, not field rewrites
Merges, splits, and canonicalizer upgrades emit unit_identity_changed events with {from_ids, to_ids, epoch, reason}. Downstream consumers reconcile via these events, not by reading the live table.
Prevents silent drift in contact_consumption, entitlements, saved items, reviews, and analytics.
One rentable space = one inventory_id
Each room or space has its own lifecycle and publish state.
Prevents ENTIRE_PLACE, PRIVATE_ROOM, and SHARED_ROOM from being conflated.
One public card = one unit_id at the active epoch
Search groups visible results by unit id scoped to the active identity epoch.
Prevents spammy duplicate cards and map clutter across and through merges.
Anonymous search never reads raw contact data
Public read paths use sanitized projections only.
Eliminates app-layer redaction holes.
Exact address and hidden coordinates are never in approximate payloads
Approximate listings use stable public geometry only.
Stops privacy leakage and triangulation.
Autocomplete reads only public projections
The “what are you looking for” field matches on public area labels and sanitized tokens, never raw address tables.
Prevents exact-address leakage through suggestion hints.
ENTIRE_PLACE uses guest capacity
Capacity is about how many people the unit can host.
Avoids slot semantics where they do not belong.
PRIVATE_ROOM uses room availability plus room capacity
It is a room, not a bed-count row.
Fixes the earlier private-room modeling flaw.
SHARED_ROOM uses open bed counts
Bed supply is explicit and bounded.
Keeps shared inventory semantics accurate.
List card and map popup read the same grouped object
Both surfaces share one grouped summary contract tied to the same query_snapshot_id, projection_epoch, and, when applicable, embedding_version and ranker_profile_version.
Prevents contradictory UI summaries and cross-pane drift.
Pagination is snapshot-based and version-pinned
Page 2 reads the same ordered result-set as page 1 and uses the same embedding and ranker versions.
Prevents duplicates and skips when ranking, embedding, or projection changes.
Snapshots have graceful expiry, not cliffs
On snapshot-miss the server returns a structured snapshot_expired response; the client rebuilds with a visible “results refreshed” cue.
Prevents silent duplication and user confusion on long dwell times.
Every mutation is idempotent
Create, edit, and contact flows accept duplicate delivery safely.
Protects against retries, double-clicks, and flaky networks.
Suppressions are high priority and cache-bursting
Moderation pause or privacy-critical tombstones bypass low-priority queues and emit a client cache-bust signal keyed to unit_id.
Guarantees fast hide behavior even during backlog and on stale mobile caches.
One Stripe event = at most one grant
Webhook replay cannot create duplicate grants.
stripe_events.id uniqueness makes replays a no-op and prevents double-crediting.
One (user_id, unit_id@epoch, contact_kind) = at most one consumption
A user can only consume a given contact action once per unit at a given identity epoch. Identity changes trigger explicit reconciliation.
Makes double-charging mathematically impossible even under retries, duplicate clicks, merges, or splits.
Grants are serialized per user_id with hot-partition isolation
Grant, revoke, and consume events for the same user are processed in causal order. Abuse-rate users overflow into a hot-user queue so they cannot starve their partition-mates.
Prevents cross-event races and partition starvation.
Price is locked at checkout-session creation
An in-flight checkout preserves the product price that was offered when the session was created.
Prevents price-change races and support disputes.
Pass purchase during an active pass is additive via explicit deltas
Buying a new Mover’s Pass appends a grant delta that extends window_end as max(now, current_window_end) + 30d, and records the contribution so it can be subtracted cleanly on refund.
Avoids entitlement loss on extension and makes partial refunds deterministic.
Free credits are non-refundable and non-transferable
Signup credits are policy-limited to the original verified account.
Reduces fraud surface and support complexity.
Consumption is logged even for pass holders
Pass usage records contact events with consumed_credit_from = NONE_PASS_UNLIMITED.
Preserves abuse analytics, evidence bundles, and monetization observability.
Alert delivery revalidates at send time
An alert_deliver job reads current publish_status before sending. A tombstoned listing is never the target of an outbound link.
Prevents delivering emails that deep-link into moderated or deleted listings.
5. Architecture overview
The platform has seven planes: canonical write plane, monetization write plane, entitlement projection plane, async publication plane, semantic projection plane, public read plane, and control plane.
Plane
Components
Responsibility
Canonical write plane
API handlers, validators, Postgres source tables
Accept host writes, enforce invariants, append outbox events, record audit events.
Monetization write plane
Checkout handlers, Stripe webhook receiver, stripe_events ledger, payments, refunds
Persist Stripe events and economic facts durably without granting business effects synchronously on the request path.
Entitlement projection plane
Entitlement worker, entitlement_state projection, contact_consumption ledger, paywall evaluator
Derive user entitlement state with delta-tracked grants, enforce paywall decisions, and keep hot-path reads rebuildable from ledger truth.
Async publication plane
Outbox workers, geocoder worker, projection builders, tombstone handlers, identity reconciler
Turn canonical changes and identity events into published projections without blocking the write path.
Semantic projection plane
Embedding worker, pgvector index, embedding_version tracker, semantic tombstone handler
Maintain a versioned, sanitized embedding index whose freshness and coherence with filter projections is guaranteed.
Public read plane
Search API, query snapshot store, list UI, map UI, epoch-scoped client caches
Serve only sanitized, published, unit-grouped results and honor cache-bust signals tied to projection and identity epochs.
Control plane
Feature flags, kill switches, moderation tools, rate limits, alerts, runbooks
Constrain blast radius, manage rollout, and respond safely during incidents.
Operating model. The critical separations are: physical unit ≠ rentable inventory ≠ published public payload ≠ semantic index entry, and payment ledger ≠ entitlement projection ≠ contact consumption. Identity itself is versioned. Write once to canonical tables, publish and derive asynchronously across every read projection, and read only sanitized projections pinned to known-good epochs and model versions.
6. Canonical data model
The data model is intentionally split so each table owns one concept. This keeps search semantics, moderation, privacy, identity mutation, and failure handling from leaking across layers.
The same rule applies to monetization. Payments, refunds, and contact consumption are canonical ledgers; entitlement_state is a replace-only projection that can always be rebuilt from those ledgers alone.
6.1 Physical units
physical_units represents the real-world location. It is the stable identity used for deduplication, geocoding, privacy projection, and grouping within an identity epoch.
Core fields: id, unit_identity_epoch, canonical_address_hash, canonical_unit, exact_point, public_point, public_cell_id, public_area_name, privacy_mode, privacy_version, geocode_status, canonicalizer_version, supersedes_unit_ids, superseded_by_unit_id, created_at, updated_at.
canonical_address_hash is derived from normalized address components. canonical_unit treats empty or missing unit values consistently.
public_point and public_cell_id are persistent public geometry fields; they are not randomized per request.
privacy_version allows a projection rebuild whenever privacy rules or geometry resolution changes.
unit_identity_epoch increments when this unit is involved in a merge, split, or canonicalizer upgrade. supersedes_unit_ids and superseded_by_unit_id record the directed lineage so downstream consumers can reconcile without ambiguity.
6.2 Host unit claims
host_unit_claims decouples ownership and moderation from the physical unit identity.
Use this table to represent which host claims a unit, whether the claim is verified, and whether the unit is in moderation review.
This prevents ownership disputes from corrupting the base physical-unit identity and makes cross-owner conflict handling explicit.
Claims carry unit_identity_epoch_written_at so a reconciler can detect claims that predate an identity change and re-resolve them.
6.3 Listing inventories
listing_inventories represents the rentable thing inside the unit. It is where category semantics, availability, price, and publication state live.
Core fields: id, unit_id, unit_identity_epoch_written_at, inventory_key, room_category, space_label, capacity_guests, total_beds, open_beds, available_from, available_until, availability_range, price, lease_min_months, lease_max_months, lease_negotiable, gender_preference, household_gender, lifecycle_status, publish_status, row_version, source_version, last_published_version, last_embedded_version, created_at, updated_at.
inventory_key identifies the rentable space inside the unit. It is the anchor for editing, moderation, photo grouping, and duplicate prevention.
row_version is used for optimistic concurrency. source_version increments on every successful canonical change. last_embedded_version tracks the embedding_version used for the most recent successful vector index write.
6.4 Published projections
Use three sanitized read models, not one.
inventory_search_projection: row-level, filterable, sanitized inventory projection used for matching and ranking on filter queries.
unit_public_projection: grouped, sanitized unit rendering payload used for cards, map popups, and list summaries.
semantic_inventory_projection: sanitized vector embedding plus minimal filterable attributes used for semantic candidate generation. Carries embedding_version and publish_status so stale-model rows can be rebuilt atomically.
All projections are replace-only and versioned. Search reads only published rows. A unit is fully visible to filter search when both inventory_search_projection and unit_public_projection are PUBLISHED; it is visible to semantic search only when semantic_inventory_projection is PUBLISHED at the current embedding_version.
This three-projection split matters because filtering is inventory-granular, rendering is unit-granular, and semantic matching is embedding-granular. One projection cannot do all three jobs safely at scale or safely survive a model upgrade.
6.5 Operational tables
outbox_events: durable async handoff for publication, geocoding, embedding, suppression, identity mutation, and notification work.
idempotency_keys: exact-once admission control for create, edit, and contact flows.
audit_events: append-only, redacted operational and security trail.
query_snapshots: short-lived ordered result-set references for stable pagination and map/list consistency. Snapshots pin query_hash, projection_epoch, embedding_version, ranker_profile_version, and unit_identity_epoch_floor.
identity_mutations: append-only record of every merge, split, and canonicalizer upgrade with its input and output unit ids, reason, and epoch.
cache_invalidations: ephemeral queue of cache-bust signals keyed to unit_id plus projection_epoch, consumed by edge and client push channels.
6.6 Category matrix
Category
Required fields
Forced null fields
Search semantics
ENTIRE_PLACE
capacity_guests; availability window; price
total_beds, open_beds, gender_preference, household_gender
Match when capacity_guests >= requested_occupants and lease/date rules pass.
PRIVATE_ROOM
capacity_guests; availability window; price
total_beds, open_beds
Match when the room is available and capacity_guests >= requested_occupants.
SHARED_ROOM
total_beds; open_beds; availability window; price
capacity_guests
Match when open_beds >= requested_occupants and lease/date rules pass.
6.7 Constraint and uniqueness strategy
Use explicit NOT NULL and category-specific CHECK rules for row shape. Do not rely on a single generic CHECK over nullable fields.
Use a canonical unique index for physical units so whitespace, casing, and empty unit values cannot bypass deduplication.
Use one active ENTIRE_PLACE inventory per unit as a hard invariant unless the product explicitly introduces a different scheduling model later.
For hot identities, take a short transaction-level advisory lock during create-or-resolve flows.
Use EXCLUDE or stronger mechanisms only for true cross-row overlap rules; do not encode those rules in weak app-only logic.
contact_consumption uniqueness is enforced on (user_id, unit_id, contact_kind, unit_identity_epoch_written_at). The identity reconciler maintains this index through merges and splits (see 6.15).
Design choice. Because booking is out of scope, the recommended default is one live row per rentable space. Hosts edit the existing listing instead of creating a chain of future rows for the same space. That sharply reduces duplicate risk, summary drift, and moderation ambiguity.
6.8 Stripe events
stripe_events is the webhook idempotency boundary for all Stripe callbacks and replay safety.
Core fields: id (Stripe event id, primary key), event_type, livemode, signature_verified, raw_payload_jsonb, processing_status, attempt_count, received_at, processed_at, and dlq_reason.
Insert with ON CONFLICT (id) DO NOTHING so duplicate deliveries are a hard no-op.
Events with livemode = false are retained for observability, but production business logic never grants entitlement from test-mode traffic.
6.9 Payments
payments is the economic ledger for captured value.
Core fields: id, user_id, stripe_payment_intent_id (unique), product_code, amount_cents, currency, tax_cents, net_cents, status, origin_event_id.
Recommended product_code enum: MOVERS_PASS_30D and MINI_PACK_3 for Phase 1.
Recommended statuses: PENDING, SUCCEEDED, FAILED, REFUNDED_FULL, REFUNDED_PARTIAL, DISPUTED, CHARGEBACK_LOST, CHARGEBACK_WON.
6.10 Refunds
refunds records every Stripe refund or support-issued refund fact without mutating the original payment row.
Core fields: id, payment_id, stripe_refund_id (unique), amount_cents, reason, origin_event_id.
Recommended refund reasons: user_request_within_sla, support_grant, chargeback, duplicate, fraud_suspected, host_bounced, host_banned, host_mass_deactivated, host_ghosted_sla_exceeded.
6.11 Entitlements
entitlements is the immutable grant and revocation ledger used to derive what a user may do.
Core fields: id, user_id, grant_kind, credits_granted, window_start_delta, window_end_delta, source_payment_id, source_refund_id, idempotency_key.
Unique on (user_id, idempotency_key) so the same payment or webhook cannot grant twice.
Revocations are appended as new rows using negative credits or explicit negative window deltas. No grant row is updated or deleted.
Every pass grant carries an explicit window_start_delta and window_end_delta representing its own contribution to the pass window, so refund of any single grant removes exactly its contribution without collapsing the pass earlier than other active grants would support (see 6.13 for the projection math).
6.12 Contact consumption
contact_consumption is the canonical record of each monetized or pass-covered contact action.
Core fields: id, user_id, unit_id, unit_identity_epoch_written_at, inventory_id_nullable, contact_kind, consumed_credit_from, client_idempotency_key, restoration_state (NONE, RESTORED_HOST_BOUNCE, RESTORED_HOST_BAN, RESTORED_HOST_MASS_DEACTIVATED, RESTORED_HOST_GHOST_SLA, RESTORED_SUPPORT).
Unique on (user_id, unit_id, contact_kind, unit_identity_epoch_written_at). Identity reconciler (6.15) rewrites unit_id on merges and preserves uniqueness deterministically.
Also unique on (user_id, client_idempotency_key) to protect against network retries and duplicate form submits.
Restoration events are appended, not destructive. A restored consumption returns a credit to the user’s ledger and is observable in audits.
6.13 Entitlement state
entitlement_state is the hot-path projection consumed by the paywall evaluator.
Core fields: user_id, credits_free_remaining, credits_paid_remaining, active_pass_window_start, active_pass_window_end, fraud_flag, freeze_reason (NONE, CHARGEBACK_PENDING, FRAUD_REVIEW, MANUAL), last_recomputed_at, source_version.
It is replace-only and fully rebuildable from payments, refunds, entitlements, and contact_consumption.
active_pass_window_start and active_pass_window_end are computed as the union of active grant contributions minus refund contributions, using window_start_delta and window_end_delta from each row. Formally: for every non-revoked pass grant i with deltas (s_i, e_i), the active pass window is the union of (s_i, e_i) intervals; window_end is the maximum of e_i values, and window_start is the minimum of s_i values in the union containing now().
If the projection is stale beyond threshold, the server forces an on-demand rebuild before making a gated decision.
freeze_reason causes the paywall evaluator to deny new gated actions without touching past consumptions or revealed data. A defrost event is an append-only audit action that clears freeze_reason back to NONE.
6.14 Saved searches and alert subscriptions
saved_searches and alert_subscriptions extend the model so search alerts are durable, query-hash aligned, epoch-aware, and paywall-aware.
saved_searches fields: id, user_id, search_spec_jsonb, search_spec_hash, embedding_version_at_save, ranker_profile_version_at_save, active. The hash matches the canonical query_hash used elsewhere in search.
alert_subscriptions fields: id, saved_search_id, channel, frequency, active, last_delivered_at. Phase 1 supports EMAIL plus INSTANT and DAILY_DIGEST delivery modes.
Saved-search alerts are pass-gated at evaluation time. An expired pass deactivates alert delivery behavior without deleting the underlying saved search record.
If embedding_version or ranker_profile_version has advanced since the saved search was created, the matcher re-hashes the spec under the current versions before matching.
6.15 Identity lifecycle and reconciliation
Identity is versioned because canonicalization rules, duplicate signals, and address normalization improve over time. Treating merges and splits as first-class events is the only way to keep contact_consumption uniqueness, entitlement bookkeeping, saved items, and reviews coherent across those changes.
identity_mutations table fields: id, kind (MERGE, SPLIT, CANONICALIZER_UPGRADE, MANUAL_MODERATION), from_unit_ids (array), to_unit_ids (array), reason_code, operator_id, created_at, epoch.
Every mutation emits an identity_mutation outbox event at high priority. The identity reconciler consumes these events serially per affected user_id and per affected unit_id.
Merge (N → 1): rewrite unit_id on contact_consumption, saved_listings, recently_viewed, reviews, and any other unit-referencing row. On contact_consumption unique-index collision, keep the earliest consumption and append an audit row for the discarded duplicate so the user is never double-charged and is never re-charged for a pre-existing relationship.
Split (1 → N): migrate each child row to the successor unit that best matches by inventory_id when available; otherwise route by address match; otherwise leave against the primary successor with a reconciliation ticket.
Canonicalizer upgrade: may produce merges, splits, or no-ops. Runs in a dedicated queue with strict throughput caps; never runs during a launch window.
Republished listing at the same canonical address after a prior contact: a new inventory with a new inventory_key belongs to the same unit_id and therefore is not independently free-to-contact. This is intentional. A new unit_id, issued because the physical address genuinely changed (new canonical_address_hash), is free-to-contact. This rule is documented user-facing so the distinction is explicit.
saved_searches that embed unit_id filters are rewritten during merge; saved_searches that filter by geometry are unaffected.
6.16 Semantic projection
semantic_inventory_projection is a sanitized, versioned embedding store that powers vibe search. It is a projection with the same durability requirements as unit_public_projection.
Core fields: inventory_id, unit_id, unit_identity_epoch_written_at, embedding_version, embedding_vector (pgvector), sanitized_content_hash, coarse_filter_attrs, publish_status, last_built_at.
embedding_version is a monotonic identifier that encodes both the model and the preprocessing contract. Example: gemini-embedding-2:v3-20260120.
Queries specify a target embedding_version. Candidate generation only returns rows matching the target version, so cross-model similarity is impossible.
On embedding_version upgrade: build the new-version rows in a shadow table, run an offline coherence check, then atomically swap publish_status to the new version. Tombstones emitted during the swap window are applied to both active versions.
Tombstones take a high-priority lane identical to unit_public_projection tombstones. A moderation suppression is never visible via semantic search.
7. Contact identity
The contact identity model defines when a credit is consumed, what counts as the same paid action, and how duplicate clicks and host-side failures are neutralized.
Scenario
Credits consumed
First message to Unit A
1 MESSAGE_HOST
Second message to Unit A in the same thread
0; uniqueness prevents a second burn.
Phone reveal on Unit A after messaging
1 REVEAL_PHONE
Phone reveal on Unit A twice
0; repeated reveal is an idempotent success.
Message Unit A and Unit B in the same multi-inventory unit group
2 total because unit_id is the billing identity.
Contact after the unit is unpublished via a stale link
First successful contact burns once; subsequent attempts return 410 Gone with an informational paywall-free response.
Pass holder contacts any unit
0 credits burned; the action is still logged with consumed_credit_from = NONE_PASS_UNLIMITED.
Pass expires mid-compose and the user submits
Evaluate at submit time using the authoritative server clock, not the UI render time.
Host’s delivery email hard-bounces
Automatic credit restoration on confirmed hard bounce; audit trail records RESTORED_HOST_BOUNCE.
Host is banned or suspended between submit and delivery
Automatic credit restoration; audit trail records RESTORED_HOST_BAN.
Host deactivates every listing within the ghost window of receiving the contact
Automatic credit restoration after the ghost-window SLA; audit trail records RESTORED_HOST_MASS_DEACTIVATED.
Host has already blocked the user at submit time
Contact is refused before credit consumption. The user receives a neutral “host not accepting contact” response without disclosing the block.
Host has blocked the user between submit and delivery
Credit is restored; audit trail records RESTORED_HOST_BAN variant. The user sees the same neutral response at thread refresh.
Unit merge rewrites unit_id after a prior contact
No new credit consumed; the existing contact_consumption row’s unit_id is rewritten by the identity reconciler and uniqueness is preserved.
New listing at a newly-distinct address (new canonical_address_hash)
Treated as a new unit; subject to the user’s remaining credits.
Host deletes the listing immediately after contact and never replies
48-hour SLA; after expiry, automatic restoration recorded as RESTORED_HOST_GHOST_SLA.
Duplicate-click protection: the client generates a client_idempotency_key at compose start and sends it with every contact attempt. The server enforces both (user_id, unit_id, contact_kind, unit_identity_epoch_written_at) uniqueness and (user_id, client_idempotency_key) uniqueness. The stronger constraint wins, and no user should ever be charged twice for the same logical action.
8. Privacy and access model
Privacy is enforced structurally, not cosmetically. The public path must never depend on reading private fields and stripping them later.
Layer
Rule
Implementation
Schema exposure
Raw source tables are not exposed to anonymous clients.
Keep canonical tables in a private schema or a strictly server-only access path.
Public search
Anonymous search reads sanitized projections only.
Search handlers join inventory_search_projection, unit_public_projection, and, for vibe paths, semantic_inventory_projection; no raw address or contact reads.
Autocomplete
Autocomplete reads public projections and coarse area labels only.
No direct table lookups against physical_units or inventories; no exact-address substring matching.
Approximate location
Approximate listings use stable public geometry.
Persist public_point/public_cell_id and area labels; never randomize per request.
Exact location
Only exact-mode listings may render exact coordinates publicly.
Even then, never expose unit number unless product explicitly requires it.
Phone reveal
Phone access is separate from search payload.
Reveal on click through a dedicated, rate-limited path that audits every reveal.
Failure handling
Privacy fails closed.
If rate limiter, redaction checks, or publish validation are degraded, do not reveal exact location or phone data.
Client cache
Tombstones invalidate public client responses keyed to unit_id.
Edge caches and service workers honor epoch-scoped ETags and cache-bust signals (see 10.5).
Sparse-area protection:
Store public geometry at density-aware precision. If local anonymity falls below the minimum threshold, coarsen the geometry or suppress the map marker.
Approximate search filtering and approximate rendering must use the same public geometry. Never filter on exact_point and render on approximate_point.
Density-aware coarsening rules are auditable and versioned. When coarsening correlates strongly with a protected demographic boundary, the coarsening table is reviewed before deploy. This is a Fair Housing Act compliance requirement, not a courtesy.
9. Write path and publication flow
The write path is designed for correctness first. Canonical writes are transactional; publication is asynchronous but durable; public visibility changes only when published projections are ready, including the semantic projection where applicable.
9.1 Admission and validation
Require Idempotency-Key on every create, edit, and contact-host mutation.
Validate with a server-side discriminated union based on room_category.
Normalize address/unit and derive canonical identity before touching the database.
Null any irrelevant fields server-side even if the client accidentally sends stale hidden values.
Reject payloads that exceed size or complexity limits.
On host writes against a suppressed row, return 423 Locked with a sanitized reason instead of silently accepting and re-publishing.
9.2 Transaction boundary
Acquire a short advisory lock on the canonical unit identity when resolving or creating a physical unit.
Use a SERIALIZABLE transaction for create/edit flows where correctness matters more than raw throughput.
Upsert canonical tables, increment source_version, write audit_events, and append outbox_events in the same transaction.
Return accepted_pending_publish rather than pretending the new public projection is already live. Response includes pending_projections so the UI can show a realistic progress cue (PENDING_GEOCODE, PENDING_PROJECTION, PENDING_EMBEDDING).
9.3 Publication pipeline
Outbox workers read committed events and dispatch them by event type.
Geocode if needed outside the write transaction. If geocoding is slow or unavailable, keep the item in PENDING_GEOCODE or STALE_PUBLISHED.
Rebuild inventory_search_projection and unit_public_projection idempotently using source_version ordering.
Generate and index the embedding outside the write transaction. If the embedding provider is slow or unavailable, keep the item in PENDING_EMBEDDING; existing semantic_inventory_projection rows at the current embedding_version remain live if present.
Publish each new projection version atomically. Existing published versions remain live until replacement succeeds.
High-priority tombstone, suppression, and identity-mutation events bypass low-priority rebuild work. Tombstones fan out to unit_public_projection, inventory_search_projection, semantic_inventory_projection, and cache_invalidations in the same worker unit.
9.4 Publish state machine
State
Meaning
Visibility rule
DRAFT
Saved but not eligible for public visibility.
Not visible.
PENDING_GEOCODE
Canonical change committed; public geometry not ready.
Existing published version stays live; new listing remains hidden.
PENDING_PROJECTION
Geometry is ready or unchanged; filter projections not yet rebuilt.
Existing published version stays live; new listing remains hidden from filter search.
PENDING_EMBEDDING
Filter projections are ready; semantic projection not yet rebuilt at the current embedding_version.
Listing is visible in filter search; semantic search returns the prior embedding (if any) or omits it entirely if no prior version exists.
PUBLISHED
Current projection versions are complete and active across filter and semantic paths where required.
Visible through all public search surfaces.
STALE_PUBLISHED
A newer source version exists but replacement publish is pending on at least one projection.
Older published version remains visible until swap; per-surface visibility reflects which projection is up to date.
PAUSED / SUPPRESSED / ARCHIVED
Listing is intentionally not public.
Not visible across every projection; tombstone propagation is high priority; client cache-bust is emitted.
9.5 Lost-update and moderation precedence
Every edit request carries row_version or an If-Match equivalent.
If the client submits an outdated version, the API returns 409 Conflict with the latest canonical summary.
Moderation writes scope strictly to lifecycle_status, publish_status, and moderation metadata. Host writes scope to editable content fields. The schema enforces this split with a trigger: a host-role write attempting to modify a moderation-owned column is rejected at the DB boundary.
A host edit arriving on a SUPPRESSED or PAUSED row returns 423 Locked with a sanitized reason. Host writes never implicitly unsuppress.
A host edit arriving between moderation decision and moderation commit observes row_version and fails with 409 if moderation won the commit race.
9.6 Checkout initiation
Checkout creation is synchronous only up to durable session creation. Entitlement activation always remains asynchronous on the webhook path.
When the user hits the paywall and selects a product, the server creates a Stripe Checkout Session from server-side price configuration only.
Persist and pass client_reference_id = user_id plus metadata such as user_id, product_code, and checkout_idempotency_key.
Generate checkout_idempotency_key on the first Buy click. Re-clicks within a reuse window shorter than the Stripe session TTL return the same session URL and do not create a second PaymentIntent.
If the existing session is expired or canceled, create a new session and retire the old idempotency key rather than returning a dead URL.
Redirect to Stripe-hosted Checkout so PCI scope never enters Roomshare.
success_url may show “payment received, activating,” but activation happens only after the trusted webhook path succeeds. Never trust the browser return as proof of entitlement.
9.7 Webhook receiver
The webhook receiver is the only trusted ingress for payment success, refund, and dispute facts.
Verify the Stripe signature. Invalid signatures return 400 and emit an abuse signal.
Insert the event into stripe_events with ON CONFLICT (id) DO NOTHING.
If zero rows are inserted, the event is a replay and the handler returns 200 immediately.
If one row is inserted, append a payment-webhook outbox event in the same transaction, then return 200.
Business logic runs asynchronously from the outbox so a crash before commit is recovered by normal Stripe retry behavior.
9.8 Entitlement worker
The entitlement worker serializes grant, revoke, and consume decisions per user_id so monetization state stays causally ordered.
Use a single logical consumer partitioned by user_id so same-user payment events are processed in order. A hot-user overflow queue isolates any user whose rate exceeds the per-partition budget, so one abuse account cannot starve legitimate users sharing its partition.
Handle checkout.session.completed, payment_intent.succeeded, charge.refunded, charge.dispute.created, and charge.dispute.closed through the same durable queue.
On payment success, insert the payments row, append the corresponding entitlements row with explicit window_start_delta and window_end_delta, and replace entitlement_state in one ordered worker transaction.
On refund, insert refunds plus a REVOCATION entitlement fact that subtracts exactly the contributing grant’s deltas, and recompute the projection.
On dispute.created, set entitlement_state.freeze_reason = CHARGEBACK_PENDING. This denies new gated actions without revoking past revealed data. Do not auto-revoke until dispute.closed is lost.
On dispute.closed won, clear freeze_reason (defrost).
On dispute.closed lost, apply full revocation and keep freeze in place if fraud_flag is set.
If the checkout metadata and webhook amount disagree, refuse the grant, preserve the event, and page operations immediately.
If the user has been banned between checkout and webhook commit, still persist the payment row, set fraud_flag = true, and auto-issue a refund through the refund path rather than granting an unusable entitlement.
9.9 Out-of-order events
Stripe does not guarantee delivery order. The worker must tolerate late, missing-parent, and replayed events without corrupting ledger truth.
If a refund arrives before its parent payment, hold the work item with bounded backoff; after the maximum wait window, send it to DLQ and page.
If a payment arrives after a previously held refund for the same PaymentIntent, grant then revoke in source order so the net entitlement converges to zero.
Out-of-order processing is acceptable only if the final ledger state is equivalent to a clean in-order replay.
9.10 Identity reconciler
The identity reconciler is a dedicated worker that consumes identity_mutation outbox events.
Per-mutation transaction: acquire advisory locks on all affected unit_ids and on affected user_ids, rewrite references in contact_consumption, saved_listings, recently_viewed, reviews, and saved_searches where applicable, resolve uniqueness collisions by keeping the earliest entry and appending audit rows for the rest, and bump unit_identity_epoch_written_at on all rewritten rows.
Each identity mutation also enqueues projection rebuilds for affected units and a cache_invalidations fan-out.
Reconciliation lag has a paging SLO (18.3).
Canonicalizer upgrades are run during explicit quiet windows with throughput caps and are never concurrent with launch windows.
10. Search, matching, ranking, and map behavior
Search correctness is defined at the inventory level, then rendered at the unit level. This avoids both over-matching and misleading summary cards. The filter path and the semantic path share a single result-set shape and a single snapshot contract.
10.1 SearchSpec contract
Required: move_in_date, requested_occupants.
Optional: lease_months, max_gap_days, price range, room categories, amenities, languages, gender filters, map bounds or radius, semantic_query, cursor.
Clamp occupants to a sane business maximum. Clamp max_gap_days and limit large geographic scopes.
Reject pathologically broad or computationally expensive search requests at admission time.
10.2 Matching semantics
Immediate match: the inventory is available on or before the requested move-in date and is compatible with the requested lease.
Near-future match: the inventory starts after the requested move-in date but within max_gap_days and is compatible with the requested lease starting from its own available_from.
Lease compatibility uses lease_min_months, lease_max_months, and lease_negotiable. Do not collapse Flexible into month-to-month.
ENTIRE_PLACE and PRIVATE_ROOM use capacity_guests; SHARED_ROOM uses open_beds.
When semantic_query is present, candidate generation reads semantic_inventory_projection at the current embedding_version, then filter matching is applied on top. Semantic candidates that have not yet reached PUBLISHED at the current embedding_version are excluded from semantic ranking.
10.3 Grouping and summary rules
Filter and rank inventories first using inventory_search_projection and, when applicable, semantic_inventory_projection.
Group matched inventories by unit_id at the active unit_identity_epoch.
Join one unit_public_projection row for rendering. The card and the map popup read the same grouped summary object.
Safe grouped fields include from_price, room_categories, earliest_available_from, matching_inventory_count, and coarse availability badges.
Do not invent one combined “spots available” or one combined gender/lease statement across mixed inventory types.
10.4 Ranking, stable pagination, and snapshot expiry
Step
Rule
Normalize
Create a canonical query hash from the SearchSpec that includes projection_epoch, embedding_version, ranker_profile_version, and unit_identity_epoch_floor. Two visually-identical queries run across a model upgrade are not the same query.
Coalesce
Singleflight identical hashes briefly so a pan/zoom burst does not stampede the database.
Snapshot
Persist the ordered unit_id result set for a short TTL; return a query_snapshot_id that pins projection_epoch, embedding_version, ranker_profile_version, and unit_identity_epoch_floor.
Cursor
Page using the snapshot, not a fresh live query, so page 2 cannot skip or duplicate units.
Expiry
On snapshot-miss, respond with a structured snapshot_expired payload containing the canonical query-hash. The client rebuilds and surfaces a “results refreshed” cue so the user understands why ordering changed.
Holes
Entries tombstoned after snapshot creation are filtered at render time and holes are backfilled from the next snapshot slice up to page_size so the user never sees a short page. snapshot_hole_ratio is an SLO.
Boundaries
Cap deep paging and metro-wide result sizes. Large zoom levels return clusters rather than one marker per unit.
Map behavior:
One public feature per unit_id at the active epoch.
Approximate listings use stable public geometry or a coarse cell/area representation.
Very large viewports default to cluster-only mode.
List and map responses must share the same query_snapshot_id, projection_epoch, and, when semantic_query is present, embedding_version and ranker_profile_version.
10.5 Client cache coherence
Server correctness ends at the wire. Mobile service workers, edge caches, and browser caches extend the consistency surface, so the plan extends to them.
Every cacheable public response carries a projection_epoch ETag. Listing detail responses additionally carry unit_identity_epoch_written_at and, for semantic-reached pages, embedding_version.
Cache-Control on listing detail responses is short (minutes), not hours, and uses stale-while-revalidate semantics so a tombstone is observed on the next interaction.
Tombstones fan out to a cache_invalidations queue that emits a push to subscribed clients (Web Push where granted, SSE on foreground clients) keyed to unit_id. Subscribing clients evict matching entries on receipt.
Service workers refuse to serve a cached response whose projection_epoch is older than a server-provided floor epoch delivered with every authenticated response.
Semantic autocomplete and search bar suggestions are not cached client-side beyond a single session.
11. Contact-host and reveal-phone flow
Contact-host is the primary monetized action. Browsing, searching, and viewing listings remain free, but every gated action must be evaluated against canonical entitlement state at submit time, not at page render time, and host-side failures trigger automatic credit restoration.
11.1 Primary flow
The client submits a POST containing client_idempotency_key, unit_id, unit_identity_epoch_observed, contact_kind, and any message body or reveal intent.
The server validates unit_identity_epoch_observed against the current epoch. If the unit has been merged or split since the client’s view, the server either rewrites to the successor unit (merge) or returns a 409 with a prompt to refresh (split).
The server invokes the paywall evaluator with user_id, unit_id, and contact_kind.
The evaluator checks entitlement_state in order: freeze_reason = NONE; then active pass window covering now; then credits_free_remaining > 0; then credits_paid_remaining > 0; otherwise return 402 with a paywall payload containing allowed products, prices, and checkout entry points.
On allow, insert a contact_consumption row in the same transaction that decrements a credit bucket only when credits are actually consumed. If the unique key on (user_id, unit_id, contact_kind, unit_identity_epoch_written_at) or (user_id, client_idempotency_key) fires, treat it as a safe retry and return success without a second burn.
Check host-side preconditions at submit time: host not banned, host not deactivating all listings right now, host has not blocked the user. On precondition failure, refuse before consumption (block) or mark the consumption eligible for automatic restoration (ban in flight).
Enqueue contact delivery or phone-reveal side effects on the existing durable queue inside the same transaction as consumption.
Delivery and monetization accounting must commit or fail together. Never burn a credit without a durable record of the user action.
11.2 Free-tier spend order
When no active pass window covers the action, spend FREE credits before MINI_PACK credits. Active-pass usage does not burn credits and is logged separately with consumed_credit_from = NONE_PASS_UNLIMITED.
11.3 Automatic credit restoration
Credit restoration is automatic on deterministic host-side failure signals. Restoration is an append-only event against contact_consumption and a matching entitlement credit-back grant.
Hard bounce on the host’s notification channel (SES or equivalent feedback loop) within the restoration window: RESTORED_HOST_BOUNCE.
Host account banned or suspended within the restoration window: RESTORED_HOST_BAN.
Host deactivates every active listing within the ghost window of receiving the contact: RESTORED_HOST_MASS_DEACTIVATED.
Host never reads the message within the ghost SLA (default 48 hours) and has no read receipt for any listing message in that window: RESTORED_HOST_GHOST_SLA.
Restorations are metered so one abusive host cannot be used as a credit pump. Per-user-per-day restoration caps apply; violations route to manual review.
11.4 Failure behavior
If the paywall evaluator times out, fail closed for gated actions and fail open for non-gated discovery paths. The free tier and public search must continue to operate.
If entitlement_state is stale, force a recompute before making a gated decision. If recompute fails, return 503 for the gated action rather than guessing.
If a pass expires while the compose UI is open, the authoritative decision is made at submit time using server clock and current entitlement state.
If the host has blocked the user, return a neutral “host is not accepting contact” response that does not reveal the block. No credit is consumed.
12. Fault tolerance, degraded modes, and dependency policy
The system must have deterministic behavior when dependencies misbehave. The rule is simple: bounded retries with jitter for transient faults, circuit breakers for sustained faults, bulkheads for resource isolation, and degraded responses before cascading failure.
Dependency / path
Timeout + retry
Breaker / bulkhead
Graceful degradation
Postgres write path
Short statement timeout; retry only serialization/deadlock failures once or twice with full jitter
Dedicated write pool; admission control on pool wait
Fail closed with 409/503; never fake success
Postgres search path
Tight query timeout; no automatic request-path retries
Dedicated search pool; open breaker on sustained error ratio
Serve cached or stale-safe first page, list-only, clusters-only, or semantic-disabled mode
Projection workers
Async exponential backoff with max attempts and DLQ
Dedicated worker pool and queue concurrency cap
Existing published version remains live
Geocoder
Short connect and total timeout; retry only 429/5xx/timeouts
Worker-local breaker; no synchronous dependency on create/edit response
Leave listing in PENDING_GEOCODE or STALE_PUBLISHED
Embedding provider
Short connect and total timeout; retry only 429/5xx/timeouts; per-minute token cap to bound cost
Worker-local breaker; dedicated embedding worker pool
Leave listing in PENDING_EMBEDDING; semantic search falls back to filter-only results with a visible cue
Email/SMS delivery
Async retry over minutes with bounded backoff
Separate worker pool
Pending delivery state; no impact on search availability
Redis / limiter
No blind request-path retries
Fast breaker with local fallback rules
Search uses stricter local fallback; phone reveal fails closed
Map provider
Client budget only
UI-level breaker
Disable map and keep list results functional
Stripe Checkout session creation
5 s total timeout; retry session creation at most twice with jitter
Isolated monetization client budget and local circuit breaker
Show payments temporarily unavailable while keeping free-tier discovery fully functional.
Stripe webhook processing
Async exponential backoff with max attempts and DLQ
Dedicated payment_webhook worker pool and per-user serialization
Entitlements may stay in activating state temporarily; support and the reconciliation job can resolve.
Paywall evaluator
50 ms hot-path read target; up to 500 ms on forced rebuild
Dedicated entitlement-state cache and fallback to direct ledger rebuild
On timeout, gated actions return 503 or 402-safe responses; non-gated actions remain unaffected.
Alert matcher
Async queue-backed retries with bounded backoff
Dedicated medium-priority queue and user-hash concurrency cap
Saved-search alerts are delayed, not lost, and do not affect search freshness.
Alert email dispatch
Async bounded retries with 24 h TTL; deliver-time publish_status revalidation
Separate delivery worker pool
Failed or tombstoned-target alerts are dropped without user confusion and can surface as in-app recovery notices on the next visit.
Identity reconciler
Per-mutation transaction with advisory locks; bounded retries on collisions
Dedicated low-priority pool and strict throughput cap
Reconciliation lag alerting; listings remain visible at their prior epoch until reconciliation commits.
13. Resource isolation and capacity budgets
Bulkheads must be concrete, not aspirational. The starting production budget below assumes a 64-connection application-facing Postgres budget per region. If your actual budget differs, scale the shares proportionally but keep separate pools.
Workload class
DB pool cap
Concurrency starting point
Auto-pause / throttle trigger
Public search
24
Up to 16 in-flight search requests per node
If p95 pool wait > 50 ms for 5 min, force degraded search and reduce search concurrency
Host writes
12
Up to 8 in-flight write transactions per node
If lock wait or serialization retries spike, shed non-critical writes and pause background contention
Projection workers
8
4 rebuild workers + 2 geocode workers + 2 tombstone handlers
If projection lag > 60 s or DB pressure rises, pause low-priority rebuilds first
Embedding workers
4
2 embedding build + 1 embedding tombstone + 1 embedding shadow-build
If embedding lag > 120 s or provider error ratio > 10 %, pause shadow builds first; then pause new-publish embeddings
Identity reconciler
2
1 reconcile worker by default; 1 canonicalizer-upgrade worker in quiet windows
Auto-pause on any search/write SLO breach or during a launch window
Moderation / ops
4
2 operators or low-rate admin jobs
If search/write SLOs are threatened, suspend ad-hoc admin scans
Migration / backfill
4
1 backfill worker by default; max 2 during quiet windows
Auto-pause when CPU, pool wait, or replica lag crosses threshold
Alert matcher
2
Reverse-match publication events against saved searches with user-hash concurrency limits
If search or write SLOs are threatened, pause alert matching and resume from durable offsets later.
Payment webhook + entitlement worker
4
Serialized per user_id with hot-user overflow for abuse-rate accounts
If webhook lag or DB pressure rises, pause non-critical alert and repair work before granting pressure escapes the isolated pool.
Reserve / break-glass
4
Held back for incident response, deploy rollbacks, and diagnostics
Never consumed by batch jobs
Repair jobs and migrations must run in dedicated queues and dedicated pools; they cannot share unlimited concurrency with search or write paths.
Use SKIP LOCKED only for queue tables. Do not use it as a general read consistency tool.
Every queue has max attempts, DLQ routing, and backlog-age alerts.
Per-user-id admission control: if a single user_id exceeds its partition’s rate budget, further events route to a hot-user overflow queue serviced by reserve capacity, preventing noisy-neighbor starvation.
14. Background workers and queue topology
Queue
Priority
Primary jobs
Notes
publish_high
Highest
Suppressions, tombstones, pause/unpublish events, identity mutation fan-out
Keeps hide behavior fast under backlog and propagates identity changes ahead of rebuilds.
payment_webhook
Highest
stripe_events to payment, refund, dispute, entitlement grant or revoke work
Co-equal with publish_high so monetary truth is not starved during retry storms.
cache_invalidate
Highest
Edge cache purges and client push notifications on tombstones and identity mutations
Ensures moderated listings disappear from mobile caches within SLO.
publish_normal
High
Filter projection rebuilds for edits and new publishes
Ordered by source_version per aggregate.
embed_publish
High
Embedding generation and semantic_inventory_projection swaps at the current embedding_version
Separate pool so embedding-provider outages do not stall filter projections.
geocode
Medium
Address-to-public-geometry resolution
Never blocks canonical write commit.
contact_delivery
Medium
Email/SMS dispatch and retries
Checks bounce feedback loops; routes confirmed bounces into the restoration path (see 11.3).
alert_match
Medium
Reverse-match newly published or updated inventory against saved_searches
Runs off durable publication events and can pause safely under pressure.
alert_deliver
Medium
Dispatch saved-search alert email with bounded retry and TTL
Revalidates publish_status at send time; tombstoned targets are dropped with an audit record.
restoration
Medium
Host-ghost SLA timers, mass-deactivation detection, bounce-driven credit restoration
Owns the automatic credit-back path described in 11.3.
identity_reconcile
Low
Apply identity_mutation events across downstream tables
Runs on dedicated capacity with strict throughput caps.
repair_and_moderation
Low
Collision scans, stale listing nudges, privacy repair jobs, EMERGENCY_GRANT post-flag audit
Auto-pauses first during DB pressure.
backfill_migration
Lowest
Shadow reads, backfills, checksum jobs, embedding model swaps in shadow
Runs only under explicit capacity budget.
Worker requirements:
All workers are idempotent and safe to retry.
Every queue item carries aggregate_id, source_version, attempt_count, next_attempt_at, unit_identity_epoch, and DLQ reason.
Projection workers must be able to rebuild from canonical state, not only from event payload fragments.
Backfill and repair workers must self-throttle or pause when database pressure exceeds thresholds.
alert_deliver workers must refuse to send when the current publish_status for any referenced unit is not PUBLISHED.
15. Kill switches and operational controls
Kill switch / flag
Safe effect
When to use
force_list_only
Disables map rendering; search continues as list-only.
Map-provider outage, map payload pressure, client-side instability.
force_clusters_only
Large viewports return clusters only.
Search pressure, metro-wide map overload, degraded query budgets.
disable_semantic_search
Semantic query inputs fall back to filter-only search with a visible explanation cue.
Embedding provider outage, embedding_version rollout incident, quality regression.
disable_new_publication
Canonical writes still save; new public versions stop publishing.
Projection pipeline incident or privacy validation issue.
disable_phone_reveal
Phone reveal endpoint returns unavailable; contact-host form still works.
Rate-limiter outage, abuse spike, or audit sink issue.
pause_geocode_publish
Listings remain pending; existing published versions stay live.
Geocoder outage or bad geocode quality deployment.
pause_embed_publish
New embedding indexing pauses; existing semantic projection remains live; new listings stay PENDING_EMBEDDING.
Embedding provider cost spike or quality regression.
pause_backfills_and_repairs
Stops non-essential worker classes.
Any search/write SLO breach or deployment stabilization window.
pause_identity_reconcile
Pauses merge/split application; systems continue operating on the previous epoch until resumed.
Reconciliation incident, canonicalizer bug, or launch-window lockdown.
disable_shadow_read_comparison
Stops extra comparison load during migration.
Production pressure during dual-run windows.
rollback_ranker_profile
Returns to last known-good ranking weights.
Ranking bug or user-facing result instability.
rollback_embedding_version
Reads semantic projection from the prior embedding_version; pauses new-version builds.
Newly deployed embedding model causes result regression.
disable_payments
Paywall shows payments temporarily unavailable; free-tier discovery and existing entitlements continue to work.
Stripe outage, webhook processing incident, or launch-day monetization instability.
freeze_new_grants
Persist Stripe facts to the ledger but stop projecting new grants into entitlement_state.
Suspected grant-logic bug where economic truth must be preserved without expanding the blast radius.
disable_alerts
Pause alert_match and alert_deliver without affecting saved-search persistence.
Alert storm, deliverability degradation, or email-provider incident.
emergency_open_paywall
Temporarily treat all gated actions as free while logging EMERGENCY_GRANT behavior for every use. Automatically schedules a post-flag fraud audit job.
Catastrophic paywall failure during a launch-critical window; requires elevated approval and audit.
16. Deployment, migration, and rollback contract
Rollout safety depends on additive changes, mixed-version compatibility, and instant rollback paths. The system must remain safe if only half a release deploys.
Phase
What changes
Exit criteria
0. Preflight audit
Profile duplicates, invalid shapes, empty unit patterns, old status issues, address normalization risk, and embedding coverage.
Known data issues documented and triaged.
1. Additive schema
Create new source tables (including identity_mutations, cache_invalidations, semantic_inventory_projection) and flags with no read cutover.
No production regression; migrations reversible.
2. Outbox + projections
Transactional outbox, publish workers, filter and unit projections.
Projection lag alerting works; no public reads from raw tables.
3. Semantic projection
Embedding worker, pgvector index, embedding_version tracking, shadow-build pipeline.
Embedding lag SLO green; shadow build and swap tested end-to-end.
4. Search + snapshots
Inventory matching, grouped render join, query snapshots pinned to epoch and model versions, list/map shared contract.
Stable page 1/page 2 under changing rank inputs and mid-flight model changes.
5. Privacy + contact
Stable public geometry, reveal-phone control path, abuse controls, moderation precedence trigger, autocomplete projection.
Approximate path never leaks exact data; reveal fails closed; moderation writes cannot be overwritten.
6. Monetization
Stripe checkout, webhook, entitlement worker with delta-tracked grants, paywall evaluator, chargeback defrost.
Exactly-once grants; partial refunds produce deterministic windows; defrost path tested in staging.
7. Client cache coherence
Epoch-scoped ETags, service-worker version floor, cache_invalidations push channel.
Tombstone propagation to mobile caches inside SLO on a real device.
8. Migration + cutover
Dual write, shadow read, controlled switch, rollback drills.
Mismatch rate below threshold; feature-flag rollback proven.
9. Launch hardening
Runbooks, alerts, kill switches, restore drills, chaos tests, identity-mutation drill.
All launch gates pass and incident controls are documented.
17. Backup, restore, and drills
Topic
Policy
Notes
Database backup
Point-in-time recovery enabled with daily base snapshots and minute-grained WAL retention.
Retention measured in weeks, not hours.
Object storage
Versioned buckets with lifecycle rules.
Media restoration is ordered behind DB restore.
Vector index
pgvector index is part of the backup set; a restore drill includes a semantic-search smoke test against a known-answer fixture.
A restore is not trusted until semantic queries return expected candidates at the post-restore embedding_version.
Idempotency and audit retention
Retain long enough to survive retries, restores, and incident review.
Do not purge aggressively during migration windows.
Identity mutations
identity_mutations is a permanent ledger retained for the life of the product.
Required to reconstruct any past unit_id lineage.
Drills
Monthly backup restore validation; quarterly game-day including projection rebuild, embedding swap, public search smoke tests, and a simulated identity merge plus split.
A backup is not trusted until a restore succeeds end to end.
Keep a documented restore sequence for: database restore, outbox replay posture, filter projection rebuild, embedding projection rebuild, identity reconciliation resume, feature-flag defaults, and public smoke validation.
During restore, privacy-sensitive endpoints default to fail closed until publish-state and access-path checks pass.
Maintain one tested degraded-but-safe launch mode: list-only search, semantic disabled, no phone reveal, no new publish, existing published versions only.
18. Observability, SLOs, and alerts
The system must detect silent failures before users report them. Instrument search, writes, projections, semantic coherence, identity reconciliation, client caches, dependencies, privacy controls, and migration separately.
18.1 SLO starting points
Service objective
Initial target
Primary alert
Public search availability
99.9% monthly
Search degraded response ratio or hard-failure ratio breaches target.
Host write success
99.95% monthly excluding explicit validation rejects
Conflict/timeout/error rate spikes.
Filter projection freshness
p99 projection lag under 60 seconds
projection_lag_seconds p99 > 60 s for 5 min.
Semantic projection freshness
p99 embedding lag under 120 seconds
embedding_lag_seconds p99 > 120 s for 5 min.
Pause/suppress hide latency
95% under 60 seconds across all projections and client caches
Suppressed listing still appears beyond SLA; cache_invalidate backlog age breached.
Identity reconciliation lag
p99 under 10 minutes from mutation to reconciliation commit
identity_reconcile_lag_seconds p99 > 600 s for 10 min.
Snapshot hole ratio
<= 2% of paginated responses contain a hole that required backfill
snapshot_hole_ratio > 5% for 15 min.
Alert delivery safety
0 alerts delivered to tombstoned targets
alert_delivered_to_tombstoned_target_total > 0.
Phone-reveal policy safety
0 privacy-critical leaks
Any public payload or reveal-path privacy violation pages immediately.
Payment-to-entitlement latency
p99 under 30 seconds from successful payment to active entitlement
payment_without_entitlement_total > 0 or sustained p99 activation lag breach pages immediately.
Webhook processing latency
p95 under 5 seconds from event persistence to entitlement_state update
Webhook backlog age or DLQ depth breaches threshold.
Paywall evaluation latency
p99 under 100 milliseconds
Gated-action evaluation p99 breaches threshold for 5 minutes.
Ledger consistency
Zero payment_without_entitlement and zero entitlement_without_payment events
Any orphaned payment or orphaned entitlement pages immediately.
Host-ghost restoration correctness
100% of qualifying events result in a restoration within 1 SLA window
restoration_missed_total > 0 over 1 hour.
18.2 Metrics and traces
Search: request count, latency, zero-result rate, cache hit ratio, degraded_mode count, query_snapshot build time, snapshot_hole_ratio, semantic fallback count.
Write path: write latency, row-version conflicts, idempotency replays, serialization retries, lock wait time, moderation-precedence rejection count.
Projection: lag seconds per projection class, dirty-unit count, build latency, DLQ depth, version skew, tombstone latency, embedding_version distribution.
Identity: identity_mutation rate, reconciliation lag, collision count, rows rewritten per mutation.
Client cache coherence: cache_invalidate queue depth, push delivery latency, stale-epoch responses served before refresh.
Dependencies: timeout counts, breaker state, retry counts, geocoder success rate, embedding provider success rate and token spend, provider error ratio.
Database: pool wait, connections in use, statement timeouts, deadlocks, replica lag.
Privacy and abuse: reveal-phone denials, rate-limit hits, PII violation count, low-anonymity suppressions, autocomplete rejection count.
Monetization funnel: paywall_view, checkout_start, payment_success, entitlement_granted, first_paid_contact.
Revenue and risk: ARPU, conversion rate, refund rate by reason_code, chargeback rate, support-assisted reversal rate, restoration_rate by reason.
Ledger health: orphaned payments count, orphaned refunds count, entitlement_state drift versus ledger replay, pass-window delta reconciliation errors.
Stripe abuse signals: webhook signature failures, payment_attempt_failed_rate by IP, account, device fingerprint, and normalized email.
Traces must include request_id, trace_id, query_hash, query_snapshot_id, unit_id, unit_identity_epoch, inventory_id, projection_version, embedding_version, ranker_profile_version, publish_status, degraded_mode.
18.3 Paging alerts
Any public_payload_pii_violation_total > 0.
projection_lag_seconds p99 > 60 seconds for 5 minutes.
embedding_lag_seconds p99 > 120 seconds for 5 minutes.
identity_reconcile_lag_seconds p99 > 600 seconds for 10 minutes.
alert_delivered_to_tombstoned_target_total > 0.
cache_invalidate backlog age beyond the hide SLA.
db_pool_wait_ms p95 > 50 ms for 5 minutes in search or write pools.
shadow_read_mismatch_rate over the agreed migration threshold.
Any critical circuit breaker stuck open beyond its normal recovery window.
Suppressed listing still visible after the hide SLA anywhere (server projection or client cache).
payment_without_entitlement_total > 0 or entitlement_without_payment_total > 0 over a 5-minute window.
Webhook DLQ depth > 10 or webhook backlog age beyond the agreed activation SLA.
chargeback_rate > 1% over a rolling 7-day window, which signals a fraud or evidence-quality problem.
Paywall evaluator p99 > 100 ms for 5 minutes on the production cohort.
pass_window_delta_reconciliation_error_total > 0.
restoration_missed_total > 0 over 1 hour.
19. Security and abuse controls
Threat
Control
Expected behavior
Duplicate submits / retries
Idempotency keys + advisory locks + unique canonical indexes
Exactly one logical mutation wins.
Stale-tab overwrite
row_version / If-Match precondition
Stale edit gets 409 Conflict.
Stale-client unit reference after merge or split
Server validates unit_identity_epoch_observed; rewrites on merge, returns 409 on split
Contact and edit flows never act on stale identity.
Phone scraping
Dedicated reveal endpoint, policy checks, rate limits, audit
Reveal can be throttled or disabled without breaking search.
Approximate-location triangulation
Stable coarse geometry, density-aware precision, shared filter/render geometry
Approximate listing does not narrow via repeated requests.
Autocomplete address leak
Autocomplete reads only public area labels and sanitized tokens
Exact addresses cannot be fished through suggestion hints.
Migration self-outage
Dedicated pools, concurrency caps, auto-pause, kill switches
Live traffic keeps priority.
Projection starvation
Transactional outbox + worker priorities + tombstone fast lane + dedicated embedding pool
Existing published truth remains stable and hide requests stay fast.
Multi-account free-credit farming
Require verified accounts, normalize emails (lowercase, strip Gmail dots and plus-tags, blocklist disposable domains), apply device fingerprinting plus IP-cluster heuristics, block repeated FREE grants when the same high-confidence signature reappears inside the policy window
Free credits are materially harder to farm, while shared-campus or shared-office IPs are handled with lower confidence.
Card testing
Use Stripe Radar plus per-IP and per-fingerprint rate limits on Checkout Session creation. Three failed attempts inside the defined window should trigger a temporary block.
Attackers cannot cheaply validate stolen cards through the Roomshare paywall.
Friendly fraud
Retain detailed pass-holder and paid-contact consumption logs so evidence bundles can be auto-assembled for disputes.
Chargeback response quality improves and high-use fraudulent disputes become easier to contest.
Phone-number leakage in free-form messages
Run lightweight regex and policy detection on outbound message bodies and soft-flag likely phone or email leakage for review.
The system detects attempts to bypass the paywall without hard-blocking normal communication.
Entitlement tampering
Never trust client-reported entitlement state. Re-evaluate every gated action on the server from projection or ledger truth.
UI spoofing cannot unlock paid features.
Amount tampering
Validate webhook amount and product metadata against server-side product configuration before granting any entitlement.
Misconfigured products or malicious tampering refuse the grant and trigger an operational page.
Webhook replay
Enforce unique stripe_events.id with replay-safe outbox logic.
Duplicate deliveries remain harmless no-ops.
Chargeback over-freeze on legitimate users
Freeze only blocks new gated actions; defrost path is an audited operation restoring entitlement_state.freeze_reason = NONE; support can defrost within minutes on verified false-dispute signal.
Legitimate users regain access quickly; abusers remain frozen.
Restoration farming
Per-user-per-day restoration caps; unusual restoration patterns route to manual review
Restoration cannot be weaponized into unlimited free contacts.
Host-write-on-suppressed exploit
Moderation precedence trigger at the DB boundary returns 423 Locked; host-role writes never touch moderation-owned columns
A host cannot silently republish a suppressed listing by saving an edit.
Hot-user partition starvation
Per-user rate budget with overflow to a hot-user queue on reserve capacity
One abuse actor cannot starve legitimate users sharing its partition.
Post-emergency_open_paywall fraud wave
An automatic fraud_audit_after_flag_off job re-evaluates every EMERGENCY_GRANT consumption against current abuse signals
Emergency flag use does not become a fraud escape hatch.
20. Refund and dispute policy
Refunds and disputes are policy-driven, ledger-backed, and reversible only through explicit revocation facts. Extensions are refunded against their own contributed deltas, so the resulting pass window is always deterministic.
Case
Policy
Mini Pack or Mover’s Pass with 0 contacts used and request within 24 hours
Approve automatically through support tooling or Stripe Dashboard, then rely on the webhook path to apply revocation and recompute entitlement_state.
Mini Pack or Mover’s Pass with 1 to 2 contacts used and request within 24 hours
Send to manual review; the default posture is approve minus a per-contact deduction when policy permits.
Mover’s Pass with more than 2 contacts used or a request after 24 hours
Deny by default policy unless a support override is justified and audited.
Refund of a pass purchased as an extension of an existing active pass
Subtract exactly the refunded grant’s window_start_delta and window_end_delta from the projection. Other active grants keep their contributions; window never collapses earlier than their union supports.
User initiates a chargeback
Set entitlement_state.freeze_reason = CHARGEBACK_PENDING immediately. If usage crosses the evidence threshold, auto-assemble and submit the evidence bundle.
Chargeback won (in our favor)
Clear freeze_reason (defrost). No revocation.
Chargeback lost
Apply full revocation and retain freeze if fraud_flag is set.
Chargeback identified as a bank or user mistake before close
Support may defrost with elevated approval; audit row records the defrost reason.
Host hard-bounces, is banned or suspended, mass-deactivates listings, or blocks the user in the restoration window
Automatic credit restoration via the restoration queue; no ticket required.
Host deletes the listing after contact and never replies within the service window
Automatic restoration after ghost SLA; consumed contact is credited back, preferring free credits before paid credits where policy allows.
Stripe refund is processed externally
Consume the refund webhook, append revocation facts with matching deltas, and recompute entitlement_state from ledger truth without any manual mutation.
Banned user’s in-flight payment succeeds
Record the payment, set fraud_flag, and auto-issue a full refund via the refund queue; never grant entitlement to a banned user.
21. Testing and fault-injection program
The final plan is not done until the hard cases are tested deliberately. Test the source-of-truth model, the publish pipeline, the semantic projection, identity mutations, and the degraded states separately.
Test layer
Must prove
Unit tests
Canonicalization, category validators, lease matching, grouped summary rules, cursor encode/decode, privacy redaction rules, pass-delta math for grant and refund, email normalization.
Database tests
Invalid row shapes reject correctly, unique canonical identity holds, source_version increments correctly, tombstones and suppressions propagate, moderation-precedence trigger rejects host writes on moderation columns, contact_consumption uniqueness survives merge and split.
Integration tests
Create/edit writes append outbox events atomically, projections rebuild idempotently, query snapshots keep pagination stable across ranker and embedding changes, snapshot_expired response round-trips correctly, cache_invalidate propagates to a simulated client.
E2E tests
Switching room categories does not leak stale hidden form data; approximate listings never leak exact fields; list and map stay in sync; semantic-disabled fallback renders correctly; service worker evicts on tombstone push; host-ghost automatic restoration fires on the SLA; chargeback defrost restores access.
Load and chaos tests
10x identical query storms, geocoder outage, embedding-provider outage, embedding_version swap under load, projection worker outage, Redis/limiter outage, duplicate create storm, conflicting edits, identity-mutation storm, webhook retry storm, hot-user partition saturation.
Rollback drills
Flags safely return traffic to the previous read path, previous embedding_version, or degraded-safe mode without data loss.
Identity drills
Simulated merge of two real-looking units and simulated split of one unit into two; verify contact_consumption, entitlements, saved items, reviews, and search ordering remain coherent.
Restoration drills
Synthetic host bounce, host ban, and host mass-deactivation each trigger correct automatic credit restoration within SLA.
22. Implementation phases and acceptance criteria
The cleanest implementation path is phased. Each phase ends only when the listed acceptance gates pass.
Phase
Scope
Acceptance gate
A. Foundations
Canonical tables, validators, idempotency keys, audit events, feature flags, identity lifecycle tables
Invalid shapes rejected; duplicate create path stable under concurrency; identity_mutations table wired to outbox.
B. Outbox + filter projections
Transactional outbox, publish workers, inventory and unit projections, cache_invalidations fan-out
Projection lag alerting works; no public reads from raw tables; cache_invalidate delivers under synthetic load.
C. Semantic projection
Embedding worker, pgvector index, embedding_version tracking, shadow-build and atomic swap
Embedding lag SLO green; swap drill completes without observable ranking gap; semantic tombstone fast lane tested.
D. Search + snapshots
Inventory matching, grouped render join, query snapshots pinned to epoch and model versions, list/map shared contract, snapshot expiry UX
Stable page 1/page 2 under changing rank inputs, mid-flight embedding swap, and mid-flight tombstones.
E. Privacy + contact
Stable public geometry, reveal-phone control path, abuse controls, autocomplete projection, moderation precedence trigger, host-ghost detection
Approximate path never leaks exact data; reveal fails closed; host writes cannot overwrite moderation; automatic restoration fires on synthetic host-ghost.
F. Monetization
Checkout, webhook, entitlement worker with delta grants, paywall evaluator, defrost path, host-side restoration
Exactly-once grants; pass extension and partial refund math verified; defrost tested; banned-user in-flight payment auto-refunded.
G. Client cache coherence
Epoch ETags, service-worker version floor, cache-bust push
Tombstone propagation to mobile caches inside SLO on a real device; stale-epoch response is rejected.
H. Migration + cutover
Dual write, shadow read, controlled switch, rollback drills, identity drill
Mismatch rate below threshold; feature-flag rollback proven; identity drill complete.
I. Launch hardening
Runbooks, alerts, kill switches, restore drills, chaos tests, post-emergency audit job
All launch gates pass; incident controls documented; emergency_open_paywall followed by fraud_audit_after_flag_off exercised in staging.
23. Definition of done
Anonymous search uses only sanitized published projections across filter and semantic paths.
Approximate listings never expose exact address, unit number, hidden coordinates, or raw phone in the public payload, including in autocomplete suggestions.
Card and map popup are summary-identical for the same unit and share the same query_snapshot_id, projection_epoch, unit_identity_epoch, and, when applicable, embedding_version and ranker_profile_version.
PRIVATE_ROOM, SHARED_ROOM, and ENTIRE_PLACE all match correctly under realistic capacity cases.
Create, edit, contact, reveal, merge, and split flows are idempotent and concurrency-safe.
Projection publish state is visible in metrics and alerts across filter, unit, and semantic projections. Stale published versions behave as designed.
Identity mutations complete within SLO and leave downstream tables consistent.
Snapshot expiry produces a structured client response and refresh cue, never silent duplication.
Client caches (edge and service worker) honor tombstone invalidation within SLO on real devices.
Moderation writes cannot be silently overwritten by host edits. 423 Locked is returned and observed in audit.
Search, writes, workers, and migrations have isolated pools and tested kill switches.
A restore drill, rollback drill, identity drill, embedding-swap drill, and at least one chaos test suite have completed successfully.
The team can run the system safely in degraded-but-private mode during an incident (list-only, semantic disabled, no reveal, no new publish).
Every Stripe webhook is processed exactly once from the system’s point of view; replay delivery becomes a database no-op.
No grant exists without a succeeded payment, and no succeeded payment remains without exactly one grant or one auto-refund, unless a manual revocation is explicitly audited.
Paywall evaluation is correct under double-clicks, network retries, pass expiry mid-action, refund during an active session, out-of-order webhooks, Stripe outage conditions, identity mutations mid-flow, chargeback freeze, and defrost.
Pass extension and partial refund math produces deterministic window results verified against a reference implementation.
Automatic host-side credit restoration fires on bounce, ban, mass-deactivation, and ghost-SLA without support tickets.
Paywall failure never degrades free-tier discovery or anonymous search availability.
Chargeback-evidence generation, entitlement-freeze, and defrost runbooks have been tested in staging.
emergency_open_paywall, freeze_new_grants, rollback_embedding_version, and disable_semantic_search have all been exercised safely before launch, and the post-emergency fraud_audit job has been verified.
Final recommendation. Build this exact model. Separate physical truth, public truth, semantic truth, and economic truth. Version identity itself. Extend the consistency contract through the client cache. Keep user-facing paths insulated from dependency failure and model-version drift.