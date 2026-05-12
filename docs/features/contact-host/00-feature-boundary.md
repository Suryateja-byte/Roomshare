# Contact Host Feature Boundary

Feature: Contact host from listing detail into messaging/conversation creation.

Slug: `contact-host`

Evidence status: historical Phase 1/2 boundary snapshot. Runtime/browser
behavior and test execution were `NOT VERIFIED` in this phase. Current focused
runtime/test status is recorded in `runtime-verification.md`,
`11-test-traceability-matrix.md`, and `evidence-register.md` CH-E032-CH-E066.

Source of truth: current dirty worktree on 2026-05-08. Production code was not
modified.

## Included

- Listing detail contact-host entry point, including the sidebar contact block,
  `MessagingCta`, login/email-verification CTA variants, contact-only copy, and
  the explicit no-booking/no-hold copy. Evidence:
  `src/app/listings/[id]/ListingPageClient.tsx:31`, `497-523`, `529-597`,
  `613-640`.
- `ContactHostButton` current behavior: start conversation button, loading
  state, duplicate-click guard, paywall dialog, checkout offer buttons, login
  redirect handling, generic error toasts, and navigation to `/messages/{id}`.
  Evidence: `src/components/ContactHostButton.tsx:32-214`.
- Server action conversation creation through `startConversation`, including
  auth, payload validation, rate limiting, suspension/email checks, listing
  contactability, owner/self-contact checks, host suspension, unit identity epoch
  stale guard, block checks, duplicate conversation handling, paywall
  consumption, contact-attempt logging, and serializable transaction retry.
  Evidence: `src/app/actions/chat.ts:43-362`.
- Profile checks currently evidenced in the message-start path are email
  verification and suspension checks. A separate profile-completion or
  user-verification gate was not confirmed in this Phase 1/2 pass and is
  tracked as a later evidence gap. Evidence:
  `src/app/actions/chat.ts:63-105`, `src/app/actions/suspension.ts:6-53`;
  gap: `unknowns.md#ch-u013`.
- Message sending from existing conversations through `sendMessage` and
  `sendConversationMessage`, including auth, validation, rate limiting,
  suspension/email checks, participant access, listing contactability,
  recipient/owner suspension checks, block checks, outbound content soft flags,
  message persistence, internal notifications, and notification emails.
  Evidence: `src/app/actions/chat.ts:368-430`,
  `src/lib/messaging/send-conversation-message.ts:49-228`.
- Conversation/message reads, unread counts, mark-read behavior, and per-user
  conversation visibility helpers. Evidence: `src/app/actions/chat.ts:432-608`,
  `src/lib/messages.ts:27-104`.
- `/api/messages` GET/POST API behavior for conversation lists, thread
  messages, polling, unread counts, mark-read, direct message send, CSRF, auth,
  access control, validation, rate limits, cache headers, and error statuses.
  Evidence: `src/app/api/messages/route.ts:76-386`.
- `/messages` and `/messages/[id]` route entry points, auth redirects, access
  denial state, initial data loading, and chat UI handoff. Evidence:
  `src/app/messages/page.tsx:8-35`,
  `src/app/messages/[id]/page.tsx:24-125`.
- `MessagesPageClient`, `ChatWindow`, blocking controls, typing/polling/read
  behavior, draft handling, and mobile/responsive messaging surfaces as
  source-level scope only. Evidence: `src/components/MessagesPageClient.tsx:53-430`,
  `src/app/messages/[id]/ChatWindow.tsx:69-430`.
- Viewer-state contract that supplies contact CTA state, paywall summary,
  privacy-first availability state, private cache headers, and fallback behavior
  for listing detail. Evidence:
  `src/app/api/listings/[id]/viewer-state/route.ts:69-307`.
- Public contact contract and listing contactability gate logic for login,
  email verification, owner view, unavailable listing, migration review,
  moderation lock, and paywall-required states. Evidence:
  `src/lib/listings/public-contact-contract.ts:1-234`,
  `src/lib/messaging/listing-contactable.ts:1-60`.
- Paywall/contact entitlement and checkout handoff for `MESSAGE_START`,
  including contact-pack/pass offers, entitlement state, emergency open,
  migration bypass, contact consumption, and `/api/payments/checkout` response
  shape. Evidence: `src/lib/payments/contact-paywall.ts:1-730`,
  `src/app/api/payments/checkout/route.ts:110-459`.
- Contact-attempt audit logging and PII-key metadata rejection for
  message-start outcomes. Evidence: `src/lib/contact/contact-attempts.ts:1-70`.
- Prisma schema and migrations for `Conversation`, `ConversationDeletion`,
  `Message`, `TypingStatus`, `Notification`, `BlockedUser`,
  `ContactConsumption`, `EntitlementState`, `ContactRestoration`,
  `ContactAttempt`, `HostContactChannel`, `PhoneRevealAudit`, `PhysicalUnit`,
  `Listing`, and `User` fields used by the contact-host flow. Evidence:
  `prisma/schema.prisma:42-60`, `107-125`, `250-338`, `516-527`, `768-909`,
  `931-995`; `prisma/migrations/20251122195016_add_conversation_model/migration.sql:86-225`,
  `328-342`, `469-480`, `548-572`;
  `prisma/migrations/20260505000000_phase05_privacy_contact_host_ghost/migration.sql:10-54`;
  `prisma/migrations/20260512000000_payments_entitlement_refund_queue_fix/migration.sql:20-22`.
