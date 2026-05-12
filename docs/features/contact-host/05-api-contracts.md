# API Contracts

Status: partially verified. Source contracts are documented, and latest focused Jest/API/security coverage passed for `/api/messages`, checkout creation route, checkout-session polling/status, viewer-state route contract/status/cache, viewer-state private-feedback no-bleed, listing-page viewer-state consumers, CSRF helper/messages-route coverage, and the approved uniform 1000-character message-length boundary. CH-E055 records passing WSL route-handler Jest evidence for direct `/api/messages` status/cache-header branches after a test-only stale-fixture repair, CH-E056 records passing WSL route-handler Jest evidence for direct viewer-state status/cache/contract branches, CH-E058 records mocked Chromium checkout return / paid-unlock runtime evidence, CH-E066 records the approved uniform 1000-character outbound message contract implementation, CH-E067 records passing focused Linux-side WSL Jest evidence for the updated boundary tests, CH-E068 records the implemented suspended/blocked viewer-state contract, and CH-E073 closes focused/full listing-detail Chromium proof for suspended/blocked states. Direct HTTP/runtime verification remains partial for realtime/polling behavior, optional live-server API parity, and real payment-provider fulfillment.

## Protocol Conventions

| Item | Current documented convention | Evidence | Verification status |
|---|---|---|---|
| Base URL | Same-origin relative app routes such as `/api/messages`; production transport is platform-managed HTTPS. | Route files under `src/app/api/**` | Source-level convention; no direct HTTP capture in this docs pass |
| Request content type | POST JSON APIs read `request.json()` and expect `Content-Type: application/json` in tests. | `src/app/api/messages/route.ts:282`; `src/app/api/payments/checkout/route.ts:196`; checkout tests | Source/test-source verified |
| Response content type | Routes use `NextResponse.json(...)`, so successful and error payloads are JSON. | API route source | Source verified |
| Cache | Contact-host API responses are private/no-store or private short cache by branch; exact headers are listed below where source-observed. | CH-E015, CH-E016, CH-E019, CH-E055, CH-E056; `phase-4/04-auth-security-permissions.md` | `/api/messages` and viewer-state route-handler assertions passed in WSL; optional direct HTTP live-server parity is P2 |

## Routes And Server Actions

