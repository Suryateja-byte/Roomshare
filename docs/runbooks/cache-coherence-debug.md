# Cache Coherence Debug Runbook

This runbook is a launch-window companion to `public-cache-coherence.md`.

## Debug Steps

1. Confirm the affected public response includes projection epoch and cache-key
   metadata headers.
2. Confirm `/api/public-cache/state` returns a floor token newer than the stale
   response.
3. Confirm foreground clients can use SSE or polling to receive invalidation
   events.
4. Confirm service-worker metadata eviction removes entries for the affected
   unit key.
5. If stale content remains visible, pause public-cache push, purge CDN caches,
   and keep semantic search disabled until privacy is verified.

## Privacy Rules

Use unit cache keys and projection epochs in logs. Do not log exact addresses,
precise coordinates, raw phone numbers, emails, or push endpoints.

## Evidence

- Public cache runbook:
  `docs/runbooks/public-cache-coherence.md`
- PII scanner:
  `scripts/scan-public-payload-pii.js`
