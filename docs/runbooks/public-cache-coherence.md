# Public Cache Coherence Runbook

Phase 08 keeps public search and listing-detail caches coherent through a
rollback-safe floor token, foreground SSE, service-worker eviction, and optional
Web Push fanout.

## Kill Switches

- Set `FEATURE_PUBLIC_CACHE_COHERENCE=false` to return clients to the pre-Phase
  08 behavior. State and event endpoints remain no-store, but clients stop
  subscribing and the fanout worker exits without processing rows.
- Set `KILL_SWITCH_DISABLE_PUBLIC_CACHE_PUSH=true` to pause Web Push fanout
  only. SSE and polling continue to advance foreground clients.
- If stale public content is suspected, set both switches, purge CDN/search
  route caches, then re-enable `FEATURE_PUBLIC_CACHE_COHERENCE` with push still
  disabled until fanout health is confirmed.

## VAPID Rotation

1. Generate a new VAPID key pair outside application logs.
2. Deploy the new `PUBLIC_CACHE_VAPID_PUBLIC_KEY`,
   `PUBLIC_CACHE_VAPID_PRIVATE_KEY`, and `NEXT_PUBLIC_PUBLIC_CACHE_VAPID_KEY`
   together.
3. Keep `PUBLIC_CACHE_VAPID_SUBJECT` stable unless the contact domain changes.
4. Leave old encrypted subscriptions in place; browsers will refresh their
   subscription on the next foreground state poll if the public key changed.
5. Monitor `cache_invalidations.fanout_status` and subscription
   `last_failed_at`. A spike in endpoint-gone failures is expected during
   rotation; a spike in transient failures is not.

## Fanout Backlog

- Claimable rows:
  `fanout_status='PENDING' AND fanout_next_attempt_at <= now()`.
- Healthy rows move to `DELIVERED`, `SKIPPED`, or retry with an incremented
  `fanout_attempt_count`.
- If fanout stalls, keep `KILL_SWITCH_DISABLE_PUBLIC_CACHE_PUSH=true`, verify
  VAPID and `PUBLIC_CACHE_PUSH_ENCRYPTION_KEY`, then replay by clearing the kill
  switch. Do not delete `cache_invalidations` rows to clear the backlog.

## SSE And Poll Fallback

- `/api/public-cache/events` is the foreground fast path and must return
  `Cache-Control: no-store`.
- `/api/public-cache/state` is the polling fallback and source of truth for the
  current floor token.
- If SSE errors spike, the client continues polling every minute. Confirm that
  state responses include `cacheFloorToken`, `latestCursor`, and
  `projectionEpochFloor`.

## Stale Cache Incident

1. Confirm the affected unit was tombstoned, suppressed, or republished and a
   `cache_invalidations` row exists for the active `unit_id@epoch`.
2. Confirm public JSON responses carry `X-Roomshare-Projection-Epoch` and, for
   grouped search/map responses, `X-Roomshare-Unit-Cache-Keys`.
3. Ask an affected browser to foreground the tab; it should poll state, reject
   cached responses below the projection floor, and refresh public surfaces.
4. If the hide-SLA is missed, set `FEATURE_PUBLIC_CACHE_COHERENCE=false`, purge
   CDN caches, and keep push disabled while investigating missing headers,
   service-worker registration, or fanout backlog.

## Privacy Rules

- Public invalidation payloads expose only opaque unit cache keys, projection
  epoch, coarse reason, and cursor metadata.
- Never log raw push endpoints, user emails, exact addresses, precise
  coordinates, or listing private data while debugging fanout.
- The push subscription table stores endpoint hashes and encrypted subscription
  JSON; use only endpoint hashes in operational notes.
