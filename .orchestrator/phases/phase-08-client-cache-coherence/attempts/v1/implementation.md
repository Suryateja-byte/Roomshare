# Phase 08 Implementation

## Summary

Implemented Phase 08 client cache coherence as a flagged, rollback-safe
extension to public search/detail caching. Public cache state now exposes a
signed invalidation cursor and projection epoch floor, foreground clients can
receive SSE invalidations, the service worker rejects stale projection epochs
and evicts unit-keyed cached entries, and optional Web Push fanout is backed by
encrypted subscription storage.

## Files Changed

- `.orchestrator/phases/phase-08-client-cache-coherence/*`
- `prisma/schema.prisma`
- `prisma/migrations/20260508000000_phase08_client_cache_coherence/*`
- `package.json`, `pnpm-lock.yaml`
- `next.config.ts`
- `public/sw.js`
- `src/lib/public-cache/*`
- `src/app/api/public-cache/state`, `/events`, and `/push-subscription`
- `src/app/api/search/v2/route.ts`
- `src/app/api/search/listings/route.ts`
- `src/app/api/map-listings/route.ts`
- `src/app/api/search-count/route.ts`
- `src/app/api/geocoding/autocomplete/route.ts`
- `src/app/api/cron/outbox-drain/route.ts`
- `src/components/ServiceWorkerRegistration.tsx`
- `src/app/listings/[id]/*`
- Phase 08 schema, public-cache, route, client, and regression tests
- `docs/runbooks/public-cache-coherence.md`

## Implementation Notes

- `FEATURE_PUBLIC_CACHE_COHERENCE=false` remains the full rollback path.
- `KILL_SWITCH_DISABLE_PUBLIC_CACHE_PUSH=true` pauses only Web Push fanout; SSE
  and polling remain available.
- Push subscriptions are stored as endpoint hashes plus AES-GCM encrypted
  subscription JSON. Raw endpoints are not logged or written outside the
  encrypted payload.
- `GET /api/public-cache/state` returns `cacheFloorToken`, signed
  `latestCursor`, `projectionEpochFloor`, and `generatedAt` with `no-store`.
- `GET /api/public-cache/events` emits bounded SSE invalidations after a signed
  cursor and returns a structured `invalid_cursor` error for malformed cursors.
- Public JSON routes now carry projection metadata headers and opaque unit cache
  keys where grouped unit results are present.
- Listing detail uses static short cache headers in `next.config.ts` and passes
  dynamic unit/projection metadata to the service worker from the client.
- Autocomplete remains `no-store`; server cache versioning is tied to the public
  cache floor and no client/session suggestions are persisted by this phase.

## Validation

- Phase 08 focused Jest: 10 suites, 28 tests passed.
- Phase 07 saved-search/alerts regression: 9 suites, 100 tests passed.
- Phase 04 search regression: 8 suites, 85 tests passed.
- Phase 02 outbox/projection regression: 19 suites, 158 tests passed.
- `pnpm exec prisma validate` passed.
- `pnpm typecheck` passed.
- `pnpm lint` passed with 0 errors and existing warnings only.

## Notes

- Added production dependency `web-push` and dev dependency `@types/web-push`
  for standards-based VAPID push delivery.
- Broad `pnpm test --runInBand` was not run; the requested focused and
  regression sets above passed.
- A dedicated Playwright mobile hide-SLA script was not added in this slice;
  detail refresh, service-worker message handling, stale-floor rejection inputs,
  and route contracts are covered by focused Jest tests.
