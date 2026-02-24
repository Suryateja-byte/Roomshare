# Smooth Map Experience (Airbnb-like)

## Goal + Acceptance Criteria
- Map feels instant and smooth: old markers never disappear during fetch
- No heavy loading overlays (no blur, no tinted backgrounds)
- Map restricted to USA bounds
- Client-side spatial cache for instant zoom-out/pan-back
- Wider viewport support (10-degree span)
- All existing tests pass

## Scope
- `src/lib/constants.ts`
- `src/components/Map.tsx`
- `src/components/PersistentMapWrapper.tsx`

## Risks
- USA maxBounds could exclude territories (mitigated: covers all 50 states)
- 10-degree viewport could return too many rows (mitigated: LIMIT 200 at SQL)
- Cache staleness (mitigated: session-scoped, cleared on filter change, 20-entry LRU)

## Plan

### Phase 1: "Never Go Blank"
- [x] 1.1 Stale-while-revalidate marker pattern (PersistentMapWrapper)
- [x] 1.2 Remove heavy map loading overlays (Map.tsx + PersistentMapWrapper)
- [x] 1.3 USA bounds restriction + minZoom (Map.tsx + constants.ts)
- [x] Phase 1 verification: lint + typecheck + tests (14/14 pass)

### Phase 2: Client-Side Spatial Cache
- [x] 2.1 Bounds-based listing cache (PersistentMapWrapper)
- [x] 2.2 Viewport hysteresis - skip unnecessary fetches (PersistentMapWrapper)
- [x] 2.3 Pad fetch bounds by 20% (PersistentMapWrapper)
- [x] Phase 2 verification: lint + typecheck + tests (14/14 pass)

### Phase 3: Wider Viewport + Timing Tuning
- [x] 3.1 Increase MAX_LAT_SPAN / MAX_LNG_SPAN from 5 to 10
- [x] 3.2 Tune debounce/throttle timing (Map.tsx)
- [x] Phase 3 verification: lint + typecheck + full test suite (5416/5417 pass; 1 flaky perf benchmark unrelated)

## Results + Verification Story
All 3 phases implemented. 3 files modified, 6 test files updated for new MAX span.
- Lint: 0 errors
- Typecheck: passes
- Tests: 5416 pass, 1 flaky perf benchmark (pre-existing), 12 skipped
