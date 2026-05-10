# Phase 4 Evidence Pass 05: Test Traceability

Status: historical Phase 4 source-only evidence pass. No tests were run during
this pass. Later focused command results supersede the `NOT RUN` cells below and
are recorded in `../11-test-traceability-matrix.md` and
`../evidence-register.md` CH-E032-CH-E049. Current passing evidence includes
focused component/API/security tests, checkout/checkout-session route tests,
private-feedback no-bleed, CSRF helper and route missing-Origin tests, P1
checkout/session/paywall/restoration/email-helper/suspension/contact-attempt
unit/API tests, Chromium messaging, Mobile Chrome no-deps/setup-backed, and
focused listing-detail Contact Host runtime, plus PR #123 runnable messaging
functional-core CI coverage. Remaining gaps are full
viewer-state contract/status/cache proof, checkout browser return, Supabase RLS,
skipped/fixme messaging realtime cases,
actual email delivery, state-matrix browser coverage, message length resolution,
and browser coverage outside configured CI projects.

## Manifest-Listed Test Inventory

| Test file | Source-observed coverage | Phase 4 run status | Evidence |
| --- | --- | --- | --- |
| `src/__tests__/components/ContactHostButton.test.tsx` | Button rendering, loading state, auth redirect, error toast, success redirect, unit epoch propagation, double-click guard, paywall dialog, checkout handoff, `PAYWALL_REQUIRED`, and `PAYWALL_UNAVAILABLE`. | NOT RUN | `src/__tests__/components/ContactHostButton.test.tsx:33-297` |
| `src/__tests__/api/messages.test.ts` | Messages API auth, pre-auth rate limit, participant authorization, polling, conversation list, send validation, email verification, block gates, suspended host, successful send notification/email, outbound content flags, listing unavailable, migration review, and DB error cases. | NOT RUN | `src/__tests__/api/messages.test.ts:93-624` |
| `src/__tests__/lib/messaging/listing-contactable.test.ts` | Contactability utility for active listing, extra-field preservation, paused/rented listings, null/undefined listing, stale host-managed listing, migration review, and moderation lock. | NOT RUN | `src/__tests__/lib/messaging/listing-contactable.test.ts:23-134` |
| `tests/e2e/concurrent/conversation-dedup.spec.ts` | Parallel contact-host clicks, rapid double-click, and re-contacting the same host/listing returning the same conversation. | NOT RUN | `tests/e2e/concurrent/conversation-dedup.spec.ts:1-247` |
| `tests/e2e/journeys/22-messaging-conversations.spec.ts` | Existing-conversation send, search/listing/contact-host/send journey, and messages empty-state/conversation-state journey. | NOT RUN | `tests/e2e/journeys/22-messaging-conversations.spec.ts:1-245` |

## Behavior-To-Test Traceability

| Behavior / claim area | Covered by manifest-listed tests? | Evidence |
| --- | --- | --- |
| Contact button renders normal CTA and enters loading/disabled state while start is pending. | Yes, component test. | `src/__tests__/components/ContactHostButton.test.tsx:39-52` |
| Unauthorized contact start sends viewer to login. | Yes, component test. | `src/__tests__/components/ContactHostButton.test.tsx:54-63` |
| Contact start errors toast and loading resets. | Yes, component test. | `src/__tests__/components/ContactHostButton.test.tsx:65-76`; `src/__tests__/components/ContactHostButton.test.tsx:124-145` |
| Successful contact start navigates to the message thread. | Yes, component test. | `src/__tests__/components/ContactHostButton.test.tsx:78-87` |
| Observed unit identity epoch is included only when provided. | Yes, component test. | `src/__tests__/components/ContactHostButton.test.tsx:89-122` |
| Rapid double-click guard prevents duplicate client calls. | Yes, component test and E2E. | `src/__tests__/components/ContactHostButton.test.tsx:147-154`; `tests/e2e/concurrent/conversation-dedup.spec.ts:137-205` |
| Paywall-required contact opens unlock UI instead of starting a conversation. | Yes, component test. | `src/__tests__/components/ContactHostButton.test.tsx:156-203`; `src/__tests__/components/ContactHostButton.test.tsx:253-279` |
| Checkout handoff posts to `/api/payments/checkout` and redirects to Stripe checkout URL. | Yes, component test with mocked `fetch`. | `src/__tests__/components/ContactHostButton.test.tsx:205-251` |
| Paywall unavailable shows retry-later copy. | Yes, component test. | `src/__tests__/components/ContactHostButton.test.tsx:281-296` |
| Messages GET requires auth and pre-auth rate limit runs before auth. | Yes, API test. | `src/__tests__/api/messages.test.ts:117-148` |
| Conversation-message GET enforces participant authorization. | Yes, API test. | `src/__tests__/api/messages.test.ts:150-197` |
| Polling read returns messages and typing users without mutating read state. | Yes, API test. | `src/__tests__/api/messages.test.ts:199-244` |
| Conversation list returns conversations when no `conversationId` is supplied. | Yes, API test. | `src/__tests__/api/messages.test.ts:246-269` |
| POST `/api/messages` rejects unauthenticated, invalid, non-participant, and unverified-email sends. | Yes, API test. | `src/__tests__/api/messages.test.ts:283-336` |
| POST `/api/messages` blocks both directions of user block relationship. | Yes, API test. | `src/__tests__/api/messages.test.ts:338-400` |
| Existing thread send is blocked when target host is suspended. | Yes, API test. | `src/__tests__/api/messages.test.ts:402-438` |
| Successful direct API send creates message, updates conversation, emits internal notification, and sends preference-aware email. | Yes, API test. | `src/__tests__/api/messages.test.ts:440-499` |
| Outbound content soft flags are recorded for direct API sends. | Yes, API test. | `src/__tests__/api/messages.test.ts:501-543` |
| Existing-thread send is blocked for unavailable or migration-review listings. | Yes, API test. | `src/__tests__/api/messages.test.ts:545-608` |
| Contactability utility rejects null/missing, unavailable, stale, migration-review, and moderation-locked listings. | Yes, unit test. | `src/__tests__/lib/messaging/listing-contactable.test.ts:23-134` |
| Parallel contact-host clicks return the same conversation. | Yes, E2E, but setup can skip when test API/listing unavailable. | `tests/e2e/concurrent/conversation-dedup.spec.ts:56-135` |
| Re-contacting the same listing returns the existing conversation. | Yes, E2E, but setup can skip when test API/listing unavailable. | `tests/e2e/concurrent/conversation-dedup.spec.ts:210-247` |
| Existing-conversation send appears in the thread. | Partially, E2E can skip on mobile/no auth/no conversations. | `tests/e2e/journeys/22-messaging-conversations.spec.ts:22-91` |
| Search to listing to contact host to message journey. | Partially, E2E can skip when listing/contact button/session is unavailable. | `tests/e2e/journeys/22-messaging-conversations.spec.ts:93-189` |
| Messages page shows conversations or empty state. | Partially, E2E can skip on Mobile Chrome or auth redirect. | `tests/e2e/journeys/22-messaging-conversations.spec.ts:191-245` |

