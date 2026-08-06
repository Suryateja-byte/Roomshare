# Roomshare — Verified Project Review (2026-08-05)

> **This report supersedes `docs/full-project-review-2026-08-03.md` and
> `docs/full-project-review-2026-08-03-round2.md`.** Every finding those two reports listed was re-derived
> from source at `main` @ `6b6367c8`, after PRs #178, #180, #181, #182, #183 and #184 were merged. Nothing
> here is carried over on trust: each item was located by symbol search (the originals' line numbers are
> stale), read in the current tree, and given an independent verdict.
>
> **Method.** 13 domain agents re-verified the findings; every verdict that *reduced* the backlog (FIXED or
> INVALID) and every remaining P0/P1 was handed to an adversarial verifier instructed to refute it; the 5
> disagreements went to a tie-breaker that re-derived them from first principles. 22 agents, 934 tool calls.
> Two verdicts were overturned on challenge — both in the same place, and both in the *unsafe* direction.

## Baseline health (measured today, not quoted)

| Check | Result |
| --- | --- |
| `pnpm lint` | ✅ 0 errors, 18 warnings (unused vars; 3 auto-fixable) |
| `pnpm typecheck` | ✅ clean, `strict: true`, no build escape hatches |
| `pnpm test` | ✅ 8,262 passed / 17 skipped in 79s — **530 of 535 suites; 5 suites skip entirely** |
| `pnpm build` | ✅ succeeds (87 static pages generated) |
| Working tree | clean; 3 untracked docs |

Four of the five fully-skipped suites are the `REAL_DB_URL` / `RUN_DB_ASSERTIONS`-gated DB tests — see
**V-P2-35**; they are the proofs for three of the fixes merged this week, and they run nowhere.
(The fifth, `src/__tests__/actions/create-listing.test.ts`, is a deliberate `describe.skip` on a deprecated
action — benign.)

## Scoreboard

| | Count | |
| --- | --- | --- |
| 🟥 **P0 open** | **0** | ✅ P0-V1 fixed 2026-08-05 on `fix/p0-google-link-takeover` — see below |
| 🟧 **P1 open** | **2** | messaging dies ~14 min in; photo gallery unusable by keyboard |
| 🟨 **P2 open** | **35** | correctness, cost, trust & safety, observability |
| ⬜ **P3 open** | **74** | hygiene, latent risk, test debt |
| ✅ **Verified fixed** | **11** | independently re-derived, not taken from the PR descriptions |
| ❌ **Not defects** | **4** | 1 refutation upheld, 1 report claim factually wrong, 1 numbering artifact, 1 verifier caveat confirmed |

Of the 138 claims verified — 122 distinct after merging duplicates across the two reports — **100 were
accurate as written, 36 were real but overstated, and 2 were wrong.**
The original reports were, on the whole, honest about their own evidence — the failures were in the *fixes*,
not the findings.

---

## 🟥 P0-V1. Account takeover is still live — the P0-1 fix closed the naive path and the `linkAccount` rewrite opened a new one

> ### ✅ Fixed (2026-08-05) — branch `fix/p0-google-link-takeover`
>
> | Change | What it defends |
> | --- | --- |
> | `events.linkAccount` only stamps `emailVerified` when `normalizeEmail(profile.email) === normalizeEmail(user.email)`; on a mismatch it logs at `error` and `deleteMany`s the mislinked `Account` row, asserting `count === 1`. | The **only** thing that prevents the bad link. `profile.email` survives `defaultProfile`; only `email_verified` is stripped. |
> | `signIn` refuses a Google sign-in whose `profile.email` ≠ the resolved row's email, placed *after* the suspension gate. | Containment. Without it a surviving mislink lets `getUserByAccount` mint a session for the victim's row with **no password and no session cookie** (`handle-login.js:190-198`). It cannot prevent the link — on that request `user` *is* the Google profile (`callback/index.js:63-67`). |
> | FL-3 discriminator narrowed from "any linked google account" to *this* `providerAccountId`, with an explicit non-empty-string guard. | Closes the race between the adapter's committed `INSERT` and the undo. A concurrent victim sign-in reading the broad count would see 1 and skip eviction. `providerAccountId: undefined` makes Prisma **drop** the filter, silently restoring the forgeable form. |
> | `/signup` now signs out an existing session before `signIn("google")`, mirroring `/login`. | Defence in depth only — a direct `POST /api/auth/signin/google` skips the page. |
>
> Coverage: 7 new cases in `src/__tests__/lib/auth.test.ts` (5 RED against pre-fix code) + 1 in
> `src/__tests__/pages/signup.test.tsx`. ~12 existing tests had fixtures that omitted `profile.email` /
> `user.email` entirely; they were given matching emails — **not** made to fail open, which would have
> nullified the fix. Verification: lint 0 errors / 18 warnings (unchanged) · typecheck clean · 8,270 tests
> passing (was 8,262) · build succeeds. No migration; reversible by revert.
>
> **Scope of the claim:** this closes the *password* half. Steps 1-3 are untouched — `/api/register` still
> creates the squat row and `authorize()` still admits it, so the victim still inherits whatever the
> attacker seeded on that row. It is also prevention-only: pre-existing mislinks cannot be found, because
> no provider-side email is stored on `Account` and the token scrub nulls the `id_token` that carried it.
> Lesson recorded in `tasks/lessons.md` (2026-08-05).