| API / function | Method | Inputs | Validation / auth | Output | Errors / failure states | Cache | Evidence | Tests |
|---|---|---|---|---|---|---|---|---|
| `startConversation` | Server action | `listingId`, optional `clientIdempotencyKey`, optional `unitIdentityEpochObserved` | Auth, schema, `chatStartConversation`, suspension, email, contactability, self-contact, host suspension, unit epoch, block, paywall | `{ success: true, conversationId }` or `{ success: false, error, code?, paywallSummary? }` style result | Unauthorized/session expired, invalid input, rate limited, suspended, email unverified, unavailable listing, self-contact, host unavailable, stale unit, blocked, paywall required/unavailable | N/A | CH-E003, CH-E005-CH-E011, CH-E032, CH-E050, CH-E057, CH-E058 | Focused action/component Jest passed for covered branches; full Chromium messaging passed after CH-E057 test/setup synchronization; checkout-return runtime passed after mocked fulfillment in CH-E058 |
| `sendMessage` | Server action | `conversationId`, `content` up to the approved 1000-character outbound message max | Auth, `chatSendMessage`, suspension, schema, email, shared send gates | Created message result from shared helper | Unauthorized, rate limited, suspended, invalid, over 1000 characters, email unverified, access/listing/block failures | N/A | CH-E012, CH-E013, CH-E032, CH-E049, CH-E050, CH-E060, CH-E066, CH-E067 | `/api/messages` and action/component Jest passed for covered send paths historically; CH-E066 updates source and focused tests to the approved 1000 limit, and CH-E067 verifies the focused Linux-side WSL command |
| `/api/messages` | GET | `view=unreadCount`, or `conversationId`, optional `poll`, `lastMessageId`, `page`, `limit` | Pre-auth IP rate limit; auth required; conversation access for thread/polling | Unread count, polling messages plus typing users, thread messages, or conversation list | 401 unauthenticated, 403 inaccessible, rate-limit errors, validation errors, server errors | Private/no-store or private cache per branch | CH-E015, CH-E032, CH-E049, CH-E055; `phase-4/02-api-data-flow.md` | Focused Jest API coverage passed in CH-E049; CH-E055 WSL focused command passed after stale fixture repair and asserts GET status/cache branches |
| `/api/messages` | POST | JSON with `action: "markRead"` or message-send payload | CSRF, auth, body parse, rate limits, suspension/email checks, access checks, payload validation | Mark-read success or created message result | 400 invalid JSON/body, 401 unauthenticated, 403 inaccessible, 429 rate limit, send failures | `no-store` on source-observed send and mark-read paths | CH-E016, CH-E032, CH-E049, CH-E055; `phase-4/04-auth-security-permissions.md` | Focused Jest API coverage and missing-Origin CSRF rejection passed in CH-E049; CH-E055 WSL focused command passed after stale fixture repair and asserts send/mark-read no-store headers |
| `/api/listings/[id]/viewer-state` | GET | Listing id from route | `viewerState` rate limit; optional auth/session context | Privacy-first viewer contact contract, paywall summary, public availability, review/private-feedback context | Rate-limit passthrough; fallback privacy-first contract on errors; contact disabled reasons for login/email/owner/listing/moderation/paywall/suspension/block states | `private, no-store` on route-handler success and fallback paths | CH-E019, CH-E020, CH-E046, CH-E056, CH-E068, CH-E073 | Focused route-handler contract/status/cache Jest passed in CH-E056; CH-E068 adds and passes route coverage for the four suspended/blocked reasons; CH-E073 closes focused/full listing-detail Chromium proof |
| `/api/payments/checkout` | POST | `productCode`, `purchaseContext`, `listingId` for contact contexts, optional idempotency data | Feature flags, CSRF, rate limit, auth, suspension, email, product/context validation, listing contactability, own-listing rejection, paywall state | `checkoutUrl`, `sessionId` | Disabled payments/paywall, invalid request, unauthenticated, suspended, unverified, owner purchase, unavailable listing, no purchase required, Stripe/payment failures | Source-observed response sets no-store/private behavior | CH-E004, CH-E048, CH-E053, CH-E058; `phase-4/02-api-data-flow.md` | Current route tests pass after fixture freshness repair; mocked checkout-return browser runtime passed in CH-E058; real provider fulfillment remains P2 confidence coverage |
| `/api/payments/checkout-session` | GET | `session_id`, `listing_id`, purchase context query params | Feature flag, auth, `paymentsCheckoutStatus`, query validation, local payment ownership, metadata matching, optional Stripe metadata validation | Classified checkout snapshot for listing return | Unauthorized, invalid query, not found/mismatch, unfulfilled, canceled, expired, timeout, polling error | `private, no-store` helper observed | CH-E047, CH-E058; `phase-4/02-api-data-flow.md`; `manifest.json` | Focused route/lib Jest and mocked checkout-return browser runtime passed; real provider fulfillment remains P2 confidence coverage |

## Observed Error Shapes

The code does not enforce one shared `ErrorResponse` type. Current docs should
therefore describe the observed union rather than inventing one canonical
schema.

| Shape | Meaning | Evidence |
|---|---|---|
| `{ "error": string }` | Common route error body. | `src/app/api/messages/route.ts:87`, `277`, `286`; `src/app/api/payments/checkout-session/route.ts:44` |
| `{ "error": string, "code": string }` | Domain-coded failure such as send helper or payments-disabled branches. | `src/app/api/messages/route.ts:373-377`; `src/app/api/payments/checkout/route.ts:152-159` |
| `{ "error": string, "details": object }` | Validation failure with flattened field errors. | `src/app/api/payments/checkout-session/route.ts:72-80` |
| Rate-limit response | Returned by shared rate-limit helpers, shape not expanded in this doc. | `src/lib/with-rate-limit.ts`; `src/lib/rate-limit.ts` |

## Request / Response Field Reference

### Server Actions