- Unit and E2E tests discovered for contact button, messages API, message
  helpers, contactability, paywall/contact attempts, conversation deduplication,
  messaging journeys, mobile messaging, and notifications. Test execution was
  `NOT VERIFIED` in Phase 1/2; later focused command results are tracked in
  `evidence-register.md` CH-E032-CH-E066 and
  `11-test-traceability-matrix.md`. Phase 1/2 evidence:
  `src/__tests__/components/ContactHostButton.test.tsx:33-289`,
  `src/__tests__/api/messages.test.ts:93-621`,
  `src/__tests__/lib/messaging/listing-contactable.test.ts:23-133`,
  `tests/e2e/concurrent/conversation-dedup.spec.ts:1-176`,
  `tests/e2e/journeys/22-messaging-conversations.spec.ts:24-286`.

## Excluded

- Booking request creation, booking holds, inventory reservation, checkout
  fulfillment, and payment webhooks are out of scope except where current code
  explicitly hands off from contact unlock to `/api/payments/checkout`.
  Listing detail copy says no booking request or hold is created from that page.
  Evidence: `src/app/listings/[id]/ListingPageClient.tsx:521-523`.
- Search/map listing-card contact behavior is out of Phase 1/2 scope unless a
  later evidence pass finds a direct contact-host entry point outside listing
  detail. Marked `UNKNOWN`.
- Phone reveal is adjacent. It shares contact/paywall infrastructure and
  `HostContactChannel`, but the main `contact-host` boundary covers message
  start, not phone number reveal. Evidence:
  `src/app/api/payments/checkout/route.ts:112-124`, `330-399`;
  `prisma/schema.prisma:898-909`.
- Private feedback is adjacent to messaging threads and included only as route
  context, not as part of conversation creation. Evidence:
  `src/app/messages/[id]/page.tsx:76-125`.
- Runtime UX, real email delivery, real Stripe checkout, Supabase realtime, and
  production database behavior were not verified in Phase 1/2. Current runtime
  evidence is partial: focused Jest/API/security/component checks, Chromium
  messaging, Mobile Chrome no-deps, setup-backed Mobile Chrome, focused
  Chromium listing-detail Contact Host checks, and mocked Chromium checkout
  return / paid-unlock runtime pass; paywall/unavailable/migration/moderation
  listing-detail browser states also pass in CH-E059, focused WebKit/Mobile
  Chrome/Mobile Safari listing-detail plus messaging specs pass in CH-E063, and
  Firefox browser availability is confirmed in CH-E064 while CH-E065 passes the
  focused Firefox listing-detail and messaging specs after narrow test/helper
  fixes. Historical message-length cap assertions pass in CH-E060; the approved
  1000-character source/test update is recorded in CH-E066. CH-E068 implements
  the suspended/blocked listing-detail contract, disabled UI copy, fixtures, and
  focused test source; CH-E073 closes the focused and full listing-detail
  Chromium proof for those states. Realtime, email, real provider checkout fulfillment, and
  provider-level Supabase behavior remain gaps.

## Documentation Rules

- Do not write final documentation before later evidence passes complete the
  interaction census, API contracts, state model, test traceability, and final
  verification.
- Every current-behavior claim must cite code, schema/migration, test source,
  command output, browser observation, or be marked `UNKNOWN` / `NOT VERIFIED`.
- Separate current behavior, inferred behavior, intended behavior, and unknowns.
- Do not modify production code unless explicitly asked.

## Boundary Questions

| Question | Why it matters | Status |
|---|---|---|
| Does any search/map listing card trigger contact host directly, or only navigate to listing detail? | A direct card action would expand the feature boundary and interaction census. | `UNKNOWN`; needs Phase 4 source and browser pass. |
| Which tests are release-blocking for contact-host versus confidence-building? | Later docs need a test matrix that does not overstate unrun tests. | Classified in `11-test-traceability-matrix.md`; mocked checkout browser return passed in CH-E058; paywall/unavailable/migration/moderation listing-detail states passed in CH-E059; historical message-length cap assertions passed in CH-E060, the approved 1000-character source/test update is recorded in CH-E066, and focused Linux-side WSL Jest execution passed in CH-E067; CH-E068 implements suspended/blocked source/test/fixture coverage with route proof passing, and CH-E073 closes the focused/full listing-detail Chromium proof; fallback/API/mocked realtime evidence passed in CH-E062; provider-level Supabase RLS, email, full matrix, and real payment-provider fulfillment remain gaps. |
| Is the visible contact-host UI a modal/form or a direct button-to-thread flow for all states? | User-action docs must describe actual visible behavior. | Partially verified: contact button, focused listing-detail Chromium states, mocked checkout return, paywall dialog, unavailable/migration/moderation warning/no-CTA states, Chromium messaging journey, Mobile Chrome no-deps, and setup-backed Mobile Chrome inbox/thread passed; suspended/blocked listing-detail pre-click source/test/fixture coverage is implemented in CH-E068 and focused/full listing-detail Chromium proof is closed by CH-E073. |
| Are notification emails actually delivered in runtime environments? | Source queues email send calls, but delivery depends on environment/configuration. | `NOT VERIFIED`; requires runtime/email evidence. |
| Does Supabase realtime work, and when does polling take over? | Messaging UX depends on realtime or fallback behavior. | Reduced in CH-E062: fallback polling and mocked client-side realtime insert handling are locally verified; provider-level Supabase delivery/RLS remains blocked. |
| Are booking-system assumptions fully removed from contact-host docs? | Contact-host appears to be contact-first, not booking-first. | Current boundary excludes booking/holds; later docs should keep historical booking references explicitly marked if they appear. |
| Is there any broader profile-completion or user-verification gate beyond email verification and suspension? | The requested profile/suspension boundary needs accurate requirements without inventing a guard. | `UNKNOWN`; needs Phase 4 auth/profile pass. |
