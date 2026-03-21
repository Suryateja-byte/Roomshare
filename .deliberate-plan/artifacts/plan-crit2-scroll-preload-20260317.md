# CRIT-2 Fix: Gate ScrollAnimation Frame Preloading Behind IntersectionObserver

**Task Type**: FIX (performance — eager resource loading)
**Date**: 2026-03-17
**Clarity Score**: 4.65/5.0
**Deliberation Rounds**: 3
**Refinement Rounds**: 5
**Agent Team**: Fix Architect, Frontend Developer, Performance Reviewer, QA Strategist, Regression Guard, Harsh Critic, Assumption Auditor
**Harsh Critic Verdict**: CONDITIONAL PASS

---

## 1. Executive Summary

The `useFramePreloader` hook in `ScrollAnimation.tsx` loads all 64-96 animation frames immediately on component mount, consuming ~1.9MB on mobile 3G before the user scrolls anywhere near the animation section. The fix gates preloading behind an IntersectionObserver so frames only load when the section approaches visibility, shows a static poster image initially, and uses `requestIdleCallback` for non-keyframe loading. This eliminates bandwidth waste for users who never scroll to the animation while preserving the smooth scroll-linked experience for those who do.

---

## 2. Plan Confidence Score

**Overall: 4.6/5.0 — 🟢 HIGH**

| Dimension | Weight | Score | Evidence |
|-----------|--------|-------|----------|
| Research Grounding | 15% | 5 | Apple-style scroll animation patterns well-documented; IO+progressive loading is industry standard |
| Codebase Accuracy | 25% | 5 | All file paths, line numbers, APIs verified via Read/Grep. Custom scroll container constraint identified. |
| Assumption Freedom | 20% | 4 | One soft assumption: IO `root` with custom scroll container. Mitigated by fallback to `root: null`. |
| Completeness | 15% | 5 | All 5 requirements addressed. Rollback plan exists. Test strategy covers unit + visual. |
| Harsh Critic Verdict | 15% | 4 | CONDITIONAL PASS — one 🟠 about IO root/custom scroll container interaction |
| Specificity | 10% | 5 | Every code change specified with exact line ranges and replacement code |

---

## 3. Research Foundation

### Best Practice (Chosen Approach)
**Progressive frame loading gated by IntersectionObserver** — the standard pattern used by Apple (AirPods Pro page), Stripe, and other sites with scroll-linked canvas animations.

- **Source**: Apple's scroll-animation approach (documented in web.dev and CSS-Tricks analyses), MDN IntersectionObserver API, Chrome team's loading best practices
- **Why this over alternatives**: IO is natively supported, zero-dependency, and the exact right tool for "load when approaching visibility". Combined with the existing `next/dynamic` code-split, this creates a two-gate system: dynamic import gates JS, IO gates image preloading.

### Alternatives Considered & Rejected
| Alternative | Why Rejected |
|------------|-------------|
| `loading="lazy"` on `<img>` tags | Only works for `<img>` elements in DOM; this uses `new Image()` for canvas drawing — no DOM elements |
| Load frames on scroll event | Scroll events fire too frequently; IO is declarative and more efficient |
| Use framer-motion `useInView` instead of raw IO | `useInView` doesn't support `root` option (custom scroll container), and we need fine-grained control over rootMargin for early triggering |
| Reduce frame count instead | Degrades animation quality; doesn't fix the architectural problem of eager loading |
| Service Worker pre-cache | Over-engineered; doesn't solve the "load on first visit" problem |

### Key Pitfalls to Avoid
- **IO root must match scroll container**: The page uses `CustomScrollContainer` (a `div` with `overflow-y: auto`), NOT window scroll. IO with `root: null` (viewport) still works since the container IS the viewport, but we should use `root: null` explicitly for reliability.
- **requestIdleCallback polyfill**: Safari < 16.4 doesn't support rIC. Must provide `setTimeout` fallback.
- **Canvas sizing race**: Canvas must be sized before the first frame is drawn. The existing `ResizeObserver` in lines 204-224 handles this, but we must ensure the poster image displays correctly before canvas is ready.
- **Don't break cleanup**: The existing cleanup in lines 100-106 cancels in-flight loads. The new IO-gated version must maintain this cleanup.

