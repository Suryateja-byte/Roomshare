# Roomshare — Full Project Review, Round 2 (2026-08-03)

> Second whole-project pass, run after the morning review (`docs/full-project-review-2026-08-03.md`) and after its
> P0/P1 fixes were merged as #178, #180, #181, #182, #183.
>
> This round deliberately attacked the axes that review under-covered, and independently re-verified its fixes.
> 11 domain reviewers → every P0/P1 handed to an individual adversarial verifier instructed to **refute** it,
> every P2 to a batch verifier → 1 completeness critic. 39 agents, 2,001 tool calls, ~6.7M tokens, 61 min.
>
> **82 raw findings → 29 confirmed, 30 confirmed-but-downgraded, 18 unverified P3s, 2 refuted, 3 from the critic.**

**Severity after verification:** 🟥 1 P0 · 🟧 3 P1 (2 distinct) · 🟨 34 P2 · ⬜ 42 P3

## Baseline health

| Check | Result |
| --- | --- |
| `pnpm lint` | ✅ 0 errors, 18 warnings (unused vars; 2 stale `eslint-disable`) |
| `pnpm typecheck` | ✅ clean, `strict: true`, no build escape hatches |
| `pnpm test` | ✅ 8,235 passed / 17 skipped, 529 of 534 suites, 62s |
| `pnpm build` | ✅ succeeds; every route resolves `ƒ` (no personalized page statically generated) |
| Secrets in git | ✅ clean end to end, history included |
| Test-only routes in prod | ✅ deployed but inert — triple-gated (`VERCEL_ENV`, `E2E_TEST_HELPERS`, ≥16-char bearer) |

---

## Executive summary

The morning review's verdict still stands: the engineering discipline here is real, and it is strongest exactly where
these codebases are usually weakest. Server Action authorization is uniformly correct across all 14 `"use server"`
files. Upload handling validates declared MIME → magic bytes → re-encodes through sharp. `startConversation` is
race-safe by construction via a sorted-pair advisory lock. Migrations carry genuine `-- ROLLBACK:` and `-- DATA SAFETY:`
reasoning, and the team already practises *negative* index auditing.

This round's findings cluster differently from the morning's. That review found defects in **plumbing around correct
features**. This one found a different shape: **guards that were written, merged, and believed — but that never
execute.** Five separate instances:

1. The **P0-1b email-verification fix is dead code** — it reads `email_verified` off a `profile` object that
   `@auth/core` strips it from before the event fires.
2. Every **transactional email CTA is double-prefixed** with the app URL, so every password-reset and
   email-verification link 404s.
3. **Client-side Sentry never initializes**, so no browser error has ever been captured.
4. **`onRequestError` is not exported**, so no uncaught server error reaches Sentry either.
5. Today's **real-Postgres regression proofs for P0-3, P0-4 and P1-5 are `describe.skip` in CI** — `REAL_DB_URL` is set
   in no workflow.

Items 1 and 2 compose into the single P0 below. Items 3 and 4 mean that had any of this reached production, nothing
would have reported it.

---

## 🟥 P0-R2. Email verification is unreachable for every new user, so messaging — the core product and the paywall — is dead on arrival

*Composite: `CC-1` (completeness critic) + `FL-1` (fix-regression). Verified by direct source reading and by executing
the real module.*