| Function | Request fields | Success fields | Failure fields | Evidence |
|---|---|---|---|---|
| `startConversation` | `listingId: string`; `clientIdempotencyKey?: string`; `unitIdentityEpochObserved?: positive integer` | `success: true`; `conversationId: string` | `success: false`; `error: string`; optional `code`; optional `paywallSummary` | CH-E003, CH-E005-CH-E011 |
| `sendMessage` | `conversationId: string`; `content: string` with approved max `1000` | Created message result from `sendConversationMessage` | Auth/rate/suspension/schema/email/access/listing/block failures; over-limit copy is `Message must be 1000 characters or less.` | CH-E012, CH-E013, CH-E060, CH-E066, CH-E067 |

### `/api/messages`

| Branch | Request fields | Success fields | Error fields | Cache | Evidence |
|---|---|---|---|---|---|
| `GET ?view=unreadCount` | `view: "unreadCount"` | `count: number` | `{ error: string }` | `private, max-age=10, stale-while-revalidate=20` | `src/app/api/messages/route.ts:98-114` |
| `GET ?conversationId=...&poll=1` | `conversationId: string`; `poll?: "1"`; `lastMessageId?: string` | `messages: Message[]`; `typingUsers: { id: string; name: string | null }[]`; `hasNewMessages: boolean` | `{ error: string }` | `private, no-store` | `src/app/api/messages/route.ts:116-166` |
| `GET ?conversationId=...` | `conversationId: string`; optional pagination params | `messages: Message[]`; `pagination: object` | `{ error: string }` | `private, no-store` | `src/app/api/messages/route.ts:169-204` |
| `GET` conversation list | optional pagination params | `conversations: Conversation[]`; `pagination: object` | `{ error: string }` | `private, no-store` | `src/app/api/messages/route.ts:207-264` |
| `POST action=markRead` | JSON body with `action: "markRead"` and `conversationId: string` | `success: true`; `count: number` | `{ error: string }` | `no-store` | `src/app/api/messages/route.ts:291-324` |
| `POST` send | JSON body with `conversationId: string`; `content: string` up to approved API schema max `1000`; optional action omitted | Created message object; HTTP `201` | `{ error: string }` or `{ error: string; code: string }`; over-limit copy is `Message must be 1000 characters or less.` | `no-store` | `src/app/api/messages/route.ts:327-382`; CH-E060, CH-E066, CH-E067 |

### Message Length Contract Classification

The product decision is approved as one uniform 1000-character outbound message
limit. Current source uses `OUTBOUND_MESSAGE_MAX_LENGTH = 1000` for the thread
composer, inbox composer, `sendMessage` server action schema, and direct
`/api/messages` POST schema. UI over-limit copy is `Maximum 1000 characters
allowed.` and server/API over-limit copy is `Message must be 1000 characters or
less.` The `Message.content` database column remains unconstrained text, so the
application layer is authoritative for the outbound limit. Evidence: CH-E060,
CH-E066, CH-E067.

Focused boundary tests were updated for 1000 accepted, 1001 rejected, and
empty/whitespace rejection where the existing contract requires it. The focused
Linux-side WSL Jest command passed: 5 suites and 97 tests. The prior Windows/UNC
attempts failed before test execution because pnpm could not resolve WSL
symlinked `node_modules`; see `goal-progress-message-limit-1000.md`.

### Viewer-State API

