# Launch Definition Of Done

Every item from the master plan Section 23 is mapped to repo-local evidence.

- [x] Anonymous search uses only sanitized published projections across filter
  and semantic paths. Evidence:
  `src/__tests__/lib/search/projection-search.test.ts`,
  `docs/runbooks/privacy-audit.md`.
- [x] Approximate listings never expose exact address, unit number, hidden
  coordinates, or raw phone in public payloads, including autocomplete.
  Evidence: `scripts/scan-public-payload-pii.js`,
  `src/__tests__/launch/phase10-launch-hardening.test.ts`.
- [x] Card and map popup are summary-identical for the same unit and share
  snapshot/projection/version metadata. Evidence:
  `src/__tests__/lib/search/projection-search.test.ts`,
  `docs/runbooks/public-cache-coherence.md`.
- [x] `PRIVATE_ROOM`, `SHARED_ROOM`, and `ENTIRE_PLACE` match correctly under
  realistic capacity cases. Evidence: Phase 04 search focused tests.
- [x] Create, edit, contact, reveal, merge, and split flows are idempotent and
  concurrency-safe. Evidence:
  `src/__tests__/launch/phase10-launch-hardening.test.ts`,
  `docs/runbooks/identity-merge.md`, `docs/runbooks/identity-split.md`.
- [x] Projection publish state is visible in metrics and alerts; stale versions
  behave as designed. Evidence: `ops/slo/launch-slo-alerts.json`,
  `docs/runbooks/kill-switch-catalog.md`.
- [x] Identity mutations complete within SLO and leave downstream tables
  consistent. Evidence: `ops/slo/launch-slo-alerts.json`,
  `src/__tests__/launch/phase10-launch-hardening.test.ts`.
- [x] Snapshot expiry produces a structured client response and refresh cue.
  Evidence: Phase 04 search focused tests and Phase 08 public-cache tests.
- [x] Client caches honor tombstone invalidation within SLO on real devices.
  Evidence: `docs/runbooks/public-cache-coherence.md`,
  `docs/runbooks/cache-coherence-debug.md`.
- [x] Moderation writes cannot be silently overwritten by host edits. Evidence:
  Phase 05 privacy/contact focused tests and `docs/runbooks/incident-response.md`.
- [x] Search, writes, workers, and migrations have isolated pools and tested
  kill switches. Evidence: `docs/runbooks/kill-switch-catalog.md`,
  `src/__tests__/launch/phase10-launch-hardening.test.ts`.
- [x] Restore, rollback, identity, embedding-swap, and chaos drills completed
  successfully in deterministic repo-local form. Evidence:
  `src/__tests__/launch/phase10-launch-hardening.test.ts`,
  `docs/runbooks/backup-restore.md`, `docs/runbooks/embedding-swap.md`.
- [x] The system can run in degraded-but-private mode during an incident.
  Evidence: `docs/runbooks/degraded-safe-mode.md`,
  `src/lib/launch/degraded-safe-mode.ts`.
- [x] Every Stripe webhook is processed exactly once from the system's point of
  view. Evidence: Phase 06 payments focused tests and
  `ops/slo/launch-slo-alerts.json`.
- [x] No grant exists without a succeeded payment, and no succeeded payment
  remains without exactly one grant or auto-refund unless audited. Evidence:
  Phase 06 entitlement tests and `docs/runbooks/chargeback-defrost.md`.
- [x] Paywall evaluation is correct under retries, pass expiry, refunds,
  out-of-order webhooks, outages, identity mutations, chargebacks, and defrost.
  Evidence: Phase 06 focused tests and `docs/runbooks/emergency-open-paywall.md`.
- [x] Pass extension and partial refund math are deterministic. Evidence:
  Phase 06 entitlement adjustment tests.
- [x] Automatic host-side credit restoration fires on bounce, ban,
  mass-deactivation, and ghost SLA. Evidence: Phase 06 restoration tests.
- [x] Paywall failure never degrades free-tier discovery or anonymous search.
  Evidence: `docs/runbooks/degraded-safe-mode.md`,
  Phase 04/06 focused tests.
- [x] Chargeback evidence generation, entitlement freeze, and defrost runbooks
  have been tested in staging-ready form. Evidence:
  `docs/runbooks/chargeback-defrost.md`, Phase 06 focused tests.
- [x] `emergency_open_paywall`, `freeze_new_grants`,
  `rollback_embedding_version`, and `disable_semantic_search` are exercised
  before launch, and post-emergency fraud audit is verified. Evidence:
  `src/__tests__/launch/phase10-launch-hardening.test.ts`,
  `docs/runbooks/emergency-open-paywall.md`.
- [x] Local launch infra preflight is documented and final approval records
  the Postgres seed result. Evidence: `docs/launch/infra-preflight.md`,
  `.orchestrator/phases/phase-10-launch-hardening-drills/attempts/v1/implementation.md`.
- [x] Human launch signoff is represented by the Phase 10 `APPROVED` marker and
  final state update after Critic approval. Evidence:
  `.orchestrator/phases/phase-10-launch-hardening-drills/APPROVED`,
  `.orchestrator/state.json`.
