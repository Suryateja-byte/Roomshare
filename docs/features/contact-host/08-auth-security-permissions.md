# Auth, Security, And Permissions

Status: source-backed gate inventory. This file records observed gates and focused test evidence where cited; it does not certify production security.

| Action / API | Public or protected | Enforcement location | Failure behavior | Evidence | Unknowns |
|---|---|---|---|---|---|
| View listing detail | Public with viewer-state variants | Listing page and viewer-state API | Anonymous gets login-to-message contract; owner gets edit-listing; suspended/block states can return disabled Contact Host reasons for authenticated non-owner viewers | CH-E001, CH-E002, CH-E019, CH-E020, CH-E035, CH-E040, CH-E045, CH-E051, CH-E059, CH-E061, CH-E068, CH-E073 | Focused Chromium listing-detail Contact Host runtime verified; paywall-required/unavailable/migration/moderation states passed in CH-E059 and reran cleanly in CH-E061; CH-E068 adds suspended/blocked contract, UI copy, fixture, route proof, and focused test source; CH-E073 closes the historical CH-E068 execution gap with focused four-state Chromium proof and a full listing-detail Contact Host Chromium spec rerun |
| Start conversation | Protected | `startConversation` | Unauthorized/session expired, rate limited, suspended, unverified, unavailable, self-contact, stale unit, blocked, paywall required/unavailable | CH-E005-CH-E011, CH-E032, CH-E050, CH-E052, CH-E057, CH-E058 | Action/component branch tests, full Chromium messaging, and mocked checkout-return runtime passed; realtime/full matrix remain gaps |
| Send message by server action | Protected | `sendMessage`, `sendConversationMessage` | Unauthorized, rate limited, suspended, invalid, unverified, nonparticipant, unavailable listing, blocked, content flagged | CH-E012, CH-E013, CH-E032, CH-E049, CH-E050, CH-E052, CH-E057, CH-E062, CH-E076 | Deterministic send path, API isolation, fallback polling, mocked realtime insert handling, local Option A provider/RLS proof, and full Chromium messaging verified; production/staging provider proof and full matrix remain gaps |
| GET `/api/messages` | Protected after pre-auth rate limit | API route | 401 without session; 403 on inaccessible conversation; private cache | CH-E015, CH-E032, CH-E049, CH-E055; `phase-4/04-auth-security-permissions.md` | Focused Jest passed historically; CH-E055 WSL focused command now passes GET status/cache-header assertions after stale fixture repair. Optional direct HTTP live-server parity remains P2 confidence coverage |
| POST `/api/messages` | Protected | CSRF, auth, rate limit, schema, access checks | 400/401/403/429-style failures by branch | CH-E016, CH-E041, CH-E049, CH-E055, CH-E071 | CSRF source/helper coverage, route-level missing/malformed/mismatched Origin rejection, same-origin allowance, and localhost-development allowance pass; CH-E055 WSL focused command now passes send/mark-read no-store assertions after stale fixture repair |
| Viewer-state API | Public/optional auth, private response | Rate limit and privacy-first contract | Rate-limit passthrough; fallback contract on error; login/email/owner/listing/moderation/paywall/suspension/block disabled states | CH-E019, CH-E020, CH-E046, CH-E056, CH-E068 | Focused route-handler status/cache/auth/privacy tests, no-bleed route test, and listing-page consumer tests passed; CH-E068 adds suspended/blocked route coverage and the focused route command passes; optional live-server parity remains P2 |
| Checkout creation | Protected | CSRF, auth, suspension, email, rate, listing, paywall, Stripe metadata | Rejects disabled states, own listing, unavailable listing, no purchase needed, Stripe/payment failure | CH-E048, CH-E053, CH-E058, CH-E071; `phase-4/02-api-data-flow.md`; `phase-4/04-auth-security-permissions.md` | Current route tests pass after fixture freshness repair; route-level CSRF variant coverage passes; mocked checkout-return browser runtime passes; real Stripe/webhook fulfillment remains P2 confidence coverage |
| Checkout-session status | Protected | Auth, rate, local payment ownership, metadata matching | Rejects invalid/mismatched/not owned session; returns classified status | CH-E047, CH-E058; `phase-4/02-api-data-flow.md` | Focused route/lib Jest passed, and mocked checkout-return browser runtime passed in CH-E058; real provider fulfillment remains P2 confidence coverage |
| Block/unblock | Protected | Block actions and shared send gates | Blocked banner replaces composer; send/start blocked | CH-E022 | Block UI tests missing |
| Notification/email send | Internal side effect | Shared message helper and email preferences | Email skipped when preference disables channel | CH-E014 | Actual delivery not verified |

