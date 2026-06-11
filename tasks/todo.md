# H4 unit-projection version-ordering fix — (2026-06-11)

## Problem

`rebuildUnitPublicProjection` guarded its upsert with
`WHERE stored.source_version <= MAX(isp.source_version)`. Inventory source_versions are
independent per-inventory counters (each derives from its own Listing.version), so the
cross-inventory MAX is not a valid ordering token: deleting the highest-versioned inventory
makes every later rebuild compute a lower MAX, the guard rejects forever, and the unit row is
frozen with the deleted room's data (count, from_price, representative all stale).

## Fix (`src/lib/projections/unit-projection.ts`)

- Serialize rebuilds per unit with `pg_advisory_xact_lock(hashtext('p2:unitproj:' || unitId))`
  taken BEFORE the aggregate read (callers lock inventory rows first → acquisition order is
  rows → unit lock everywhere, no deadlock; lock releases at commit). Each rebuild then
  aggregates the latest committed state, so the upsert applies unconditionally.
- Dropped the `WHERE source_version <=` guard and `GREATEST()` from both upsert variants;
  stored `source_version` is now informational (MAX of current aggregate, may regress).
- Deliberately did NOT use `acquireXactLock()` — its `SET LOCAL lock_timeout='5s'` would leak
  into the caller's whole transaction (inline canonical-sync path).
- Tombstone's own per-inventory guard untouched (same-counter comparison — valid).

## Invariants

1. unit_public_projection is a pure aggregate of current visible ISP rows; per-unit advisory
   lock makes read-aggregate-write critical sections strictly sequential.
2. Cross-inventory source_versions are never compared for ordering decisions.
3. unit source_version may regress on inventory deletion (metadata only); the search read
   path computes `GREATEST(upp.source_version, MAX(isp.source_version))` per query — unaffected.

## Results + verification story

- 3 new regression tests (unit-projection.test.ts): exact H4 scenario (delete max-version
  room → unit row regroups to remaining room), not-stuck-in-the-past (subsequent lower-version
  updates apply), and end-to-end handleTombstone regroup. Renamed the GREATEST test to match
  the new semantics.
- `pnpm lint` 0 errors (22 pre-existing warnings, none in touched files); `pnpm typecheck` clean.
- Projections + outbox + phase02 integration suites (read-path isolation, tombstone fast lane):
  165/165 green. Full `pnpm test`: 500/500 suites, 7807 passed, 0 failed.
- No schema change; rollback = revert commit.

---

# H3 ghost-update race fix — plan (2026-06-11)

Full plan: /home/surya/.claude/plans/fix-this-h3-ghost-dynamic-snowflake.md

## Goal + acceptance criteria

- A moderator PAUSE/BAN (PAUSED/SUPPRESSED/ARCHIVED) can never be overwritten back to a
  publishable state by a background recompute (outbox INVENTORY_UPSERTED / EMBED_NEEDED
  handlers, canonical sync).
- Background handlers never recreate the `inventory_search_projection` row for a hidden inventory.
- Stale writes are logged no-ops; equal-version idempotent replays still apply; legitimate
  unpause → re-publish still works.
- Zero regressions: full lib/projections + lib/outbox + lib/listings suites green, plus
  daily-maintenance + listings-host-managed-patch (in-flight retention work untouched).

## Checklist

- [x] Site 1: `src/lib/projections/inventory-projection.ts` — FOR UPDATE read, hidden-status
      early skip (isHiddenStatus), CAS-guarded publish_status UPDATEs, `skipReason` in result
- [x] Tests A1–A8 (inventory-projection.test.ts) + B9 (handlers.test.ts) → suites green
- [x] Commit 1: 520f95ac
- [x] Site 2: `src/lib/listings/canonical-inventory.ts` — `EXCLUDED.source_version >= current`
      guard on ON CONFLICT DO UPDATE, stale-skip branch + warn log + result type
- [x] Tests C10–C11 (canonical-inventory.test.ts, append-only) + D12–D13 (new guard test file)
- [x] Commit 2: 70e2ff89 (also carries the in-tree pending H2 emergency-stop gating for this
      module — entangled in the same file, noted in the commit message)
- [x] Site 3: `src/lib/projections/semantic.ts` — status-guarded publish + semantic-row retraction
- [x] Test E14 (semantic.test.ts)
- [x] Commit 3: 646f49ec
- [x] Verify: lint, typecheck, full affected suites, then full `pnpm test`
- [x] Results + verification story below

## Risks