> ### ✅ Fixed (2026-08-04) — branch `fix/p0-email-verification-unreachable`
>
> | Half | Fix | Regression coverage |
> | --- | --- | --- |
> | (a) double-prefixed CTA | `buildAppHref` passes an absolute `http(s)` URL through unchanged, refuses every other scheme (`javascript:`/`data:`/`vbscript:`) rather than prefixing it into an href, and keeps the existing path behaviour byte-identical for the 9 relative templates. | **New** `src/__tests__/lib/email-templates.test.ts` — 21 cases, **8 RED** against the old helper. First test in the repo to render an email. |
> | (b) dead P0-1b | The unreadable `profile.email_verified` check is gone from the `linkAccount` event; `provider === "google"` is itself the proof, because `signIn` hard-returns `EmailNotVerified` earlier in the same request. Comment cites `@auth/core` file:line for both halves. | `linkAccount` block in `auth.test.ts` rewritten — 5 cases, **4 RED** pre-fix. The old pair asserted the broken contract and passed only because the helper was mocked to a constant. |
> | CC-2 hardening | `APP_URL` falls back to the production origin like every other consumer; `logStartupWarnings()` reports an unset `NEXT_PUBLIC_APP_URL`. Deliberately a warning, not a schema requirement — `instrumentation.ts` calls `getServerEnv()` at boot, so promoting it would brick a deploy. | covered by the template suite's origin cases |
> | FL-3 hardening | The revoke branch now skips rows that already carry a linked Google `Account`, and fails closed without mutating if that lookup errors. | 3 cases in `auth.test.ts`, **2 RED** pre-fix, incl. a positive control that the genuine squat still revokes |
>
> Verification: lint 0 errors / 18 warnings (unchanged) · typecheck clean · probe now emits
> `https://roomshare.app/reset-password?token=abc123` (pathname `/reset-password`). Lesson recorded in
> `tasks/lessons.md` (2026-08-04). **No migration; reversible by revert.**

`emailVerified` hard-gates `startConversation` (`src/app/actions/chat.ts:214`), review creation
(`src/app/api/reviews/route.ts:71,398,501`) and reporting (`src/app/api/reports/route.ts:230`). There are exactly three
writers of that column. In production, **all three are unreachable for a new user**:

**(a) The emailed link is malformed — every template, unconditionally.**

`buildAppHref` prepends `APP_URL` to whatever it is given and only ever inserts a slash; it never detects an
already-absolute URL:

```ts
// src/lib/email-templates.ts:20-23
function buildAppHref(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return escapeHtml(`${APP_URL}${normalizedPath}`);
}
```

It is the sole href producer (`button()` at :61 → `simpleTemplate` at :74-77). Three templates pass an **absolute** URL
into `ctaHref`: `welcomeEmail` (:215), `emailVerification` (:226), `passwordReset` (:237) — and all three callers build
a fully-qualified URL (`src/app/api/register/route.ts:205`, `src/app/api/auth/resend-verification/route.ts:67`,
`src/app/api/auth/forgot-password/route.ts:134`).

Executed against the real module with `NEXT_PUBLIC_APP_URL=https://roomshare.app`:

```
PASSWORD RESET href: https://roomshare.app/https://roomshare.app/reset-password?token=abc123
VERIFY EMAIL  href: https://roomshare.app/https://roomshare.app/verify-email?token=xyz
reset pathname     : /https://roomshare.app/reset-password
```

There is **no configuration that makes this work** — the prefix is unconditional, so unsetting either variable just
changes which wrong origin appears. There is no rewrite or catch-all to absorb it (`next.config.ts` declares neither
`redirects` nor `rewrites`). The plain-text fallback does not save it either: `src/lib/email.ts:108` builds it as
`html.replace(/<[^>]*>/g, "")`, which strips the tag and discards the href entirely. Relative-href templates (new
message, search alerts) are unaffected — which is why this survived.

**(b) The Google path never marks anyone verified — the P0-1b fix is dead code.**

```ts
// src/auth.ts:79
isGoogleEmailVerified(profile as { email_verified?: boolean })
```

`events.linkAccount({ user, account, profile })` (`@auth/core@0.41.3` `handle-login.js:265`) receives the **normalized**
profile, not the OIDC claims. The Google provider declares no custom `profile()` (`providers/google.js` exports only
`{id, name, type, issuer, style, options}`), so `defaultProfile` applies:

```js
// lib/utils/providers.js:78-84
const defaultProfile = (profile) => stripUndefined({
    id: profile.sub ?? profile.id ?? crypto.randomUUID(),
    name: profile.name ?? profile.nickname ?? profile.preferred_username,
    email: profile.email,
    image: profile.picture,
});
```

