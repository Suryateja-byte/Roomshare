# Map subsystem audit — remaining findings

Tracking doc for the open items from the full map-subsystem audit (2026-06).

A multi-dimension adversarial audit of the map subsystem produced 41 verified findings. The 2 **high**
a11y items (roving tabindex for markers, keyboard-operable clusters), the NeighborhoodMap zoom-snap bug,
and the in-flight empty-state flash were fixed and merged in **PR #159** (squash commit `df3bbcfb`).

Two follow-up batches have also already landed on `main`:

- **PR #161** (commit `16c1787f`) fixed the a11y quick wins: desktop popup dialog/focus containment,
  desktop empty-state live-region semantics, mobile preview close target size, and the MapGestureHint
  live-region nit.
- **PR #162** (commit `233a4b38`) fixed the map correctness batch: `padBounds` antimeridian handling,
  near-origin `(0,0)` revalidation after coordinate rounding, and lat/lng-derived bounds clamping.

This doc is the remaining **29**: 6 medium, 19 low, 4 nit. Use it as the brief for a fresh session.

> **Stale line numbers.** PRs #159, #161, and #162 changed `src/components/Map.tsx`,
> `PersistentMapWrapper`, and related map helpers. Re-locate every finding by symbol name / grep before
> editing — do not trust any line numbers. Verify each finding still reproduces against current `main`
> before fixing it.

## Operating rules (this repo)

- Read `.claude/CLAUDE.md` first. Use **plan mode** for any multi-file/architectural change.
- **Not one giant PR.** Group into small, reviewable, themed PRs (see batching below). Each PR: small
  diff, test-backed, conventional-commit message (`fix(map):` / `test(map):` / `refactor(map):`), green
  CI before merge.
- New behavior needs tests: unit for pure logic, component for UI, Playwright e2e for critical flows.
  Run `pnpm typecheck` + `pnpm lint` + `pnpm test` before every commit.
- **EOL gotcha:** `tests/e2e/map-markers.anon.spec.ts` is a mixed CRLF/LF file — the Edit tool flips LF
  lines to CRLF and produces a huge spurious diff. Edit it byte-precisely (Python replace) and check
  `git diff --stat`. Most other files are LF.
- For a11y changes, verify live: `pnpm build` then `pnpm start` (:3000; local DB at :5434 is seeded).
  The Chrome extension is usually not connected — use the **Playwright MCP** (`mcp__playwright__*`)
  against localhost. US-wide bounds (`/search?minLng=-125&maxLng=-66&minLat=24&maxLat=50`) force map
  clustering; narrow/SF bounds give individual markers.