- State-transition/race logic (auth/state domain): guards must fail CLOSED (stay hidden), never open.
- Working tree has uncommitted homepage + outbox-retention work — edits confined to
  non-overlapping hunks; do not touch drain.ts/handlers.ts/daily-maintenance.

## Results + verification story

All three ghost-write sites are guarded; a hidden inventory (PAUSED/SUPPRESSED/ARCHIVED) can
no longer be flipped back to a publishable state by a background recompute, and the
tombstone-deleted `inventory_search_projection` row is never recreated by a stale event.
Guards fail closed (worst case: listing stays hidden, surfaced via
`cfm.canonical.stale_sync_skipped_count` warn log). No schema changes; rollback = revert commits.

Verification (all on 2026-06-11):
- `pnpm lint` — 0 errors; 22 pre-existing warnings, none in touched files.
- `pnpm typecheck` — clean.
- Targeted suites: inventory-projection (14), handlers (34), lib/listings (33, incl. new
  canonical-inventory-guard.test.ts on real PGlite SQL), semantic (14) — all green.
- Adjacency: daily-maintenance + listings-host-managed-patch suites green (no interaction
  with in-flight retention work).
- Full `pnpm test`: 500/500 suites, 7804 passed, 0 failed (8 pre-existing skips).

Found-and-fixed along the way (commit 3a7b96b5): phase08/phase09 schema suites were red
*before* this task — the in-flight retention work added the phase08 migration to the phase02
fixture list, so the phase08+ fixture chains applied it twice (non-idempotent ADD CONSTRAINT).
The phase08 fixture now skips application when `fanout_status` already exists.

---

# Homepage HIGH-issue fixes — plan (2026-06-11)

(previous tasks: full-site UI review → superseded by homepage deep review, see tasks/ui-review-homepage-2026-06-10.md; map restyle completed cc203aff..e3d5fdc9)

## Context

Homepage UI review (tasks/ui-review-homepage-2026-06-10.md) found 7 HIGH issues. This plan fixes
all of them with explicit no-regression guardrails. Demo ~Jun 16 (code freeze mindset): every change
is small, isolated, and verified visually + by tests before commit.

Exploration verified two corrections to the original findings:
- **H6**: `src/app/api/messages/route.ts` has NO 404 code path (only 401/403/400/429/500). The observed
  404 is most likely the dev server's degraded state (same hang that 404'd `/` for fresh sessions).
  → diagnose first, then a minimal hardening fix.
- **H7**: `element.scrollIntoView()` correctly scrolls the nearest scrollable ancestor (the custom
  container) — only the skip link's *native anchor navigation* is broken. Fix is small and contained.

## Goal + acceptance criteria

- All 7 HIGH issues fixed; zero visual/behavioral regression on `/` and `/search` at 320/375/768/1024/1440.
- Keyboard focus visibly indicated on every hero search input (WCAG 2.4.7).
- Hero LCP image served optimized (AVIF/WebP via next/image, priority) — no layout shift, identical art direction.
- Featured grid readable at 768–1023px (no one-word-per-line titles, no "N…/O…" badges).
- Card titles clamp to 1 line at all widths.
- Suspense skeleton mirrors the real featured layout (CLS budget e2e stays green).
- Skip link scrolls the custom container and moves focus to `#main-content`.
- unreadCount polling: real status confirmed; polling stops on terminal auth status.
- New regression tests for: input focus-visible, skip-link focus. Existing suites stay green.

## Scope (files)

- src/components/SearchForm.tsx (focus classes only: ~1015, ~1261, ~1300)
- src/components/LocationSearchInput.tsx (~825; shared with /search header + mobile overlay — verify there)
- src/app/HomeClient.tsx (hero photo div ~94, CTA polaroid ~752 → next/image)
- src/app/layout.tsx (font weights audit only — only if a weight is provably unused)
- src/components/FeaturedListingsClient.tsx (grid spans ~165/225, badges ~251, title link ~283-289)
- src/app/page.tsx (skeleton ~34-71 → extracted component)
- NEW src/components/FeaturedListingsSkeleton.tsx
- src/components/ui/SkipLink.tsx (+ src/components/MainLayout.tsx: tabIndex/outline on `<main>`)
- src/components/NavbarClient.tsx (polling: terminal-status handling only, ~211-249)
- tests: extend tests/e2e/journeys/a11y-audit.anon.spec.ts (skip link), new/extended keyboard focus spec

## Risks

- LocationSearchInput is shared with /search (desktop header + mobile overlay) → focus ring appears there
  too. Mitigation: `focus-visible:` only (keyboard-only; pointer users see zero change) + manual check on /search.
