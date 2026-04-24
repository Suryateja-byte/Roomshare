# Identity Merge Drill Runbook

Use this drill to prove that merging duplicate physical units keeps downstream
contact, entitlement, saved item, review, and search-order state coherent.

## Procedure

1. Create two synthetic units that should resolve to one public unit.
2. Add contact consumption rows, entitlement state, saved items, reviews, and
   projection/search ordering for both units.
3. Run the MERGE mutation in staging or the deterministic repo-local drill.
4. Confirm the target unit receives a new identity epoch and source units point
   to the target.
5. Confirm there are no duplicate contact-consumption keys and entitlement
   credit totals are unchanged.
6. Confirm public search returns only the target active unit key.

## Kill Switch

Set `KILL_SWITCH_PAUSE_IDENTITY_RECONCILE=true` if identity repair work risks
search/write SLOs during launch.

## Evidence

- Deterministic drill:
  `src/__tests__/launch/phase10-launch-hardening.test.ts`
