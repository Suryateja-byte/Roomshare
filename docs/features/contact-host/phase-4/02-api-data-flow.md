# Phase 4 Evidence Pass 02: API And Data Flow

Status: Phase 4 source-only evidence pass. No API calls, browser flows, payment callbacks, or email delivery were executed during this pass.

## Flow 1: Listing Detail Loads Viewer Contact State

1. `ListingPageClient` builds a fallback viewer state from session/listing props and then fetches `/api/listings/{id}/viewer-state` for guest controls when the user is not the owner and session loading is complete. Evidence: `src/app/listings/[id]/ListingPageClient.tsx:948-1020`.
2. The viewer-state route rate limits first, loads the listing, derives owner/email-verification state, and starts a paywall-summary promise from `evaluateMessageStartPaywall`. Evidence: `src/app/api/listings/[id]/viewer-state/route.ts:69-103`.
3. Anonymous viewers receive a privacy-first contact contract, public availability, paywall summary, and review eligibility with `Cache-Control: private, no-store`. Evidence: `src/app/api/listings/[id]/viewer-state/route.ts:105-140`.
4. Authenticated viewers get review/private-feedback context, a privacy-first contact contract, and paywall enforcement that can convert `CONTACT_HOST + canContact` into `canContact: false` with `contactDisabledReason: "PAYWALL_REQUIRED"`. Evidence: `src/app/api/listings/[id]/viewer-state/route.ts:143-244`.
5. If viewer-state loading fails, the route falls back to the privacy-first contact contract and preserves `private, no-store` cache behavior. Evidence: `src/app/api/listings/[id]/viewer-state/route.ts:245-307`.

## Flow 2: Contact Host Starts Or Reuses A Conversation

1. The contact button sends `listingId`, optional `unitIdentityEpochObserved`, and a client idempotency key to the `startConversation` server action. Evidence: `src/components/ContactHostButton.tsx:108-124`.
2. `startConversation` authenticates the user and validates payload shape. Evidence: `src/app/actions/chat.ts:54-80`.
3. The action applies `chatStartConversation` rate limiting, checks suspension, and checks email verification before loading the listing. Evidence: `src/app/actions/chat.ts:82-129`.
4. Listing contactability gates block missing, unavailable, migration-review, moderation-locked, inactive, self-contact, suspended-host, stale unit-epoch, and block-list cases before conversation creation. Evidence: `src/app/actions/chat.ts:131-174`; `src/lib/messaging/listing-contactable.ts:35-64`.
5. Conversation creation/reuse runs in a Serializable transaction with an advisory lock keyed to listing and sorted participant pair. Existing conversations clear the current user's deletion record and record an `EXISTING_CONVERSATION` or `RESURRECTED_CONVERSATION` contact attempt. Evidence: `src/app/actions/chat.ts:186-247`.
6. New conversations consume message-start entitlement, record paywall-required/unavailable attempts on failure, create the conversation with both participants on success, attach any consumption, and record a succeeded contact attempt. Evidence: `src/app/actions/chat.ts:249-305`.
7. Paywall failures return `PAYWALL_REQUIRED` or `PAYWALL_UNAVAILABLE`; successful paths emit telemetry and return `conversationId`. Evidence: `src/app/actions/chat.ts:320-353`.

## Flow 3: Paywall Checkout Starts And Returns To Listing

1. If contact requires unlock, the button posts `{ listingId, productCode }` to `/api/payments/checkout` and redirects to the returned `checkoutUrl`. Evidence: `src/components/ContactHostButton.tsx:62-95`.
2. Checkout POST rejects disabled paywall/payment states, validates CSRF, rate limits checkout creation, requires auth, checks suspension and email verification, parses the body, and runs checkout abuse checks. Evidence: `src/app/api/payments/checkout/route.ts:146-233`.
3. For contact checkout, the route loads the listing, verifies contactability, rejects own-listing purchases, evaluates message-start or phone-reveal paywall state, and rejects unavailable/no-longer-required purchases. Evidence: `src/app/api/payments/checkout/route.ts:291-369`.
4. The route sets contact checkout success/cancel URLs back to `/listings/{listingId}` with `contactCheckout` or `phoneRevealCheckout` params, builds metadata containing user/listing/unit/product/contact kind, creates a Stripe Checkout Session, persists the payment, records telemetry, and returns `checkoutUrl` plus `sessionId`. Evidence: `src/app/api/payments/checkout/route.ts:371-459`.
5. On listing return, the client polls `/api/payments/checkout-session` with `session_id`, `listing_id`, and purchase context. Evidence: `src/app/listings/[id]/ListingPageClient.tsx:768-786`.
6. Checkout-session GET requires paywall feature, auth, `paymentsCheckoutStatus` rate limiting, valid query params, local payment ownership, matching paywall metadata, and optional Stripe session metadata validation before returning a classified checkout snapshot. Evidence: `src/app/api/payments/checkout-session/route.ts:48-179`.
7. A fulfilled contact checkout updates local viewer state to allow contact and clear purchase-required state; the route can also force a viewer-state refresh. Evidence: `src/app/listings/[id]/ListingPageClient.tsx:818-852`.

## Flow 4: Conversation Inbox, Polling, And Read State

