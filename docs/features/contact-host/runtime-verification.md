# Runtime Verification

Status: `PARTIALLY VERIFIED`.

A focused Jest/API/security/component command now passes for `ContactHostButton`, `/api/messages`, message read/unread/pagination, checkout creation, checkout-session polling, private-feedback viewer-state no-bleed, listing contactability, CSRF helper behavior, and `MessagesPageClient` coverage. Current Chromium/Mobile Chrome Playwright commands pass for the messaging journey, Mobile Chrome no-deps messages, setup-backed Mobile Chrome messages, and a focused listing-detail Contact Host runtime spec that opens the seeded reviewer-owned listing directly and mocks external listing images. A follow-up P1 unit/API suite also passes for checkout routes, checkout-session status, contact paywall/restoration, mocked email helper behavior, suspension helpers/middleware, and contact-attempt metadata. A broad legacy listing-detail rerun still has setup/external-image/stale-assertion failures, so it is not used as current Contact Host runtime proof; the focused `contact-host-runtime.spec.ts` is the accepted listing-detail runtime evidence. A focused messaging functional E2E attempt did not reach the spec because local dev-server health failed without `DATABASE_URL`; no realtime/polling claim is derived from that command. The full Playwright browser matrix did not run because Firefox is missing locally. Stripe checkout return execution, Supabase realtime delivery/RLS, actual email delivery, paywall-required/suspended/unavailable listing-detail states, and full Firefox/WebKit/mobile matrix remain not verified. Evidence: `evidence-register.md` CH-E032-CH-E048; `unknowns.md` CH-U001, CH-U003-CH-U007; `12-gaps-unknowns-and-questions.md` CH-G001-CH-G002.

Merged `main` commit `e4db1036` was re-verified locally in a clean worktree on
2026-05-10. Focused Jest, typecheck, docs JSON validation, stale-wording scan,
Mobile Chrome messaging, isolated Chromium messaging, and focused Chromium
listing-detail Contact Host runtime all passed. Evidence: CH-E046.

## Merged Main Verification

| Date | Codebase | Checks | Result | Notes |
|---|---|---|---|---|
| 2026-05-10 | `main` at `e4db1036` | Docs JSON parse; stale-wording scan; focused Contact Host Jest; `pnpm run typecheck`; `git diff --check`; setup-backed Mobile Chrome messages; isolated Chromium messaging journey; focused Chromium listing-detail Contact Host runtime | Passed | One combined desktop Playwright command failed once at J25 with a disabled send button, but the isolated Chromium messaging spec passed on rerun and GitHub PR #121 was fully green. Treat the combined-run failure as a local/order-sensitivity watch item, not current accepted behavior. Evidence: CH-E046. |
| 2026-05-10 | `codex/contact-host-p1-evidence` from merged `main` | Focused checkout/session/paywall/restoration/email-helper/suspension/contact-attempt Jest suite | Passed | 9 suites and 105 tests passed. This improves source/unit confidence for P1 areas, but does not prove Stripe browser return, actual email delivery, Supabase realtime/RLS, or listing-detail suspended/paywall/unavailable browser states. Evidence: CH-E047. |
| 2026-05-10 | `codex/contact-host-p1-evidence` from merged `main` | Focused `tests/e2e/messaging/messaging-realtime.spec.ts` Chromium Playwright attempt | Blocked before spec | Dev-server health timed out because `DATABASE_URL` was not configured, so no realtime/polling behavior was verified by this attempt. Evidence: CH-E048. |

## Required Runtime Checks

| Flow | Required observation | Status |
|---|---|---|
| Listing detail contact CTA | Anonymous, unverified, verified tenant, owner, suspended, paywall-required, unavailable listing states | Focused `tests/e2e/listing-detail/contact-host-runtime.spec.ts` passed for authenticated non-owner contact-first sidebar/no-booking copy and anonymous sign-in CTA; historical broad listing-detail pass exists, but latest broad reruns are noisy due setup/external-image/stale-assertion failures; suspended, paywall-required, unavailable, and full matrix state checks not run |
| Start conversation | Successful navigation to `/messages/{id}` and duplicate-click behavior | Chromium dedupe and Chromium messaging journey passed after follow-up stabilization; broader browser matrix not run |
| Paywall dialog and checkout handoff | Dialog, offer click, checkout URL, checkout return notice paths | Not run |
| Messages inbox | Empty state, conversation list, search, mark-all-read, mobile/desktop navigation | Mobile Chrome no-deps and setup-backed Mobile Chrome specs passed after the second-pass fix and verified conversation-list tap navigation to `/messages/{id}`; Chromium messaging journey passed after test stabilization; search and mark-all-read not run |
| Message thread | Send, optimistic state, retry, blocked banner, unread/read state, draft restore | Mobile Chrome no-deps spec passed after the second-pass fix and verified open-thread input visibility/functionality; Chromium messaging journey passed after follow-up stabilization; retry, blocked banner, unread/read, draft restore, and full matrix not run |
| Realtime/polling | Realtime insert, typing/presence, fallback to polling | Attempted focused messaging functional E2E, but the dev server did not become healthy without `DATABASE_URL`; realtime/RLS and polling behavior remain not runtime verified |
| API behavior | `/api/messages`, viewer-state, checkout, checkout-session status | Focused Jest/API suites passed for `/api/messages`, message read/unread/pagination, checkout creation, checkout-session polling, contact paywall/restoration, mocked email helper behavior, suspension, contact-attempt metadata, private-feedback viewer-state no-bleed, and CSRF helper/route coverage; full viewer-state contract/status/cache-header verification remains P1 |

## Runtime Acceptance

Runtime acceptance is no longer blocked by the prior Chromium messaging/listing-detail rerun failures; those are superseded by CH-E044, CH-E045, and CH-E046. CH-E047 improves P1 unit/API confidence. CH-E048 preserves the realtime/polling runtime gap because the attempted functional E2E was blocked before test execution by missing local database configuration. Remaining gaps are suspended/paywall-required/unavailable listing-detail states, checkout return, realtime/RLS, actual email delivery, and the full Firefox/WebKit/mobile browser matrix beyond the scoped Mobile Chrome runs.
