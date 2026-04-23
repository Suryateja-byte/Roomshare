# Emergency Open Paywall Runbook

`KILL_SWITCH_EMERGENCY_OPEN_PAYWALL=true` lets contact actions proceed without
burning free or paid credits. It is for incident response only.

## Enable

1. Set `KILL_SWITCH_EMERGENCY_OPEN_PAYWALL=true`.
2. Keep `KILL_SWITCH_DISABLE_PAYMENTS` and `KILL_SWITCH_FREEZE_NEW_GRANTS`
   unchanged unless Stripe checkout or grants are also unhealthy.
3. Confirm new contact attempts return `EMERGENCY_OPEN` in server logs.

## During the Incident

- Emergency opens create `EMERGENCY_GRANT` audit events.
- Emergency opens schedule `fraud_audit_jobs` with reason
  `fraud_audit_after_emergency_open_paywall`.
- Do not backfill `contact_consumption`; the incident path is audit-only so
  legitimate credits are preserved.

## Disable

1. Set `KILL_SWITCH_EMERGENCY_OPEN_PAYWALL=false`.
2. Confirm contact attempts return to the normal order: freeze gate, active
   pass, free credits, paid credits, purchase required.
3. Review scheduled fraud audit jobs and close the incident with row counts for
   emergency grants by contact kind.

## Rollback Safety

Turning the flag off immediately restores normal enforcement. Active passes,
paid packs, restorations, refunds, and chargeback freezes remain ledger-driven
and are not deleted by the emergency-open path.