- Hero CSS-bg → next/image: art direction (`bg-[63%_top]` mobile / `center_right` desktop, opacity-45/100,
  `::after` SVG mask) must be preserved exactly. Mitigation: keep wrapper div + classes, Image inside with
  matching object-position; before/after screenshots at all 5 widths.
- Featured grid span changes alter md layout intentionally — lg+ (1024+) must be pixel-identical.
- NavbarClient is global chrome → only additive guard (stop polling on 401/403), nothing else.
- web-vitals-budget.spec.ts (LCP/CLS budgets) is the safety net for H2/H5 — must stay green.

## Fix specs

### 0. Restart dev server (precondition)
Both :3000/:3010 instances hung during review. Restart `pnpm dev`, confirm `curl localhost:3000/` → 200
anonymously. Needed for H6 diagnosis and all verification.

### H6 — unreadCount 404: diagnose, then harden (do first, needs fresh server)
1. Logged-in home, DevTools/network probe: capture REAL status of `/api/messages?view=unreadCount`.
   - If 200 after restart → environmental (hung dev server); record in results, no route change.
   - If genuine 4xx/5xx → root-cause in route (auth/jwt callback path) before touching anything.
2. Hardening (regardless): in src/components/NavbarClient.tsx poll handler, stop polling permanently on
   401/403 (session terminally invalid; currently backs off and keeps hammering). Keep everything else identical.
3. No route changes unless step 1 proves a route bug. Existing tests in
   src/__tests__/api/messages-unread.test.ts pin 200/401/403/500 behavior — keep green.

### H1 — focus-visible rings on search inputs
Canonical pattern exists: ui/input.tsx → `focus-visible:ring-2 focus-visible:ring-primary/30`.
- In SearchForm.tsx (search-what ~1015, search-budget-min ~1261, search-budget-max ~1300) and
  LocationSearchInput.tsx (~825): replace `focus:ring-0` with
  `focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 rounded-md`.
  **ring-inset is required**: field wrappers have `overflow-hidden` — an offset ring would clip.
  Keep `focus:outline-none` and the home variant's `focus:bg-surface-canvas`.
- Do NOT touch the form-level `focus-within` shadows (lines ~951-952) — they stay as-is.
- Test: new e2e (extend tests/e2e/search-a11y-keyboard.anon.spec.ts or home spec): Tab into each input
  on `/`, assert computed box-shadow ≠ 'none'. Manual: /search desktop header + mobile overlay unchanged for mouse.

### H4 — fix line-clamp on card titles (smallest diff first)
FeaturedListingsClient.tsx ~283-289: move clamp from `<h3>` to the Link; Link becomes
`line-clamp-1 py-1 hover:underline` (drop `inline-flex min-h-8 items-center`; `line-clamp-*` sets
-webkit-box display; py-1 keeps ~32px tap target: 24px line + 8px). h3 keeps typography classes, drops `line-clamp-1`.
Verify: long title ("Inner Sunset shared room — UCSF and park nearby") is 1 line + ellipsis at 320/375/768;
baseline alignment with "2 slots" span unchanged at 1440.

### H3 — featured grid at md
FeaturedListingsClient.tsx:
- Card spans (~225): big `md:col-span-12 lg:col-span-6`, small `md:col-span-6 lg:col-span-3`
  (was md:col-span-6/md:col-span-3). lg+ output identical to today; md becomes 2-up smalls + full-width bigs.
- Badges (~251): replace `min-w-0 truncate` with `shrink-0` on tag spans (never truncate badge text).
- Verify at 768: titles ≤2 words/line no more, badges full ("NEW", "OPEN"), meta line shows useful text;
  1024/1440 unchanged vs before-screenshots.

### H5 — skeleton parity (after H3, mirrors its final classes)
- Extract real-layout skeleton to NEW src/components/FeaturedListingsSkeleton.tsx (server-safe, no "use client"):
  - section: same as real section (`py-20 md:py-28` + container) — copy exact classes from
    FeaturedListingsClient section + `aria-busy="true"`.
  - header: badge line, h2 block (~2 lines), pills-row placeholder (5 pill shapes), atlas-link placeholder.
  - grid: `grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-12`; items 0 & 5 big
    (`md:col-span-12 lg:col-span-6`, `h-72 sm:h-80 md:h-[26rem]`), rest small
    (`md:col-span-6 lg:col-span-3`, `h-64 sm:h-72 md:h-[19rem]`), each + pt-4 title/meta placeholder lines.
  - keep existing shimmer classes (`animate-shimmer bg-gradient-to-r …`).