`email_verified` is dropped. `isGoogleEmailVerified` is a strict boolean check, so it always returns `false` and the
`updateMany` at `src/auth.ts:83` never runs. Contrast `src/auth.ts:216` in the **signIn** callback, which is correct —
`handleAuthorized({ user, account, profile: OAuthProfile })` (`callback/index.js:63-67`) genuinely passes the raw OIDC
profile. The fix was applied to the one event that cannot see the claim.

**(c) The only surviving writer is the attack path.** `src/auth.ts:291` sets `emailVerified: new Date()` inside the
P0-1 revoke branch — which fires only when a Google identity lands on a pre-existing *unverified credential row*. So
after the fix, exactly as before it, **squatting is the only way to obtain a verified account.** That is precisely the
condition the morning's `tasks/lessons.md` entry recorded the P0-1b fix as closing.

**Fix.** Two independent changes, both small.
1. Make `buildAppHref` absolute-aware — pass through anything matching `/^https?:\/\//i` (escaped), and reject every
   other scheme so `javascript:` can never reach an href. Add a test asserting the emitted `<a href>` for
   `passwordReset`/`emailVerification`/`welcomeEmail` equals the input URL byte-for-byte.
2. Move the Google verification write out of `linkAccount`. The verifier's note is important here: doing it in the
   `signIn` callback keyed on `dbUser` does **not** work for a brand-new Google signup, because there is no `dbUser`
   yet. Either stash the asserted claim from `signIn` (where `profile.email_verified` is real) and apply it in the
   `createUser` event, or give the Google provider an explicit `profile()` that carries `email_verified` through so
   `linkAccount` can see it.

**Test-gap note.** No test renders an email. `src/__tests__/api/auth/forgot-password.test.ts:150` asserts only on the
*input* (`resetLink: expect.stringContaining("token=")`), and both e2e specs bypass the email entirely —
`tests/e2e/auth/reset-password.anon.spec.ts:37` reads the token from the dev-mode JSON response and
`page.goto()`s directly.

---

## Independent verification of this morning's merged fixes

Each of the nine was re-derived from current `main`, not from the report.

| Fix | Verdict |
| --- | --- |
| **P0-1** account pre-hijacking (revoke half) | ✅ **Holds.** Ordering is right (`handleAuthorized` at :63 precedes `handleLoginOrRegister` at :70), the byte-exact email guard is genuinely necessary (the adapter looks up by the *raw* address), the `updateMany` re-asserts both preconditions in its WHERE so it is atomic against a concurrent reset, and post-revoke credential login is dead at `src/auth.ts:401`. Caveat: **FL-3** below. |
| **P0-1b** Google `emailVerified` | ❌ **Dead code** — see P0-R2(b). |
| **P0-2** `/listings/:path*` public cache | ✅ **Holds.** Entire `headers()` array re-read; remaining `public` values are only on content-hashed/static assets. No `rewrites`/`redirects`. App-wide sweep for `revalidate`/`force-static`/`unstable_cache`/`use cache` found nothing session-dependent — `src/app/page.tsx:29`'s `revalidate = 3600` is on a provably session-free render. |
| **P0-3** inline Stripe fulfillment | ✅ **Mechanically holds** — the advisory lock is genuinely first, `PAYMENT_WEBHOOK` is correctly *excluded* from `SELF_TRANSACTIONAL_KINDS` (otherwise the xact lock would release immediately and be useless), the `kinds` allowlist is exhaustive by construction, and the env boot guard compares *resolved* booleans through the same helper the live gate uses. Caveat: **FL-2** below. |
| **P0-4** contact-idempotency scope | ✅ **Holds, including the legitimate-retry case.** The broad `findFirst` and the narrow 3-column unique are *deliberately* different shapes, and that is correct. A genuine same-operation retry returns `EXISTING_CONSUMPTION`, not 400; a retry with a fresh key still lands on the `(userId, unitId, epoch, kind)` unique. Migration is safe (widening a unique cannot fail). |
| **P1-2** dispute `warning_closed` | ✅ **Holds**, and a genuine loss still revokes — `resolveDisputeStatus` returns WON only for `won`/`warning_closed`; everything else falls through to the REVOKED path. |
| **P1-4 / P1-5** saved-search bounds + alert geo | ✅ **Holds at both layers.** The degenerate case is safe: four `undefined`s make `normalizeBoundsInput` return `undefined`, so a viewport-less saved search is *not* scoped to a null-island box. |
| **P1-6** `cron_runs` marker | ✅ **Holds** — single-statement `INSERT … ON CONFLICT DO UPDATE … WHERE last_run_at < threshold` is atomic; `cron-run-claim.test.ts` proves it against the real migration SQL under PGlite. Best-engineered fix in the batch. |
| **P1-7** CI deny-list | ⚠️ **Holds for its stated class of bug, but has a hole** — see FL-4/FE-1 below. |