1. `/messages` requires an authenticated session and passes `getConversations()` into `MessagesPageClient`. Evidence: `src/app/messages/page.tsx:14-35`.
2. `getConversations` lists conversations where the user is a participant, excluding admin-deleted conversations and per-user deletions; it includes participants, latest non-deleted message, listing title, and grouped unread counts. Evidence: `src/app/actions/chat.ts:432-488`.
3. GET `/api/messages` applies an IP pre-auth rate limit before session lookup, then requires auth. Evidence: `src/app/api/messages/route.ts:76-90`.
4. GET `/api/messages?view=unreadCount` rate limits and returns a private cached unread count. Evidence: `src/app/api/messages/route.ts:98-114`.
5. GET `/api/messages?conversationId=...&poll=1` verifies conversation access, rate limits polling, returns messages after an optional cursor plus typing users, and sets `private, no-store`. Evidence: `src/app/api/messages/route.ts:116-166`; `src/lib/messages.ts:52-90`.
6. Normal conversation-message GET verifies access, parses pagination, returns paginated messages, and sets `private, no-store`. Evidence: `src/app/api/messages/route.ts:169-204`.
7. Conversation-list GET excludes admin-deleted and per-user-deleted conversations, includes latest message/listing/participants, paginates, and sets `private, no-store`. Evidence: `src/app/api/messages/route.ts:207-264`.
8. POST `/api/messages` with `action: "markRead"` validates CSRF, auth, rate limit, input, and conversation access before marking incoming unread messages read. Evidence: `src/app/api/messages/route.ts:270-324`; `src/lib/messages.ts:93-104`.

## Flow 5: Sending Messages And Notifications

1. `MessagesPageClient` and `ChatWindow` both call the `sendMessage` server action from composer flows. Evidence: `src/components/MessagesPageClient.tsx:554-645`; `src/app/messages/[id]/ChatWindow.tsx:549-633`.
2. The server action requires auth, rate limits, checks suspension, validates `conversationId` and message content up to the approved 1000-character limit, checks email verification, and delegates to `sendConversationMessage`. Evidence: `src/app/actions/chat.ts:392-454`; CH-E066.
3. Direct POST `/api/messages` validates CSRF, requires auth, rate limits send, checks suspension/email verification, validates payload, delegates to `sendConversationMessage`, and returns the created message with `Cache-Control: no-store`. Evidence: `src/app/api/messages/route.ts:270-382`.
4. `sendConversationMessage` loads the conversation with participants/listing, rejects missing/deleted conversations and non-participants, re-runs listing contactability, blocks suspended recipients/owners, and checks block relationships. Evidence: `src/lib/messaging/send-conversation-message.ts:73-152`.
5. Before persistence, outbound content is scanned and soft-flag telemetry is recorded. Evidence: `src/lib/messaging/send-conversation-message.ts:154-159`.
6. Message creation runs in a transaction that creates the message, updates conversation `updatedAt`, and deletes conversation-deletion records so a new message resurrects hidden conversations for participants. Evidence: `src/lib/messaging/send-conversation-message.ts:161-192`.
7. After commit, the sender name is resolved, participant email addresses are loaded, internal `NEW_MESSAGE` notifications are created, and preference-aware email notifications are sent. Evidence: `src/lib/messaging/send-conversation-message.ts:194-227`; `src/lib/email.ts:208-271`.

## Data Stores Touched

| Store / model | Flow role | Evidence |
| --- | --- | --- |
| `User` | Auth identity, email verification, suspension, preferences, conversation participant relation. | `prisma/schema.prisma:42-64` |
| `Listing` | Owner/status/availability/unit data for contactability and paywall context. | `prisma/schema.prisma:107-130` |
| `Conversation` | Listing-linked thread with participants, messages, typing statuses, and deletion records. | `prisma/schema.prisma:250-263` |
| `ConversationDeletion` | Per-user hidden conversation state. | `prisma/schema.prisma:265-276` |
| `Message` | Thread content, read state, soft-delete columns, and conversation retrieval index. | `prisma/schema.prisma:278-293` |
| `Notification` | Internal `NEW_MESSAGE` notification rows. | `prisma/schema.prisma:307-338` |
| `ContactConsumption` | Contact-credit/pass/free consumption, idempotency, and conversation attachment. | `prisma/schema.prisma:768-793` |
| `EntitlementState` | Current contact credits/pass/freeze state keyed by user and contact kind. | `prisma/schema.prisma:847-860` |
| `ContactAttempt` | Audit log for start-contact outcomes and idempotency. | `prisma/schema.prisma:877-895` |
| `PhysicalUnit` | Unit identity epoch used for stale-contact and paywall decisions. | `prisma/schema.prisma:931-957` |

## Unknowns And Gaps

- Runtime API behavior was NOT VERIFIED during Phase 4; no HTTP requests or server actions were executed in that pass. Later focused tests for `/api/messages`, viewer-state route contract/status/cache, checkout creation route, checkout-session, private-feedback no-bleed, listing-page viewer-state consumers, and CSRF helper/messages-route coverage passed in CH-E046, CH-E047, CH-E049, CH-E053, and CH-E056.
- Stripe checkout creation and checkout-session classification are source-observed, but webhook/payment fulfillment timing is NOT VERIFIED because the fulfillment webhook path is outside the current manifest.
- Email notification delivery is NOT VERIFIED; the source only shows preference-aware send calls.
- CSRF implementation details were NOT VERIFIED during Phase 4; manifest-listed routes call `validateCsrf`, but `src/lib/csrf.ts` was not inspected in that pass. Later CH-E041/CH-E049 verified helper/messages-route behavior, and CH-E053 verified checkout missing-Origin rejection inside the current passing checkout-route suite.
- Supabase realtime message delivery is source-observed in `ChatWindow`, but the Supabase helper/channel implementation is outside the current manifest and was NOT VERIFIED.
