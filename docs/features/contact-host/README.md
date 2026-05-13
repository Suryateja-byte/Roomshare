# Contact Host Flow

Status: evidence-backed draft from the current dirty worktree. Phase 1/2 source
discovery and Phase 4 evidence passes are complete. Latest verification passed
deterministic viewer-state route/listing-page, checkout creation route,
checkout-session, CSRF/messages API, messaging/contact-host action/component
tests, affected contact/payment tests, direct `/api/messages` route-handler
status/cache-header tests, historical message-length cap assertions,
fallback polling, API read/unread isolation, mocked client-side realtime insert
handling, plus focused listing-detail Contact Host Chromium runtime, the full
Chromium messaging journey, mocked Chromium checkout return / paid-unlock
runtime, the scoped listing-detail browser state matrix for paywall-required,
unavailable, migration-review, and moderation-locked states, and focused
WebKit/Firefox/Mobile Chrome/Mobile Safari listing-detail plus messaging matrix
evidence. CH-E068 implements the approved suspended/blocked viewer-state
contract, disabled listing-detail copy, route tests, and E2E fixture/test source;
CH-E073 closes the historical CH-E068 execution gap with focused four-state
Chromium listing-detail proof and a full listing-detail Contact Host Chromium
spec rerun. CH-E064 closes the old Firefox missing-executable blocker and
reproduces the focused Firefox image decode and `NS_BINDING_ABORTED` test/setup
failures; CH-E065 closes those two focused Firefox blockers with narrow
test/helper changes and records a passing practical combined Firefox two-spec
run. Local Supabase Option A provider/RLS proof is closed by CH-E076. Email
delivery, optional production/staging Supabase provider proof, optional direct
HTTP live-server API parity, real Stripe/webhook provider fulfillment, and
provider-level runtime behavior remain documented runtime gaps. Production and
staging RLS policies are not claimed; email and real payment-provider
fulfillment are P2. CH-E067 closes the
message-length P1 with a passing focused Linux-side WSL Jest command. Evidence:
`manifest.json`; `evidence-register.md` CH-E001-CH-E076;
`phase-4/01-ui-interaction-census.md`; `phase-4/05-test-traceability.md`.

## Purpose

Contact Host lets a viewer start or resume a listing-linked conversation from listing detail, then continue the conversation in `/messages` or `/messages/[id]`. The documented current flow is contact-first: listing detail states that no booking request or hold is created from the page. Evidence: `evidence-register.md` CH-E001, CH-E003, CH-E017, CH-E018.

## Current Implementation Summary

Listing detail renders a contact CTA through `MessagingCta` and `ContactHostButton`. The button calls `startConversation`, handles login and paywall errors, and navigates to `/messages/{conversationId}` after success. Evidence: `evidence-register.md` CH-E002-CH-E004.

`startConversation` enforces auth, rate limiting, suspension, email verification, listing contactability, self-contact prevention, host suspension, stale unit epoch checks, block checks, idempotency, duplicate conversation reuse, paywall consumption, and contact-attempt logging. Evidence: `evidence-register.md` CH-E005-CH-E011.

After a conversation exists, message sending uses `sendMessage` and `sendConversationMessage`; message APIs and pages provide inbox, thread, polling, unread count, mark-read, notification, and email paths. Evidence: `evidence-register.md` CH-E012-CH-E018.

## Main Entry Points

| Area | Entry point | Evidence |
|---|---|---|
| Listing detail CTA | `src/app/listings/[id]/ListingPageClient.tsx` | CH-E001, CH-E002 |
| Contact action | `src/components/ContactHostButton.tsx` | CH-E003, CH-E004 |
| Conversation start | `src/app/actions/chat.ts` `startConversation` | CH-E005-CH-E011 |
| Messages inbox | `/messages`, `MessagesPageClient` | CH-E017 |
| Message thread | `/messages/[id]`, `ChatWindow` | CH-E018 |
| Messages API | `GET/POST /api/messages` | CH-E015, CH-E016 |
| Viewer-state API | `GET /api/listings/[id]/viewer-state` | CH-E019, CH-E020 |
| Checkout handoff | `POST /api/payments/checkout`, `GET /api/payments/checkout-session` | `phase-4/02-api-data-flow.md` Flow 3 |