- page.tsx: fallback={<FeaturedListingsSkeleton />}.
- Verify: throttle/reload `/` (dev has no ISR cache) — no visible jump when skeleton resolves;
  e2e CLS budget (tests/e2e/performance/web-vitals-budget.spec.ts) green.

### H2 — hero image → next/image (+ font preload audit)
- HomeClient.tsx ~94: keep `.home-hero-photo` wrapper div + its opacity/`::after` mask classes; replace
  the CSS background classes (the url + cover + 63%_top / md center_right position utilities) with child
  `<Image src="/images/home/hero-living-room.png" alt="" fill priority sizes="100vw"
  className="object-cover object-[63%_top] md:object-[center_right]" />`.
  (Optimizer serves AVIF/WebP at device widths — config already has formats + sharp ^0.34.5.)
  `::after` pseudo-element paints above the child image (tree order) — mask preserved; verify mobile curve.
- HomeClient.tsx ~752 (CTA polaroid): same pattern, `loading="lazy"`, `sizes="(max-width:1024px) 90vw, 33vw"`,
  wrapper gets `relative overflow-hidden` (keep aspect-[4/3] rounded-2xl).
- Optional (skip if any visual doubt): downscale source PNG → keep as-is; next/image already cuts wire size.
- Fonts: diagnose the 2 preloaded-unused woff2 warnings — map the two hashed files to families
  (network tab vs generated @font-face), grep actual usage of weights (font-medium=500, font-semibold=600,
  display 600). ONLY remove a weight from layout.tsx config if provably unused; otherwise leave config alone
  and record findings.
- Verify: hero art-direction identical at all widths (esp. mobile 63%_top crop + bottom mask curve);
  network shows AVIF/WebP ≤ ~250KB instead of 1.7MB PNG; LCP budget e2e green; no CLS on hero.

### H7 — skip link works with custom scroll container
- src/components/ui/SkipLink.tsx → "use client"; add onClick: preventDefault →
  `document.getElementById(targetId)` → `el.scrollIntoView()` (scrolls the custom container — verified) →
  `el.focus({ preventScroll: true })`.
- src/components/MainLayout.tsx `<main id="main-content">`: add `tabIndex={-1}` and `focus:outline-none`
  (globals.css `:focus-visible:not(input)` would otherwise draw a page-wide outline).
- Keep href="#main-content" for no-JS semantics.
- Test: extend tests/e2e/journeys/a11y-audit.anon.spec.ts skip-link test: after Enter,
  `document.activeElement.id === "main-content"`.
- Explicitly OUT of scope (pre-existing, separate task): useScrollHeader window.scrollY,
  Privacy/Terms scroll-spy, InfiniteScroll/LazyImage IntersectionObserver root.

## Execution order (each step: implement → verify → next)

0. Restart dev server → H6 diagnosis (record real status)
1. H4 title clamp (tiny) → visual check
2. H3 grid spans + badges → visual check 768/1024/1440
3. H5 skeleton (mirrors H3 classes) → reload + CLS check
4. H1 focus rings → keyboard pass home + /search spot-check
5. H7 skip link → keyboard test
6. H2 hero next/image + font audit → art-direction screenshots + LCP
7. H6 hardening (NavbarClient terminal-status) if step 0 confirmed env-only; route fix if not
8. New/extended tests (H1 focus e2e, H7 skip-link assertion)

## Verification (Definition of Done)

- pnpm lint && pnpm typecheck && pnpm test — green
- Targeted e2e: journeys/01-discovery-search.spec.ts, performance/web-vitals-budget.spec.ts,
  search-a11y-keyboard.anon.spec.ts (+ extended), journeys/a11y-audit.anon.spec.ts
- Browser screenshot pass at 320/375/768/1024/1440 diffed by eye against
  tasks/.ui-review/homepage-jun10/ "before" shots — only intended changes visible
- /search regression spot-check: desktop header search, mobile overlay, filters (LocationSearchInput shared)
- Console: zero errors on `/` (incl. unreadCount), no font-preload warnings if font fix applied

## Rollback notes

- Pure FE changes, no DB/migrations. Each fix lands as its own commit → `git revert` per-fix.
- Hero image fix is the only riskier-looking diff; it's still a 2-block change, revertible independently.

## Results + verification story (2026-06-11)

All 7 HIGH issues closed. Changes uncommitted, ready for review/commit.

