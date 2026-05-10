# Phase 4 Evidence Pass 04: Auth, Security, And Permissions

Status: Phase 4 source-only evidence pass. This pass records source-observed gates and unknowns; it does not certify production security.

## Route And Page Access Gates

| Surface | Gate | Evidence |
| --- | --- | --- |
| `/messages` page | Requires `auth()` session with user id; unauthenticated users redirect to `/login?callbackUrl=%2Fmessages`. | `src/app/messages/page.tsx:14-35` |
| `/messages/[id]` page | Requires auth; unauthenticated users redirect to `/login`. | `src/app/messages/[id]/page.tsx:24-31` |
| `/messages/[id]` page | Fetches conversation and messages, then denies display when the conversation is missing, admin-deleted, hidden by current user's deletion record, or current user is not a participant. | `src/app/messages/[id]/page.tsx:33-68` |
| GET `/api/messages` | Applies an IP pre-auth rate limit before `auth()` and returns 401 without a session. | `src/app/api/messages/route.ts:76-90` |
| POST `/api/messages` | Calls `validateCsrf`, requires auth, parses body safely, and returns 401/400 for missing auth or invalid JSON. | `src/app/api/messages/route.ts:270-287` |
| POST `/api/payments/checkout` | Rejects disabled paywall/payment states, calls `validateCsrf`, rate limits, requires auth, and checks suspension/email verification. | `src/app/api/payments/checkout/route.ts:146-194` |
| GET `/api/payments/checkout-session` | Requires paywall feature, auth, checkout-status rate limit, valid query params, and local payment ownership/metadata matching. | `src/app/api/payments/checkout-session/route.ts:48-122` |
| GET `/api/listings/[id]/viewer-state` | Rate limits before loading viewer state and always returns `private, no-store` for listed success/fallback paths. | `src/app/api/listings/[id]/viewer-state/route.ts:69-140`; `src/app/api/listings/[id]/viewer-state/route.ts:218-244`; `src/app/api/listings/[id]/viewer-state/route.ts:282-306` |

## Contact Start Permission Gates

| Gate | Source-observed behavior | Evidence |
| --- | --- | --- |
| Auth | `startConversation` returns `Unauthorized` / `SESSION_EXPIRED` if no user id exists. | `src/app/actions/chat.ts:54-65` |
| Input validation | `listingId`, `clientIdempotencyKey`, and `unitIdentityEpochObserved` are schema-validated. | `src/app/actions/chat.ts:48-80` |
| Rate limiting | `chatStartConversation` uses IP plus user id with a 20/hour configured limit. | `src/app/actions/chat.ts:82-91`; `src/lib/rate-limit.ts:279-280` |
| Suspension | Suspended current users are blocked before listing lookup completes. | `src/app/actions/chat.ts:93-96`; `src/app/actions/suspension.ts:6-29` |
| Email verification | Unverified current users are blocked before starting a conversation. | `src/app/actions/chat.ts:98-105`; `src/app/actions/suspension.ts:31-53` |
| Listing availability | Missing/unavailable/migration-review/moderation-locked/inactive listings are blocked through `evaluateListingContactable`. | `src/app/actions/chat.ts:109-135`; `src/lib/messaging/listing-contactable.ts:35-64` |
| Self-contact | Listing owners cannot start a conversation with themselves. | `src/app/actions/chat.ts:136-137` |
| Suspended host | Suspended listing owners return host-not-accepting-contact. | `src/app/actions/chat.ts:139-144` |
| Unit freshness | If the client sends `unitIdentityEpochObserved`, the action verifies it against `PhysicalUnit.unitIdentityEpoch` and returns `UNIT_EPOCH_STALE` on mismatch. | `src/app/actions/chat.ts:146-164`; `prisma/schema.prisma:931-944` |
| Block relationship | `checkBlockBeforeAction` blocks either direction of block relationship before conversation creation. | `src/app/actions/chat.ts:166-174`; `src/app/actions/block.ts:191-217` |
| Race/idempotency | Conversation start uses Serializable transaction plus advisory lock; contact attempts and contact consumptions are idempotency-aware. | `src/app/actions/chat.ts:186-305`; `src/lib/contact/contact-attempts.ts:39-87`; `src/lib/payments/contact-paywall.ts:558-580` |

## Message Send And Read Permissions

| Gate | Source-observed behavior | Evidence |
| --- | --- | --- |
| Server action send | Requires auth, rate limits by IP/user, checks suspension, validates message payload, checks email verification, and delegates to shared send logic. | `src/app/actions/chat.ts:368-421` |
| API send | POST `/api/messages` calls `validateCsrf`, requires auth, rate limits send, checks suspension/email verification, validates payload, and returns send result. | `src/app/api/messages/route.ts:270-382` |
| Participant access | Shared send logic rejects deleted/missing conversations and non-participants. | `src/lib/messaging/send-conversation-message.ts:73-115` |
| Listing state on existing thread | Shared send logic re-checks listing contactability, so an existing conversation can still be blocked by unavailable/migration/moderation/listing status. | `src/lib/messaging/send-conversation-message.ts:117-125` |
| Suspended recipient/owner | Sending is blocked if another participant is suspended or the listing owner is suspended. | `src/lib/messaging/send-conversation-message.ts:131-145` |
| Block relationship | Sending checks both block directions and returns a 403-style failure before message creation. | `src/lib/messaging/send-conversation-message.ts:49-71`; `src/lib/messaging/send-conversation-message.ts:147-152` |
| Read state | Mark-read API verifies conversation access before updating incoming unread messages. | `src/app/api/messages/route.ts:291-324`; `src/lib/messages.ts:93-104` |
| Typing state | Typing status actions verify participant access and non-deleted/non-hidden conversation state before upsert/read. | `src/app/actions/chat.ts:725-827` |
| Per-user delete | Conversation deletion requires auth, verifies participant access, rejects admin-deleted/missing conversations, and upserts a deletion row for the current user only. | `src/app/actions/chat.ts:663-719` |

