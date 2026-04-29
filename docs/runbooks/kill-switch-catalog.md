# Kill Switch Catalog Runbook

Phase 10 launch drills must exercise every kill switch in the catalog exported
by `src/lib/launch/kill-switch-catalog.ts`.

## Exercise Procedure

1. Pick one switch and confirm the owning on-call role.
2. Set only that switch in staging or a local drill environment.
3. Run the matching focused test or manual probe from the catalog entry.
4. Confirm the expected degraded behavior occurs and no PII is logged.
5. Clear the switch and confirm the normal path resumes.
6. Record the timestamp, operator, command, and result in the launch evidence
   tracker.

## Switch Inventory

| Switch | Env var | Primary runbook | Expected degraded behavior |
|---|---|---|---|
| `force_list_only` | `KILL_SWITCH_FORCE_LIST_ONLY` | `degraded-safe-mode.md` | Search works without map/list coupling. |
| `force_clusters_only` | `KILL_SWITCH_FORCE_CLUSTERS_ONLY` | This runbook | Map cluster payloads can be forced. |
| `disable_semantic_search` | `KILL_SWITCH_DISABLE_SEMANTIC_SEARCH` | `degraded-safe-mode.md` | Filter-only projection search remains available. |
| `pause_geocode_publish` | `KILL_SWITCH_PAUSE_GEOCODE_PUBLISH` | This runbook | Geocode publish requeues; existing public rows remain readable. |
| `pause_embed_publish` | `KILL_SWITCH_PAUSE_EMBED_PUBLISH` | `embedding-swap.md` | Embedding work requeues without deleting active rows. |
| `rollback_ranker_profile` | `KILL_SWITCH_ROLLBACK_RANKER_PROFILE` | This runbook | Ranking can be disabled with `off` while search remains available. |
| `rollback_embedding_version` | `KILL_SWITCH_ROLLBACK_EMBEDDING_VERSION` | `embedding-swap.md` | Semantic reads target the previous published embedding version. |
| `pause_backfills_and_repairs` | `KILL_SWITCH_PAUSE_BACKFILLS_AND_REPAIRS` | This runbook | Low-priority repair jobs pause. |
| `pause_identity_reconcile` | `KILL_SWITCH_PAUSE_IDENTITY_RECONCILE` | `identity-merge.md` | Identity repair queues pause without deleting public rows. |
| `disable_payments` | `KILL_SWITCH_DISABLE_PAYMENTS` | `emergency-open-paywall.md` | Checkout stops; free discovery and existing grants remain. |
| `freeze_new_grants` | `KILL_SWITCH_FREEZE_NEW_GRANTS` | `chargeback-defrost.md` | Payment grant activation pauses. |
| `disable_alerts` | `KILL_SWITCH_DISABLE_ALERTS` | `saved-search-alerts.md` | Alert match/delivery work pauses durably. |
| `emergency_open_paywall` | `KILL_SWITCH_EMERGENCY_OPEN_PAYWALL` | `emergency-open-paywall.md` | Contact actions proceed with audit-only emergency grants. |
| `disable_phone_reveal` | `KILL_SWITCH_DISABLE_PHONE_REVEAL` | `degraded-safe-mode.md` | Phone reveal fails closed. |
| `disable_new_publication` | `KILL_SWITCH_DISABLE_NEW_PUBLICATION` | `degraded-safe-mode.md` | New publication pauses; existing published projections remain. |
| `disable_public_cache_push` | `KILL_SWITCH_DISABLE_PUBLIC_CACHE_PUSH` | `public-cache-coherence.md` | Web Push fanout pauses; SSE and polling continue. |

## Evidence

- Deterministic catalog completeness:
  `src/__tests__/launch/phase10-launch-hardening.test.ts`
- Launch checklist:
  `docs/launch/definition-of-done.md`