### FL-2 (P2). The `after()` fix introduced concurrent SERIALIZABLE processing of sibling Stripe events

`src/app/api/stripe/webhook/route.ts:162`. Stripe delivers `payment_intent.succeeded` and
`checkout.session.completed` for one purchase with no ordering guarantee. Each POST now schedules its own drain, so two
workers process sibling rows simultaneously for the first time — the loser aborts on serialization failure and is only
retried by the once-daily cron, partially reinstating the delay the fix removed. *The verifier rejected the finding's
proposed fix:* a second `pg_advisory_xact_lock` inside the same transaction cannot prevent the abort, because
`withActor` issues `SELECT set_config(...)` as the transaction's first statement (`with-actor.ts:63-68`), which has
already established the snapshot.

### FL-3 (P2). The P0-1 revoke branch also fires against a user's own account

`src/auth.ts:262`. Direct consequence of FL-1: a Google-first user's row has `emailVerified: null` (because the P0-1b
fix never ran) **and** `password: null`. If they later set a password via forgot-password — which does not require an
existing one (`forgot-password/route.ts:97-99`) — their next Google sign-in matches the revoke condition and silently
nulls the password they just set. **Fix:** add the missing discriminator — only revoke when the row has no `Account`
for this provider.

### FL-4 / FE-1 (P2→P3). Today's real-Postgres regression proofs never run in CI

`grep -rn 'REAL_DB_URL' .github/` returns nothing. Four suites gate on it and are therefore `describe.skip` in every
CI run:

| Suite | Tests dark | Proves |
| --- | --- | --- |
| `src/__tests__/db/contact-paywall-idempotency.test.ts` | 3 | **P0-4** |
| `src/__tests__/db/alert-bounds-postgis.test.ts` | 4 | **P1-5** |
| `src/__tests__/db/payment-webhook-concurrency.test.ts` | 2 | Stripe webhook concurrency |
| `src/__tests__/lib/search/fts-db.test.ts` | 7 | FTS SQL semantics (also `RUN_DB_ASSERTIONS==="1"` while `.env.example` documents `=true` — **FE-6**) |

`ci-test-coverage.test.ts` passes because those files *are* listed by `--listTests`; it proves files are enumerated,
never that a test inside them executes. **Fix:** port them to PGlite the way `cron-run-claim.test.ts` already does
(no server, no Docker, runs everywhere), and extend the guard to assert no build-gated suite is entirely skipped.

---

## 🟧 P1 — two distinct defects

### P1-R2-a. `/messages` polls 4× faster than its own rate limit, so live messaging dies ~14 minutes in

*Found independently by two reviewers (`FE-1` react-nextjs, `PERF-1` performance-cost). `src/lib/rate-limit.ts:310`,
`src/components/MessagesPageClient.tsx:510`.*

The client polls `GET /api/messages` every 3s (1,200 req/h) and the navbar unread badge polls the same route every 30s
(120 req/h) into the same bucket. The route's **first** gate is `messagesPreAuth` — IP-keyed, fixed window, **300/hour**.
At ~300 requests (≈14 min) every subsequent GET returns 429 *before `auth()` runs*. Incoming messages stop appearing,
typing indicators freeze, the unread badge stops updating, and opening any *other* conversation 429s too. The user is
shown nothing — the catch only `console.error`s. Everyone behind one NAT shares the bucket, so an office or campus
burns it in minutes. The client never backs off, so it keeps firing at 3s for the rest of the hour: ~1,200 wasted
Vercel invocations/hour per idle tab.

