# Auth, Security, And Permissions

Status: source-backed gate inventory. This file records observed gates and focused test evidence where cited; it does not certify production security.

| Action / API | Public or protected | Enforcement location | Failure behavior | Evidence | Unknowns |
|---|---|---|---|---|---|
| View listing detail | Public with viewer-state variants | Listing page and viewer-state API | Anonymous gets login-to-message contract; owner gets edit-listing | CH-E001, CH-E002, CH-E019, CH-E020, CH-E035, CH-E040, CH-E045 | Focused Chromium listing-detail Contact Host runtime verified; suspended/paywall/unavailable states remain gaps |
| Start conversation | Protected | `startConversation` | Unauthorized/session expired, rate limited, suspended, unverified, unavailable, self-contact, stale unit, blocked, paywall required/unavailable | CH-E005-CH-E011, CH-E032, CH-E034, CH-E040 | Direct full branch-matrix action test remains P1 |
| Send message by server action | Protected | `sendMessage`, `sendConversationMessage` | Unauthorized, rate limited, suspended, invalid, unverified, nonparticipant, unavailable listing, blocked, content flagged | CH-E012, CH-E013, CH-E032, CH-E034, CH-E040 | Runtime send path verified in Chromium/Mobile Chrome subsets; production Supabase policies/publications and skipped/fixme realtime cases remain gaps |
| GET `/api/messages` | Protected after pre-auth rate limit | API route | 401 without session; 403 on inaccessible conversation; private cache | CH-E015, CH-E032; `phase-4/04-auth-security-permissions.md` | Focused Jest passed; exact direct HTTP header capture remains gap |
| POST `/api/messages` | Protected | CSRF, auth, rate limit, schema, access checks | 400/401/403/429-style failures by branch | CH-E016, CH-E041, CH-E044 | CSRF source/helper coverage and route-level missing-Origin rejection passed; per-route malformed/mismatch variants remain optional confidence tests |
| Viewer-state API | Public/optional auth, private response | Rate limit and privacy-first contract | Fallback contract on error | CH-E019, CH-E020 | Exact runtime cache headers not called |
| Checkout creation | Protected | CSRF, auth, suspension, email, rate, listing, paywall, Stripe metadata | Rejects disabled states, own listing, unavailable listing, no purchase needed, Stripe/payment failure | CH-E044; `phase-4/02-api-data-flow.md`; `phase-4/04-auth-security-permissions.md` | Focused route Jest passed; checkout browser return remains P1 unless paid unlock is release-blocking |
| Checkout-session status | Protected | Auth, rate, local payment ownership, metadata matching | Rejects invalid/mismatched/not owned session; returns classified status | CH-E044; `phase-4/02-api-data-flow.md` | Focused route/lib Jest passed; checkout browser return remains P1 |
| Block/unblock | Protected | Block actions and shared send gates | Blocked banner replaces composer; send/start blocked | CH-E022 | Block UI tests missing |
| Notification/email send | Internal side effect | Shared message helper and email preferences | Email skipped when preference disables channel | CH-E014 | Actual delivery not verified |

## Security Notes

- Rate limits exist for start conversation, send message, messages API, polling, mark-read, viewer-state, checkout, and checkout-session. Evidence: CH-E026; `phase-4/04-auth-security-permissions.md`.
- Contact attempt metadata rejects keys that look like email, phone, address, message, or content. Evidence: CH-E011.
- `ChatWindow` includes a client-side guard against cross-conversation realtime inserts and notes missing `Message` RLS in code comments. Current repo inspection did not find a source-backed `Message`/`Conversation` RLS policy or Supabase realtime publication entry for messaging tables, so production Supabase policy/publication posture remains a P1 code-decision gap. Evidence: CH-E050; `src/app/messages/[id]/ChatWindow.tsx:420-544`; `src/lib/supabase.ts:52-63`; `phase-4/04-auth-security-permissions.md`.
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

CSRF route-call evidence is source-verified. Helper-level CSRF tests and
route-level missing-Origin rejection tests for `/api/messages` and
`/api/payments/checkout` passed in CH-E044. Per-route malformed-origin,
origin-mismatch, localhost dev allowance, and valid same-origin variants remain
optional confidence coverage.

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