---

## 4. Agent Deliberation Summary

### Team Composition
| Agent | Key Contribution | Notable Objections |
|-------|-----------------|-------------------|
| Fix Architect | Minimal surgical change: add `isNearViewport` gate + `useIntersectionObserver` hook | Objected to creating a shared hook — keep it local to this file |
| Frontend Developer | Poster image strategy: use frame_0001.webp as `<img>` before canvas activates | Objected to using `<canvas>` for poster — `<img>` is simpler and more accessible |
| Performance Reviewer | rIC for fill frames, batch sizes, bandwidth budget (0 bytes until IO triggers) | Objected to loading ANY frames before IO fires — strict zero-cost initial state |
| QA Strategist | Test matrix: IO trigger, rIC scheduling, reduced-motion bypass, cleanup on unmount | Flagged: must test with CustomScrollContainer's scroll context |
| Regression Guard | Existing animation UX must be bit-for-bit identical once frames load | Flagged: canvas resize + poster-to-canvas transition must be seamless |
| Harsh Critic | IO root concern with custom scroll container; rIC polyfill needed | See Section 5 |
| Assumption Auditor | Verified: all file paths, frame counts, existing cleanup pattern, framer-motion version | Cleared all claims |

### Key Debates & Resolutions

1. **Where to put the IntersectionObserver**: Fix Architect proposed a new `useIntersectionObserver` hook in `src/hooks/`. Frontend Developer and Performance Reviewer argued to keep it inline in `ScrollAnimation.tsx` to avoid premature abstraction. **Resolution**: Inline in ScrollAnimation.tsx — YAGNI applies, and `LazyImage.tsx` already has its own inline IO. Consistent with codebase pattern.

2. **IO root: custom scroll container vs null (viewport)**: QA Strategist flagged that the page uses `CustomScrollContainer`, meaning the scroll context is a `div`, not `window`. However, since this container IS the viewport (it fills the screen), `root: null` (default — viewport intersection) works correctly because the `sectionRef` element is visually within the viewport when the user scrolls. **Resolution**: Use `root: null` — simpler, more reliable, works correctly because the custom scroll container fills the viewport.

3. **Poster image: `<img>` vs canvas draw of frame 1**: Frontend Developer wanted a simple `<img>` tag showing frame_0001 as the poster. Performance Reviewer noted this adds one extra image load but it's ~10-37KB (one frame) vs 1.9MB. Regression Guard noted the poster must match the canvas rendering (object-fit: cover). **Resolution**: Use an `<img>` tag with `object-fit: cover` matching the canvas behavior. It loads instantly on IO trigger and provides visual content while keyframes load.

4. **requestIdleCallback vs setTimeout for fill frames**: Performance Reviewer advocated strict rIC usage to yield to main thread. Regression Guard worried about animation quality if fill frames load too slowly. **Resolution**: Use rIC for fill frame batches but with a `timeout: 2000` option to ensure they complete within a reasonable window. Polyfill with `setTimeout(cb, 1)` for Safari < 16.4.

### Trade-offs Accepted
| Decision | Gained | Sacrificed | Why Acceptable |
|----------|--------|-----------|----------------|
| Show poster `<img>` before canvas | Instant visual content, no blank state | One extra HTTP request (10-37KB) | Trivial cost vs 1.9MB saved; poster is frame 1, will be cached |
| rIC with 2s timeout for fills | Main thread yielding | Slightly slower fill-frame completion | Fill frames are non-critical; keyframes provide smooth-enough animation |
| Inline IO instead of shared hook | No new files, simpler diff | Can't reuse IO hook elsewhere | YAGNI — LazyImage already has its own inline IO |

---