*Verifier corrections to the proposed fixes:* (1) keying `messagesPreAuth` on `ip:userId` is impossible — it exists
specifically to run *before* `auth()` (see the comment at `src/app/api/messages/route.ts:89`); (2) the suggested
client-side pattern from `NavbarClient.tsx:213-244` does not actually handle 429 — `fetch` does not throw on 429, so
`if (response.ok)` simply falls through and polling continues.

**Fix.** Resize `messagesPreAuth` to a per-minute window that admits the real rate with NAT headroom
(e.g. `{ limit: 240, windowMs: 60_000 }`), gate both intervals on `document.visibilityState === "visible"`, and add
explicit `response.status === 429` handling with backoff plus a user-visible signal.

### P1-R2-b. The listing photo gallery is unopenable by keyboard, and its lightbox is not a dialog

*`A11Y-1`, `src/components/ImageGallery.tsx:93`.*

On `/listings/<id>` at ≥768px the only openers are `GalleryItem` divs with no `role`/`tabIndex`/`onKeyDown`, plus a
"View all N photos" button that is both `md:hidden` and only rendered in the `imageCount >= 4` branch — so for listings
with 1–3 photos there is no keyboard opener at any viewport. When opened, focus stays on the covered button, Tab walks
the page behind the overlay, nothing announces a modal (`role="dialog"`/`aria-modal` absent, no focus move, no
restore), and background scroll is not locked.

*Verifier trim:* photos 1–4 do render inline as real `next/image` with alt text, so keyboard/SR users still perceive
them — what is lost is the fullscreen view, zoom, and any photo beyond the fourth. Still P1: this is the primary
content of the primary conversion page, and the repo already has `src/components/ui/FocusTrap.tsx` wired into every
other overlay.

---

## 🟨 P2 — 34 findings

### Still open from prior reviews (12) — re-verified against current source

`P2-1(0803)` proxy suspension dead over HTTPS (`getToken` reads the non-`__Secure-` cookie name) ·
`P2-2(0803)` changing your password silently signs you out under a success banner ·
`P2-3(0803)` `isSuspended` frozen in the JWT for 14 days — a suspended user still reads any thread by URL ·
`P2-4(0803)` client-side Sentry never initializes ·
`P2-5(0803)` semantic search bypasses the `isSuspended` gate every other surface enforces ·
`P2-6(0803)` `deleteAccount` holds `FOR UPDATE` locks across a Supabase HTTP call in a 5s transaction ·
`P2-10(0803)` `MessagesPageClient` send/retry have no try/catch — lost message, permanent spinner ·
`P2-11(0803)/M4(0626)` `payment_intent.succeeded` resolves its Payment row by recency ·
`P2-13(0803)` phone-reveal limiter keyed `ip:userId` ·
`P2-15(0803)` three cron routes run multi-second dispatchers inside Prisma's default 5s transaction (P2028) ·
plus `P2-12(0803)/M5(0626)` and `M6(0626)` downgraded to P3.

### New this round (22)

**Systemic — `MS-2`: the `ip:userId` rate-limit key is not one bug, it is 22.** The morning review found this shape on
phone-reveal only. `src/app/actions/chat.ts:467` and 21 other call sites do the same, including the messaging
anti-spam caps and the account-security caps. Any per-account cap scales linearly with the attacker's proxy pool.
**Fix:** split into two independent buckets — IP-keyed *and* account-keyed — the way `/api/listings` already does.