| Field | Type / values | Notes | Evidence |
|---|---|---|---|
| `isLoggedIn` | boolean | False for anonymous branch, true for authenticated branch. | `src/app/api/listings/[id]/viewer-state/route.ts:121`, `218` |
| `hasBookingHistory` | boolean | Current route returns `false`. | `src/app/api/listings/[id]/viewer-state/route.ts:122`, `219` |
| `existingReview` | object or `null` | Authenticated branch includes `id`, `rating`, `comment`, `createdAt` when present. | `src/app/api/listings/[id]/viewer-state/route.ts:220-229` |
| `primaryCta` | `EDIT_LISTING`, `CONTACT_HOST`, `LOGIN_TO_MESSAGE`, `VERIFY_EMAIL_TO_MESSAGE` | Comes from privacy-first viewer contract. | `src/lib/listings/public-contact-contract.ts:22-25`, `193-200` |
| `canContact` | boolean | True only when `contactDisabledReason` is null. | `src/lib/listings/public-contact-contract.ts:206` |
| `contactDisabledReason` | `LOGIN_REQUIRED`, `EMAIL_VERIFICATION_REQUIRED`, `OWNER_VIEW`, `LISTING_UNAVAILABLE`, `MIGRATION_REVIEW`, `MODERATION_LOCKED`, `PAYWALL_REQUIRED`, `VIEWER_SUSPENDED`, `HOST_SUSPENDED`, `VIEWER_BLOCKED_HOST`, `HOST_BLOCKED_VIEWER`, or `null` | Authenticated non-owner viewer restrictions are applied before paywall replacement: suspended viewer, suspended host, viewer-blocks-host, then host-blocks-viewer. Paywall enforcement can replace only a still-contactable state with `PAYWALL_REQUIRED`. | `src/lib/listings/public-contact-contract.ts:14-25`; `src/lib/listings/public-contact-contract.ts:254-268`; `src/app/api/listings/[id]/viewer-state/route.ts:33-116`; `src/app/api/listings/[id]/viewer-state/route.ts:320-342` |
| `availabilitySource` | public availability source enum | From public availability resolver. | `src/lib/listings/public-contact-contract.ts:50` |
| `canBook`, `canHold` | always `false` | Contact-first invariant. | `src/lib/listings/public-contact-contract.ts:51-52`, `207-208` |
| `bookingDisabledReason` | `CONTACT_ONLY`, auth/listing reason, or `null` | Compatibility field; not an active booking flow. | `src/lib/listings/public-contact-contract.ts:27-33`, `209-211` |
| `publicAvailability` | object or `null` | Privacy-first availability summary. | `src/app/api/listings/[id]/viewer-state/route.ts:130`, `234` |
| `paywallSummary` | object or `null` | Message-start paywall summary. | `src/app/api/listings/[id]/viewer-state/route.ts:131`, `235` |
| `needsMigrationReview` | boolean-like value from listing context | Included in both anonymous and authenticated branches. | `src/app/api/listings/[id]/viewer-state/route.ts:132`, `236` |
| `reviewEligibility` | object | Built from login/owner/email/review/conversation/private-feedback state. | `src/app/api/listings/[id]/viewer-state/route.ts:133-141`, `237-245` |

### Checkout APIs

| API | Request fields | Success fields | Error fields | Evidence |
|---|---|---|---|---|
| `POST /api/payments/checkout` | JSON body with `productCode`, `purchaseContext`, `listingId` for contact contexts, optional `clientIdempotencyKey` | `checkoutUrl: string | null`; `sessionId: string` | `{ error }` or `{ error, code }` | `src/app/api/payments/checkout/route.ts:110-144`, `455-459`; `src/__tests__/api/payments-checkout-route.test.ts:234-330` |
| `GET /api/payments/checkout-session` | `session_id: string`; optional `listing_id`; optional `context` | `sessionId`, `purchaseContext`, `listingId`, `productCode`, `checkoutStatus`, `paymentStatus`, `fulfillmentStatus`, `requiresViewerStateRefresh` | `{ error }` or `{ error, details }` | `src/app/api/payments/checkout-session/route.ts:48-179`; `src/lib/payments/checkout-session-status.ts:27-35`; `src/__tests__/api/payments-checkout-session-route.test.ts:172-240` |

Checkout-session enum values:

| Field | Values | Evidence |
|---|---|---|
| `purchaseContext` | `CONTACT_HOST`, `PHONE_REVEAL`, `SEARCH_ALERTS` | `src/lib/payments/checkout-session-status.ts:3` |
| `checkoutStatus` | `OPEN`, `COMPLETE`, `EXPIRED` | `src/lib/payments/checkout-session-status.ts:27` |
| `paymentStatus` | `PAID`, `UNPAID` | `src/lib/payments/checkout-session-status.ts:28` |
| `fulfillmentStatus` | `PENDING`, `FULFILLED`, `FAILED`, `CANCELED` | `src/lib/payments/checkout-session-status.ts:29-33` |