## Paywall And Payment Permissions

| Gate | Source-observed behavior | Evidence |
| --- | --- | --- |
| Checkout auth and account status | Checkout creation requires auth, non-suspended account, and verified email. | `src/app/api/payments/checkout/route.ts:171-194` |
| Checkout product/context validation | Checkout body validates product code, purchase context, listing requirement for contact contexts, and product restriction for saved-search alerts. | `src/app/api/payments/checkout/route.ts:110-144` |
| Own listing | Users cannot purchase contact access for their own listing. | `src/app/api/payments/checkout/route.ts:323-328` |
| Contactability before checkout | Checkout validates listing contactability before creating a Stripe session. | `src/app/api/payments/checkout/route.ts:296-321` |
| Paywall no-op protection | Checkout returns conflict when contact access is already available or unit context indicates purchase is not required. | `src/app/api/payments/checkout/route.ts:349-369` |
| Metadata binding | Checkout metadata binds user id, listing id, unit id, unit epoch, product code, and contact kind. | `src/app/api/payments/checkout/route.ts:381-400` |
| Stripe idempotency | Checkout can pass a Stripe idempotency key derived from user, context, listing, product, and client idempotency key. | `src/app/api/payments/checkout/route.ts:423-434` |
| Checkout status ownership | Checkout-session polling verifies local payment user id, metadata user id, purchase context, listing id, and optional Stripe metadata before returning status. | `src/app/api/payments/checkout-session/route.ts:89-155` |

## Rate Limits Observed

| Limit | Configured value | Evidence |
| --- | --- | --- |
| `chatStartConversation` | 20/hour | `src/lib/rate-limit.ts:279-280` |
| `chatSendMessage` / API `sendMessage` | 100/hour | `src/lib/rate-limit.ts:246`; `src/lib/rate-limit.ts:279` |
| `messages` | 60/hour | `src/lib/rate-limit.ts:237` |
| `messagesPoll` | 180/minute | `src/lib/rate-limit.ts:254` |
| `messageRead` | 120/minute | `src/lib/rate-limit.ts:255` |
| `messagesPreAuth` | 300/hour per IP | `src/lib/rate-limit.ts:307` |
| `viewerState` | 60/minute | `src/lib/rate-limit.ts:293-294` |
| `paymentsCheckout` | 10/hour | `src/lib/rate-limit.ts:282` |
| `paymentsCheckoutStatus` | 60/minute | `src/lib/rate-limit.ts:283` |

## Privacy And Abuse Observations

| Area | Source-observed control | Evidence |
| --- | --- | --- |
| Private caching | Message APIs, viewer-state, checkout, and checkout-session responses set private/no-store or no-store headers on source-observed paths. | `src/app/api/messages/route.ts:157-166`; `src/app/api/messages/route.ts:198-204`; `src/app/api/messages/route.ts:259-264`; `src/app/api/payments/checkout/route.ts:455-459`; `src/app/api/payments/checkout-session/route.ts:38-45` |
| Contact attempt metadata | `recordContactAttempt` rejects metadata keys that look like email, phone, address, message, or content. | `src/lib/contact/contact-attempts.ts:20-37` |
| Outbound content flags | Message send scans outbound content and records soft flags before persistence. | `src/lib/messaging/send-conversation-message.ts:154-159` |
| Email preferences | New-message emails are mapped to `emailMessages` and skipped when the user's preference explicitly disables that channel. | `src/lib/email.ts:208-271` |
| Realtime guard | `ChatWindow` contains an explicit client-side guard against cross-conversation realtime inserts and comments that there is no RLS on the `Message` table. | `src/app/messages/[id]/ChatWindow.tsx:400-431` |
| UI block state | Blocked conversations replace the composer with a blocked banner and, when the current user is blocker, can expose unblock. | `src/app/messages/[id]/ChatWindow.tsx:1010-1018`; `src/components/chat/BlockedConversationBanner.tsx:24-65` |

## Unknowns And Gaps

- CSRF implementation was NOT VERIFIED during Phase 4. The routes call `validateCsrf`, but `src/lib/csrf.ts` was outside the Phase 4 manifest slice and was not inspected then. Later CH-E041/CH-E044 verified helper behavior and route-level missing-Origin rejection for `/api/messages` and `/api/payments/checkout`; per-route malformed/mismatched Origin variants remain optional confidence coverage.
- Supabase realtime authorization is a high-priority unknown. The client code comments that there is no RLS on `Message` and relies on a client-side conversation-id guard for realtime inserts; channel helper implementation and database policies were not inspected.
- Payment webhook fulfillment and refund/restoration permissions are NOT VERIFIED in this pass.
- Profile-completion or identity-verification gates beyond email verification and suspension remain UNKNOWN.
- Notification content includes sender name and the first 50 message characters in the internal notification body; privacy acceptability of that preview was not evaluated against product policy. Evidence: `src/lib/messaging/send-conversation-message.ts:201-209`.
- Runtime abuse behavior was NOT VERIFIED; this pass only records configured rate limits and source-observed branch behavior.