**Observability is not wired (`SC-2`/`OPS-2`, `OPS-4`, `OPS-7`).** `instrumentation.ts:9` never exports
`onRequestError`, and the Sentry build plugin is off by default — so uncaught Server Component / route-handler errors
reach Sentry only where a handler wrote an explicit `captureException` (25 of 61 routes). Outbox DLQ routing and every
projection SLA breach use `Sentry.addBreadcrumb`, which sends nothing on its own. And `sendEmail` returns
`{success:true}` when `RESEND_API_KEY` is unset **in every environment**, after which the alert pipeline marks the
delivery permanently `DELIVERED`. **Fix:** `export const onRequestError = Sentry.captureRequestError;` (note:
`instrumentation.ts` currently has no top-level `@sentry/nextjs` import), promote DLQ routing to `captureMessage`, and
gate the email short-circuit on `NODE_ENV !== "production"`.

**Cost (`MS-3`, `PERF-2`, `PERF-3`, `PERF-4`).** `POST /api/nearby` proxies the paid Radar API **unauthenticated with
no spend ceiling** — 43,200 upstream calls/day per source IP — while every other paid provider sits behind a
Redis-backed monthly cap. `/api/messages` rate limiting is Postgres-backed (~10 DB round trips per 3s poll) while
search/map/chat use Redis. `<WebVitals />` fires 4–6 serverless invocations per page view to build a log object and
discard it. `robots.txt` advertises `/sitemap.xml`, a URL the build does not emit (`generateSitemaps()` produces only
`/sitemap/[__metadata_id__]`), so the entire listing corpus is uncrawled — and the route is `force-dynamic`, 3 queries
and up to 5,000 rows, unrated-limited.

**Trust & safety (`FE-2` domain-rules, `FE-3`, `FE-1` domain-rules).** `/users/[id]` never checks `isSuspended`, so a
banned user's profile and listing cards stay public and crawlable. Search alerts apply no owner-suspension gate, so a
banned host's listings are emailed to subscribers with a link that 404s. The Fair Housing gate on `/api/chat:344`
screens only the **last** user message while forwarding the whole array to the LLM. *Verifier caveat on the
`/users/[id]` fix:* do not add `isSuspended` to the existing select — it is spread into the client component's RSC
payload, which the page's own comment exists to prevent.

**Privacy (`FE-5` react-nextjs).** The create-listing draft — including the exact street address — persists in
localStorage under a **global, non-user-scoped key** for 24h, is cleared only on successful submit, and survives
sign-out. On a shared browser the next account is offered the previous host's address.

**A11y (`A11Y-2..6`).** `color-contrast` is unconditionally filtered out of every axe assertion in the repo
(`tests/e2e/helpers/test-utils.ts:123`) and the shared search-input placeholder measures 2.50:1 (2.03:1 focused).
Two icon-only buttons on `/profile/edit` are excluded from the axe scan **by CSS selector instead of being fixed**.
A bare `m` shortcut is bound at `window` on `/search` and collides with Radix Select typeahead. Notification
mark-read/delete ignore the server action's error result and report success on failure. The navbar notification
dropdown has no Escape, no `aria-expanded`, no dialog role.

---

## ⬜ P3 — 42 findings

Grouped highlights; the rest are hygiene and latent risk.

- **Data model (`DL-1..7`).** Hard-deleting a listing cascades away every conversation and message on it — destroying
  both parties' paid contact history while the credit stays spent. `stripe_events.payload` stores verbatim Stripe
  events (customer email, name, phone, full billing address) with no retention job. `alert_deliveries` has a
  purpose-built 7-day `expires_at` that nothing purges. Six indexes on the hottest write table are unusable, for
  exactly the reason the `20260702` dead-index migration documents. The phase-09 booking retirement dropped 3 tables,
  4 columns and 2 enums **with no rollback note**, violating a stated non-negotiable. 22 CHECK constraints were added
  `NOT VALID` and never validated.
- **Dead surfaces (`SC-4`, `SC-3`/`OPS-6`, `FE-8`).** `NeighborhoodChat.tsx` has no importer, yet `/api/chat` and
  `/api/agent` stay live. `/api/cron/embeddings-maintenance` is dispatched by nothing while its producer is live, so
  `recoverStuckEmbeddings` never runs and a `PROCESSING` listing is permanently frozen. `docs/API_REFERENCE.md`
  documents `POST /api/reviews` as a working 201 while the handler returns 403 on every path.