## Public Contact Contract Fields

| Field family | Current documented meaning | Evidence |
|---|---|---|
| CTA state | `primaryCta` can select edit listing, contact host, login to message, or verify email to message. | CH-E002, CH-E020 |
| Contact permission | `canContact` plus `contactDisabledReason` determine whether the button is active, disabled, paywall-gated, or replaced with login/verify links. Suspended and blocked pre-click states use explicit disabled reasons and safe, non-disclosing copy. | CH-E002, CH-E020, CH-E068 |
| Availability | Public availability and listing contactability block unavailable, migration-review, moderation-locked, inactive, or missing listings. | CH-E020, CH-E021 |
| No booking state | Contact contract explicitly keeps booking and hold unavailable through `canBook: false` and `canHold: false`. | CH-E020 |
| Paywall summary | Paywall state can be open, metered, active pass, frozen, purchase required, unavailable, or migration bypass. | CH-E010, CH-E025 |

## Response Field Tables

These tables are compact reconstruction references. They list fields proven by
source evidence and mark direct HTTP/runtime gaps explicitly.

### `/api/messages`

| Branch | Successful response fields | Error/status families | Cache/header status | Evidence | Verification status |
|---|---|---|---|---|---|
| `GET ?view=unreadCount` | Unread-count payload for the current user. | `401` without auth; rate-limit failures. | Private cached branch observed in source and asserted in passing focused Jest. | CH-E015, CH-E032, CH-E055; `phase-4/02-api-data-flow.md` Flow 4 | CH-E055 WSL focused command passed after stale fixture repair |
| `GET ?conversationId=...&poll=1` | New messages after optional cursor plus typing users. | `401` unauthenticated; `403` inaccessible conversation; rate/validation/server errors. | `private, no-store` observed in source and asserted in passing focused Jest. | CH-E015, CH-E032, CH-E055; `phase-4/02-api-data-flow.md` Flow 4 | CH-E055 WSL focused command passed; browser fallback is a P2/future confidence gap, while provider-level Supabase realtime/RLS remains P1 |
| `GET ?conversationId=...` | Paginated thread messages. | `401` unauthenticated; `403` inaccessible conversation; pagination/server errors. | `private, no-store` observed in source and asserted in passing focused Jest. | CH-E015, CH-E032, CH-E055 | CH-E055 WSL focused command passed |
| `GET` with no conversation id | Conversation list excluding admin-deleted and per-user-deleted conversations, with latest message/listing/participants and pagination. | `401` unauthenticated; rate/server errors. | `private, no-store` observed in source and asserted in passing focused Jest. | CH-E015, CH-E032, CH-E055 | CH-E055 WSL focused command passed; inbox search/mark-all-read browser gaps remain |
| `POST action=markRead` | Mark-read success result. | `400` invalid body; `401`; `403`; `429`; server errors. | `no-store` observed in source and asserted in passing focused Jest. | CH-E016, CH-E032, CH-E055 | CH-E055 WSL focused command passed; UI mark-all-read is a P2/future confidence gap |
| `POST` send payload | Created message result. | `400` invalid body; `401`; `403`; `429`; send helper failures. | `no-store` source path and asserted in passing focused Jest. | CH-E016, CH-E032, CH-E049, CH-E050, CH-E055, CH-E057 | CH-E055 WSL focused command passed after active listing fixture repair; full Chromium messaging passed after CH-E057 test/setup synchronization |

### Viewer-State And Checkout APIs

