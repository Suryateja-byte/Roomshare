# Launch Incident Response Runbook

Use this runbook for launch-window incidents affecting search, publication,
identity, payments, alerts, public cache coherence, or privacy.

## Triage

1. Classify impact: privacy leak, data corruption risk, paid access failure,
   search outage, write outage, or worker lag.
2. Check `ops/slo/launch-slo-alerts.json` for the owning metric and severity.
3. Activate the narrowest kill switch from `kill-switch-catalog.md`.
4. If multiple systems are unstable or privacy is uncertain, enter degraded
   safe mode.

## Privacy First Rules

- Do not paste raw emails, phone numbers, exact addresses, unit numbers, precise
  coordinates, push endpoints, or Stripe card data into incident notes.
- Use unit cache keys, delivery ids, payment ids, outbox ids, and hashed abuse
  identifiers only.
- If public payload leakage is suspected, run:

```bash
pnpm run scan:public-payload-pii -- scripts/fixtures/public-payload-clean.json
```

## Closure

1. Clear temporary kill switches one at a time.
2. Confirm relevant SLO alert stubs would return to healthy state.
3. Attach test, drill, or dashboard evidence to the incident record.
4. For emergency-open paywall incidents, run the fraud audit job after the flag
   is disabled.