- **Ops (`OPS-1`, `OPS-5`, `OPS-8`, `OPS-9`, `OPS-10`, `PERF-5`).** The three HTTP metrics in `/api/metrics/ops` are
  permanently zero — their only writer is never called. `runDelegatedTask` grades sub-routes on HTTP status alone, so
  `refresh-search-docs` returning 200 with `{success:false, errors:N}` counts as success. None of the ten
  `sourceMetric` names in `ops/slo/launch-slo-alerts.json` is emitted anywhere. The degraded-safe-mode runbook presents
  kill switches as a live toggle, but they are Vercel env vars requiring a redeploy. `daily-maintenance` runs 13 tasks
  serially with no `maxDuration` while three callees declare 30s/60s of their own.
- **Test debt (`FE-3..7` test-quality).** The Playwright skip-count gate can never fail CI (`exit 1` sits inside
  `if [ "$CI_MODE" = true ]`, and the script is invoked without `--ci`). The P0-2 regression e2e never loads an actual
  listing detail page — the render that carries the street address. `stability-tests.yml` runs Playwright against
  `next dev`, the exact configuration `tasks/lessons.md` records as producing unreliable results. Three spec files are
  excluded from every project, and 7 `describe` blocks + 12 `test.fixme` are dark while still counting toward the
  headline total.
- **Supply chain (`SC-1`, `SC-5`, `SC-6`).** Two pnpm `overrides` pin transitive packages to versions that are
  themselves still vulnerable, and the selectors prevent normal resolution from moving past them. `"sideEffects": false`
  at the app package root applies to all of `src/`. `verify.js` is tracked at the repo root, wired to `pnpm verify`,
  and writes a seed user with an unhashed password into whatever DB it is pointed at.
- **Server surface (`MS-1`, `MS-4`, `MS-5`, `MS-6`).** The HMAC view-token gate is skipped entirely when the body is
  not valid JSON. `createReviewResponse`/`deleteReviewResponse` have neither rate limit nor suspension check.
  `POST /api/reports` buffers and parses the full body *before* CSRF and *before* the rate limiter.
  `src/app/actions/suspension.ts` is marked `"use server"`, exposing two internal helpers as public endpoints that
  accept a caller-supplied user id.

---

## ✅ Refuted

- **`FE-5` (domain-rules)** — "semantic search returns stale/unavailable listings." The SQL facts were right, but the
  compensating control exists one call frame above the mapper the finding quoted.
- **`OPS-3` (observability)** — "daily-maintenance claims the lane before doing work, so a crash loses the day." Every
  quote was verbatim and accurate, but the failure path does not follow from them.

---

## What is genuinely strong

- **Server Action authorization** is uniformly correct across all 14 `"use server"` files — every action re-derives
  identity from `auth()` and re-checks ownership against the DB.
- **`startConversation`** is race-safe by construction: whole find-or-create in one transaction under
  `pg_advisory_xact_lock(hashtext('conv:${listingId}:${sortedIds}'))` on the *sorted* pair, so both directions collapse
  onto one lock — and it is retry-safe without trusting the client's idempotency key.
- **Upload hardening**: declared MIME allowlist → magic-byte validation → sharp re-encode stripping EXIF/GPS.
- **`src/lib/cron-auth.ts`** fails *closed* (500) when `CRON_SECRET` is absent or under 32 chars, rejects placeholder
  values, and compares in constant time.
- **`src/lib/privacy-redaction.ts`** is 12 regex families, not a token denylist.
- **`src/lib/outbox/retention.ts`** ships an allowlist of compactable kinds with a per-kind "NEVER add" rationale.
- **`ci-test-coverage.test.ts`** is the best test in the repo on its axis — it shells out to `jest --listTests` rather
  than reimplementing matcher semantics.
- **`cron-run-claim.test.ts`** is exemplary PGlite usage: applies the *actual* migration file, pins `SET TIME ZONE 'UTC'`
  with a comment explaining why.
