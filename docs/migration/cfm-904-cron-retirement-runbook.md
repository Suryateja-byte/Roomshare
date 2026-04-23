# CFM-904 — Legacy cron retirement runbook

**Commit**: `09dba2b0` (gate) + `<this commit>` (runbook/inventory/observability corrections).
**Flag**: `ENABLE_LEGACY_CRONS` ∈ `{on, off}`; missing env = `on`.
**Scope**: `src/app/api/cron/sweep-expired-holds/route.ts`, `src/app/api/cron/reconcile-slots/route.ts`.

---

## What the flag does

When `ENABLE_LEGACY_CRONS=off`, both legacy cron handlers early-return immediately after the cron-auth check, emit a structured `cfm.cron.legacy_*_skipped_count{reason="flag_off"}` log, and perform zero database work. The route files, handler logic, and Vercel schedule entries remain on disk per CFM-1003 retention policy — only execution is gated.

Semantics:

- `sweep-expired-holds` runs via `vercel.json` (every 5 min). Post-flip steady-state: ~288 skipped counts/day.
- `reconcile-slots` has NO `vercel.json` entry of its own, but is invoked by `src/app/api/cron/daily-maintenance/route.ts:162-167` every 15 min. Post-flip steady-state: ~96 skipped counts/day.

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
3. Within 10 min: confirm `cfm.cron.legacy_sweep_skipped_count` starts incrementing at ~1/5 min. Confirm `cfm.cron.legacy_reconcile_skipped_count` starts at ~1/15 min (driven by daily-maintenance). No DB write load from either route.
4. Within 60 min: confirm `cfm.booking.legacy_open_count` remains at `0` (nothing new getting stuck because nothing is being created).

---

## Post-flip monitor (24h)

Watch the following for regression:

| Signal | Expected | Action if not |
|---|---|---|
| `cfm.cron.legacy_sweep_skipped_count{reason=flag_off}` | ~288/day | If 0: cron stopped firing. Check Vercel cron logs. If > 288/day: spurious invocations — investigate. |
| `cfm.cron.legacy_reconcile_skipped_count{reason=flag_off}` | ~96/day | Same thresholds scaled to 1/15 min. |
| `cfm.booking.legacy_open_count` | `0` | If > 0: some path is creating new bookings. Roll back the flag. |
| `cfm.booking.legacy_mutation_blocked_count{role=non_admin}` | monotonic | If it unexpectedly drops to 0, investigate for a missing caller path, telemetry breakage, or an unexpected code regression in the permanent lockdown. |

Note: `daily-maintenance/route.ts`'s summary counter reports reconcile as `succeeded: true` when the gate skips (its `runDelegatedTask` helper does not currently promote `detail.skipped === true` to the top-level `skipped` field). This is cosmetic — the skipped-count log is the source of truth. A future follow-up (CFM-904-F2, optional) can promote the `skipped` field for cleaner summary semantics.

---

## Rollback

If any regression observed: set `ENABLE_LEGACY_CRONS=on` (or unset the var) in Vercel env and redeploy. Next invocation resumes the original handler. No data rollback needed — the flag only gates execution, never touches data. Rollback time is one Vercel deploy cycle (~2 min).

---

## Deferred cleanup (separate ticket)

Removing the `vercel.json` entry for `sweep-expired-holds` is deferred to a later cleanup ticket once `cfm.cron.legacy_sweep_skipped_count` shows 7+ days of steady-state post-flip (i.e., zero unexpected invocations or errors). Same criterion for removing `reconcile-slots` from `daily-maintenance`'s task list. The goal is to keep the rollback surface live for the 7-day safety window.
