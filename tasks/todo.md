# Fix critical issues from search & map review (2026-07-01)

## Goal + acceptance criteria
Fix the 3 critical findings from the search/map discovery review:

1. **Redis-backed geocoding cost caps** — monthly provider caps live in an in-memory
   Map (`src/lib/geocoding/provider-cost-controls.ts`) and reset on every serverless
   cold start. AC: counters persist in Redis (Upstash, already wired in
   `geocoding-cache.ts`) via INCR+EXPIRE per provider:surface:month; graceful
   in-memory fallback when Redis unavailable; unit tests cover cap + fallback.
2. **Cache paid autocomplete provider results** — Mapbox/Google branches in
   `src/app/api/geocoding/autocomplete/route.ts` call billable APIs with no cache.
   AC: results cached via existing geocoding cache keyed by provider+normalized
   query; cache consulted before the billable call; test proves second identical
   query skips the provider adapter.
3. **Location popup intercepts mobile Search tap** — autocomplete popup
   (`LocationSearchInput.tsx`, fixed portal, z-9999) is never dismissed on submit
   and can swallow the tap aimed at the Search button.
   AC: non-interactive popup states cannot swallow taps; popup closes on form
   submit; E2E workaround from commit 3dfb9031 reverted so the gate test covers
   the real flow.

## Scope (files/modules)
- src/lib/geocoding/provider-cost-controls.ts (+ all call sites)
- src/app/api/geocoding/autocomplete/route.ts
- src/components/LocationSearchInput.tsx + search submit path
- tests: unit tests for cost controls + autocomplete caching; e2e search gate spec

## Risks
- Fix 1 may turn sync functions async → ripple to call sites (must find all).
- Fix 2: Google Places ToS limits caching of predictions — keep TTL short.
- Fix 3: popup dismissal risks breaking suggestion click-selection (blur-vs-click
  ordering) — keep surgical: submit-time dismissal + pointer-events on
  non-interactive states only; no blur refactor.

## Checklist
- [x] Read involved files + find call sites
- [x] Fix 1: Redis-backed caps + fallback + tests
- [x] Fix 2: REJECTED as proposed — provider ToS prohibits caching (see below)
- [x] Fix 3: popup dismissal on submit + pointer-events + revert e2e workaround
- [x] lint + typecheck + affected unit tests
- [x] Results + verification story

## Results + verification story

**Fix 1 (Redis-backed cost caps) — DONE.**
`provider-cost-controls.ts` now uses Upstash Redis (INCRBY + first-write EXPIRE,
month-scoped `geo-usage:` keys) with the old Map demoted to per-instance
fallback. All callers made async: autocomplete route (2 cap checks),
google-places (5 usage records + 1 cap check), mapbox (1 record), smarty
(assert → async + 2 records). New suite
`src/__tests__/lib/geocoding/provider-cost-controls.test.ts` (7 tests): INCRBY
key shape, expire-once, cross-instance cap reads, string counter tolerance,
no-cap short-circuit, Redis-error fallback, no-Redis fallback. `.env.example`
cap section documents the Redis requirement.

**Fix 2 (cache paid autocomplete results) — REJECTED as proposed, documented.**
Mapbox Temporary Geocoding terms prohibit storing results (adapter operation is
literally `temporary_geocoding_forward`; existing route test "does not cache
temporary results" pins this deliberately) and Google Places terms only allow
caching place IDs — not predictions. Caching provider payloads in Redis would
trade a cost bug for a ToS violation. The compliant cost bound is Fix 1 (caps
now actually enforce) + the existing first-party local-index/public-inventory
cache in front of paid providers. Decision recorded as a comment in
`autocomplete/route.ts` above the Mapbox branch.

**Fix 3 (popup intercepts mobile Search tap) — DONE, root causes fixed.**
- `LocationSearchInput`: popup closes on surrounding form submit (native
  capture listener on `input.form`); Escape now closes only the popup and
  stops propagation (progressive dismissal — no longer closes the whole
  mobile dialog); mousedown on popup dead chrome dismisses instead of
  swallowing; status-only popups (type-more hint, no-results) are
  `pointer-events-none` so taps pass through to the Search button.
- `MobileSearchOverlay`: the 250ms initial-focus enforcement no longer steals
  focus from a control the user already moved to (this was what deterministically
  re-opened the popup over the Search button on Mobile Safari).
- Reverted the test-only workaround from commit 3dfb9031 — the gate spec now
  submits with the popup open, i.e. it is the regression test for the bug.
- New suite `LocationSearchInput.popup-dismissal.test.tsx` (5 tests) + updated
  the one integration test that pinned the old swallow-the-tap behavior.

**Verification:** `pnpm lint` 0 errors (18 pre-existing warnings, none in
changed lines); `pnpm typecheck` clean; 38 affected suites / 386 tests pass
(all of `lib/geocoding`, `api/geocoding`, `components/search`,
`components/LocationSearchInput`, SearchHeaderWrapper, MobileSearchOverlay).
NOT run locally: Playwright e2e (needs prod build + DB per project memory) —
the reverted gate spec must be watched in CI.
NOT committed — awaiting user go-ahead.

---

# ARCHIVED: /search Feature Audit — Fix Plan (2026-06-18) [COMPLETE]

All 12 groups landed (45/49 findings fixed, 4 deferred). Lint/typecheck green,
7447 jest tests passed. Full record in git history and docs/search-audit-2026-06-18.md.