- **The P1-5 fix ships the positive control** `tasks/lessons.md` says was missing — the Seattle-negative is paired with
  an Austin-positive.
- **Migration discipline**: near-universal `-- ROLLBACK:` / `-- DATA SAFETY:` blocks that reason rather than recite,
  correct non-blocking DDL (NOT NULL via default → backfill → CHECK NOT VALID → VALIDATE), and a prior migration that
  *drops* dead indexes with a written proof.
- **No build escape hatches** anywhere; dev and prod share the same bundler (`--webpack` on both); secret hygiene clean
  including history.
- **Focus management** is real and consistently applied via `FocusTrap.tsx` — the gallery in P1-R2-b is the exception,
  not the rule. The navbar mobile menu toggles `aria-modal`/`aria-hidden`/`inert` together, correctly.
- **The persistent map** applies viewport hysteresis so small pans issue zero requests; all twelve React contexts
  memoize their provider values; SearchDoc caching quantizes bounds to ~100m so pans inside a cell share one entry.

---

## Recommended fix order

| # | Item | Why here |
| --- | --- | --- |
| 1 | **P0-R2** — absolute-aware `buildAppHref` + move the Google `emailVerified` write off `linkAccount` | Two small changes; without them no user can verify email, and messaging/reviews/reports are unreachable in production. Add the email-rendering test. |
| 2 | **`SC-2`/`OPS-2`** — `export const onRequestError = Sentry.captureRequestError` | One line. It is what would have told you about #1. Pair with `P2-4` (client Sentry via `instrumentation-client.ts`). |
| 3 | **P1-R2-a** — resize `messagesPreAuth`, gate polls on visibility, handle 429 | Core feature silently dies 14 min in, and burns ~1,200 invocations/hour per idle tab. |
| 4 | **`FL-3`** — add the provider-linked discriminator to the P0-1 revoke branch | Today it nulls a legitimate user's own password. Falls out of the #1 fix but must be done explicitly. |
| 5 | **`MS-3`** — put `/api/nearby` behind auth + a Radar spend cap | Unauthenticated paid-API proxy is the largest uncapped cost exposure. |
| 6 | **`FL-4`/`FE-1`** — port the three real-DB suites to PGlite; assert no gated suite is fully skipped | Cheap, and it is what stops #1-class regressions from shipping believed-covered. |
| 7 | **`MS-2`** — split the 22 `ip:userId` buckets into IP-keyed + account-keyed | Systemic; supersedes `P2-13`. |
| 8 | **`P2-1(0803)`** — `secureCookie` on `getToken` | One argument; restores proxy-level suspension enforcement, and unblocks `P2-2` and `P2-3`. |
| 9 | **`FE-5`** react-nextjs — namespace the listing draft key by user id and clear on sign-out | Exact street address on shared browsers. |
| 10 | **`FE-2`/`FE-3`** domain-rules — suspension gate on `/users/[id]` and on alert delivery | Banned hosts are still publicly reachable and still emailed to subscribers. |

---

## Coverage and method

11 reviewers: fix-regression, backlog-triage, react-nextjs, a11y-ux, performance-cost, server-actions-api, data-model,
domain-rules, test-quality, observability-ops, hygiene-supply-chain. Every P0/P1 went to a dedicated verifier prompted
to refute it by default; every P2 to a per-dimension batch verifier; one completeness critic then hunted what all 11
missed (it produced the P0).

**Note on process.** During verification the `refute:FE-2` agent temporarily deleted the P0-1 guard from `src/auth.ts`
to test whether `auth-edge-cases.test.ts` would stay green (it did — that is finding `FE-2`/test-quality), then
restored it. The working tree was confirmed byte-identical to HEAD afterwards. This is legitimate mutation testing but
should be done in a worktree, not the working copy.

**Known gaps this round did not cover:** i18n/locale beyond timezone, email deliverability (SPF/DKIM), push
notifications and PWA/offline, the admin surface in depth, and load/performance testing under concurrency.