## Source Of Truth

The committed server truth is the database-backed conversation, message, block, listing, contact-attempt, and entitlement state. Listing detail uses a fallback viewer contact state until the viewer-state API returns a privacy-first contact contract. Client state owns transient UI concerns: loading, paywall dialog, optimistic messages, drafts, typing, polling/realtime mode, and blocked banners. Evidence: `phase-4/03-state-model.md`; `evidence-register.md` CH-E019-CH-E023.

## Key Invariants

`Source-Verification Status` means the cited source/schema/test evidence
supports the rule. It does not mean every runtime/browser state is proven; use
`runtime-verification.md` and `11-test-traceability-matrix.md` for command
evidence.

| Invariant | Source-Verification Status | Evidence |
|---|---|---|
| Contact-host is not booking or holding inventory. | Verified by source | CH-E001, CH-E020 |
| Starting contact requires authenticated, non-suspended, email-verified users. | Verified by source | CH-E006 |
| Users cannot contact themselves through their own listing. | Verified by source | CH-E007 |
| Missing, unavailable, inactive, migration-review, and moderation-locked listings block contact. | Verified by source | CH-E007, CH-E021 |
| Block relationships stop contact start and later message sending. | Verified by source | CH-E007, CH-E013, CH-E022 |
| Existing conversations are reused or resurrected instead of creating duplicates when source conditions match. | Verified by source | CH-E008, CH-E009 |
| Message-start paywall can require purchase, be unavailable, be bypassed, or consume an entitlement. | Verified by source | CH-E010, CH-E025 |
| Message length contract is approved as one 1000-character outbound limit across inbox, thread, server action, and direct API source; focused Linux-side WSL Jest execution passed. | Closed P1 | CH-E030, CH-E060, CH-E066, CH-E067, CH-G007 |
| Runtime behavior is not accepted until browser/tests prove each scoped flow. | Partially verified with current deterministic gates, viewer-state route contract, checkout creation route, affected contact/payment tests, focused listing-detail runtime passing, CH-E055 message status/cache-header assertions passing, full Chromium messaging passing after CH-E057 test/setup synchronization, checkout-return browser runtime passing in CH-E058, scoped paywall/unavailable/migration/moderation listing-detail state-matrix proof in CH-E059/CH-E061, focused WebKit/Mobile Chrome/Mobile Safari listing-detail and messaging proof in CH-E063, Firefox install plus reduced post-install failure classification in CH-E064, CH-E068 suspended/blocked source/test/fixture proof plus CH-E073 focused four-state Chromium listing-detail execution and full listing-detail Contact Host Chromium rerun, historical message-length cap assertions in CH-E060, updated 1000-limit source/test coverage in CH-E066, fallback/realtime/API isolation reduction in CH-E062, and local Supabase Option A provider/RLS proof in CH-E076 | CH-E027, CH-E032-CH-E076 |

## Quick Links

- [Feature boundary](./00-feature-boundary.md)
- [Source map](./01-source-map.md)
- [User flows](./02-user-flows.md)
- [Interaction census](./03-interaction-census.md)
- [Runtime sequences](./04-runtime-sequences.md)
- [API contracts](./05-api-contracts.md)
- [Data model and invariants](./06-data-model-and-invariants.md)
- [State management](./07-state-management.md)
- [Auth/security/permissions](./08-auth-security-permissions.md)
- [Errors, empty, loading, edge cases](./09-errors-empty-loading-edge-cases.md)
- [Performance and observability](./10-performance-observability.md)
- [Test traceability matrix](./11-test-traceability-matrix.md)
- [Gaps and unknowns](./12-gaps-unknowns-and-questions.md)
- [Runtime verification](./runtime-verification.md)
- [Round-trip review](./round-trip-review.md)
- [Evidence register](./evidence-register.md)
- [Manifest](./manifest.json)