- `Map.tsx` is the biggest risk surface — prefer additive, surgical changes; reuse existing guards/refs/
  helpers (e.g. the shared `findAdjacentByDirection` nav helper added in #159).

## Findings

### Medium (6) — fix first

1. **Hover perf:** `getAvailabilityPresentation` runs for all ~200 markers on every hover, in the render
   `.map`, because `MapComponent` reads the *combined* `useListingFocus()` context. `Map.tsx`. Fix:
   precompute `availabilityAriaLabel` inside the `markersSourceSignature`-keyed `markerPositions` memo,
   or read the split `useListingFocusState`.
2. **God component:** `Map.tsx` mixes 6 concerns. Extract the already-pure desktop-popup geometry helpers
   into `src/lib/maps/desktop-popup-placement.ts`, and pull style-load + WebGL-recovery into hooks.
   Mechanical, behavior-preserving; do as its own PR.
3. **Test gap:** the empty-state-on-error invariant is unit-tested but the wired
   `Map`/`PersistentMapWrapper` path is never exercised with `hasFetchError=true`. Add a component test.
   (#159 enriched the DynamicMap mock with `data-has-fetch-error` — use it.)
4. **Test quality:** `PersistentMapWrapper.networking.test.tsx` stale-guard tests validate by
   `data-listings-count` only. Assert on real content (now that the mock exposes more props).
5. **Test gap:** the 800ms min-interval throttle + trailing/coalesced search (`Map.tsx`) has no test.
6. **Test gap:** the `MAP_FLY_TO_EVENT` receive-side listener (persistent-map-never-remounts invariant)
   is never dispatched in any Map/Wrapper test.

### Low (19)

- **State/race (`PersistentMapWrapper.tsx`):** (a) search vs pan effects store incompatible shapes in the
  shared `lastFetchedParamsRef` dedup key; (b) 429 retry re-arms `searchAbortRef` regardless of the
  originating lane. Both masked by guards today.
- **Lifecycle/perf:** NearbyPlacesMap re-diffs all markers on every highlight (`highlightedPlaceId` in
  `updateMarkers` deps); Map `onLoad` re-runs URL-bounds `fitBounds` on dark-mode toggle (resets
  pan/zoom — gate behind a first-load ref); `getListingStabilityKey` serializes ≤200 listings every
  render via a non-lazy `useRef` arg (use lazy init); `handleMove` prefetch throttle is leading-edge only
  (optional trailing flush).
- **Security/cost:** `src/lib/maps/stadia.ts` embeds a `NEXT_PUBLIC_` API key as a URL query param — dead
  path today; delete the helper or move `escapeHtml` out and document domain-auth. `/api/map-listings`
  (`src/lib/data.ts`) selects `address`/`zip` (server-only, stripped before client) — minor over-fetch.
- **Architecture/duplication:** extract shared coord/number helpers — `sanitize-map-listings.ts` and
  `lib/search/v2-map-data.ts` duplicate `toFiniteNumber`/etc, and `toFiniteNumber` has already diverged;
  cluster/marker/home-pin logic reimplemented across the 3 map components with drifting radius constants;
  `mapAdapter.ts` is bypassed by all production code (only `escapeHtml` used — re-home it); hoist Map.tsx
  magic numbers to named consts; `MAP_RELEVANT_KEYS` is documented-dead (replace with the live viewport
  subset); zoom-control JSX duplicated (extract `<MapZoomControls>`).
- **Correctness:** the two `toFiniteNumber`s handle Decimal/BigInt differently (latent). Keep this open
  even if the fix lands with the shared coord/number helper extraction above.
- **Testing:** the named "separate abort controllers (P1-#4)" test never drives a pan abort; five
  assertions in `v2-map-stale-nearmatches.test.tsx` grep source *text* via `readFileSync` (replace with
  behavioral assertions).
- **needs-context (verify impact before investing):** `toPublicCoordinates` has no dedicated unit test
  (precision is pinned transitively — low value).

### Nit (4)

- `style-sanitize.ts` addLayer prototype monkeypatch is a permanent global mutation (document or apply
  once at module init).
- `getPinDisplayMode` comment says "12-14" but code is "10-14" (`Map.tsx`) — fix the comment.
- NearbyPlacesMap fully remounts the map when `listingLat/Lng` change (not reachable in current flows;
  switch to `flyTo` if ever wired).
- `/api/map-listings` snapshot ok-path returns the stored set bypassing bounds re-check (privacy intact;
  add a comment + optional `MAX_MAP_MARKERS` cap assertion).

## Suggested batching (one PR each)

1. **perf** — medium #1 (hover), low (`getListingStabilityKey`, NearbyPlacesMap highlight, onLoad
   fitBounds, optional trailing prefetch flush).
2. **state/correctness leftovers** — low `PersistentMapWrapper` dedup/retry races and the remaining
   `toFiniteNumber` Decimal/BigInt divergence.
3. **dedup/refactor** — shared sanitize helpers, cluster-layer factory, `mapAdapter`/`MAP_RELEVANT_KEYS`/
   magic-numbers cleanup, zoom-controls extraction.
4. **god-component split** — medium #2 (extract popup geometry + hooks). Largest; keep isolated.
5. **test hardening** — mediums #3–#6 + low test items (abort race, source-text greps).
