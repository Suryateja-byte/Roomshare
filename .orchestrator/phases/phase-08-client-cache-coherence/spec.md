# Phase 08: Client Cache Coherence

## Goal And Success Criteria

Extend the projection consistency contract through edge, browser, and service
worker caches. Phase 08 is approved when public cacheable responses carry
version metadata, foreground clients receive invalidation events, service
worker caches refuse stale projection epochs, and tombstone/identity
invalidations can refresh or evict stale public views without leaking private
listing, location, user, or push-subscription data.

## Ordered Slices

1. Schema and artifacts: add this spec, an expand-only migration, Prisma schema
   support, PGlite/schema tests, and rollback notes for fanout status and push
   subscription storage.
2. Public cache contracts: add signed invalidation cursors, public unit cache
   keys, state payload extensions, SSE event delivery, and rate-limited push
   subscription routes.
3. Worker and service worker: fan out `cache_invalidations`, keep push
   best-effort, update `public/sw.js` to track cache metadata and reject
   stale floor epochs.
4. Public response wiring: add cache metadata headers for projection-backed
   public JSON routes, short listing-detail cache headers, listing metadata
   handoff to the service worker, and session-only autocomplete boundaries.
5. Closeout: add runbook coverage, run targeted and regression checks, write
   generator/review artifacts, add `APPROVED`, and advance state to Phase 09
   pending after Critic approval.

## Target Subsystems

- `prisma/schema.prisma`, additive migration SQL, and PGlite schema fixtures.
- `src/lib/public-cache/*`, `/api/public-cache/state`, `/api/public-cache/events`,
  and push subscription routes.
- `public/sw.js`, `ServiceWorkerRegistration`, search/listing detail clients,
  and public route response headers.
- Public cache API, service-worker, search/detail, autocomplete, and schema
  tests.

## Invariants And Constraints

- `FEATURE_PUBLIC_CACHE_COHERENCE=false` keeps the current rollback behavior.
- Cache invalidation payloads expose only opaque cache keys, epochs, cursors,
  timestamps, and coarse reason codes.
- Push endpoints are never logged and are stored encrypted-at-rest.
- Client caches must prefer refresh/no stale result over serving a tombstoned
  or suppressed target.
- No public response header may expose exact coordinates, unit IDs, user IDs,
  emails, raw push subscription endpoints, or private listing fields.
- Public search, map, and count snapshot behavior from Phase 04 remains in
  scope only as a cache metadata carrier; snapshot semantics are unchanged.

## Acceptance Criteria

- `GET /api/public-cache/state` returns `cacheFloorToken`, signed
  `latestCursor`, `projectionEpochFloor`, and `generatedAt` with `no-store`.
- `GET /api/public-cache/events` accepts a signed cursor and emits bounded SSE
  invalidation events with opaque unit keys and no private data.
- Push subscription upsert/delete routes validate shape, rate-limit calls,
  encrypt subscriptions, and avoid raw endpoint logs.
- `cache_invalidations` rows track fanout status, attempts, backoff, and final
  delivery/skipped state.
- Public search/map/count/autocomplete JSON routes include projection cache
  metadata headers when cacheable.
- Listing detail has short `stale-while-revalidate` cache headers and passes
  dynamic cache metadata to the service worker without relying on dynamic page
  response headers.
- `public/sw.js` evicts matching unit cache entries, clears dynamic cache on
  global floor changes, and refuses cached responses below the projection floor.
- Semantic autocomplete and search-bar suggestions are not persisted beyond the
  browser session.

## Validation Commands

- `pnpm test -- --runTestsByPath src/__tests__/db/phase08-schema.test.ts --runInBand`
- Phase 08 focused public-cache Jest set.
- Existing public-cache, search route, autocomplete, Phase 07, Phase 04, and
  Phase 02 focused regression sets.
- `pnpm exec prisma validate`
- `pnpm typecheck`
- `pnpm lint`
- Optional: `pnpm test --runInBand`; record unrelated existing failures.

## Rollback Notes

Operational rollback is first: set `FEATURE_PUBLIC_CACHE_COHERENCE=false` and
stop registering/using push subscriptions, SSE, and service-worker cache floor
behavior. Schema rollback is expand-only: drop `public_cache_push_subscriptions`,
the Phase 08 fanout indexes, and Phase 08-only `cache_invalidations` fanout
columns after pending invalidations are no longer needed.

## Research Summary

External research was limited to primary sources. Next.js documents that
Server Component `headers()` is read-only, `next.config` can set static
response headers, and Route Handlers can return custom headers. W3C Push API
and RFC 8292 describe service-worker push subscription and VAPID requirements.