## Security Notes

- Rate limits exist for start conversation, send message, messages API, polling, mark-read, viewer-state, checkout, and checkout-session. Evidence: CH-E026; `phase-4/04-auth-security-permissions.md`.
- Contact attempt metadata rejects keys that look like email, phone, address, message, or content. Evidence: CH-E011.
- `ChatWindow` includes a client-side guard against cross-conversation realtime inserts and notes missing `Message` RLS in historical code comments. CH-E062 adds mocked local proof that `ChatWindow` subscribes to the filtered `Message` insert channel, ignores a cross-conversation payload, accepts an in-conversation payload, and marks inbound messages read. CH-E070 records the historical pre-harness blocker. CH-E076 closes local Option A provider/RLS proof: local-only RLS audit showed policies for `Conversation`, `_ConversationParticipants`, `Message`, `ConversationDeletion`, and `TypingStatus`; only `Message` was in `supabase_realtime`; direct RLS passed 28 assertions; local Realtime passed 34 assertions; rollback and cleanup passed. Production/staging RLS policies are not claimed. Evidence: `src/app/messages/[id]/ChatWindow.tsx:400-431`; `src/lib/supabase.ts:52-63`; `src/__tests__/components/ChatWindow.test.tsx:371-478`; `goal-progress-provider-rls.md`; `phase-4/04-auth-security-permissions.md`; CH-E062; CH-E070; CH-E076.
- Broader profile-completion or identity-verification gates beyond email verification and suspension remain unknown. Evidence: CH-E031; `unknowns.md` CH-U013.

## CSRF Mechanism

State-changing API routes in this feature call `validateCsrf` before processing
POST bodies. Next.js server actions are not covered by this helper; the helper
is for API routes.

| Rule | Current source behavior | Evidence |
|---|---|---|
| Safe methods | `GET`, `HEAD`, and `OPTIONS` skip CSRF validation. | `src/lib/csrf.ts:7`, `29-34` |
| Mutation methods | Mutation requests require an `Origin` header. Missing origin returns `403` with `{ error: "Forbidden: missing Origin header" }`. | `src/lib/csrf.ts:36-45` |
| Malformed origin | Malformed origin returns `403` with `{ error: "Forbidden: malformed Origin header" }`. | `src/lib/csrf.ts:48-56` |
| Same-host rule | Origin host must equal the request `Host` header. Mismatch returns `403` with `{ error: "Forbidden: Origin mismatch" }`. | `src/lib/csrf.ts:72-79` |
| Development exception | Development allows localhost origin/host variants. | `src/lib/csrf.ts:59-70` |
| Test exception | `NODE_ENV === "test"` skips CSRF validation, which is why route tests using plain `Request` objects can pass without browser origin setup. | `src/lib/csrf.ts:26-28` |
| Contact-host routes using helper | `POST /api/messages` and `POST /api/payments/checkout` call the helper. | `src/app/api/messages/route.ts:270-272`; `src/app/api/payments/checkout/route.ts:163-164` |

CSRF route-call evidence is source-verified. Helper-level CSRF and messages-route
tests passed in CH-E049. Route-level missing-Origin rejection for
`/api/payments/checkout` passed inside the current checkout-route suite in
CH-E053. CH-E071 adds current deterministic route-handler proof for both
`POST /api/messages` and `POST /api/payments/checkout`: missing Origin,
malformed Origin, mismatched Origin, valid same-origin, and localhost-development
allowance all pass. Optional live-server transport parity remains separate P2
confidence coverage.

## Rate Limits

| Surface | Limit | Evidence |
|---|---|---|
| `messages` | 60/hour | `src/lib/rate-limit.ts:237` |
| `sendMessage` / API send | 100/hour | `src/lib/rate-limit.ts:246` |
| `unreadCount` | 60/minute | `src/lib/rate-limit.ts:253` |
| `messagesPoll` | 180/minute | `src/lib/rate-limit.ts:254` |
| `messageRead` | 120/minute | `src/lib/rate-limit.ts:255` |
| `chatSendMessage` | 100/hour | `src/lib/rate-limit.ts:279` |
| `chatStartConversation` | 20/hour | `src/lib/rate-limit.ts:280` |
| `paymentsCheckout` | 10/hour | `src/lib/rate-limit.ts:282` |
| `paymentsCheckoutStatus` | 60/minute | `src/lib/rate-limit.ts:283` |
| `viewerState` | 60/minute | `src/lib/rate-limit.ts:294` |
| `messagesPreAuth` | 300/hour per IP | `src/lib/rate-limit.ts:307` |
