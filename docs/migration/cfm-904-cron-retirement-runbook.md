# CFM-904 — Legacy cron retirement runbook

**Commit**: `09dba2b0` (gate) + `<this commit>` (runbook/inventory/observability corrections).
**Flag**: `ENABLE_LEGACY_CRONS` ∈ `{on, off}`; missing env = `on`.
**Scope**: `src/app/api/cron/sweep-expired-holds/route.ts`, `src/app/api/cron/reconcile-slots/route.ts`.

---

## What the flag does

When `ENABLE_LEGACY_CRONS=off`, both legacy cron handlers early-return immediately after the cron-auth check, emit a structured `cfm.cron.legacy_*_skipped_count{reason="flag_off"}` log, and perform zero database work. The route files, handler logic, and Vercel schedule entries remain on disk per CFM-1003 retention policy — only execution is gated.

Semantics:

- `sweep-expired-holds` has no dedicated `vercel.json` entry. It can still be called manually or by an external scheduler during the retention window.
- `reconcile-slots` has no dedicated `vercel.json` entry and is not part of the Hobby-plan daily-maintenance fan-out. It can still be called manually or by an external scheduler during the retention window.
- `vercel.json` keeps one Hobby-compatible daily cron for `/api/cron/daily-maintenance` at `2 9 * * *`.

---

## Pre-flip checklist (operator)

Run these before setting the flag to `off`:

1. **Verify zero non-terminal booking rows for 7 consecutive days.**
   - SQL:
     ```sql
     SELECT COUNT(*) FROM "Booking"
      WHERE status IN ('PENDING', 'HELD');
     ```
   - Expect `0` for 7 days running. If non-zero, trigger one last manual sweep (see `/api/cron/sweep-expired-holds` with the standard cron auth) to drain stale holds, then re-check.

2. **Verify `cfm.booking.legacy_mutation_blocked_count{role=non_admin,reason=flag_off}` is monotonic** for the prior 24 h (proves the permanent CFM-902 non-admin lockdown is enforced; no caller is bypassing server-side).

3. **Confirm observability dashboards are registered** for:
   - `cfm.cron.legacy_sweep_skipped_count`
   - `cfm.cron.legacy_reconcile_skipped_count`
   - `cfm.booking.legacy_open_count` (the canary for regressions).

4. **Schedule a 24h watch window** with on-call; expected alerts are ZERO (both metrics are dashboard-only).

---

## Flip procedure

1. Set `ENABLE_LEGACY_CRONS=off` in the Vercel production environment.
2. Trigger a deploy (Vercel auto-redeploys on env var change). The gate takes effect on next request.
3. Trigger one authenticated manual request to each retained legacy cron route. Confirm `cfm.cron.legacy_sweep_skipped_count` and `cfm.cron.legacy_reconcile_skipped_count` each increment once with `reason=flag_off`. No DB write load from either route.
4. Within 60 min: confirm `cfm.booking.legacy_open_count` remains at `0` (nothing new getting stuck because nothing is being created).

---

## Post-flip monitor (24h)

Watch the following for regression:

| Signal | Expected | Action if not |
|---|---|---|
| `cfm.cron.legacy_sweep_skipped_count{reason=flag_off}` | No steady-state Vercel increments; manual/external invocations only | If it increments unexpectedly, investigate the caller. |
| `cfm.cron.legacy_reconcile_skipped_count{reason=flag_off}` | No steady-state Vercel increments; manual/external invocations only | If it increments unexpectedly, investigate the caller. |
| `cfm.booking.legacy_open_count` | `0` | If > 0: some path is creating new bookings. Roll back the flag. |
| `cfm.booking.legacy_mutation_blocked_count{role=non_admin}` | monotonic | If it unexpectedly drops to 0, investigate for a missing caller path, telemetry breakage, or an unexpected code regression in the permanent lockdown. |

Note: `daily-maintenance/route.ts` no longer invokes `reconcile-slots` on the Hobby-plan daily dispatcher. The skipped-count logs are therefore a manual/external invocation signal, not a steady-state Vercel cron signal.

---

## Rollback

If any regression observed: set `ENABLE_LEGACY_CRONS=on` (or unset the var) in Vercel env and redeploy. Next invocation resumes the original handler. No data rollback needed — the flag only gates execution, never touches data. Rollback time is one Vercel deploy cycle (~2 min).

---

## Deferred cleanup (separate ticket)

Deleting the retained `sweep-expired-holds` and `reconcile-slots` route files is deferred to a later cleanup ticket once 7+ days of post-flip monitoring show zero unexpected invocations or errors. The goal is to keep the rollback surface live for the 7-day safety window.