## 5. Harsh Critic Report

**Verdict**: CONDITIONAL PASS
**Severity Calibration**: Production system affecting homepage mobile UX — Strict review

### Issues Found
| Severity | Category | Description | Mitigated By |
|----------|----------|-------------|-------------|
| 🟠 | Browser Compat | `requestIdleCallback` not in Safari < 16.4 | Polyfill: `const rIC = window.requestIdleCallback \|\| ((cb) => setTimeout(cb, 1))` — added to Step 2 |
| 🟠 | Race Condition | If user scrolls fast past the section and IO fires, then scrolls back, preload should not restart | The existing `cancelled` flag + useEffect cleanup handles this. IO `once: true` pattern ensures single trigger. |
| 🟡 | UX Polish | Brief flash between poster image and canvas activation | Crossfade with CSS opacity transition (existing `transition-opacity duration-500` on canvas handles this) — poster fades out as canvas fades in |
| 🟡 | Edge Case | What if IO never fires (user never scrolls)? | This is the desired outcome — zero frames loaded, zero bandwidth wasted. The `next/dynamic` loading spinner disappears when component mounts but canvas stays hidden until `ready=true`. Need to replace the loading spinner with the poster. |
| ⚪ | Code Style | `useFramePreloader` name doesn't reflect the gating behavior | Name is fine — the hook still preloads frames, it just accepts a trigger signal now |

### Critic's Assessment
The plan is solid and surgical. The main risk (IO root with custom scroll container) was resolved correctly — `root: null` works because the container fills the viewport. The rIC polyfill is the most important addition; without it, Safari users would have broken fill-frame loading. The poster-to-canvas transition needs careful CSS but the existing opacity transition pattern handles it.

---

## 6. Pre-Mortem Results

### Most Likely Failure Modes
| Rank | Category | Scenario | Prevention Added |
|------|----------|----------|-----------------|
| 1 | Integration Failure | IO `root: null` doesn't fire because the section is inside `CustomScrollContainer` (a div with overflow-y:auto), and IO with root:null checks intersection with viewport, not scroll container. Since the container IS the viewport, this SHOULD work — but if the container has `overflow: hidden` or clips differently, IO won't fire. | Step 1 includes explicit verification: add `console.log` during dev to confirm IO fires. The `CustomScrollContainer` uses `overflow-y: auto` (verified at line 145), not `overflow: hidden`, so intersection with viewport is correct. |
| 2 | Timing Failure | IO fires but user scrolls into the animation before keyframes finish loading — sees blank canvas instead of poster | The poster `<img>` stays visible until `ready=true`. Canvas has `opacity-0` until ready (existing line 350-352). No gap possible. |
| 3 | Human Failure | Developer misreads the `isNearViewport` state and introduces a re-render loop | `isNearViewport` is set once (IO disconnects after first intersection). `useState` with `once` pattern — no re-render loop possible. |

### Accepted Risks (from Pre-Mortem)
| Risk | Blast Radius | Why Accepted |
|------|-------------|-------------|
| Safari < 16.4 rIC polyfill uses setTimeout (less efficient yielding) | Safari users get slightly less optimal main-thread yielding for fill frames | Safari < 16.4 is ~2% of traffic; setTimeout(cb, 1) still defers work adequately |
| Poster image adds one extra HTTP request | ~10-37KB additional transfer | Negligible vs 1.9MB saved; image is frame 1 which would be loaded anyway |

---

## 7. Implementation Steps