*Supersedes `0803-P0-1` and its `P0-1b` sub-fix. Both reports recorded this as closed (#178, then #184).*
*Two independent agents and a tie-breaker reached this conclusion; I re-verified every step myself before
writing it down.*

**The naive path really is closed.** `src/auth.ts:270-275` gates on
`account?.provider === "google" && dbUser.emailVerified === null && dbUser.password !== null`, guards on a
byte-exact raw-email comparison (`:279`), and revokes with an atomic `updateMany` that re-asserts both
preconditions in its `WHERE` (`:316-328`) and aborts unless exactly one row moved (`:330`). Post-revoke
credential login is genuinely dead (`src/auth.ts:436  if (!user.password) return null;`). The ordering claim
holds against the installed library: `@auth/core@0.41.3` `callback/index.js:63` runs `handleAuthorized`
before `handleLoginOrRegister` at `:70`.

**What #184 changed.** The old `linkAccount` guard read `profile.email_verified` — a claim `@auth/core`
strips before the event fires — so it never executed. #184 removed the dead gate and made the write
unconditional for Google (`src/auth.ts:88-93`):

```ts
// src/auth.ts:88-93
if (account.provider === "google") {
  await prisma.user.updateMany({
    where: { id: user.id, emailVerified: null },
    data: { emailVerified: new Date() },
  });
}
```

The justifying comment (`src/auth.ts:83-87`) says *"Reaching here with provider 'google' IS the proof."*
That is true of the **profile**, and false of the **row**. `handleAuthorized` proves the *Google account's*
email is verified; `user.id` here is whatever row the caller's current session resolves to. The write never
compares `profile.email` to that row's email — and `profile.email` is present on the normalized profile, so
the comparison was available.

**The chain, every step confirmed in current source:**

1. Attacker registers the victim's address — `src/app/api/register/route.ts:176-180` writes
   `{ email, password: hashedPassword, emailVerified: null }` for any caller-supplied email.
2. Attacker signs in on that row. `authorize()` (`src/auth.ts:385-443`) has **no `emailVerified` gate** —
   only rate limit, Turnstile, `if (!user.password) return null` and bcrypt. They now hold a JWT for the
   victim's email.
3. Holding that cookie, the attacker starts Google OAuth **with their own Google account**. `@auth/core`
   takes the signed-in branch — `handle-login.js:206-212`, `if (user) { await linkAccount({ ...account,
   userId: user.id }); await events.linkAccount?.({ user, account, profile }); }` — which links to the
   **session's** row with *no email comparison at all*. Nothing upstream blocks it: the route is a bare
   `export const { GET, POST } = handlers;`, `src/proxy.ts` only does suspension + headers, and
   `authorized()` covers `/login` and `/signup`, not `/api/auth/signin/google`.
4. `events.linkAccount` fires → `src/auth.ts:88-93` stamps `emailVerified` on the **victim's-email row**,
   using the **attacker's** Google account as proof. That row now also has
   `account.count({ userId, provider: "google" }) === 1`.
5. The victim signs in with Google for the first time. The revoke branch is skipped **twice over**:
   `emailVerified` is no longer `null` (`:273`), and even if it were, the FL-3 discriminator
   `if (linkedGoogleAccounts > 0) return true;` (`:307-311`) short-circuits first. `@auth/core` then
   auto-links the victim onto the squat row via `allowDangerousEmailAccountLinking`
   (`handle-login.js:234-241`).

**End state: identical to the P0 both reports rated P0** — attacker keeps a working password on the
victim's account, victim's Google identity is merged into it — plus a forged "email verified" badge. The
precondition is the same one the original finding assumed (register the victim's address first); the
attacker needs no extra privilege, only one extra click.

**Second, independent consequence of the same missing check:** *any* signed-in user can stamp
`emailVerified` on an arbitrary-email row by linking any Google account. That badge gates messaging
(`src/app/actions/chat.ts:214`), listing creation (`src/app/listings/create/page.tsx:122`), reporting and
review creation — i.e. the verification requirement is bypassable by design today.

**Why P0 and not P1.** The verification pass rated it P1 ("partial fix"). I am raising it: the outcome is
byte-identical to the defect both reports rated P0, under the same precondition. Being reachable by a
different route does not make it a smaller defect.

**Fix (three parts, all small):**

1. Gate the `linkAccount` write on an email match —
   `normalizeEmail(profile.email) === normalizeEmail(<row email>)` — which is the check the removed claim
   gate was standing in for.
2. Replace the `linkedGoogleAccounts > 0` early return with a discriminator an attacker cannot forge
   (persisted provenance, or a stored per-`Account` verified email compared against the row's).
3. Gate credential `authorize()` on `emailVerified`, or expire unverified registrations, so step 2 is
   unavailable at all.

**Test gap that hid it:** `src/__tests__/lib/auth.test.ts:361-443` and `:737-800` all use a single-user
fixture with one profile whose email matches the row, and mock `prisma.account.count` directly. No test
constructs a `linkAccount` whose `profile.email` differs from the linked row's email. Add that first.

---

## 🟧 P1 — 2 open

### P1-V1. /messages polls GET /api/messages every 3s against a 300/hour IP-keyed pre-auth limiter, with no visibility gating and no 429 handling — messaging silently dies ~14 min in

*Was `R2-P1-R2-a` (round 2). Verdict: **OPEN** — unchanged since the report; the challenger
could not refute it and widened it instead.*

src/lib/rate-limit.ts:310 is unchanged: `messagesPreAuth: { limit: 300, windowMs: 3_600_000 }, // 300 per hour
per IP`, and it is the FIRST gate on the route — src/app/api/messages/route.ts:89-96 runs
`withRateLimit(request, { type: "messagesPreAuth" … })` and returns 429 before `const session = await auth()`.
The identifier is `getClientIP(request)` (src/lib/with-rate-limit.ts:47) and checkRateLimit is a DB-backed
sliding window (src/lib/rate-limit.ts:119-126, prisma.rateLimitEntry), so the bucket is global across
instances and shared per NAT. src/components/MessagesPageClient.tsx:510-512 `pollInterval = setInterval(() =>
{ void fetchMessages(lastMsgIdRef.current); }, 3000);` with no `document.visibilityState` check anywhere in
that effect, and the poll starts unprompted on desktop because :344-353 auto-selects the first conversation.
429 handling is absent: :409-413 `if (!response.ok) throw` → :487-493 catch only `console.error`s; polling
keeps firing. MessagesPageClient contains zero references to supabase/realtime (grep count 0), so it is pure
polling — unlike ChatWindow, which polls at 5000ms and only when `transportModeRef.current !== "realtime"`
(src/app/messages/[id]/ChatWindow.tsx:571-575). NOTHING has changed: `git log -1 -- src/lib/rate-limit.ts` =
3ff67e1e (2026-06-09). ONE report claim is wrong: the navbar badge IS visibility-gated —
src/components/NavbarClient.tsx:198-202 `setInterval(() => { if (document.visibilityState === "visible")
fetchFn(); }, interval)` at BASE_POLL_INTERVAL=30000 (:154) — though its 429 handling is indeed absent (`if
(response.ok)` at :214 falls through; the backoff at :225-237 is in the catch, which a 429 never enters).

**Fix.** Resize messagesPreAuth to a per-minute window with NAT headroom (it cannot be user-keyed — it exists to run
before auth()), gate the 3s interval on document.visibilityState, and add explicit `response.status === 429`
handling with backoff + a user-visible signal in MessagesPageClient (NavbarClient needs the 429 branch too,
but already has visibility gating).

### P1-V2. Listing photo gallery openers are non-interactive divs and the lightbox is not a dialog (no role/aria-modal/focus management)

*Was `R2-P1-R2-b` (round 2). Verdict: **OPEN** — unchanged since the report; the challenger
could not refute it and widened it instead.*

src/components/ImageGallery.tsx:91-97 — GalleryItem renders `<div className={cn("relative group/item cursor-
pointer overflow-hidden", className)} onClick={onClick}>` with no role/tabIndex/onKeyDown, so no opener is
focusable. The "View all N photos" button (src/components/ImageGallery.tsx:361-368: `className="md:hidden
absolute bottom-4 right-4 ..."`) sits inside the 4+-image bento branch that starts at line 300, so listings
with 1–3 photos have no button at any viewport. The lightbox root (src/components/ImageGallery.tsx:381-384) is
`<div className="fixed inset-0 z-modal bg-on-surface/95 flex flex-col" onClick={closeLightbox}>` — no
`role="dialog"`, no `aria-modal`, no FocusTrap import (the repo does ship src/components/ui/FocusTrap.tsx),
and no focus move or restore anywhere in the file. Latest commit touching the file is 8404c9f3 (#68), long
before the reviews, so nothing landed. ONE SUB-CLAIM IS WRONG: background scroll IS locked —
src/components/ImageGallery.tsx:171-176 `document.body.style.overflow = "hidden";` with cleanup. Escape/arrow
keys also work once open (lines 156-168); what is missing is the ability to open it at all without a mouse,
plus dialog semantics and focus handling.

**Fix.** Make GalleryItem a real button (or wrap in one) with keyboard activation; render a keyboard-reachable "view
all" opener in the 1/2/3-image branches too; add role="dialog" aria-modal="true" + aria-label to the lightbox
root, wrap in the existing FocusTrap, move focus into the overlay on open and restore to the invoking element
on close.

**Scope the challenge pass added, beyond what round 2 reported.** P1-V1 is broader: `ChatWindow` polls the
*same* pre-auth-gated route every 5s (720 req/h — still 2.4× over the 300/h cap) with the identical
swallow-the-error path, so `/messages/[id]` breaks too, at ~25 min; sending still works, so the failure is
receive-side only. P1-V2 is broader too: the "View all N photos" button carries `md:hidden`, so on desktop
*no* listing of *any* photo count has a keyboard-reachable opener — not just the 1–3-photo ones.

---

## ✅ Verified fixed (11)

Each re-derived from current source. "Fixed" here means the defect is gone, not that the PR said so.

| Was | Defect | Fixed by | How it was verified |
| --- | --- | --- | --- |
| `0803-P0-3` | Stripe fulfillment deferred to a once-daily cron, so every purchase waits up to ~24h for its entitlement grant | `b36862dc` (#178) | src/app/api/stripe/webhook/route.ts:2 now imports `after` and at :156-162 schedules `after(async () => { await drainOutboxOnce({ kinds: ["PAYMENT_WEBHOOK"], maxBatch: 5, maxTickMs: 5000 }); ... })` immediately after a successful `captureStripeEvent`, gated on `alreadyProcessed` (:148) not… |
| `0803-P0-4` | Contact-credit idempotency key client-chosen and scoped only to (userId), letting one key unlock unlimited message-starts and… | `b36862dc` (#178) | src/lib/payments/contact-paywall.ts:573-608 now uses `findFirst({ where: { userId, clientIdempotencyKey }, select: { id, unitId, unitIdentityEpoch, contactKind } })` and, before returning EXISTING_CONSUMPTION, asserts `existingByIdempotency.unitId === evaluation.unitId && ...unitIdentityEpoch ===… |
| `0803-P1-1` | Paid-contact idempotency keyed only on (userId, clientIdempotencyKey) — replaying one key unlocks every listing for free | `b36862dc` (#178) | De-duplication confirmed correct: this finding cites the identical code site and identical mechanism as 0803-P0-4 (`consumeContactEntitlement`'s idempotency short-circuit, src/lib/payments/contact-paywall.ts:565-608) and the identical backing constraint. It is the message-start framing of the same… |
| `0803-P1-3` | Contact-entitlement idempotency key not bound to listing/unit, so one paid contact unlocks unlimited host phone reveals | `b36862dc` (#178) | Also the same defect: it names the same function and the same lines (contact-paywall.ts:562), differing only in the REVEAL_PHONE entry point (src/app/api/phone-reveal/route.ts). The kind discriminator is now enforced both in code (contact-paywall.ts:590 `existingByIdempotency.contactKind ===… |
| `0803-P1-2` | charge.dispute.closed with status warning_closed (inquiry closed, no chargeback) permanently revoked a paid entitlement | `e05906e2` (#183) | src/lib/payments/entitlement-adjustments.ts:132-136 now reads `if (dispute.status === "won" \|\| dispute.status === "warning_closed") { return "WON"; } return "LOST";`, with a comment at :122-131 explaining that warning_closed is an inquiry closed without funds moving while 'prevented' is… |
| `0803-P1-4` | parseSavedSearchFilters dropped bounds and lat/lng, stripping location scope from saved-search reopen links and alert emails | `6d9b97b7` (#181) | src/lib/search/saved-search-parser.ts:56-67 adds resolveStoredBounds(), which assembles a nested bounds object from the FLAT stored keys ("return { minLat: stored.minLat, maxLat: stored.maxLat, ... }") and is passed at :118 `bounds: resolveStoredBounds(legacyCompatibleInput)`; lat/lng are now… |
| `0803-P1-5` | Scheduled and instant search alerts applied no geographic filter, matching new listings nationwide | `6d9b97b7` (#181) | Scheduled path now scopes by viewport: src/lib/search-alerts.ts:929-934 `const alertBounds = boundsFromAlertFilters(filters); if (alertBounds) { whereClause.id = { in: await findListingIdsWithinBounds(alertBounds, sinceDate) }; }`. The prefilter is a PostGIS ST_Intersects over Location.coords with… |
| `0803-P1-6` | daily-maintenance gated all nine daily tasks on a 3-minute UTC wall-clock window that Vercel Hobby jitter normally misses | `45b689ef` (#182) | isDailyWindow() is gone. src/app/api/cron/daily-maintenance/route.ts:231 `const dailyLane = await claimDailyLane(nowUtc);` and :109-117 issue ONE statement — `INSERT INTO cron_runs (task,last_run_at) VALUES (...) ON CONFLICT (task) DO UPDATE SET last_run_at = ${now} WHERE cron_runs.last_run_at <… |
| `0803-P1-7` | CI gated on an allow-list of test paths, leaving 76 test files (security, middleware, db, schema, RLS) unrun by any workflow | `57b2efaf` (#180) | `.github/workflows/ci.yml:201-214` adds a `test-rest` job running `pnpm jest --ci --maxWorkers=2 --testPathIgnorePatterns="/node_modules/" ... "src/__tests__/performance/"` (a deny-list), and `ci.yml:234` now lists `test-rest` in the `build` job's `needs:`. I empirically re-ran the union: `jest… |
| `R2-P0-R2` | Email verification unreachable for every new user (double-prefixed CTA hrefs + dead P0-1b + revoke branch as sole emailVerified… | `6b6367c8` (#184) | (a) src/lib/email-templates.ts:24-46 `buildAppHref(pathOrUrl)` now returns `escapeHtml(pathOrUrl)` unchanged when `/^https?:\/\//i` matches (:31-33), returns bare APP_URL for any other scheme `/^[a-z][a-z0-9+.-]*:/i` (:40-42), and only then prefixes (:44-45); it is still the sole href producer via… |
| `R2-FL-3` | P0-1 revoke branch also fires against a legitimate Google-first user who later sets a password, silently nulling it | `6b6367c8` (#184) | src/auth.ts:292-311 adds the missing discriminator before any mutation: `linkedGoogleAccounts = await prisma.account.count({ where: { userId: dbUser.id, provider: "google" } })`, and `if (linkedGoogleAccounts > 0) return true;` (:307-311) skips the revoke. The lookup fails closed without mutating… |

**On the P0-4 / P1-1 / P1-3 trio:** the morning report's claim that these are one defect was itself
verified — same function, same lines, same backing constraint; they differ only in entry point
(`startConversation` vs `REVEAL_PHONE`). One fix, correctly counted once.

### Audit of the six merged PRs

| PR | Verdict | What survived scrutiny, and what did not |
| --- | --- | --- |
| #178 `b36862dc` | ⚠️ **Partial** | P0-2 and P0-4 genuinely closed (the `/listings/:path*` public rule is gone; the idempotency lookup now asserts the full operation and migration `20260803000000` widens the unique to 3 columns). P0-1's naive path closed but see **P0-V1**. P0-3's mechanism is present but has **zero tests** and introduced a new concurrency hazard (V-P2-8, V-P2-10). The commit's P0-1b claim was factually false — that code never ran. |
| #180 `57b2efaf` | ⚠️ **Partial** | Real: the `test-rest` deny-list job enumerates 81 previously-unrun suites and is in the build gate's `needs`. Hole: its own guard (`ci-test-coverage.test.ts:120`) proves files are *enumerated*, never that a test inside them *executes* — so the three `REAL_DB_URL` suites still run nowhere (V-P2-35). |
| #181 `6d9b97b7` | ✅ **Holds** | Verified at both layers, including the write path (flat-in/flat-out through `savedSearchFiltersWriteSchema`), the single `triggerInstantAlerts` call site, antimeridian split and null-island guard. Two residuals: a saved search with no stored viewport is still deliberately unscoped, and the 1000-id cap truncates to the newest while `lastAlertAt` advances unconditionally. |
| #182 `45b689ef` | ✅ **Holds — best fix in the batch** | Auth runs *before* the lane is claimed; the claim is one atomic `INSERT … ON CONFLICT … WHERE last_run_at < $4`; the migration ships `TIMESTAMPTZ(3)` with real rollback notes; and `cron-run-claim.test.ts` executes the actual migration file under PGlite. Residual: a broken `cron_runs` table degrades to `claim_failed` while the route still returns `success: true`. |
| #183 `e05906e2` | ✅ **Holds** | `warning_closed` → WON, everything else falls through to the REVOKED path; the WON branch really does restore a FROZEN grant; the raw Stripe status is preserved on both the dispute row and the audit detail. Confirmed `warning_closed` is a live literal in `stripe@22.1.0`. |
| #184 `6b6367c8` | ⚠️ **Fixed the reported defect, opened P0-V1** | The href half is genuinely fixed — `buildAppHref` passes absolute `http(s)` through byte-for-byte, refuses other schemes, and the new `email-templates.test.ts` is RED against the old helper. Email verification is now reachable end to end. But the `linkAccount` rewrite dropped the email comparison — see **P0-V1** — and two follow-ups remain (V-P3-*: plaintext part still link-less, pre-#184 Google rows never backfilled). |

---

## 🟨 P2 — 35 open

All re-verified against current source. `⚠` marks a claim the verification pass had to correct or narrow.

### Auth & session

**V-P2-1. ⚠ checkSuspension's getToken() reads the non-__Secure- cookie name, so the proxy's live suspension check never fires over HTTPS**  
<sub>was `0803-P2-1` · `src/lib/auth-helpers.ts:197`, `src/auth.ts`</sub>

src/lib/auth-helpers.ts:197 is unchanged: `token = await getToken({ req: request, secret });` — no
`secureCookie`, no `cookieName`. node_modules/.pnpm/@auth+core@0.41.3/.../jwt.js:85 defaults `cookieName =
defaultCookies(secureCookie ?? false).sessionToken.name` → `authjs.session-token` (lib/utils/cookie.js:44-46),
while lib/init.js:69 writes `__Secure-authjs.session-token` whenever `url.protocol === "https:"`; src/auth.ts
sets neither `useSecureCookies` nor `cookies`. So `!token` short-circuits at src/lib/auth-helpers.ts:215-217
before the fast path (:225), `getLiveSuspensionStatus` (:239) and the password-revocation redirect (:248-252).
`git log -S'secureCookie' -- src/` returns nothing, i.e. no fix ever landed. OVERSTATED because password
revocation is independently enforced in the jwt callback (src/auth.ts:199-216 runs on every session read) and
every mutating surface does its own live checkSuspension; residual impact is read-only access to one's own
private pages until the 14-day JWT expires.

*Fix:* Pass `secureCookie: request.headers.get("x-forwarded-proto") === "https"` (or the nextUrl protocol) to
getToken, and add a NextRequest test carrying only `__Secure-authjs.session-token`. Also update
tests/e2e/helpers/session-expiry-helpers.ts, which hardcodes the insecure name.

**V-P2-2. ⚠ Self-service password change revokes the acting session: passwordChangedAt is set to now while the token's authTime is never re-stamped**  
<sub>was `0803-P2-2` · `src/app/actions/settings.ts:211`, `src/lib/password-security.ts:16`</sub>

src/app/actions/settings.ts:211-224 still does `const passwordUpdate = await
preparePasswordUpdate(newPassword)` → src/lib/password-security.ts:16-19 `passwordChangedAt: new Date()` →
`updateUserPassword(tx, session.user.id, passwordUpdate)` and returns `{ success: true }` with no session re-
issue. `token.authTime` is stamped only on initial sign-in (src/auth.ts:159-161, comment "Set ONLY on initial
sign-in, never updated during refreshes"), so getPasswordRevocationState returns "revoked" and the session
callback blanks the user (src/auth.ts:131-134). Client confirms no re-auth:
src/app/settings/SettingsClient.tsx:110-121 only calls setPasswordSuccess/clears the form (the `signOut` calls
at :135 and :140 belong to handleDeleteAccount). OVERSTATED on impact: the codebase has a deliberate
`reason=password_changed` 401/redirect path (buildPasswordChangedRedirectResponse, src/lib/auth-
helpers.ts:230/251), so 'in-flight drafts are lost' does not follow.

*Fix:* Exclude the initiating session — re-stamp authTime after a successful self-change (or give each JWT a session
id with a revokedBefore marker) and surface a 'please sign in again' banner. Add a test asserting valid-for-
actor / revoked-for-older-session.

**V-P2-3. ⚠ isSuspended is copied into the JWT at sign-in and never refreshed, so token-trusting pages honour a stale flag for up to 14 days**  
<sub>was `0803-P2-3` · `src/auth.ts:166`, `src/app/messages/[id]/page.tsx:31`</sub>

src/auth.ts:166 still gates the DB refresh: `if (trigger === "signIn" || trigger === "update" || account) {` —
a plain auth() read passes neither, and `updateAge: 24*60*60` (src/auth.ts:57) re-signs without re-entering
it, while the password check at src/auth.ts:199-216 deliberately runs live on every round-trip. Consumers of
the frozen flag remain: src/app/messages/[id]/page.tsx:31 `if (session.user.isSuspended) { redirect("/"); }`
and src/app/messages/page.tsx:21. OVERSTATED: the list page is safe in practice because
src/app/actions/chat.ts:517-524 `getConversations` does a live `checkSuspension` and returns [] — the
confirmed exposure is a suspended user opening a conversation URL directly and reading that thread.

*Fix:* Either re-read isSuspended on every jwt round-trip (reuse getLiveSuspensionStatus's 5-minute cache) or make
src/app/messages/[id]/page.tsx call checkSuspension(session.user.id) instead of trusting the token.

### Trust & safety

**V-P2-4. /users/[id] renders a suspended host's profile, reviews and listing cards to the public with no isSuspended gate**  
<sub>was `R2-FE-2-domain-rules` · `src/app/users/[id]/page.tsx:62`, `src/lib/listings/public-contact-contract.ts:103`</sub>

src/app/users/[id]/page.tsx:62-114 selects the user with no isSuspended field and no suspension branch; the
only gate after `if (!user) notFound()` (line 116) is per-listing
`resolvePublicListingVisibilityState(listing).isPubliclyVisible` (line 126-129), which takes listing
status/availability only (src/lib/listings/public-contact-contract.ts:103-143 — no owner input).
src/app/actions/admin.ts:212-219 `suspendUser` only does `prisma.user.update({data:{isSuspended: suspend}})` +
`restoreConsumptionsForHostBan`, so the host's listings stay ACTIVE and keep rendering as cards.
src/app/robots.ts:11-22 does not disallow /users/, and generateMetadata sets a canonical (`alternates: {
canonical: \`/users/${id}\` }`, page.tsx:45-47) with no noindex — so the page is crawlable. git log on the
page shows no change since cc49034e (pre-report).

*Fix:* Add an owner-suspension gate to /users/[id] (notFound() for non-admin/non-self viewers when the profile owner
is suspended), ideally via a shared server helper rather than a raw select field. Note the cards already dead-
end: /listings/[id] 404s for suspended owners (see R2-FE-3 evidence), so the profile page currently advertises
links that cannot resolve.

**V-P2-5. Search-alert emails have no owner-suspension gate and link to listing pages that 404 for suspended hosts**  
<sub>was `R2-FE-3-domain-rules` · `src/lib/search-alerts.ts:144`, `src/lib/listings/public-detail.ts:95`</sub>

Half 1 — no gate: src/lib/search-alerts.ts:144-157 `ALERT_LISTING_SELECT` selects `ownerId` but never
`owner`/`isSuspended` (grep for "owner|Suspend" in that 1304-line file returns only line 146 `ownerId: true`).
The match query is `whereClause: Prisma.ListingWhereInput = { status: "ACTIVE", ... }` (line 833-834) with no
owner filter, and both eligibility checks — `isDeliverableAlertListing` (line 171-173) used by
`findDeliverableAlertListings` (line 235-240), and the delivery-time re-check at line 578-604 — call only
`resolvePublicListingVisibilityState(listing)`, which has no owner input (public-contact-contract.ts:103-143).
Half 2 — the link 404s: the email sets `notificationLink = \`/listings/${delivery.targetListingId}\`` (search-
alerts.ts:607), and src/lib/listings/public-detail.ts:95-97 does `if (listing.owner.isSuspended && !isOwner &&
!isAdmin) return null;` which src/app/listings/[id]/page.tsx:195-197 turns into `notFound()`. Latest commit
touching search-alerts.ts is 6d9b97b7 (#181, geo scope) — no suspension work.

*Fix:* Add `owner: { isSuspended: false }` to the alert match where-clause and select owner.isSuspended into
ALERT_LISTING_SELECT so the delivery-time re-check drops the delivery as TARGET_NOT_PUBLIC; alternatively make
suspendUser cascade to the listings' public state so all read paths converge.

**V-P2-6. Fair Housing gate on /api/chat screens only the last user message while forwarding the entire client-supplied array to the LLM**  
<sub>was `R2-FE-1-domain-rules` · `src/app/api/chat/route.ts:342`</sub>

src/app/api/chat/route.ts:342-347 takes only the last user message (`messages.slice().reverse().find(m =>
m.role === "user")`) and line 349-363 runs `checkFairHousingPolicy(userText)` on that single string; line 366
then does `convertToSimpleMessages(messages)` on the FULL array and line 399-406 passes `messages:
simpleMessages` to `streamText`. The whole array is client-controlled and only shape-validated:
validateChatPayload (line 104-166) caps count/length and allows roles user+assistant, but performs no policy
screening on earlier user turns and none at all on assistant turns. So appending one benign trailing user
message bypasses the gate entirely, and forged assistant turns are never screened. No fix has landed — latest
commits touching route.ts/fair-housing-policy.ts are 25c33a50 and 7783cf41, both predating the report.

*Fix:* Screen every user-role part in the array (and ideally reject/ignore client-supplied assistant turns or screen
them too) before the model call.

**V-P2-7. Semantic search still bypasses the owner-suspension gate (SQL fn has no User join; service re-check omits owner) — distinct surface, shared root cause with FE-2/FE-3**  
<sub>was `0803-P2-5` · `prisma/migrations/20260515000000_embedding_ga_version_isolation/migration.sql:86`, `src/lib/search/search-v2-service.ts:274`</sub>

Unchanged since the report.
prisma/migrations/20260515000000_embedding_ga_version_isolation/migration.sql:86-113 — the `filtered` CTE is
`FROM listing_search_docs sd WHERE sd.status = 'ACTIVE' AND ...` with no Listing/User join (this is the newest
of the 3 migrations defining search_listings_semantic). src/lib/search/search-v2-service.ts:274-288 re-selects
only listing columns (`id,status,statusReason,totalSlots,availableSlots,openSlots,moveInDate,availableUntil,mi
nStayMonths,lastConfirmedAt`) with no `owner`, and the filter at :328-333 calls
`isListingEligibleForPublicSearch({ statusReason, resolvedAvailability })`. Grep confirms `isSuspended`
appears in the search layer only at search-doc-queries.ts:847/1459 and projection-search.ts:87. Severity re-
rated to P3 because the path is latent: features.semanticSearch requires an explicit `ENABLE_SEMANTIC_SEARCH
=== "true"` (src/lib/env.ts:895-899) and .env.example:264 ships it commented/false — it becomes P2 the moment
the flag is enabled. OVERLAP VERDICT: distinct surfaces, one shared root cause. There is no central "owner
suspended ⇒ content hidden" invariant — each surface re-implements it, and src/app/actions/admin.ts:212-219
never propagates a ban to Listing.status or to listing_search_docs. Exactly one surface (listing detail,
src/lib/listings/public-detail.ts:95) and the two SQL search paths enforce it; /users/[id] (FE-2), the alert
pipeline (FE-3) and semantic search (P2-5) each miss it independently. Fixing any one…

*Fix:* Add the User join + `u."isSuspended" = FALSE` to the semantic SQL `filtered` CTE and/or select
`owner:{select:{isSuspended:true}}` in resolveEligibleSemanticItems; have suspendUser mark the host's listings
dirty so the read model converges.

### Payments

**V-P2-8. The after() fulfillment fix introduced concurrent SERIALIZABLE processing of sibling Stripe events; the loser aborts and waits for the next drain**  
<sub>was `R2-FL-2` · `src/app/api/stripe/webhook/route.ts:156`</sub>

Confirmed present and unmitigated. Every unprocessed POST schedules its own tick
(src/app/api/stripe/webhook/route.ts:156-162), and the claim query uses FOR UPDATE SKIP LOCKED
(drain.ts:143-157), so two near-simultaneous deliveries for one purchase claim disjoint rows and process them
in parallel. Nothing serializes siblings: the advisory lock in processCapturedStripeEvent is keyed per
StripeEvent ROW — `pg_advisory_xact_lock(hashtext('payment-webhook-row:' + stripeEventRowId))` (webhook-
worker.ts:549-551) — so checkout.session.completed and payment_intent.succeeded take different keys while both
write the same Payment row (upsertPaymentFromCheckoutSession :143-156 / upsertPaymentFromIntent :206-218, both
@unique on stripePaymentIntentId). Under withActor's SERIALIZABLE tx (drain.ts:212-217) the loser fails (40001
or P2002), the handler converts it to transient_error (handlers.ts:571-576), and drain.ts:243-266 reschedules
it `nextAttemptAt = now + retryDelayMs(attemptCount)` (~30-60s, drain.ts:73-79). Nothing then drains it until
another Stripe event arrives or the 09:02 UTC cron runs, so the delayed lane can persist for up to a day.

*Fix:* Serialize siblings on the purchase, not the event row — e.g. take an advisory lock keyed on the payment intent
/ checkout session as the transaction's first statement, or process PAYMENT_WEBHOOK rows for one aggregate
under a single claim. Note the verifier's caveat: a second pg_advisory_xact_lock inside the same tx cannot
prevent the abort, because withActor issues SELECT set_config(...) first (with-actor.ts) and the snapshot is
already established.

**V-P2-9. ⚠ payment_intent.succeeded resolves its Payment row by recency, so it can attach the intent to the wrong pending row and P2002 the sibling checkout.session.completed**  
<sub>was `0803-P2-11` · `src/lib/payments/webhook-worker.ts:63`, `prisma/schema.prisma.`</sub>

Unchanged. src/lib/payments/webhook-worker.ts:63-76 still does `client.payment.findFirst({ where: { userId,
productCode, stripePaymentIntentId: null }, orderBy: { createdAt: "desc" } })`, called as the fallback from
upsertPaymentFromIntent at :176; upsertPaymentFromIntent's data object (:185-200) writes
`stripePaymentIntentId` but never `stripeCheckoutSessionId`. The sibling upsertPaymentFromCheckoutSession
still resolves with an unordered `findFirst({ where: { OR: [ {stripeCheckoutSessionId},
{stripePaymentIntentId} ] } })` (:93-118). Both columns remain @unique in prisma/schema.prisma. The report's
own adversarial note is the accurate one: the fallback picks the NEWEST pending row, which is normally the
session the user was just redirected to, so mis-attachment needs an older-session payment plus a specific
drain order, and the grant is still created — the damage is a stuck success page plus a DLQ'd event. The
inline after() drain (P0-3 fix) makes the two-events-in-flight window more likely, not less.

*Fix:* Resolve the payment by session identity (match on stripeCheckoutSessionId from intent metadata / expanded
intent), or bail out when more than one pending candidate matches; and give upsertPaymentFromCheckoutSession a
deterministic session-id-first lookup.

**V-P2-10. #178's P0-3 inline Stripe fulfilment has no test at all — the route test only mocks after() to run, and drain's new kinds allowlist is untested**  
<sub>was `NEW-stripe-drain-untested` · `src/__tests__/api/stripe-webhook-route.test.ts`, `src/__tests__/lib/outbox/drain.test.ts`</sub>

The entire #178 change to src/__tests__/api/stripe-webhook-route.test.ts is a 5-line `after: (fn) => { void
fn(); }` mock at line 2-5. `grep -n 'drain' src/__tests__/api/stripe-webhook-route.test.ts` finds no reference
to drainOutboxOnce: nothing asserts the kick happens for a captured-but-unprocessed event, nothing asserts it
is skipped on `alreadyProcessed`, and nothing asserts the `kinds: ["PAYMENT_WEBHOOK"]` scoping that is the
whole reason the drain is safe to run with phase02 off. Separately, `grep -n 'kinds:'
src/__tests__/lib/outbox/drain.test.ts` returns nothing — the allowlist branch at drain.ts:99-106 has no
coverage either. The money path's newest behaviour is therefore asserted only by the commit message.

*Fix:* Add route tests for (a) drain called once with kinds:[PAYMENT_WEBHOOK] on a fresh event, (b) not called on
alreadyProcessed, (c) a throwing drain still returns 200; add a drain.test.ts case proving `kinds` excludes
the complement of HANDLERS.

### Rate limiting & server surface

**V-P2-11. The `${ip}:${userId}` composite rate-limit key is systemic — 22 occurrences today, incl. messaging anti-spam and account-security caps**  
<sub>was `R2-MS-2` · `src/app/actions/chat.ts:127`, `src/app/actions/settings.ts:176`</sub>

I counted them: `grep -rn '\${ip}:\${' src --include=*.ts --include=*.tsx | grep -v __tests__` returns exactly
22 lines today — the report's count of 22 is exact. Messaging: src/app/actions/chat.ts:127
(`"startConversation"`) and :467 (`"sendMessage"`). Account security: src/app/actions/settings.ts:176
`"changePassword"`, :251 `"verifyPassword"`, :324 `"deleteAccount"`. Plus phone-reveal (route.ts:35),
profile.ts:83, saved-listings.ts:36, notifications.ts:66/151, verification.ts:79/86 (two shared helpers
`checkActionRateLimit`/`checkAdminWriteRateLimit` with 6 call sites, so the effective endpoint count is higher
than 22), admin.ts:124/189/351/512/656/684/891/987, admin/verifications/[id]/documents/[kind]/route.ts:43, and
the shared helper src/lib/search-rate-limit-identifier.ts:16 (`return userId ? `${ip}:${userId}` : ip`). The
suggested fix pattern is already implemented twice in-repo: src/app/api/listings/route.ts:158-182 (IP bucket
then user bucket) and src/auth.ts:401/411 (`emailRl` + `ipRl` as two separate checks).

*Fix:* Split each load-bearing site into IP-keyed + account-keyed buckets. Triage note: the three settings.ts sites
are weaker than the report implies — `verifyPassword`/`changePassword`/`deleteAccount` all require the
victim's own session, so the composite key mostly costs self-DoS resistance, not attacker leverage. The real
leverage is on phone-reveal, chat.ts:127/467, saved-listings and notifications.

**V-P2-12. Phone-reveal rate limit keyed `${ip}:${userId}`, so the 10/hour per-account cap scales with the attacker's proxy pool**  
<sub>was `0803-P2-13` · `src/app/api/phone-reveal/route.ts:34`, `src/lib/rate-limit.ts:284`</sub>

src/app/api/phone-reveal/route.ts:34-38 still reads `const ip = getClientIPFromHeaders(request.headers)` then
`checkRateLimit(`${ip}:${session.user.id}`, "phoneReveal", RATE_LIMITS.phoneReveal)` — the only limiter in the
whole POST handler (lines 21-96; no second IP-independent per-user check). RATE_LIMITS.phoneReveal is still `{
limit: 10, windowMs: 60*60*1000 }` (src/lib/rate-limit.ts:284). The enabling premise holds:
`features.contactPaywall` is `phaseCutoverDefault(process.env.ENABLE_CONTACT_PAYWALL)`
(src/lib/env.ts:778-780) and `consumeContactEntitlement` still short-circuits to `source:
"ENFORCEMENT_DISABLED"` (src/lib/payments/contact-paywall.ts:495). The two-bucket precedent the report cites
is real and unchanged (`createBooking` / `createBookingByIp`, rate-limit.ts:302-303; /api/listings
route.ts:158-182 stacks an IP bucket then a user bucket). `git log -- src/app/api/phone-reveal/route.ts` shows
no commit since cc49034e (#114), i.e. nothing in #178-#184 touched it.

*Fix:* Split into two independent buckets — `checkRateLimit(session.user.id, "phoneReveal", …)` for the per-account
cap plus an IP-keyed `phoneRevealByIp` bucket — and require both to pass, mirroring
src/app/api/listings/route.ts:158-182.

**V-P2-13. createReviewResponse / deleteReviewResponse have neither a rate limit nor a suspension check**  
<sub>was `R2-MS-4` · `src/app/actions/review-response.ts`</sub>

src/app/actions/review-response.ts contains no `checkRateLimit`, no `checkSuspension`, and no
`checkEmailVerified` import at all — `createReviewResponse` (line 13) goes auth → zod → ownership check
(`review.listing.ownerId !== session.user.id`, line ~111) → write, and `deleteReviewResponse` (line 174) does
the same shape (ownership check at :208-213). Both are properly authorized, so this is not an authz hole. I am
rating it above the report's P3 because create sends an outbound email on every success
(`sendNotificationEmail("reviewResponse", review.author.email, …)`, lines 81-89) while the uniqueness guard is
only `existingResponse` (lines 59-65) — a listing owner can loop create → deleteReviewResponse → create
indefinitely and email-bomb a reviewer with zero rate limiting. A suspended host can also still delete
responses.

*Fix:* Add a `checkRateLimit` bucket (IP- and account-keyed) plus `checkSuspension` to both actions; the create
path's email send is the load-bearing one.

### Observability & email delivery

**V-P2-14. instrumentation.ts never exports onRequestError, so uncaught Server Component / route-handler errors never reach Sentry**  
<sub>was `R2-SC-2/OPS-2` · `instrumentation.ts`, `src/app/api`</sub>

instrumentation.ts (whole file, 38 lines) exports only `register()` — no `onRequestError`, and no top-level
`@sentry/nextjs` import, exactly as the report states. Repo-wide grep for
`onRequestError`/`captureRequestError` outside node_modules returns hits only in the two review docs. The
counts check out today: `find src/app/api -name route.ts | wc -l` = 61 and `grep -rl captureException
--include=route.ts src/app/api | wc -l` = 25. src/lib/api-error-handler.ts:38 does
`Sentry.captureException(sanitizeSentryException(error), sentryContext)` but zero route.ts files call it (grep
for handleApiError in src/app/api → 0), so it does not close the gap. Combined with P2-4, client-side error
boundaries (src/app/global-error.tsx:16) also report nothing.

*Fix:* `import * as Sentry from "@sentry/nextjs"; export const onRequestError = Sentry.captureRequestError;` in
instrumentation.ts.

**V-P2-15. Client-side Sentry never initializes: sentry.client.config.ts is bundled only by withSentryConfig, which is opt-in and never enabled**  
<sub>was `0803-P2-4` · `next.config.ts:306`, `instrumentation.ts`</sub>

next.config.ts:306-314 still gates the plugin: `const isSentryBuildPluginEnabled =
process.env.SENTRY_ENABLE_BUILD_PLUGIN === "1";` … `if (isSentryBuildPluginEnabled && hasSentryCredentials) {
const { withSentryConfig } = require("@sentry/nextjs"); }`. `ls instrumentation*.ts` returns only
instrumentation.ts — there is still no instrumentation-client.ts (repo root or src/). instrumentation.ts:15-34
imports only ./sentry.server.config and ./sentry.edge.config.
node_modules/@sentry/nextjs/build/cjs/config/webpack.js:542-547 confirms sentry.client.config.ts is discovered
only by the plugin's entry rewrite (and :330 warns it is deprecated in favor of instrumentation-client.ts). A
repo-wide grep for SENTRY_ENABLE_BUILD_PLUGIN outside node_modules hits only next.config.ts:307 and the review
docs, and docs/DEPLOYMENT.md:103-106 never tells operators to set it or SENTRY_ORG/SENTRY_PROJECT, so a docs-
following prod deploy gets no browser SDK at all. Knock-on: src/app/global-error.tsx:16
`Sentry.captureException(error, …)` is a no-op on an uninitialized client SDK. Last commits touching
next.config.ts/instrumentation.ts are b36862dc (#178) and b6161f16 — neither addressed this.

*Fix:* Add instrumentation-client.ts (or make SENTRY_ENABLE_BUILD_PLUGIN=1 + the three credentials mandatory and
asserted in CI); note build is `next build --webpack` (package.json:14) so the plugin path would still work if
enabled.

**V-P2-16. sendEmail returns {success:true} when RESEND_API_KEY is unset in every environment; alert deliveries are then marked permanently DELIVERED**  
<sub>was `R2-OPS-7` · `src/lib/email.ts:70`, `src/lib/search-alerts.ts:650`</sub>

src/lib/email.ts:70-74: `const RESEND_API_KEY = process.env.RESEND_API_KEY; if (!RESEND_API_KEY) {
console.warn("RESEND_API_KEY not configured. Email not sent:", { subject }); return { success: true }; //
Return success in dev mode }` — the guard has no NODE_ENV condition, so it fires identically in production.
The downstream consequence is real: src/lib/search-alerts.ts:650 only retries `if (!emailResult.success)`, and
on the success path :678-685 writes `status: "DELIVERED", deliveredAt: new Date(), lastError: null`, plus
:687-695 advances lastAlertAt/lastDeliveredAt — the delivery is never retried. Same fail-open silently affects
password-reset/verification mail, which surface no error to the user.

*Fix:* Gate the short-circuit on `process.env.NODE_ENV !== "production"` (or return success:false with an explicit
error in prod). Note the trigger is a misconfiguration, not the steady state — prod presumably has the key set
— which is why I rate this P2 rather than P1.

**V-P2-17. Outbox DLQ routing and projection SLA breaches only call Sentry.addBreadcrumb, which transmits nothing on its own**  
<sub>was `R2-OPS-4` · `src/lib/metrics/projection-lag.ts:82`</sub>

src/lib/metrics/projection-lag.ts:82-96 `recordDlqRouting` does `logger.sync.warn("outbox_dlq_routing", …)`
then `Sentry.addBreadcrumb({ category: "projection.dlq", … level: "error" })` and nothing else — no
captureMessage/captureException. Same shape for the two SLA breaches: :37-44 (`projection.lag`,
exceedsThreshold) and :66-73 (`projection.tombstone`). Breadcrumbs are only attached to a subsequently
captured event, so with no capture in these paths (and, per SC-2, no onRequestError to capture anything
nearby) a DLQ routing or SLA breach produces zero Sentry signal. Grep for addBreadcrumb across src/ confirms
the only other users are embeddings (gemini.ts, sync.ts) and useFacets.ts.

*Fix:* Promote recordDlqRouting (and the two exceedsThreshold branches) to Sentry.captureMessage at warning/error
level.

**V-P2-18. ⚠ Raw Resend API error bodies are console.error'd in sendEmail, bypassing logger/redactSensitive**  
<sub>was `0803-P2-12` · `src/lib/email.ts:122`, `src/lib/logger.ts`</sub>

src/lib/email.ts:122 `const errorText = await response.text();` then :126 `console.error("Failed to send email
(non-retryable):", errorText);`, :141 `console.error("Failed to send email:", errorText);`, :163
`console.error("Error sending email:", error);`, :183 `console.error("Unexpected error in sendEmail:",
error);`, :203 `console.error(\`Error sending ${type} email:\`, error);` — all bare console, none routed
through logger (src/lib/logger.ts is the only redaction seam). FROM_EMAIL still defaults to `"RoomShare
<onboarding@resend.dev>"` (src/lib/email.ts:60-61). No `no-console` rule exists in eslint.config.mjs, and no
global console patch exists outside tests (only src/__tests__/api/nearby/* reassign console.error). `git log
-- src/lib/email.ts` shows nothing since a26e8bc7 (#109), so none of #178-#184 touched it.

*Fix:* Route the five console.error sites through logger.sync.error with a sanitized error field. Accuracy note: the
mechanism claim is exactly right, but the Impact paragraph's 'every failed email writes a raw user address to
logs' is speculative — whether PII appears depends on what Resend echoes; the common 422 body does not contain
the recipient.

### Search, map & cost

**V-P2-19. POST /api/nearby proxies the paid Radar API unauthenticated with no spend ceiling**  
<sub>was `R2-MS-3` · `src/app/api/nearby/route.ts:197`, `src/lib/rate-limit.ts:266`</sub>

src/app/api/nearby/route.ts:197-213: the POST handler's only gate is `withRateLimit(request, { type:
"nearbySearch" })` followed by the RADAR_SECRET_KEY presence check — there is no `auth()` call anywhere in the
file, and no isProviderMonthlyCapReached / recordGeocodingProviderUsage (grep for monthlyCap in the file
returns nothing). src/lib/rate-limit.ts:266 `nearbySearch: { limit: 30, windowMs: 60 * 1000 }` → 43,200
upstream calls/day per source IP, matching the report's number. Each request issues one billed Radar call
(api.radar.io/v1/search/places at :407-448, or /search/autocomplete at :251-264). Radar is the only paid
provider outside provider-cost-controls' GeocodingProvider union (src/lib/geocoding/provider-cost-
controls.ts:13-19).

*Fix:* Add a Redis-backed monthly cap for Radar and consider requiring a session (or a per-listing token) for the
proxy. Whether the key is provisioned in the Vercel production env is not verifiable from source —
RADAR_SECRET_KEY is set in the local .env and uncommented in .env.example:202, and the route 503s when it is
absent.

**V-P2-20. HNSW vector indexes unusable by search_listings_semantic because the `filtered` CTE is referenced twice and therefore materialized**  
<sub>was `0803-P2-7` · `prisma/migrations/20260515000000_embedding_ga_version_isolation/migration.sql:87`</sub>

Unchanged in the only live definition.
prisma/migrations/20260515000000_embedding_ga_version_isolation/migration.sql:87 `filtered AS (` carries no
MATERIALIZED/NOT MATERIALIZED hint and is read twice — :114-121 `semantic_results AS (... FROM filtered f
ORDER BY f.embedding <=> query_embedding LIMIT (match_count + result_offset) * 3)` and :122-135
`keyword_results AS (... FROM filtered f ...)`. With two references PostgreSQL 12+ materializes the CTE, so
the ANN ordering runs over a tuplestore and no HNSW index scan is possible. No later migration redefines the
function (only 20260314000000 / 20260314200000 / 20260515000000 mention search_listings_semantic).

*Fix:* Give semantic_results its own SELECT ... FROM listing_search_docs with the same predicates (or an explicit NOT
MATERIALIZED), and add an EXPLAIN-based regression test.

**V-P2-21. Phase-04 projection search filters geography with a regex + split_part over unindexed TEXT and runs with no statement timeout**  
<sub>was `0803-P2-8` · `src/lib/search/projection-search.ts:542`</sub>

Unchanged (last touch of the file is 04d283f4, before this review). src/lib/search/projection-
search.ts:542-545 still builds `const cellExpr = "COALESCE(isp.public_cell_id, upp.public_cell_id)"` and
`(CASE WHEN ${cellExpr} ~ '^-?[0-9]+(\.[0-9]+)?,...' THEN split_part(${cellExpr}, ',', 1)::DOUBLE PRECISION
END)` used in the BETWEEN bounds predicate — fully non-sargable. public_cell_id is plain TEXT
(20260502000000/migration.sql:27, 20260504000000/migration.sql:24) and a grep of every migration for an index
on public_cell_id/public_point returns nothing. No cancellation: grep for `timeout` in projection-search.ts
returns zero hits, and both queries go through `rawSql.$queryRawUnsafe` at :612 and :662.

*Fix:* Store the public point as geography(Point,4326) with a GIST index (or add indexed public_lat/public_lng
columns) and route both raw queries through queryWithTimeout. Impact is scoped to cutover — env.ts:848-849
phase04ProjectionReads uses phaseCutoverDefault, which returns false in production (env.ts:614-617).

**V-P2-22. Semantic eligible-page walk is unbounded in candidate count (quadratic work) and re-filters an SQL-expressible predicate in JavaScript**  
<sub>was `0803-P2-14` · `src/lib/search/search-v2-service.ts:362`</sub>

src/lib/search/search-v2-service.ts:362-402: `while (eligibleItems.length < requiredEligibleCount)` still
exits only on semanticRows===null (:372), an empty batch (:378), or an all-duplicate batch (:393) — never when
a batch contributes zero *eligible* items — and `rawOffset += rawBatchSize` at :401. The caller still passes
`minAvailableSlots: 0` (:366), so the SQL gate `sd.available_slots >= COALESCE(filter_min_available_slots, 1)`
(migration 20260515000000:112) degenerates and the real gate runs in JS via resolveEligibleSemanticItems →
isListingEligibleForPublicSearch (:328-336), which enforces ACTIVE + 21-day freshness (public-
availability.ts:252-263). SEMANTIC_ELIGIBLE_MAX_PAGE=20 (:344,351) bounds the page requested, not the walk
width. The SQL candidate CTEs remain `LIMIT (match_count + result_offset) * 3`, so per-pass cost grows with
rawOffset.

*Fix:* Break after N consecutive zero-eligible batches and push freshness/openSlots into the `filtered` CTE so the
SQL LIMIT counts eligible rows.

**V-P2-23. /api/messages rate limiting is Postgres-backed, costing many DB round trips per 3s poll while search/chat use Redis**  
<sub>was `R2-PERF-2` · `src/app/api/messages/route.ts:88`, `src/lib/with-rate-limit.ts:52`</sub>

Every /api/messages request runs at least two rate-limit checks through the Postgres limiter:
src/app/api/messages/route.ts:88-93 `withRateLimit(request, { type: "messagesPreAuth" })` then a typed
applyMessageRateLimit (:52-68, called at :115/:143/:185/:223/:312/:347). withRateLimit delegates to
checkRateLimit (src/lib/with-rate-limit.ts:52), which per call does `prisma.rateLimitEntry.deleteMany` (rate-
limit.ts:121-127) plus a raw UPDATE…RETURNING (:134-144) plus follow-up create/read on miss — on top of auth()
session lookup, checkSuspension and the message query itself. The client polls every 3s:
src/components/MessagesPageClient.tsx:510-512 `pollInterval = setInterval(() => { void
fetchMessages(lastMsgIdRef.current); }, 3000);`. Redis limiters exist and are used elsewhere (src/lib/rate-
limit-redis.ts, e.g. checkMetricsRateLimit in the web-vitals route).

*Fix:* Move the messaging limiters to the Redis path, and/or collapse the pre-auth + typed checks into one.

**V-P2-24. robots.txt advertises /sitemap.xml, a URL the build never emits; the sitemap route is force-dynamic, 3 queries, up to 5000 rows, unrate-limited**  
<sub>was `R2-PERF-4` · `src/app/robots.ts:25`, `src/app/sitemap.ts:18`</sub>

src/app/robots.ts:25 `sitemap: \`${baseUrl}/sitemap.xml\``, but because src/app/sitemap.ts:18 exports
generateSitemaps(), Next emits only the id-scoped route — the built manifest contains exactly
`"/sitemap/[__metadata_id__]/route"` and no /sitemap.xml entry (.next/server/app-paths-manifest.json), and no
rewrite exists (grep for sitemap in next.config.ts and src/proxy.ts returns nothing). The route itself is
src/app/sitemap.ts:4 `export const dynamic = "force-dynamic"` and each id runs listing.count (:64) +
listing.findMany take up to URLS_PER_SITEMAP=5000 (:74-81) + user.findMany (:96-101), with no caching and no
rate limit.

*Fix:* Point robots at /sitemap/0.xml (or a sitemap index), and cache/revalidate the sitemap route instead of force-
dynamic.

### Frontend correctness

**V-P2-25. ⚠ MessagesPageClient handleSend/handleRetry await the sendMessage server action with no try/catch, so a rejected action loses the typed text and leaves a permanent "sending"…**  
<sub>was `0803-P2-10` · `src/components/MessagesPageClient.tsx:601`, `src/components/messages/MessageComposer.tsx:48`</sub>

src/components/MessagesPageClient.tsx:601-692: `setInput("")` at :621, optimistic bubble pushed at :638, then
`const result = await sendMessage(activeId, content);` at :640 with no enclosing try/catch (the whole function
body is unguarded). handleRetry is identical — it clears `failed` at :698-702 then `await sendMessage(...)` at
:704 unguarded, so a rejection leaves the bubble permanently in the spinner state. The composer config at
:1180-1189 passes only `submitDisabled: isOffline` and no `isSending`, unlike ChatWindow. The duplicate-send
half of the claim is REFUTED: src/components/messages/MessageComposer.tsx:48-53 computes `submitDisabled =
disabled || isSending || submitDisabledProp || trimmedLength === 0 || isOverLimit` and :72-74
`submitIfAllowed` gates on it, so the cleared input disables Send immediately. The "server action 500s" path
is also mostly refuted — src/app/actions/chat.ts wraps everything after auth() and returns `{error}`, which
:643-657 does handle. Real trigger is narrowed to a transport-level rejection or auth() throwing.

*Fix:* Wrap both handleSend and handleRetry in try/catch mirroring src/app/messages/[id]/ChatWindow.tsx (mark
optimistic message failed:true + toast), add an isSending state cleared in finally and pass it to the
composer.

**V-P2-26. Create-listing draft including the exact street address persists in localStorage under a global, non-user-scoped key for 24h and survives sign-out**  
<sub>was `R2-FE-5-react-nextjs` · `src/app/listings/create/CreateListingForm.tsx:124`, `src/hooks/useFormPersistence.ts:28`</sub>

src/app/listings/create/CreateListingForm.tsx:124 `const FORM_STORAGE_KEY = "listing-draft";` — a fixed global
string with no user id — passed at :245 `useFormPersistence<ListingFormData>({ key: FORM_STORAGE_KEY })`. The
persisted shape includes the exact address: `interface ListingFormData { … address: string; city: string;
state: string; zip: string; … }` (:103-122), and the autosave effect writes `saveData(collectFormData())` on
every field change (:416-430). src/hooks/useFormPersistence.ts:28 `const DEFAULT_EXPIRATION_MS = 24 * 60 * 60
* 1000;` with `localStorage.setItem(key, JSON.stringify(persistData))` (:110) and expiry-only invalidation on
mount (:71-80). No sign-out path clears it — the three `signOut({ callbackUrl: "/" })` call sites
(NavbarClient.tsx:698, :833; UserMenu.tsx:106; SearchHeaderWrapper.tsx:485) do no localStorage cleanup. Last
touch of useFormPersistence.ts is 7783cf41 (2026-03-21), well before the report.

*Fix:* Scope the key to the session user id (e.g. `listing-draft:${userId}`) and clear it on sign-out; consider
excluding the street address from the persisted payload.

**V-P2-27. Notification mark-read / mark-all-read / delete ignore the server action's error result and optimistically report success on failure**  
<sub>was `R2-A11Y-5` · `src/app/notifications/NotificationsClient.tsx:128`, `src/app/actions/notifications.ts:144`</sub>

src/app/notifications/NotificationsClient.tsx:128-143 — `handleMarkAsRead` does `await
markNotificationAsRead(notificationId);` then unconditionally `setNotifications(… read: true …)`;
`handleMarkAllAsRead` (:135-138) and `handleDelete` (:140-143) are the same shape: the return value is never
inspected. Those actions really do return failures as values rather than throwing:
src/app/actions/notifications.ts:144 `return { error: "Unauthorized", code: "SESSION_EXPIRED" }`, :155 `if
(!rl.success) return { error: "Too many attempts. Please wait." }`, :175 `return { error: "Failed to mark
notification as read" }`, and :226 the same for deleteNotification. So on rate-limit, expired session or DB
error the row visibly disappears / turns read while the server state is unchanged, and it reappears on reload.
`handleDeleteAll` right below (:159-175) shows the correct pattern (`if ("error" in result) console.error…`),
proving the omission is inconsistent rather than intentional. File unchanged since a26e8bc7 (2026-04-24).

*Fix:* Inspect the returned result in all three handlers: only mutate local state on success, toast on `error`, and
route SESSION_EXPIRED to login like the messaging surfaces do.

### Accessibility

**V-P2-28. axe rule `color-contrast` is disabled in every axe scan in the repo; the shared search-input placeholder is 2.50:1 (2.03:1 focused)**  
<sub>was `R2-A11Y-2` · `tests/e2e/helpers/test-utils.ts:123`, `tests/e2e/helpers/a11y-helpers.ts:133`</sub>

tests/e2e/helpers/test-utils.ts:123 `knownExclusions: ["color-contrast", "aria-prohibited-attr"] as const`,
consumed by every axe consumer: tests/e2e/helpers/a11y-helpers.ts:133 (filterViolations),
tests/e2e/nearby/nearby-a11y.spec.ts:30 `.disableRules([...A11Y_CONFIG.knownExclusions])`,
tests/e2e/profile/profile-edit.spec.ts:230, tests/e2e/messaging/messaging-a11y.spec.ts:75,106,
tests/e2e/settings/settings.spec.ts:182-183; the two files that don't import it hard-code the same exclusion —
tests/e2e/journeys/a11y-audit.anon.spec.ts:20 and tests/e2e/create-listing/create-listing.a11y.spec.ts:50
`const EXCLUDED_RULES = ["color-contrast", "select-name"]`. That is all 6 AxeBuilder call sites in the repo.
Contrast reproduced exactly from resolved tokens: src/components/search/SearchBar/SearchBarField.tsx:18
`placeholder:text-on-surface-variant/50 ... focus:placeholder:text-on-surface-variant/40`;
src/app/globals.css:25 `--color-on-surface-variant: #4a4941` over the pill background src/app/globals.css:13
`--color-surface-container-lowest: #ffffff` (SearchBar.tsx:156 / SearchBarField.tsx:91,97 use bg-surface-
container-lowest). 50% blend = rgb(164.5,164,160), L=0.3701 → 1.05/0.4201 = 2.50:1; 40% blend =
rgb(182.6,182.2,179), L=0.4682 → 1.05/0.5182 = 2.03:1. Both below the 4.5:1 AA threshold.

*Fix:* Raise the placeholder alpha (≈/80 of #4a4941 on white gives ~4.6:1) or use a dedicated token, then remove
"color-contrast" from A11Y_CONFIG.knownExclusions and the two hard-coded lists so regressions are caught.
Mitigating context: each field also carries a visible full-opacity <label> (SearchBarField.tsx:103-105), so
the placeholder is supplementary — hence P2, not P1.

**V-P2-29. Two icon-only buttons on /profile/edit have no accessible name; the axe test hides them with CSS-selector excludes instead of fixing them**  
<sub>was `R2-A11Y-3` · `tests/e2e/profile/profile-edit.spec.ts:225`, `src/app/profile/edit/EditProfileClient.tsx:256`</sub>

tests/e2e/profile/profile-edit.spec.ts:225-229 — `// Exclude known unlabelled buttons in EditProfileClient: -
Photo upload overlay button ... - Language tag remove buttons` then `.exclude(".group-
hover\\:opacity-100").exclude(".hover\\:text-red-500")`. Both buttons are still unlabelled today:
src/app/profile/edit/EditProfileClient.tsx:256-267 photo-upload `<button type="button" onClick={() =>
fileInputRef.current?.click()} ... className="... group-hover:opacity-100 ...">` containing only a `<Camera/>`
icon, and src/app/profile/edit/EditProfileClient.tsx:427-433 `<button type="button" onClick={() =>
handleRemoveLanguage(lang)} className="text-on-surface-variant hover:text-red-500 ..."><X className="w-3 h-3"
/></button>` — neither has aria-label/title/sr-only text (contrast with line 462 which does: `aria-label="Add
a language"`). WCAG 4.1.2 button-name, axe impact serious.

*Fix:* Add `aria-label="Upload profile photo"` and `aria-label={`Remove ${lang}`}`, then delete the two `.exclude()`
calls from PE-14 so the scan actually covers them.

**V-P2-30. ⚠ Bare `m` shortcut bound at window across the whole /search layout fires whenever focus is on any non-input element, including Radix Select triggers/options**  
<sub>was `R2-A11Y-4` · `src/components/SearchLayoutView.tsx:45`, `src/app/search/layout.tsx:83`</sub>

src/components/SearchLayoutView.tsx:45-54 registers `{ key: "m", preventInInput: true, action: () => { if
(canShowMap) toggleMap(); } }`, and src/app/search/layout.tsx:83 wraps all of /search in `<SearchLayoutView>`.
The guard is too narrow: src/hooks/useKeyboardShortcuts.ts:53-67 `isInputElement` returns true only for
`input|textarea|select` tags and `contenteditable="true"` — a Radix Select trigger is a `<button
role="combobox">` and its open items are divs with role="option", so both fall through, and the handler runs
`event.preventDefault(); event.stopPropagation();` (lines 130-131) on a window bubble-phase listener (line
140). Radix Selects are present on /search via src/components/SortSelect.tsx:204 and
src/components/search/FilterModal.tsx:304,332,586,619. NUANCE THE REPORT GETS WRONG: because the listener is
on `window` at the bubble phase, Radix's own handlers fire first — typeahead is not blocked; the observable
defect is the map view toggling underneath the user while they type-ahead in a select (or press `m` on any
focused button/link).

*Fix:* Require a modifier, or widen the guard to skip when `document.activeElement` matches `[role="combobox"],
[role="option"], [role="listbox"], [role="menuitem"]` / lives inside an open dialog or popper, and drop the
unconditional preventDefault/stopPropagation.

**V-P2-31. Navbar notification dropdown: no Escape handler, no aria-expanded/haspopup, no dialog or menu role, no focus management**  
<sub>was `R2-A11Y-6` · `src/components/NotificationCenter.tsx:143`, `src/components/NavbarClient.tsx:582`</sub>

src/components/NotificationCenter.tsx:143-147 — the trigger is `<button onClick={() => setIsOpen(!isOpen)}
className="relative p-2 ..." aria-label="Notifications">` with no `aria-expanded`, `aria-haspopup`, or `aria-
controls`. The panel at src/components/NotificationCenter.tsx:156-157 is a bare `<div className="absolute
right-0 mt-2 w-80 sm:w-96 ...">` with no role, no aria-label, and no focus move/restore. The only dismissal
path is a mousedown click-outside listener (src/components/NotificationCenter.tsx:117-125) — there is no
`keydown`/Escape handler anywhere in the file, so a keyboard user cannot close it, and the component is
mounted into the navbar at src/components/NavbarClient.tsx:582.

*Fix:* Add aria-expanded/aria-haspopup/aria-controls on the trigger, role="dialog" (or menu) + aria-label on the
panel, an Escape keydown handler that closes and returns focus to the bell button, and move focus into the
panel on open — or replace with the Radix Popover primitive already in the repo.

### Reliability & transactions

**V-P2-32. ⚠ deleteAccount holds FOR UPDATE locks across a Supabase Storage HTTP call inside Prisma's default 5s interactive transaction**  
<sub>was `0803-P2-6` · `src/app/actions/settings.ts`, `src/lib/prisma.ts:64`</sub>

Unchanged; last commit touching the file predates the review (git log -- src/app/actions/settings.ts →
6212ee25). src/app/actions/settings.ts:369 `const deleteResult = await prisma.$transaction(async (tx) => {`
closes at :514 `});` with no options object, and src/lib/prisma.ts:64-72 constructs PrismaClient with only
`log` and `datasources` — no `transactionOptions` — so Prisma's 5000 ms interactive budget applies. Inside it:
:370-375 `SELECT id FROM "User" ... FOR UPDATE`, :381-388 unbounded `SELECT id, version FROM "Listing" WHERE
"ownerId" = ... FOR UPDATE`, then :409 `await deleteAccountVerificationDocuments(tx, session.user.id)` →
:59-76 two more `FOR UPDATE` selects → :90 `await deleteVerificationObjects(storagePaths)` →
src/lib/verification/storage.ts:126-128 `supabase.storage.from(...).remove(paths)`, an outbound HTTP call made
while those row locks are held. The per-listing loop (:411-435) and ~20 sequential deleteMany calls (:437-486)
follow. Overstatement stands as the report's own adversarial note says: storage.ts:118-120 early-returns 0
when there are no paths, so the HTTP leg only fires for users who uploaded ID documents, and the "user can
never delete their account" framing needs a many-listing host. The non-transactional storage delete can still
orphan VerificationRequest/VerificationUpload rows on rollback.

*Fix:* Move deleteVerificationObjects after commit (collect paths in-tx, delete after), pass an explicit `{ timeout:
... }` to the $transaction, bound the Listing FOR UPDATE, and replace the per-listing loops with set-based
writes.

**V-P2-33. ⚠ Three cron routes run multi-second dispatchers inside Prisma's default 5s interactive transaction, aborting the run and releasing the xact advisory lock mid-flight**  
<sub>was `0803-P2-15` · `src/app/api/cron/stale-auto-pause/route.ts:21`, `src/app/api/cron/freshness-reminders/route.ts:21`</sub>

All three routes are unchanged. src/app/api/cron/stale-auto-pause/route.ts:21-38 `await
prisma.$transaction(async (tx) => { ... pg_try_advisory_xact_lock(...) ... const summary = await
runAutoPauseDispatcher(); ... })` — no options object, and runAutoPauseDispatcher() takes no `tx`, so it uses
the module-level client and the outer transaction contributes only the lock. Same shape at
src/app/api/cron/freshness-reminders/route.ts:21-38 (`runFreshnessDispatcher()`) and src/app/api/cron/search-
alerts/route.ts:20-43 (`withRetry(() => processSearchAlerts())`, whose comment at :18-19 still claims the xact
lock "auto-releases on commit/rollback, preventing orphaned locks"). src/lib/prisma.ts:64-72 sets no
transactionOptions, so the 5 s default applies, while src/lib/freshness/auto-pause-dispatcher.ts:21-22 sets
`AUTO_PAUSE_BATCH_SIZE = 500` and `AUTO_PAUSE_TIME_BUDGET_MS = 50_000` and the routes declare `export const
maxDuration = 60` (:10). Overstated exactly as the report's own adversarial note concedes: impacts (a) double-
emailing and (c) 50 s connection starvation do not follow (the pause path re-locks and re-classifies each row,
and Prisma releases the connection at the 5 s abort). What genuinely remains is P2028 on commit → HTTP 500
with the real summary discarded, plus early release of the mutual-exclusion lock.

*Fix:* Replace the interactive-transaction wrapper with a session-scoped pg_advisory_lock/unlock pair or a time-
bounded cron_locks row (the cron_runs marker from #182 is the natural template), in all three routes.

### Data model

**V-P2-34. Hard-deleting a listing cascades away every conversation and message on it while the spent contact-credit ledger row survives**  
<sub>was `R2-DL-1` · `src/app/api/listings/[id]/route.ts:480`, `src/app/actions/admin.ts:739`</sub>

Two live hard-delete paths remain: src/app/api/listings/[id]/route.ts:480 `await tx.listing.delete({ where: {
id } });` (host DELETE; only blocked when a moderation write-lock applies at :451 or reportCount>0 at :456
suppresses instead) and src/app/actions/admin.ts:739 `await tx.listing.delete({ where: { id: listingId } });`.
The cascade chain in the schema is Listing → Conversation (prisma/schema.prisma:257 `listing Listing
@relation(fields: [listingId], references: [id], onDelete: Cascade)`) → Message (:289 `conversation
Conversation @relation(..., onDelete: Cascade)`) and also ConversationDeletion (:272) and TypingStatus (:576).
Meanwhile ContactConsumption has no FK at all (schema.prisma:787-813; the 20260502050000 migration adds no
FOREIGN KEY), so the consumed-credit row and its unique (user, unit, epoch, kind) key at :806 survive the
delete — the route comment at :478 states this deliberately ('contact-first tables are independent
projections/ledgers'). No restoration reason covers it: ContactRestorationReason (schema.prisma:667-673) is
HOST_BOUNCE | HOST_BAN | HOST_MASS_DEACTIVATED | HOST_GHOST_SLA | SUPPORT — nothing for LISTING_DELETED.

*Fix:* Either soft-delete/tombstone listings that have paid ContactConsumption rows, detach Conversation from Listing
(SetNull) so paid threads survive, or add a LISTING_DELETED restoration reason that credits the buyer back. I
rate it P2 rather than P3 because it is a money-adjacent, host-triggerable destruction of a buyer's purchased
artifact — pre-launch dummy data mutes the data-loss angle but the code-level invariant gap is live.

### CI & test integrity

**V-P2-35. The real-Postgres regression proofs for P0-3/P0-4/P1-5 are describe.skip in every CI run because REAL_DB_URL is set in no workflow**  
<sub>was `R2-FL-4-FE-1` · `.github/workflows/`, `src/__tests__/db/contact-paywall-idempotency.test.ts:27`</sub>

`grep -rn REAL_DB_URL .github/` still returns nothing (I ran it; only `.github/workflows/*.yml` exist, none
reference it). The gates are intact and the per-suite test counts in the report's table are exact:
`src/__tests__/db/contact-paywall-idempotency.test.ts:27-28` `const REAL_DB_URL = process.env.REAL_DB_URL;
const describeRealDb = REAL_DB_URL ? describe : describe.skip;` (3 tests, proves P0-4);
`src/__tests__/db/alert-bounds-postgis.test.ts:26-27` (4 tests, P1-5); `src/__tests__/db/payment-webhook-
concurrency.test.ts:38-40` `const shouldRun = Boolean(REAL_DB_URL); const describeRealDb = shouldRun ?
describe : describe.skip;` (2 tests); `src/__tests__/lib/search/fts-db.test.ts:17-18` (7 tests). Note the #180
deny-list changed nothing here: `test-rest` now *lists and loads* the three `db/` files, but every describe
inside still skips. And `src/__tests__/scripts/ci-test-coverage.test.ts:120-141` only compares `--listTests`
output sets, exactly as the report says — it can never detect an all-skipped suite.

*Fix:* Port the three db suites to PGlite the way `src/__tests__/db/cron-run-claim.test.ts` does (or point them at
ci.yml's existing `postgis/postgis:16-3.4` service via REAL_DB_URL), and extend the ci-test-coverage guard to
fail when a build-gated suite reports 0 executed tests.

---

## ⬜ P3 — 74 open

Hygiene, latent risk and test debt. Every row was re-checked; none is a stale carry-over.

### Auth & session

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-1 | The NextAuth authorized() route-protection callback is dead code — NextAuth is never wired as middleware | `src/auth.ts:348` | `0803-P3-1` |

### Server surface & config

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-2 | /api/metrics/ops throws RangeError (unhandled 500) instead of 401 when the Authorization header has equal UTF-16 length but a different UTF-8 byte length | `src/app/api/metrics/ops/route.ts:78` | `0803-P3-2` |
| V-P3-3 | /api/public-cache/push-subscription accepts unauthenticated DELETE and rebinds subscription ownership on POST, with no CSRF check on either | `src/app/api/public-cache/push-subscription/route.ts:45` | `0803-P3-3` |
| V-P3-4 | `*.googleusercontent.com` wildcard in next.config remotePatterns makes /_next/image an unauthenticated, unrate-limited image proxy | `next.config.ts:94` | `0803-P3-4` |
| V-P3-5 | ⚠ LOG_HMAC_SECRET is optional in the schema with no production enforcement, and validateViewToken fails open when it is missing | `src/app/api/metrics/hmac.ts:36` | `0803-P3-5` |
| V-P3-6 | /api/health/ready is unauthenticated, unrate-limited, proxy-excluded, and performs a DB round-trip plus an outbound Upstash call per request | `src/app/api/health/ready/route.ts:14` | `0803-P3-6` |
| V-P3-7 | ⚠ E2E test-helper backdoor's production guard collapses to a single env var off Vercel; helper actions are ownership-agnostic | `src/app/api/test-helpers/route.ts:26` | `0803-P3-7` |
| V-P3-8 | HMAC view-token gate on POST /api/listings/[id]/view is skipped entirely when the request body is not valid JSON | `src/app/api/listings/[id]/view/route.ts:20` | `R2-MS-1` |
| V-P3-9 | POST /api/reports clones, buffers and JSON-parses the full body before CSRF validation and before the rate limiter | `src/app/api/reports/route.ts:106` | `R2-MS-5` |
| V-P3-10 | src/app/actions/suspension.ts is `"use server"`, exposing checkSuspension/checkEmailVerified as server-action endpoints that trust a caller-supplied user id | `src/app/actions/suspension.ts:1` | `R2-MS-6` |

### Payments

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-11 | 19 of 24 feature flags undocumented in .env.example, including every payments-critical one | `.env.example` | `0803-C-1` |
| V-P3-12 | ⚠ No test exercises the duplicate-entitlement-grant guard on Stripe webhook redelivery | `src/__tests__/lib/payments/webhook-worker.test.ts:192` | `0803-P2-16` |
| V-P3-13 | Refund entitlement adjustment is not idempotent: a replayed refund webhook after credits are spent increases the remaining balance | `src/lib/payments/entitlement-adjustments.ts:352` | `0803-P3-17` |
| V-P3-14 | Amount/currency mismatch on a succeeded payment silently drops the purchase — user is charged, nothing recorded, nothing refunded | `src/lib/payments/webhook-worker.ts:258` | `0803-P3-18` |
| V-P3-15 | Webhook upserts rewrite the whole Payment row even when the status transition is suppressed, dropping the charge id used to match refunds and disputes | `src/lib/payments/webhook-worker.ts:125` | `0803-P3-19` |
| V-P3-16 | The outbox payment handler swallows exceptions, so the SERIALIZABLE transaction commits partial money-path writes instead of rolling back | `src/lib/outbox/handlers.ts:562` | `0803-P3-20` |

### Data model & migrations

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-17 | listing_search_docs, listing_search_doc_dirty, NeighborhoodCache and the household_languages GIN index exist only in raw SQL; `prisma migrate dev` would emit DROPs | `prisma/schema.prisma` | `0803-P3-11` |
| V-P3-18 | Payments/entitlements schema has no foreign keys — refunds, grants, disputes and refund-queue rows can point at nonexistent payments | `prisma/migrations` | `0803-P3-12` |
| V-P3-19 | stripe_events.payload stores verbatim Stripe events (customer email/name/phone/billing address) with no retention or redaction | `src/app/api/stripe/webhook/route.ts:45` | `R2-DL-2` |
| V-P3-20 | ⚠ alert_deliveries has a 7-day expires_at that nothing purges — rows accumulate forever | `prisma/schema.prisma:465` | `R2-DL-3` |
| V-P3-21 | ⚠ Six dead indexes remain on listing_search_docs — write amplification with no read path | `src/lib/search/search-doc-queries.ts:946` | `R2-DL-4` |
| V-P3-22 | phase-09 booking retirement drops 3 tables, 4 columns and 2 enums with a data-safety note but no rollback note | `prisma/migrations/20260509000000_phase09_cutover_retire_booking/migration.sql` | `R2-DL-5` |
| V-P3-23 | ⚠ 23 CHECK constraints were added NOT VALID and never validated | `prisma/migrations` | `R2-DL-6` |

### Search, map & cost

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-24 | ⚠ Public autocomplete runs a leading-wildcard LIKE over a concatenated expression across a 3-table join with no index and no timeout | `src/lib/geocoding/public-autocomplete.ts:80` | `0803-P3-10` |
| V-P3-25 | ⚠ List query never clamps bounds span, so a world-scale bbox passes the boundsRequired guard | `src/lib/search/search-v2-service.ts:926` | `0803-P3-24` |
| V-P3-26 | ⚠ Query-embedding cache is per-Lambda in-memory only and the Gemini embedding path has no monthly spend cap | `src/lib/embeddings/query-cache.ts:14` | `0803-P3-25` |
| V-P3-27 | ⚠ Snapshot-contract page 1 runs a second full-column SELECT purely to collect listing IDs | `src/lib/search/search-v2-service.ts:424` | `0803-P3-26` |
| V-P3-28 | ⚠ Snapshot page hydration skips the availability/freshness eligibility filter, so page 2+ can show listings page 1 excluded | `src/lib/search/search-doc-queries.ts:1457` | `0803-P3-27` |
| V-P3-29 | ⚠ Mapbox public autocomplete has no monthly cap by default and results are intentionally uncached | `src/app/api/geocoding/autocomplete/route.ts:220` | `0803-P3-28` |
| V-P3-30 | Every v2 search response ships list items twice — `list.items` duplicates `list.fullItems` and no runtime consumer reads it | `src/lib/search/search-v2-service.ts:1200` | `0803-P3-29` |
| V-P3-31 | ⚠ SearchDoc map query never populates `totalCandidates` although the field is plumbed through to the response | `src/lib/search/search-doc-queries.ts:1575` | `0803-P3-30` |
| V-P3-32 | ⚠ Client-search effect gates on the raw URL string but fetches the canonical one, causing redundant refetches that reset accumulated results | `src/components/search/SearchResultsClient.tsx:363` | `0803-P3-31` |
| V-P3-33 | ⚠ queryWithTimeout sets statement_timeout equal to Prisma's own transaction budget | `src/lib/search/search-doc-queries.ts:82` | `0803-P3-9` |
| V-P3-34 | <WebVitals /> fires one serverless invocation per metric per page view and the endpoint builds a log object and discards it | `src/app/layout.tsx:128` | `R2-PERF-3` |

### Cron, outbox & reliability

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-35 | ALERT_DELIVER sends the email without claiming the delivery row — a kill between send and record replays and re-sends the alert | `src/lib/search-alerts.ts:500` | `0803-P3-32` |
| V-P3-36 | ⚠ GEOCODE_NEEDED handler makes an outbound HTTP call (plus a conditional 1.1s throttle sleep) inside an open SERIALIZABLE transaction from a 5-connection pool | `src/lib/outbox/handlers.ts:645` | `0803-P3-33` |
| V-P3-37 | IDENTITY_MUTATION replay re-inserts a cache_invalidations row and re-appends a priority-10 CACHE_INVALIDATE outbox event per affected unit | `src/lib/outbox/handlers.ts:433` | `0803-P3-34` |
| V-P3-38 | runDelegatedTask grades sub-routes on HTTP status alone, so a 200 carrying {success:false, errors:N} is counted as a successful task | `src/app/api/cron/daily-maintenance/route.ts:165` | `R2-OPS-5` |
| V-P3-39 | degraded-safe-mode runbook presents kill switches as a live toggle when they are Vercel env vars requiring a redeploy | `docs/runbooks/degraded-safe-mode.md` | `R2-OPS-9` |
| V-P3-40 | ⚠ daily-maintenance runs its whole task list serially with no maxDuration while callees declare 30s/60s budgets of their own | `src/app/api/cron/daily-maintenance/route.ts` | `R2-PERF-5` |
| V-P3-41 | ⚠ Refutation of "daily-maintenance claims the lane before doing work, so a crash loses the day" — the refutation is itself overstated | `src/app/api/cron/daily-maintenance/route.ts:231` | `R2-REFUTED-OPS-3` |
| V-P3-42 | ⚠ /api/cron/embeddings-maintenance is dispatched by nothing, so recoverStuckEmbeddings never runs and a PROCESSING listing stays frozen | `vercel.json` | `R2-SC-3/OPS-6` |

### Frontend correctness

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-43 | Chat message timestamps and day separators are formatted with client-local getters during SSR, causing wrong times + hydration text mismatch | `src/components/messages/MessageBubble.tsx:34` | `0803-P2-9` |
| V-P3-44 | ⚠ Listing detail renders the contact CTA from an optimistic fallback with paywallSummary:null, so a click before viewer-state loads shows a toast instead of the purchase modal | `src/app/listings/[id]/ListingPageClient.tsx:283` | `0803-P3-13` |
| V-P3-45 | ⚠ Client-side search failures are silently swallowed — a failed "search this area" leaves stale results with no error state and no retry | `src/components/search/SearchResultsClient.tsx:405` | `0803-P3-14` |
| V-P3-46 | MobileBottomSheet never cancels its drag requestAnimationFrame on unmount | `src/components/search/MobileBottomSheet.tsx:224` | `0803-P3-15` |
| V-P3-47 | PersistentMapWrapper's pan-fetch effect can leak a scheduled 429 retry past unmount, and the two fetch effects write incompatible keys into one dedup ref | `src/components/PersistentMapWrapper.tsx:733` | `0803-P3-16` |

### Observability & ops

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-48 | http_requests_total / http_errors_total / http_request_duration_ms in /api/metrics/ops are permanently zero — their only writer is never called | `src/app/api/metrics/ops/route.ts:44` | `R2-OPS-1` |
| V-P3-49 | ⚠ None of the ten sourceMetric names in ops/slo/launch-slo-alerts.json is emitted anywhere in the codebase | `src/lib/metrics/projection-lag.ts:30` | `R2-OPS-8` |

### Tests & CI

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-50 | "Public Payload PII Scan" CI gate scans a static hand-written clean fixture, so it can never fail on real data | `.github/workflows/ci.yml:227` | `0803-P3-35` |
| V-P3-51 | Playwright "Audit test.skip count" step invokes count-test-skips.sh without --ci, so its threshold check can never fail the build | `.github/workflows/playwright.yml:210` | `0803-P3-36` |
| V-P3-52 | Admin verification reject/document flows are permanently skipped in CI because AA-05 consumes the only seeded PENDING request | `scripts/seed-e2e.js:1254` | `0803-P3-37` |
| V-P3-53 | Outbox drain claim exclusivity (FOR UPDATE SKIP LOCKED) is only asserted against jest mocks / as a SQL substring; no test proves two workers cannot double-process | `src/__tests__/lib/outbox/drain.test.ts:1` | `0803-P3-38` |
| V-P3-54 | No global Jest coverage threshold, coverage collected in only one job, and never uploaded on pull requests | `jest.config.js:55` | `0803-P3-39` |
| V-P3-55 | ⚠ expectRedirectToRoot never verifies the redirect destination and passes on a thrown RangeError, weakening the admin/suspension authorization tests | `src/__tests__/lib/auth-authorized.test.ts:92` | `0803-P3-40` |
| V-P3-56 | Assertion-free tests whose comments claim to verify behaviour they never check (expect(true).toBe(true)) | `src/__tests__/components/map/touch-gestures.test.tsx:1028` | `0803-P3-41` |
| V-P3-57 | Deleting the P0-1 account-pre-hijacking guard leaves auth-edge-cases.test.ts green — that file has no coverage of the guard | `src/__tests__/edge-cases/auth-edge-cases.test.ts:59` | `R2-FE-2-mutation` |
| V-P3-58 | The P0-2 regression e2e never loads a real listing detail page — the render that actually carries the street address | `tests/e2e/security/security-headers.spec.ts:65` | `R2-FE-4` |
| V-P3-59 | stability-tests.yml runs Playwright against `next dev`, the exact configuration tasks/lessons.md records as unreliable | `.github/workflows/stability-tests.yml:43` | `R2-FE-5` |
| V-P3-60 | fts-db.test.ts gates on RUN_DB_ASSERTIONS==="1" while .env.example documents RUN_DB_ASSERTIONS=true, so following the docs never enables it | `src/__tests__/lib/search/fts-db.test.ts:17` | `R2-FE-6` |
| V-P3-61 | Three spec files are excluded from every Playwright project, and 7 describe.skip blocks + 12 test.fixme stay dark while counting toward the headline total | `tests/e2e/concurrent/` | `R2-FE-7` |

### Privacy, supply chain & dead surfaces

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-62 | assertParameterizedWhereClause only scans single-quoted literals, so numeric/identifier interpolation passes silently | `src/lib/sql-safety.ts:59` | `0803-C-2` |
| V-P3-63 | .git is ~818 MB, driven by tracked binaries and multi-MB .orchestrator agent artifacts | `.gitignore` | `0803-C-3` |
| V-P3-64 | ⚠ Logger emits context userId unhashed and REDACTED_FIELDS contains no PII key names | `src/lib/logger.ts:85` | `0803-P3-21` |
| V-P3-65 | Payment-abuse email/IP identifiers degrade to unsalted SHA-256 when LOG_HMAC_SECRET is unset, with no startup warning | `src/lib/payments/abuse-controls.ts:25` | `0803-P3-22` |
| V-P3-66 | Sentry/log scrubber denylist misses `cookies`, the field name Sentry uses for the request cookie map | `src/lib/privacy-redaction.ts:9` | `0803-P3-23` |
| V-P3-67 | 279+ binary artifacts (~22MB) tracked in git, including root-level review screenshots and Vibe.zip | `.gitignore` | `0803-P3-8` |
| V-P3-68 | docs/API_REFERENCE.md documents POST /api/reviews as returning 201 while every reachable path returns 403 | `docs/API_REFERENCE.md:955` | `R2-FE-8` |
| V-P3-69 | Two pnpm overrides pin fast-uri and brace-expansion to versions that are themselves still flagged vulnerable | `package.json:131` | `R2-SC-1` |
| V-P3-70 | NeighborhoodChat.tsx has no importer, yet /api/chat and /api/agent remain live | `src/components/NeighborhoodChat.tsx:205` | `R2-SC-4` |
| V-P3-71 | "sideEffects": false at the app package root marks every module under src/ as side-effect-free | `package.json:5` | `R2-SC-5` |
| V-P3-72 | verify.js is tracked at repo root, wired to `pnpm verify`, and seeds a user with an unhashed password into whatever DB it points at | `verify.js` | `R2-SC-6` |

### Follow-ups from the merged fixes

| # | Finding | Where | Was |
| --- | --- | --- | --- |
| V-P3-73 | #184 fixed the HTML href but the text/plain alternative still strips the anchor, so a plain-text mail client gets a verification/reset email with no link | `src/lib/email.ts:108` | `NEW-email-plaintext-linkless` |
| V-P3-74 | Google accounts created before #184 keep emailVerified null forever — linkAccount never fires again for an already-linked account, and the FL-3 early return skips the only other writer | `src/auth.ts:88` | `NEW-google-legacy-unverified-backfill` |

⚠ = the original report's description was broader than what the code supports; the underlying issue is real
but narrower. Full per-finding evidence for every row is in the machine-readable dataset (see *Method*).

---

## ❌ Not defects, and corrections to the two reports

### Refutations upheld

- **`FE-5` (domain-rules) — "semantic search returns stale/unavailable listings."** Round 2 refuted it;
  the refutation is correct. Every semantic consumer routes through `getSemanticEligibleListPage`, which
  re-reads live listing state and drops ineligible rows one frame above the mapper the finding quoted.

### A refutation that reached the right answer for the wrong reason

- **`OPS-3` — "daily-maintenance claims the lane before doing work, so a crash loses the day."** Round 2
  refuted this as "the failure path does not follow." That reasoning is wrong: `claimDailyLane` is a bare
  `$executeRaw` (autocommit) called first thing after auth, nothing rolls the marker back, and the route
  declares no `maxDuration` — so a hard kill after the claim genuinely does lose the rest of that day's lane.
  The *disposition* was right, though: every task is individually try/caught, and the survivors are
  idempotent daily janitors that self-heal on the next run. Carried as **V-P3-41**, not dismissed.

### Claims that were factually wrong

- **The morning report's P0-1b fix note** — *"`linkAccount` now sets `emailVerified` for verified Google
  profiles"* — was wrong when written. `@auth/core`'s `defaultProfile` strips `email_verified` before the
  event fires (`providers/google.js` declares no custom `profile()`), so that write never executed once.
  Round 2 caught this. #184 fixed it — and, in fixing it, created **P0-V1**.
- **Round 2's `DL-1..7`** enumerates six defects, not seven. There is no seventh finding; `DL-7` is a
  numbering artifact.

### Verifier caveats that were themselves checked

- Round 2's caveat on the `/users/[id]` suspension fix — *"do not add `isSuspended` to the existing
  select, it is spread into the client component's RSC payload"* — **is correct**. `page.tsx:131-142`
  spreads the selected user straight into `<UserProfileClient>`, so any added field is serialized into the
  flight payload. Fix it with a separate server-side lookup, not a wider select.

---

## Recommended fix order

| # | Item | Why here |
| --- | --- | --- |
| ~~1~~ | ✅ **P0-V1** — done 2026-08-05 (`fix/p0-google-link-takeover`). The `emailVerified`-on-credential-login part was deliberately **not** shipped: it would lock unverified users out permanently, since `/api/auth/resend-verification` 401s without a session. That needs an unauthenticated resend endpoint first. | — |
| 2 | **V-P2-35** — port the three `REAL_DB_URL` suites to PGlite and make the CI guard fail on a fully-skipped build-gated file | This is the control that would have caught #1's class of failure. `cron-run-claim.test.ts` is the working template. |
| 3 | **V-P2-14 / V-P2-15** — `export const onRequestError = Sentry.captureRequestError` and add `instrumentation-client.ts` | Two small changes. Nothing in production reports errors today, server or client — which is why #1 could ship believed-fixed. |
| 4 | **P1-V1** — resize `messagesPreAuth` to a per-minute window, gate polls on visibility, handle 429 | Core feature dies ~14 min in and burns ~1,200 wasted invocations/hour per idle tab. |
| 5 | **V-P2-10 / V-P2-8** — a route test for the Stripe `after()` drain, then serialize sibling events on the purchase | The money path's newest behaviour is asserted only by a commit message. |
| 6 | **V-P2-4–V-P2-7** — suspension gates on `/users/[id]`, alert delivery and semantic search; screen every chat turn | Banned hosts are still publicly reachable, still emailed to subscribers, still in vibe search. |
| 7 | **V-P2-11** — split the 22 `ip:userId` buckets into IP-keyed + account-keyed | Systemic; supersedes the phone-reveal finding. `/api/listings` already shows the right shape. |
| 8 | **V-P2-19** — `/api/nearby` behind auth + a Radar spend cap | Largest uncapped paid-API exposure: 43,200 upstream calls/day per source IP, unauthenticated. |
| 9 | **P1-V2** — make the gallery openers real buttons, give the lightbox dialog semantics + `FocusTrap` | Primary content of the primary conversion page; WCAG 2.1.1 Level A. The repo already ships the component. |
| 10 | **V-P2-1** — `secureCookie` on `getToken` | One argument; restores proxy-level suspension enforcement and unblocks V-P2-2 and V-P2-3. |

---

## What is genuinely strong (re-confirmed, not carried over)

- **Server Action authorization** across all `"use server"` files — every action re-derives identity from
  `auth()` and re-checks ownership against the DB. No IDOR found in either round.
- **`startConversation`** is race-safe by construction under a sorted-pair advisory lock.
- **Upload hardening**: declared MIME allowlist → magic-byte validation → sharp re-encode stripping EXIF/GPS.
- **`src/lib/cron-auth.ts`** fails *closed* on a missing/short/placeholder `CRON_SECRET`, constant-time compare.
- **Migration discipline** — real `-- ROLLBACK:` / `-- DATA SAFETY:` reasoning, correct non-blocking DDL,
  and a prior migration that *drops* dead indexes with a written proof.
- **`cron-run-claim.test.ts`** executes the actual migration file under PGlite and pins `SET TIME ZONE 'UTC'`
  with a reason. It is the template the three dark DB suites should follow.
- **#182** is the best-engineered fix of the six: atomic lease, claimed after auth, proven against real Postgres.
- **No build escape hatches**; secret hygiene clean including history; `strict: true` throughout.

## Method, coverage and gaps

**Provenance.** 138 claims verified across 13 domains, 20 backlog-reducing or high-severity verdicts sent to
adversarial challengers, 5 disagreements resolved by an independent tie-breaker. Both overturned verdicts
(`0803-P0-1`, `0803-P0-1b`) moved *against* the safe reading — a FIXED verdict that the challenger and the
tie-breaker both showed was still exploitable. Every step of that chain was then re-verified by hand,
including reading `@auth/core@0.41.3`'s `handle-login.js` in `node_modules`.

**Confidence.** Anything marked FIXED was read in the current tree, not inferred from a PR description. Two
things could not be settled from source: whether `RADAR_SECRET_KEY` is actually provisioned in the Vercel
production environment (which bounds the real exposure of **V-P2-19**), and live CVE status for the
pinned transitive packages — that was read from `package.json`/`pnpm-lock.yaml`, not from a network audit.
The only finding with an `UNVERIFIABLE` verdict is round 2's `DL-7`, which does not exist.

**Not covered this round:** i18n/locale beyond timezone, email deliverability (SPF/DKIM), push notifications
and PWA/offline, the admin surface in depth, load testing under concurrency, and anything requiring a running
production system.

**Pre-launch context.** The project is pre-launch on dummy data, so data-loss objections about existing rows
are weak and were rated accordingly. Code-level invariants and the migration-discipline rules in
`.claude/CLAUDE.md` still apply and were held to.

