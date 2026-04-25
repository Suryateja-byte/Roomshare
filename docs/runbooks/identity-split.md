# Identity Split Drill Runbook

Use this drill when one physical unit must be split into multiple public unit
identities.

## Procedure

1. Create one synthetic source unit and two target units.
2. Attach contact, entitlement, saved item, review, and search-order fixtures to
   the source.
3. Run the SPLIT mutation in staging or the deterministic repo-local drill.
4. Confirm all target units receive the new identity epoch.
5. Confirm downstream rows reference existing units, contact-consumption keys
   remain unique, and entitlement credit totals are unchanged.
6. Confirm public search ordering contains the target active unit keys.

## Rollback

Do not manually delete downstream rows. If the split is unsafe, pause identity
reconciliation and keep existing published projections readable while a manual
moderation plan is prepared.

## Evidence

- Deterministic drill:
  `src/__tests__/launch/phase10-launch-hardening.test.ts`
