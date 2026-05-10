# Contact Host Flow

Status: evidence-backed draft verified again from merged `main` commit `b9e6cea0` after PR #123 was squash-merged. Phase 1/2 source discovery and Phase 4 evidence passes are complete. Focused Contact Host Jest/API/security/component coverage, Chromium messaging journey, focused Chromium listing-detail Contact Host runtime, Mobile Chrome no-deps messaging, and setup-backed Mobile Chrome messaging now pass after the follow-up stabilization recorded in CH-E044, CH-E045, and CH-E046. Historical Mobile Chrome messages runs failed in setup-backed auth and in the first no-deps MM-02/MM-03 thread-navigation rerun, but the second-pass mobile activation fix passed both no-deps and setup-backed Mobile Chrome. A follow-up P1 unit/API suite passed for checkout routes, checkout-session status, paywall/restoration, mocked email helper behavior, suspension, and contact-attempt metadata in CH-E047. A local messaging functional Playwright attempt is recorded as environment-blocked in CH-E048 because the clean local dev server had no `DATABASE_URL`; PR #123's full sharded Playwright CI run passed with database services and includes runnable messaging functional-core coverage in CH-E049. Stripe checkout browser return, actual email delivery, Supabase realtime delivery/RLS, skipped/fixme messaging realtime cases, suspended/paywall-required/unavailable listing-detail state matrix, and browser coverage outside configured CI projects remain documented runtime gaps. Evidence: `manifest.json`; `evidence-register.md` CH-E001-CH-E049; `phase-4/01-ui-interaction-census.md`; `phase-4/05-test-traceability.md`.

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
| Message length contract is unresolved: inbox composer uses 1000, thread composer uses 500, server action/API allow 2000. | Known gap | CH-E030, CH-G007 |
| Runtime behavior is not accepted until browser/tests prove each scoped flow. | Partially verified with current focused gates passing, P1 unit/API follow-up evidence, and PR #123 sharded CI evidence for runnable messaging functional-core cases; remaining runtime gaps stay explicit | CH-E027, CH-E032-CH-E049 |

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
