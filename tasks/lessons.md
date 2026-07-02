- Date: 2026-07-01
- Mistake / failure mode: (near-miss, caught before implementing) A code-review finding recommended "cache Mapbox/Google autocomplete results in Redis" as a critical cost fix. Both providers' terms prohibit storing that data (Mapbox Temporary Geocoding; Google Places allows caching place IDs only), and the codebase already encoded this deliberately — the route test is literally named "does not cache temporary results" and the Mapbox adapter's operation is `temporary_geocoding_forward`. Blindly applying the finding would have traded a cost bug for a ToS violation.
- Detection signal: reading the existing test file before changing the route; the test name asserted the "missing" cache was intentional.
- Root cause: reviewers (human or agent) judge code in isolation; deliberate constraints (legal/ToS, product decisions) live in test names, operation strings, and comments, not in the code shape.
- Prevention rule: before implementing any review finding that adds/removes caching, persistence, or data retention for third-party API responses, (1) check the provider's data-retention terms, and (2) grep existing tests for the current behavior — a test that pins it by name means it's a contract, not an oversight. Fix the enforceable control instead (here: Redis-backed monthly caps).
- Follow-up: decision recorded as a comment in autocomplete/route.ts; caps made cross-instance in provider-cost-controls.ts.

- Date: 2026-06-20
- Mistake / failure mode: 4 of the /search audit fixes regressed existing e2e tests that encoded the PRIOR behavior as INTENTIONAL — caught only by the PR's e2e shards (unit + typecheck + the search-release-gate were all green). #28 (show "you've seen all" on a single-page set) contradicted pagination-core 4.2's explicit "no end-of-results message when all fit on first page". #42 (drop redundant `z-50` from FloatingMapButton) broke mobile-toggle/mobile-ux which literally assert `toContain("z-50")`. #2 (recount noindex via countActiveFilters → price as 1 chip) broke SEO-07 which expects q+price-range+roomType → noindex.
- Detection signal: PR e2e shards 3/7/9/10 failed (failed all 3 retries — distinct from 2 genuinely-flaky tests that passed on retry); errors were `expect(...).not.toBeVisible` / `toContain("z-50")` / robots-not-noindex.
- Root cause: an adversarial code-audit judges "is this a defect?" from the code alone; it cannot see that an existing e2e test + comments encode the behavior as a deliberate product/UX/SEO decision. Low-value "improvements" (nits, UX niceties) that flip tested behavior are usually overreach.
- Prevention rule: before changing observable behavior from an audit finding, grep the e2e suite (tests/e2e) for tests asserting that behavior. If one exists with intent, treat the behavior as a contract: revert the finding (if low value) or make a SURGICAL fix that preserves the contract (e.g. #2 → drop only the always-derived `bounds` term, keep price per-field so SEO-07 still noindexes). Never flip a tested SEO/UX decision just to apply a nit. Run the e2e shards (not just unit + the feature-specific gate) before declaring a multi-fix PR done. Distinguish "failed (all retries)" from "flaky (passed on retry)" — only fix the former.
- Follow-up: #28 + #42 reverted; #2 made surgical (bounds-only); unit tests realigned; CI re-run.

- Date: 2026-06-18
- Mistake / failure mode: Shipped PR #155 with a build-breaking type error (`page.tsx:572 'paginatedResult.totalPages' is possibly 'null'` — PaginatedResultHybrid.totalPages is `number|null`, and `"totalPages" in x` narrowing keeps the nullable). `pnpm typecheck` returned exit 0 TWICE (false negative); `next build` (the search-release-gate / Vercel) caught it. The LSP flagged it live and I wrongly dismissed it as "transient" because typecheck was green.
- Detection signal: gate failed at the build step ("Failed to type check") before any e2e ran; a FRESH `pnpm typecheck` (after the gate rebuilt `.next`) then ALSO returned exit 1 on the same line.
- Root cause: `tsc --noEmit` is incremental and the typecheck script (`rm -rf .next/types .next/dev/types && next typegen && tsc --noEmit`) does NOT clear the TS `.tsbuildinfo`, so a stale build-info marked page.tsx clean and skipped re-checking it. `next build` does a clean check ⇒ authoritative.
- Prevention rule: `next build` is the source of truth for type-safety, not `pnpm typecheck`. (1) Never dismiss an LSP/tsserver diagnostic just because `pnpm typecheck` is green — tsserver is non-incremental and more trustworthy here. (2) For a real gate, run `next build` (or `find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete` before `pnpm typecheck`). (3) After a multi-agent edit batch, do at least one clean build before claiming "typecheck passes."
- Follow-up: added a `typeof totalPages === "number"` guard; clean typecheck (cache cleared) + re-ran the gate.

- Date: 2026-06-18
- Mistake / failure mode: During the parallel /search audit-fix campaign, the `searchV2` circuit breaker's `failureThreshold` was lowered 3→1 (audit #25). It typechecked/lint-clean but broke `actions.test.ts` — 3 pre-existing V2-path tests failed only in the full-file run (passed in isolation). The "falls back when V2 times out" test trips the breaker after a single failure; the breaker is a module-level singleton with no per-test reset, so every later V2 test in the file short-circuited to the degraded path (degraded result, NO "V2 failed" log because the circuit-open path logs differently).
- Detection signal: failure reproduced with the whole file but not with `-t "<single test>"`; received output was the terminal degraded/v1-fallback return with no timeout warning ⇒ breaker open, not timeout.
- Root cause: module-level singleton state (CircuitBreaker) persists across tests in a file; threshold=1 made one failing test poison the rest. Also threshold=1 is aggressive for prod (one transient V2 blip → 30s forced V1 on that warm instance).
- Prevention rule: changing shared/singleton runtime state (circuit breakers, rate limiters, module caches) needs either a per-test reset hook OR conservative thresholds. Reverted threshold to 3 and kept only the honest per-lambda-instance doc comment (the low-value, non-controversial half of #25). When a "fix" changes a singleton's trip sensitivity, grep for tests that exercise the failure path in the same file before shipping.
- Follow-up: reverted in circuit-breaker.ts; full suite 7447 pass.

- Date: 2026-06-18
- Mistake / failure mode: Parallel fix-agents using the Edit tool on CRLF-having files normalized line endings, producing massive spurious diffs: `data.ts` showed 1092 changed lines for a 4-line logical edit, `SplitStayCard.tsx` 142 lines for 4 className fixes. (The known data.ts EOL gotcha now also bit SplitStayCard.) Map.tsx/test files were NOT polluted (verified real change ≈ raw diff).
- Detection signal: `git diff --stat` line count >> logical change; per-file `grep -c $'\r'` mismatch vs HEAD.
- Prevention rule: after any agent edits a file that HEAD has CRLF in, check `git diff --stat`; if bloated, `git checkout HEAD -- <file>` and re-apply the logical change byte-level via a node script (string replace for in-line edits; preserve each line's existing `\r` when inserting lines). Detect polluted files quickly: compare `git diff --numstat` to a CR-stripped diff (`diff <(git show HEAD:f|tr -d '\r') <(tr -d '\r' <f)`).
- Follow-up: both files restored to minimal diffs (data.ts 8/4, SplitStayCard 4/4).

- Date: 2026-06-12
- Mistake / failure mode: The new home-a11y focus-indicator e2e used `#search-what` as its "SearchForm loaded" sentinel. It passed locally but failed deterministically (3/3 retries) on its first CI run — the field only renders when `NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH=true`, which local `.env` sets but CI and prod (Vercel env) do not. NEXT_PUBLIC_ vars are inlined at build time, so the field simply doesn't exist in those builds.
- Detection signal: `page.waitForSelector('#search-what')` 30s timeout on every retry in one CI shard while all sibling tests passed; same spec green locally.
- Root cause: test assumed a flag-gated, build-time-conditional element always exists; local env flags diverge from CI/prod env flags.
- Prevention rule: e2e sentinels/selectors must target unconditionally-rendered elements; for any element behind a `NEXT_PUBLIC_*` flag, either skip-when-absent or explicitly set the flag in the CI workflow. Before relying on an env-gated element in a test, check `.github/workflows/*` and `vercel env ls` — local `.env` is the outlier, not the reference. When verifying locally under CI conditions, override the flag at build time (`NEXT_PUBLIC_X=false pnpm build`) — and check nothing stale already owns the verification port (a leftover `next-server` on 3100 served an old build and made all 4 tests fail misleadingly).
- Follow-up: sentinel switched to `#search-location`; `search-what` skipped when absent. All 4 home-a11y tests pass against a flag-off prod build.

- Date: 2026-06-11
- Mistake / failure mode: While verifying the homepage search-bar a11y fixes, Playwright e2e and standalone browser probes failed intermittently — the recent-searches combobox listbox sometimes didn't open and the form did a native GET to `/?minBudget=&maxBudget=` instead of client-navigating. I nearly mis-attributed it to my code.
- Detection signal: console showed `404` on `/_next/static/...` JS chunks + "Refused to apply style ... MIME type ('text/plain')"; the page rendered but never hydrated, so React handlers (`preventDefault`, `onFocus`-driven state) never ran. The SAME test passed and failed across runs on the SAME server; even the untouched focus-indicator regression test flipped.
- Root cause: Next 16 + `next dev --webpack` serves stale/desynced chunks after recompiles (especially with a long-lived tab or rapid edits + concurrent test runs), producing intermittent no-hydration. This is an environment artifact, not a product/code bug. (Same family as the earlier "lazy SearchForm reload loop" observed during review.)
- Prevention rule: For any e2e or browser-based verification of behavior that needs hydration, run against a PRODUCTION build — `pnpm build` then `pnpm start`, and run Playwright with `E2E_BASE_URL=http://localhost:3000` so it reuses that server instead of spawning `pnpm dev`. Treat dev-server e2e results (pass OR fail) as unreliable. Unit tests + a prod-build e2e are the trustworthy signals. Also: a JS-only form (handler calls `preventDefault`) should not carry `name` attributes — they're inert when hydrated but serialize into a confusing native-GET querystring if hydration ever fails.
- Follow-up: All 4 home-a11y e2e tests + 8 homepage e2e + 7766 unit tests passed against the prod build. Dropped the budget `name="..."` attributes (kept `autoComplete="off"`).

- Date: 2026-04-17
- Mistake / failure mode: Codex-CFM-903 exported a non-async `Set<string>` (`BOOKING_EMAIL_TEMPLATE_KEYS`) from `src/lib/email.ts`, a `"use server"` file. `pnpm typecheck` PASSED, `pnpm test` PASSED, but `pnpm build` FAILED with "A 'use server' file can only export async functions, found object."
- Detection signal: `pnpm build` at the coordinator stage caught it; Codex's self-verification only ran typecheck + test + lint, not build.
- Root cause: Next.js enforces the `"use server"` export contract at build-time through its own plugin, not through `tsc --noEmit`. Unit tests can import non-async exports from a `"use server"` file without the error firing.
- Prevention rule: **Any CFM Codex task that modifies a `"use server"` file MUST run `pnpm build` as part of its verification checklist**, not just typecheck + test. The project CLAUDE.md and critic charters should include `pnpm build` when the diff touches a `"use server"` file. Alternative: keep data constants (Sets, maps, arrays) in separate non-`"use server"` helper modules so they can be shared with tests safely.
- Follow-up: Fixed in commit `4faa94bd` by moving the constant to `src/lib/email-booking-gate.ts`.

- Date: 2026-04-17
- Mistake / failure mode: the stale 2026-04-16 CFM-1002 plan proposed a single-shot cleanup sweep without re-verifying at current `HEAD` that telemetry was unavailable from branch-only inspection, that internal `viewer-state` readers still existed, or that `availableSlots` was a canonical Prisma/search column rather than an alias.
- Detection signal: `planner-cfm1002` caller-grep sweep plus runtime telemetry audit at `HEAD b6b4e0b8`.
- Root cause: planning from a pre-dependency snapshot instead of re-grepping the live branch before proposing deletions.
- Prevention rule: cleanup tickets must re-grep callers at merge `HEAD` and confirm telemetry is actually observable from the branch or dashboard before proposing bulk deletion.

- Date: 2026-06-10
- Mistake / failure mode: after a rebase-merge of PR #142, ran `git reset --hard origin/main` on local `main` assuming it held only the PR's commits — but two map-theme commits (47f1d880, 38130f0a) had been added from a parallel session during the CI wait, and the reset moved `main` past them.
- Detection signal: a pre-reset `git diff origin/main main --stat` printed 13 files / +7967 lines where an empty diff was expected; `git reflog` identified the orphaned commits.
- Root cause: assumed exclusive ownership of the local working copy across a ~40-minute CI wait; ran a destructive ref move without first checking `git log origin/main..main` for unexpected local-only commits.
- Prevention rule: before any `git reset --hard` / branch -f on a shared local clone, list local-only commits (`git log --oneline @{u}..`) and abort if any commit is not one you authored this session. Recovery: cherry-pick from reflog, verify with `git diff <old-tip> HEAD` for byte-identical trees.

- Date: 2026-06-11
- Mistake / failure mode: Wrote a Tailwind-class-shaped token with a url arbitrary value (the bg utility joined to a bracketed url value) into tasks/todo.md; Tailwind v4 auto source-detection scans all non-gitignored text files (including tasks/*.md), generated a background-image url declaration, and webpack failed the whole build with "Module not found: Can't resolve './…'" — homepage 500'd. Happened TWICE: the results write-up quoting the offending token re-broke the build the same way.
- Detection signal: dev server 500/404 on every route; build error pointing at globals.css:4:1 with a truncated-looking './…' path that existed nowhere in the CSS.
- Root cause: Tailwind v4 content scanning treats documentation prose as class candidates; url() arbitrary values trigger webpack module resolution.
- Prevention rule: in markdown/docs inside the repo, never write class-shaped tokens containing url(...) — describe them in prose instead. If quoting classes is unavoidable, break the token (space after the bracket) or put the doc in a gitignored location.
- Follow-up: todo.md and this lessons entry both de-fanged (prose only, no quotable token). When documenting this class of bug, never paste the literal token anywhere Tailwind scans.

## 2026-06-12 — Focus-shifting layout morphs break clicks under reduced motion

- Date: 2026-06-12
- Mistake / failure mode: The search bar's submit orb morphs wider when a field gains
  focus. Under prefers-reduced-motion (which tests/e2e/helpers/test-utils.ts emulates for
  ALL e2e) the shift is instant, so it happens between mousedown and mouseup — the click
  event retargets to the common ancestor (the field cell) and the cell's dead-space
  click-to-focus handler stole focus from the input the user actually clicked.
- Detection signal: filter-price.anon e2e deterministic failure (`toBeFocused` got
  "inactive"; error-context snapshot showed the WRONG input `[active]`), while manual
  clicks with animations enabled worked fine.
- Root cause: focus-triggered layout change + click retargeting + a dead-space handler
  that didn't check whether focus was already inside the cell.
- Prevention rule: any click-to-focus delegation must no-op when
  `currentTarget.contains(document.activeElement)`; and when adding focus-triggered
  geometry changes, test with `page.emulateMedia({ reducedMotion: "reduce" })` because
  every Roomshare e2e runs that way.

## 2026-06-12 — Conditional portals are a React 19 hydration mismatch

- Date: 2026-06-12
- Mistake / failure mode: `if (typeof document === "undefined") return null; return createPortal(...)`
  in an SSR'd client component (SearchBarScrim) threw React #418 on /search — server
  rendered null, client rendered the portal during hydration.
- Detection signal: minified React error #418 in the prod-build console; dev server showed
  the full mismatch diff naming the component (but only after a FRESH dev restart — stale
  dev chunks reproduced the OLD error even after the fix, reconfirming the 2026-06-11
  dev-server lesson).
- Root cause: portal rendered during the hydration pass instead of after mount.
- Prevention rule: portals in SSR'd components must be gated on a `mounted` state set in
  useEffect; "typeof document" checks are not equivalent. Verify hydration-sensitive fixes
  against `pnpm build` + `pnpm start`, never the dev server.

## 2026-06-13 — Edit tool normalizes mixed-EOL files → spurious 1000-line diff

- Date: 2026-06-13
- Mistake / failure mode: A 2-line logical change to `src/lib/data.ts` produced a
  1072-line `git diff --stat` (668 ins / 542 del). The file had MIXED line endings in
  HEAD (1740 lines, 1204 CRLF + 536 LF); the Edit tool rewrote the whole file to all-CRLF.
- Detection signal: `git diff --stat` showed one file ballooning far beyond the edit;
  `git diff --ignore-space-at-eol <file>` collapsed to the true ~2-line change, confirming
  the rest was pure EOL churn. CR-count check: `grep -c $'\r'` differed between HEAD and
  working tree (1204 → 1740).
- Root cause: repo has no `.gitattributes` and `core.autocrlf` is unset, so mixed EOLs are
  stored verbatim; the Edit tool normalized them on write. Uniform-EOL files were unaffected.
- Prevention rule: after editing, run `git diff --stat`; if a touched file balloons, restore
  with `git checkout HEAD -- <file>` and re-apply the change at byte level (Python
  `open(...,'rb')` + `bytes.replace` with a count assertion) so non-edited bytes/EOLs are
  preserved. Don't commit wholesale EOL flips.
- Follow-up: none required; consider adding `.gitattributes` (`* text=auto`) repo-wide later.
