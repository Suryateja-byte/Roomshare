# Saved-Search Alerts Runbook

## Kill Switch

Set `KILL_SWITCH_DISABLE_ALERTS=true` to pause alert matching and delivery.
This does not delete saved searches, subscriptions, delivery rows, or outbox
events. Pending `ALERT_DELIVER` work retries through the normal outbox backoff.

Use the switch for email-provider incidents, alert storms, suspected matching
bugs, or `alert_delivered_to_tombstoned_target_total > 0`.

## Safe Resume

1. Confirm the incident source is fixed.
2. Set `KILL_SWITCH_DISABLE_ALERTS=false`.
3. Run the outbox drain for normal priority lanes.
4. Monitor pending `alert_deliveries` by `status`, oldest `scheduled_for`, and
   outbox backlog age for `ALERT_DELIVER`.
5. If backlog pressure threatens search/write SLOs, pause alerts again and
   resume in smaller drain windows.

## Delivery Drop Spike

Investigate grouped `drop_reason` counts from `alert_deliveries`.

- `TARGET_NOT_PUBLIC`: projection/moderation/tombstone churn; verify current
  listing visibility and cache invalidation health.
- `PAYWALL_LOCKED`: entitlement/pass expiry or projection lag; verify Phase 06
  entitlement state freshness.
- `PREFERENCE_DISABLED`: expected after user preference changes.
- `SUBSCRIPTION_INACTIVE`: expected after alert toggles or saved-search delete.
- `EXPIRED`: worker backlog exceeded TTL; replay only after product approval.

## Tombstone Safety

If any alert reaches a tombstoned, suppressed, unpublished, or stale-epoch
target:

1. Enable `KILL_SWITCH_DISABLE_ALERTS=true`.
2. Capture the `alert_deliveries.id`, target ids, saved-search id, and outbox
   id. Do not log user email.
3. Verify `resolvePublicListingVisibilityState` inputs for the target listing.
4. Check whether the delivery row was created before or after the tombstone
   event and whether `ALERT_DELIVER` ran after cache/projection invalidation.
5. Keep the row for audit; do not delete it manually.

## Manual Replay

Replay is normally automatic through the outbox drain. For a narrow replay, set
affected `alert_deliveries.status='PENDING'`, clear `last_error`, and enqueue a
new `ALERT_DELIVER` outbox event for each delivery id. Do not replay rows with
`DROPPED` unless support has confirmed the drop reason was caused by an
operator or migration error.