## Coverage Gaps

| Gap | Why it matters | Evidence / basis |
| --- | --- | --- |
| Tests were not executed in Phase 4. | Traceability is source-based; pass/fail status remains unknown. | Manifest marks all listed tests `NOT RUN in Phase 1/2` at `docs/features/contact-host/manifest.json:447-477`; Phase 4 command result: NOT RUN. |
| Checkout-session browser return remains unverified. | Listing return after payment depends on ownership/metadata validation and fulfillment status response. | Phase 4 found the route from `src/app/api/payments/checkout-session/route.ts:48-179`; focused route/lib tests passed later in CH-E044, but browser checkout return remains a gap. |
| Viewer-state route has no manifest-listed test. | Contact CTA state and paywall-required conversion depend on `/api/listings/[id]/viewer-state`. | `src/app/api/listings/[id]/viewer-state/route.ts:69-307`; no corresponding manifest test entry. |
| `startConversation` server action has E2E coverage for dedupe but no manifest-listed direct unit/integration test for all gate branches. | Auth, suspension, email, stale epoch, host suspension, block, paywall, and contact-attempt outcomes are high-value branch points. | `src/app/actions/chat.ts:54-353`; tests cover some paths indirectly through component/E2E. |
| Checkout creation API browser return is not covered. | Product/context validation, CSRF, abuse, owner rejection, contactability, paywall no-op, metadata, Stripe idempotency, and persistence need route and runtime evidence. | Phase 4 source evidence: `src/app/api/payments/checkout/route.ts:110-459`; `src/__tests__/components/ContactHostButton.test.tsx:205-251`. Focused checkout route tests passed later in CH-E044; browser checkout return remains a gap. |
| Block/unblock UI is not directly covered by manifest-listed tests. | Composer replacement and unblock behavior affect message permissions UX. | UI source: `src/app/messages/[id]/ChatWindow.tsx:789-864`; `src/app/messages/[id]/ChatWindow.tsx:1010-1018`; no listed test explicitly targets it. |
| Realtime/presence/typing runtime is not directly covered by manifest-listed tests. | Supabase event delivery and fallback correctness are core chat behavior but source-only here. | UI source: `src/app/messages/[id]/ChatWindow.tsx:388-533`; `tests/e2e/journeys/22-messaging-conversations.spec.ts` does not assert realtime/presence directly. |
| Message length limit mismatch has no traceability resolution. | Inconsistent caps can cause client/server disagreement and confusing UX. | `src/components/MessagesPageClient.tsx:53`; `src/app/messages/[id]/ChatWindow.tsx:69`; `src/app/actions/chat.ts:43-46`; `src/app/api/messages/route.ts:23-27` |
| Expanded per-route CSRF variants remain optional confidence coverage. | API POST routes call `validateCsrf`; Phase 4 did not inspect the helper or execute tests. | `src/app/api/messages/route.ts:270-272`; `src/app/api/payments/checkout/route.ts:163-164`; `src/__tests__/api/messages.test.ts:283-624`. Later CH-E041/CH-E044 verified the helper matrix and route-level missing-Origin rejection for `/api/messages` and `/api/payments/checkout`; per-route malformed/mismatched Origin variants remain optional confidence tests. |

## Suggested Verification Order For Later Phase

1. Narrow component tests for `ContactHostButton`.
2. Narrow unit/API tests for `listing-contactable`, `messages` API, viewer-state route, checkout route, and checkout-session route.
3. Direct server-action tests or integration tests for `startConversation` gate branches and idempotency/contact-attempt outcomes.
4. E2E contact-host dedupe spec.
5. E2E messaging journey spec across desktop and mobile projects.
6. Browser/runtime checks for paywall dialog, checkout return notices, blocked conversation UI, realtime fallback, and accessibility/focus behavior.