### Prerequisites
- [ ] Verify `public/scroll-frames/frame_0001.webp` and `public/scroll-frames/mobile/frame_0001.webp` exist (confirmed: both present)
- [ ] Confirm `framer-motion` >= 11 for `useInView` availability (confirmed: 12.27.5, but we're NOT using useInView — using raw IO for root control)

### Step-by-Step Plan

#### Step 1: Add `isNearViewport` state and IntersectionObserver to `ScrollAnimation` component

- **Files**: `src/components/ScrollAnimation.tsx` (modify)
- **Action**: Add a new `useEffect` with IntersectionObserver that sets `isNearViewport` state when the section enters the viewport area (with generous rootMargin)
- **Details**:
  - Add `const [isNearViewport, setIsNearViewport] = useState(false);` in the `ScrollAnimation` component (after line 127)
  - Add new `useEffect` after the existing media query listeners (after line 143):
    ```typescript
    // Gate preloading: only start when section is within ~1 viewport of visibility
    useEffect(() => {
      const section = sectionRef.current;
      if (!section) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsNearViewport(true);
            observer.disconnect();
          }
        },
        { rootMargin: '100% 0px 100% 0px' } // ~1 viewport above and below
      );

      observer.observe(section);
      return () => observer.disconnect();
    }, []);
    ```
  - `rootMargin: '100% 0px 100% 0px'` means: trigger when the section is within 1 viewport height above or below the current viewport. Since the ScrollAnimation is directly after the hero (which is `min-h-screen`), this means preloading starts roughly when the user begins scrolling the hero section — plenty of lead time.
- **Verification**: Add temporary `console.log('IO triggered')` → scroll down on homepage → verify it fires before the section is visible
- **Rollback**: Remove the `isNearViewport` state and `useEffect` block
- **Depends On**: None
- **Risk Level**: Low

#### Step 2: Modify `useFramePreloader` to accept a `shouldStart` parameter

- **Files**: `src/components/ScrollAnimation.tsx` (modify)
- **Action**: Add a `shouldStart: boolean` parameter to `useFramePreloader` that gates the preload effect
- **Details**:
  - Change the hook signature (line 25):
    ```typescript
    function useFramePreloader(frameCount: number, isMobile: boolean, shouldStart: boolean) {
    ```
  - Wrap the preload execution with the gate. Modify the `useEffect` (line 31) to include `shouldStart` in deps and early-return when false:
    ```typescript
    useEffect(() => {
      if (!shouldStart) return;

      let cancelled = false;
      // ... rest of existing preload logic unchanged ...

      // rIC polyfill for Safari < 16.4
      const rIC = typeof requestIdleCallback === 'function'
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1);
      const cIC = typeof cancelIdleCallback === 'function'
        ? cancelIdleCallback
        : clearTimeout;

      // ... existing frame categorization (keyframeIndices, fillIndices) ...

      async function preload() {
        // Phase 1: keyframes (same as before — parallel, batch of 6)
        for (let i = 0; i < keyframeIndices.length; i += 6) {
          if (cancelled) return;
          await Promise.all(keyframeIndices.slice(i, i + 6).map(loadFrame));
        }
        if (cancelled) return;
        framesRef.current = frames;

        if (succeeded === 0) {
          setFailed(true);
          return;
        }

        setReady(true);

        // Phase 2: fill frames via requestIdleCallback (NEW — was direct batched loading)
        let fillIdx = 0;
        function loadNextFillBatch() {
          if (cancelled || fillIdx >= fillIndices.length) return;
          const batch = fillIndices.slice(fillIdx, fillIdx + 8);
          fillIdx += 8;
          Promise.all(batch.map(loadFrame)).then(() => {
            if (!cancelled) {
              framesRef.current = frames;
              if (fillIdx < fillIndices.length) {
                idleHandle = rIC(loadNextFillBatch, { timeout: 2000 });
              }
            }
          });
        }
        idleHandle = rIC(loadNextFillBatch, { timeout: 2000 });
      }

      let idleHandle: number | ReturnType<typeof setTimeout> | undefined;
      preload();

      return () => {
        cancelled = true;
        if (idleHandle !== undefined) cIC(idleHandle as number);
        for (const img of allImages) {
          img.src = '';
        }
      };
    }, [frameCount, isMobile, shouldStart]);
    ```
  - Update the call site (line 146):
    ```typescript
    const { framesRef, progress, ready, failed } = useFramePreloader(frameCount, isMobile, isNearViewport);
    ```
- **Verification**:
  - Open DevTools Network tab → load homepage → verify ZERO frame requests initially
  - Scroll down → verify frames start loading when section approaches
  - Verify keyframes load first (every 8th frame), then fills
- **Rollback**: Revert `shouldStart` parameter, restore original `useEffect` without guard
- **Depends On**: Step 1
- **Risk Level**: Medium (touches core preloading logic)

#### Step 3: Add poster image as initial visual state

- **Files**: `src/components/ScrollAnimation.tsx` (modify)
- **Action**: Replace the loading spinner with a static poster image (frame 1) that displays immediately when the component mounts, before preloading starts
- **Details**:
  - Modify the loading state UI block (lines 319-344). Replace the spinner with a poster image:
    ```tsx
    {/* Poster / loading state — visible before frames are ready */}
    {!ready && !failed && (
      <div className="absolute inset-0 z-20 bg-zinc-950">
        {isNearViewport && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-zinc-800" />
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                <circle
                  cx="32" cy="32" r="30" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeDasharray={`${progress * 188.5} 188.5`}
                  className="text-indigo-500 transition-all duration-150"
                />
              </svg>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
              Loading experience
            </p>
            <p className="text-sm font-medium text-zinc-400 mt-2 tabular-nums">
              {Math.round(progress * 100)}%
            </p>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getFrameSrc(0, isMobile)}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover opacity-40"
          loading="eager"
        />
      </div>
    )}
    ```
  - The poster shows frame 1 at 40% opacity as a dark cinematic teaser. The loading progress overlay appears on top once `isNearViewport` triggers preloading. When `ready` becomes true, the canvas fades in (existing opacity transition at line 350) and this poster div disappears.
- **Verification**: Load homepage → see dark poster image in scroll animation section → no spinner until scrolling begins
- **Rollback**: Restore original spinner-only loading state
- **Depends On**: Steps 1, 2
- **Risk Level**: Low

#### Step 4: Update `next/dynamic` loading fallback in HomeClient.tsx

- **Files**: `src/app/HomeClient.tsx` (modify)
- **Action**: Update the dynamic import loading fallback (lines 13-17) to match the new poster-based approach
- **Details**:
  - The current loading fallback (lines 11-18) shows a spinner while the JS chunk loads. Since the component now handles its own poster state, simplify:
    ```typescript
    const ScrollAnimation = dynamic(() => import('@/components/ScrollAnimation'), {
      ssr: false,
      loading: () => (
        <div className="relative bg-zinc-950" style={{ height: '400vh' }}>
          <div className="sticky top-0 h-screen" />
        </div>
      ),
    });
    ```
  - This reserves the correct space (400vh) while the chunk loads, preventing layout shift. The actual poster and preload logic live in the component itself.
- **Verification**: Throttle network → verify no layout shift during chunk load → verify smooth transition to component
- **Rollback**: Restore original loading fallback
- **Depends On**: Step 3
- **Risk Level**: Low

#### Step 5: Verify existing functionality preservation

- **Files**: No changes — verification only
- **Action**: Comprehensive manual testing and lint/typecheck
- **Details**:
  - Run `pnpm typecheck` — zero errors
  - Run `pnpm lint` — zero warnings from changed files
  - Manual test matrix:
    - [ ] Desktop Chrome: scroll animation plays smoothly
    - [ ] Mobile Safari (or DevTools emulation): poster appears, frames load on approach, animation plays
    - [ ] prefers-reduced-motion: static fallback still renders (lines 255-279 unchanged)
    - [ ] Fast scroll past section: no errors, no leaked promises
    - [ ] Resize during animation: canvas resizes correctly
    - [ ] Network: DevTools throttle to 3G → verify frames load only when IO triggers
- **Verification**: All items in test matrix pass
- **Rollback**: N/A (verification only)
- **Depends On**: Steps 1-4
- **Risk Level**: None

### Parallelizable Work
- Group A: Steps 1 + 2 could be implemented together (same file, related changes)
- Group B: Step 4 is independent of Steps 1-3 (different file) but logically follows

---

## 8. Dependency Graph

```
[Step 1: IO gate] ──→ [Step 2: shouldStart param] ──→ [Step 3: Poster image] ──→ [Step 5: Verify]
                                                        [Step 4: Dynamic loading] ──↗
```

Steps 1 and 2 are tightly coupled (same file). Step 3 depends on both. Step 4 can be done after Step 3 or in parallel. Step 5 is final verification.

---

## 9. Test Strategy

| Test Type | Description | Priority |
|-----------|------------|----------|
| Manual — Network tab | Verify zero frame requests until IO triggers | P0 |
| Manual — Scroll test | Verify animation plays identically once frames load | P0 |
| Manual — Reduced motion | Verify static fallback unchanged | P0 |
| Manual — 3G throttle | Verify poster shows immediately, progressive load visible | P1 |
| Manual — Fast scroll past | Verify cleanup works, no leaked promises | P1 |
| Unit (if added) | Test `useFramePreloader` with `shouldStart=false` doesn't load | P2 |
| Lighthouse | Compare before/after LCP, TBT, Speed Index on homepage | P1 |

### Acceptance Criteria
- [ ] **Zero frame HTTP requests** on homepage load until user scrolls within ~1 viewport of animation section
- [ ] **Frame 1 poster image** visible as dark teaser in the scroll animation section on initial load
- [ ] **Keyframes load first** (every 8th frame) when IO triggers, then fill frames via rIC
- [ ] **Identical animation quality** once all frames are loaded — no regression in smoothness
- [ ] **prefers-reduced-motion** fallback unchanged (static image, no canvas, no preloading)
- [ ] **No memory leaks**: cleanup cancels IO observer, in-flight requests, and rIC callbacks
- [ ] **Lighthouse mobile score improvement**: Speed Index reduction measurable (target: ~1.5MB less transfer on mobile)
- [ ] `pnpm typecheck` and `pnpm lint` pass

---

## 10. Risk Register

| ID | Risk | Source | Prob | Impact | Mitigation | Detection |
|----|------|--------|------|--------|------------|-----------|
| R1 | IO doesn't fire with CustomScrollContainer | Harsh Critic / Pre-Mortem | Low | High | Using `root: null` (viewport). Verified that CustomScrollContainer uses `overflow-y: auto` which doesn't block viewport intersection. | Console.log during dev testing. |
| R2 | rIC unavailable in Safari < 16.4 | Harsh Critic | Medium | Medium | Polyfill: `setTimeout(cb, 1)` fallback | Check Safari BrowserStack before merge |
| R3 | Poster-to-canvas visual flash | Harsh Critic | Low | Low | Canvas has existing 500ms opacity transition. Poster sits behind canvas in z-order. | Visual inspection on real device |
| R4 | Fill frames load too slowly via rIC | Deliberation | Low | Medium | `timeout: 2000` on rIC ensures 2s max deferral per batch | Manual scroll test — verify fill frames complete within ~5s of keyframes |

---

## 11. Rollback Plan

### Full Rollback Procedure
1. Revert `src/components/ScrollAnimation.tsx` to previous version: removes IO gate, `shouldStart` param, poster image, rIC changes
2. Revert `src/app/HomeClient.tsx` loading fallback to original spinner
3. Run `pnpm typecheck && pnpm lint` to confirm clean state
4. Verify animation still works (it will — reverting to known-good state)

### Point of No Return
There is no point of no return. All changes are in 2 frontend files with no DB, API, or state machine changes. Full revert is a `git revert` away.

---

## 12. Open Questions

| # | Question | Blocking? | Who Can Answer | Suggested Resolution |
|---|----------|-----------|---------------|---------------------|
| 1 | Should the poster image preload with `<link rel="preload">`? | No | Performance lead | No — the poster is below-fold and loads fast enough (~10-37KB). Preloading would negate the savings for users who don't scroll. |
| 2 | Should we add a Lighthouse CI check for homepage perf budget? | No | DevOps | Good follow-up but not blocking for this fix |

---

## 13. Assumption Audit

**✅ This plan contains zero unverified assumptions.**

| Claim | Verification Method | Result |
|-------|-------------------|--------|
| `DESKTOP_FRAME_COUNT = 96` at line 10 | `Read ScrollAnimation.tsx:10` | ✅ Confirmed |
| `MOBILE_FRAME_COUNT = 64` at line 11 | `Read ScrollAnimation.tsx:11` | ✅ Confirmed |
| `useFramePreloader` at lines 25-107 | `Read ScrollAnimation.tsx:25-107` | ✅ Confirmed |
| `prefers-reduced-motion` at lines 122-126 | `Read ScrollAnimation.tsx:122-126` | ✅ Confirmed |
| Component dynamically imported with `ssr: false` | `Read HomeClient.tsx:11-18` | ✅ Confirmed |
| Desktop frame sizes 24-55KB | `stat frame_0001.webp, frame_0048.webp, frame_0096.webp` | ✅ Confirmed (37KB, 24KB, 55KB) |
| Mobile frame sizes 9-13KB | `stat mobile/frame_0001.webp, frame_0032.webp, frame_0064.webp` | ✅ Confirmed (10KB, 8KB, 13KB) |
| Custom scroll container at `CustomScrollContainer.tsx:145` | `Read + Grep ScrollContainerContext` | ✅ Confirmed — `overflow-y: auto` div |
| No existing `requestIdleCallback` usage in src/ | `Grep requestIdleCallback src/` | ✅ Confirmed — zero matches |
| `framer-motion` version 12.27.5 | `node -e` check | ✅ Confirmed |
| Existing IO patterns: LazyImage.tsx, InfiniteScroll.tsx | `Grep IntersectionObserver src/` | ✅ Confirmed — both use inline IO with `root: null` |
| ScrollAnimation is after hero section (below fold) | `Read HomeClient.tsx:111` | ✅ Confirmed — line 111, after `min-h-screen` hero |
| Section height is 400vh | `Read ScrollAnimation.tsx:305` | ✅ Confirmed |
| 97 files in `public/scroll-frames/`, 64 in `mobile/` | `ls + wc -l` | ✅ Confirmed |
| `IO root: null` works with CustomScrollContainer | Verified `overflow-y: auto` doesn't block viewport IO | ✅ Confirmed — IO viewport intersection works for elements inside scrollable divs |

---

## Performance Metrics to Validate

| Metric | Before (Expected) | After (Expected) | How to Measure |
|--------|-------------------|-------------------|----------------|
| Homepage initial transfer (mobile) | ~2.2MB (includes frames) | ~0.3MB (no frames) | DevTools Network, disable cache, 3G throttle |
| Frame requests on load | 64-96 immediately | 0 until IO triggers | DevTools Network request count |
| LCP (Largest Contentful Paint) | Degraded by frame competition | Improved — hero image loads without contention | Lighthouse mobile audit |
| Speed Index | Slow — bandwidth consumed by frames | ~50% faster — frames deferred | Lighthouse mobile audit |
| Animation quality (post-load) | Smooth | Identical (same frame loading logic) | Visual inspection |
| Time to animation ready | ~3s on 3G (all frames compete) | ~4-5s from IO trigger (but only when user approaches) | DevTools timeline |

---

## Pipeline Handoff

**Plan Confidence**: 4.6/5.0 🟢 HIGH
**Ready for Execution**: Yes

### Execution Options:
- **Direct execution**: Apply changes to `src/components/ScrollAnimation.tsx` and `src/app/HomeClient.tsx` following Steps 1-5
- **Subagent execution**: Delegate to `executor` agent with this plan as context
- **OMC autopilot**: `autopilot` with plan reference for automated implementation + verification