**Environment recovery (step 0)**: dev server was wedged (corrupt webpack cache from a WSL/Docker
restart event ~20 min before; roomshare-db-1 had exited too). Cleared .next, restarted, started DB
container. Separately, my own plan file broke the build: Tailwind v4 scans tasks/*.md, picked up a
class-shaped background-url token from the plan text, and webpack failed on resolving './…' →
fixed in place + lesson added to tasks/lessons.md.

**H6 — unreadCount "404": closed, NO code change.** With DB healthy: 200 {count:0}. With DB down:
403 fail-closed ("Unable to verify account status"). The 404 was the wedged dev server. Decided
against stop-on-403 hardening — a transient DB outage would permanently kill the unread badge until
reload (regression); existing exponential backoff (max 5 min) already handles both cases.

**Fixes landed**:
- H1 src/components/SearchForm.tsx + LocationSearchInput.tsx — focus-visible:ring-2 ring-inset
  ring-primary/40 on all 4 inputs (keyboard-only; pointer UX unchanged).
- H3 FeaturedListingsClient.tsx — big md:col-span-12 lg:col-span-6, small md:col-span-6 lg:col-span-3;
  badges shrink-0 (never truncate). lg+ unchanged.
- H4 FeaturedListingsClient.tsx — clamp moved onto the title Link (line-clamp-1 py-1), h3 declassed.
- H5 NEW src/components/FeaturedListingsSkeleton.tsx mirrors real section; page.tsx fallback swapped.
- H7 SkipLink.tsx — client onClick: scrollIntoView + focus; MainLayout main gets tabIndex={-1} +
  focus-visible:outline-none.
- H2 HomeClient.tsx — hero + CTA polaroid now next/image (fill, priority+sizes=100vw hero / lazy CTA);
  art direction classes preserved (object-[63%_top] md:object-[center_right], opacity, ::after mask).
  Hero served via /_next/image (AVIF/WebP, responsive) instead of raw 1.7MB PNG; preload emitted.
  Font-preload warnings: diagnosed as DEV-ONLY (Next dev appends ?v= to preload hrefs, mismatching
  @font-face URLs). Prod HTML has no font preloads at all → no config change.

**Verification**:
- pnpm typecheck ✓, lint 0 errors (none in touched files) ✓, full unit suite ✓ (exit 0).
- NEW tests/e2e/home-a11y-regression.anon.spec.ts: skip-link (focus lands on #main-content, container
  scrolls back) + focus-visible rings on all 4 inputs — 2/2 pass.
- e2e: journeys/01-discovery-search ✓, web-vitals homepage LCP ✓, search-a11y-keyboard 9/9 ✓
  (incl. the /search LocationSearchInput regression surface).
- Pre-existing, NOT regressions (proved by stash-and-rerun control on clean main): homepage CLS 0.50
  (bit-identical 0.5004180081155565 with and without fixes — deterministic pre-existing shift, likely
  the lazy SearchForm fallback swap; passes CI threshold 0.55) and search-page CLS. Worth a follow-up.
- Visual (screenshots in tasks/.ui-review/homepage-jun10/after-*.jpeg vs before shots): hero pixel-
  faithful at 1440/375; 768 featured grid fixed (720px bigs, 348px smalls, full badges, full meta);
  titles 1 line at every width; terracotta focus ring visible on WHAT input; anonymous homepage 200
  with AuthCTA rendering (closes the unverified item from the review).
- Note: Playwright-MCP browser had a stuck 200% page zoom (WSLg restart artifact) — verification used
  a dedicated chromium launch with --force-device-scale-factor=1; e2e runner unaffected.

**Follow-up (user request, 2026-06-11)**: mobile hero photo was nearly invisible (pre-existing design:
photo at opacity-45 under a 0.97→0.84 wash). Changed in HomeClient.tsx: photo now full opacity at all
breakpoints; mobile wash re-curved (0.97 → 0.92 @40% → 0.7 @58% → 0.22 @80% → 0.05 @100%) so the
headline/subhead/chips zone stays readable while the photo shows at near-full strength below the search
card. Desktop gradient untouched. Verified at 320/375/640 (screenshots hero-fix-*.jpeg).

**Follow-up 2 (user request, 2026-06-11)**: mobile hero composition — content hugged the navbar with all
viewport slack pooling at the bottom. HomeClient.tsx: hero inner column is now a mobile flex column with
two aria-hidden spacers distributing tall-viewport slack (capped max-h-14 breath above the search card,
flex-[4] photo reveal below it; both md:hidden, collapse to zero on short phones). globals.css:
.home-hero-frame mobile padding-top clamp raised (1rem→2.25rem) for navbar breathing room; md override
unchanged. Verified 412x860, 375x812, 360x700, 320x568 + 768 sanity (balance2-*.jpeg).
