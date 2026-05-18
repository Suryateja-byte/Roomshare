# Source Map

This table summarizes the feature files from `source-map.md` and
`manifest.json`. Confidence labels distinguish source verification from runtime
verification; `Source verified` means code/schema lines were inspected, not that
the behavior was browser-proven.

| Area | File | Symbols / components | Responsibility | Evidence | Confidence |
|---|---|---|---|---|---|
| Listing detail entry | `src/app/listings/[id]/ListingPageClient.tsx` | `ListingPageClient`, `MessagingCta`, `ContactFirstSidebarCard` | Renders contact-first CTA, login/verify states, checkout return notices, and no-booking/no-hold copy. | CH-E001, CH-E002, CH-E035, CH-E040, CH-E045; `phase-4/01-ui-interaction-census.md` | Source verified; focused Chromium runtime verified |
| Contact button | `src/components/ContactHostButton.tsx` | `ContactHostButton` | Starts conversations, opens paywall dialog, posts checkout request, redirects to login/messages/Stripe. | CH-E003, CH-E004, CH-E032 | Source verified; focused Jest verified |
| Conversation actions | `src/app/actions/chat.ts` | `startConversation`, `sendMessage`, reads, typing, delete helpers | Core server-action behavior for contact start, message send, reads, read state, typing, and per-user deletion. | CH-E005-CH-E013, CH-E032, CH-E034, CH-E040 | Source verified; focused tests partial |
| Shared message send | `src/lib/messaging/send-conversation-message.ts` | `sendConversationMessage` | Shared persistence, access, listing, block, content flag, notification, and email path. | CH-E013, CH-E014, CH-E032 | Source verified; API tests partial |
| Message data helpers | `src/lib/messages.ts` | `getAccessibleConversation`, `listConversationMessages`, `markConversationMessagesAsReadForUser` | Shared access and read/list operations for pages and APIs. | `source-map.md`; `phase-4/02-api-data-flow.md`; CH-E032 | Source verified; API tests partial |
| Messages API | `src/app/api/messages/route.ts` | `GET`, `POST` | Conversation list, thread messages, polling, unread count, mark-read, direct send, auth, CSRF, rate limits, cache headers. | CH-E015, CH-E016, CH-E032 | Source verified; focused Jest verified |
| Viewer-state API | `src/app/api/listings/[id]/viewer-state/route.ts` | `GET` | Builds listing-detail viewer contact contract and paywall summary. | CH-E019 | Source verified; route runtime/test gap |
| Public contact contract | `src/lib/listings/public-contact-contract.ts` | `buildPrivacyFirstViewerContract`, `coerceViewerContactFields` | Defines current contact CTA state, disabled reasons, availability gates, and `canBook/canHold: false`. | CH-E020 | Source verified |
| Contactability | `src/lib/messaging/listing-contactable.ts` | `evaluateListingContactable` | Blocks unavailable, stale, migration-review, moderation-locked, inactive, and missing listings. | CH-E021 | Partially verified |
| Blocking | `src/app/actions/block.ts` | `checkBlockBeforeAction`, block helpers | Blocks contact or message send when either direction of user block exists. | CH-E022 | Source verified; UI tests gap |
| Paywall | `src/lib/payments/contact-paywall.ts` | `evaluateMessageStartPaywall`, `consumeMessageStartEntitlement` | Computes summary and consumes or rejects message-start entitlements. | CH-E010, CH-E025 | Source verified; checkout runtime gap |
| Checkout APIs | `src/app/api/payments/checkout/route.ts`, `src/app/api/payments/checkout-session/route.ts` | `POST`, `GET` | Creates Stripe checkout sessions and classifies return-session status. | CH-E044; `phase-4/02-api-data-flow.md` Flow 3 | Source verified; focused route tests passed; browser return gap |
| Contact attempts | `src/lib/contact/contact-attempts.ts` | `recordContactAttempt` | Audit rows for contact outcomes and PII-like metadata key rejection. | CH-E011 | Source verified |
| Messaging UI | `src/components/MessagesPageClient.tsx`, `src/app/messages/[id]/ChatWindow.tsx` | Inbox and thread clients | Inbox/thread UI, polling, realtime fallback, drafts, typing, blocked banner, optimistic messages. | `phase-4/01-ui-interaction-census.md` | Partially verified |
| Notifications/email | `src/lib/notifications.ts`, `src/lib/email.ts` | `createInternalNotification`, `sendNotificationEmailWithPreference` | Internal new-message notifications and preference-aware email calls. | CH-E014 | Partially verified |
| Schema/migrations | `prisma/schema.prisma`, `prisma/migrations/**` | Messaging/contact/paywall models | Current persisted state and historical migration support. | CH-E023, CH-E024 | Partially verified |
| Tests | `src/__tests__/**`, `tests/e2e/**` | Component/API/unit/E2E specs | Source-discovered test coverage plus focused Jest/API/security/component, Chromium, Mobile Chrome, P1 unit/API follow-up command evidence, PR #123 full-sharded CI evidence for runnable messaging functional-core cases, and CH-E050 realtime/polling source/test-source inspection; local focused realtime/polling E2E and local ChatWindow component-test execution were environment-blocked. | CH-E027, CH-E032-CH-E050; `phase-4/05-test-traceability.md` | Partially verified |