| API | Successful response fields | Error/status families | Cache/header status | Evidence | Verification status |
|---|---|---|---|---|---|
| `GET /api/listings/[id]/viewer-state` | Privacy-first contact contract, public availability, paywall summary, review/private-feedback context when applicable. | Rate-limit passthrough; fallback privacy-first contract; login/email/owner/listing/moderation/paywall disabled reasons. | `private, no-store` asserted on route-handler success and fallback paths. | CH-E019, CH-E020, CH-E046, CH-E056; `phase-4/02-api-data-flow.md` Flow 1 | Focused route-handler contract/status/cache tests passed; optional live-server direct HTTP parity is P2 |
| `POST /api/payments/checkout` | `checkoutUrl`, `sessionId`. | Disabled paywall/payment, invalid request, unauthenticated, suspended, unverified email, own listing, unavailable listing, purchase no longer required, Stripe/payment errors. | Source-observed private/no-store style behavior. | CH-E004, CH-E048, CH-E053, CH-E058; `phase-4/02-api-data-flow.md` Flow 3 | Current route tests pass after fixture freshness repair; mocked checkout-return browser runtime passed; real provider fulfillment remains P2 |
| `GET /api/payments/checkout-session` | Classified checkout snapshot for listing return and viewer-state refresh decisions. | Unauthorized, invalid query, local payment not found, metadata mismatch, unfulfilled, canceled, expired, timeout, polling error. | Private/no-store helper observed in source. | CH-E047; `phase-4/02-api-data-flow.md` Flow 3; `manifest.json` | Focused route/lib Jest passed; direct HTTP/cache-header capture is a P2/future confidence gap |

## Cache / Privacy Rules

| Surface | Source-observed cache/privacy behavior | Evidence |
|---|---|---|
| Message polling/thread/list APIs | Private/no-store or private cache headers are set on source-observed GET branches. | CH-E015; `phase-4/04-auth-security-permissions.md` |
| Message POST | Send/mark-read responses are not public cacheable in source-observed path. | CH-E016 |
| Viewer-state API | Returns `private, no-store` on success and fallback paths. | CH-E019, CH-E056 |
| Checkout and checkout-session | Source-observed payment routes return private/no-store style responses and validate user ownership/metadata. | `phase-4/04-auth-security-permissions.md` |

## API Gaps

- `/api/messages` route-handler status/cache-header proof passed in CH-E055 after a test-only stale-fixture repair. Optional direct HTTP live-server capture remains P2 confidence coverage if release acceptance requires transport-level proof outside route-handler Jest. Evidence: `unknowns.md` CH-U010; `evidence-register.md` CH-E049, CH-E055.
- Viewer-state route-handler contract/status/cache tests passed in CH-E056. Optional direct HTTP live-server capture remains P2 confidence coverage if release acceptance requires transport-level proof outside route-handler Jest. Evidence: `11-test-traceability-matrix.md`; `evidence-register.md` CH-E046, CH-E056.
- CSRF implementation behavior is source-documented, helper-level/messages-route tests pass, direct missing-Origin route rejection passes for `/api/payments/checkout` inside the current passing checkout-route suite, and CH-E071 adds per-route missing/malformed/mismatched Origin plus valid same-origin and localhost-development allowance coverage for both documented Contact Host mutation routes. Evidence: `08-auth-security-permissions.md`; `evidence-register.md` CH-E041, CH-E049, CH-E053, CH-E071.

## Current Provider-Level Classification

Provider-level Supabase realtime/RLS remains P1 because the docs do not assert
provider delivery/RLS as fully verified. Checkout browser return is closed by
CH-E058 for mocked Chromium runtime; real provider fulfillment remains P2
confidence coverage.
Direct `/api/messages` route-handler status/cache proof is closed by CH-E055,
and direct viewer-state route-handler status/cache/contract proof is closed by
CH-E056. The clean full Chromium messaging rerun is closed by CH-E057 after a
narrow test/setup synchronization fix; optional direct HTTP live-server parity
is P2 confidence coverage.
Expanded per-route CSRF variants are closed for deterministic route-handler Jest
by CH-E071. Direct live-server contract proof remains separate optional P2
confidence coverage. These items should be promoted to P0 if product acceptance
requires paid unlock, direct live-server contract proof, or realtime delivery
proof before release.
The message-length product-decision blocker is resolved by the approved uniform
1000-character policy, CH-E066 implementation, and CH-E067 focused Linux-side
WSL Jest pass.
The suspended/blocked listing-detail contract blocker is closed for scoped
Chromium listing-detail proof by CH-E073 after CH-E068 added source, route test,
fixture, and focused E2E test coverage for `VIEWER_SUSPENDED`,
`HOST_SUSPENDED`, `VIEWER_BLOCKED_HOST`, and `HOST_BLOCKED_VIEWER`.
