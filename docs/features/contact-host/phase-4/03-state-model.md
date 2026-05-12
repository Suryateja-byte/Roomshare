# Phase 4 Evidence Pass 03: State Model

Status: Phase 4 source-only evidence pass. This is a model of observed source states and transitions, not final product documentation.

## Client Viewer State

| State object / field | Meaning observed from source | Evidence |
| --- | --- | --- |
| `ViewerState` | Listing-detail aggregate state for login, booking history, review, primary CTA, contact ability, disabled reason, availability source, paywall summary, review eligibility, and loaded flag. | `src/app/listings/[id]/ListingPageClient.tsx:183-193` |
| `CheckoutReturnPhase` | Local checkout return phase can be `IDLE`, `POLLING`, or `PENDING_TIMEOUT`. | `src/app/listings/[id]/ListingPageClient.tsx:201-211` |
| Fallback contact state | Before API data arrives, owner gets `EDIT_LISTING`, unauthenticated viewers get `LOGIN_TO_MESSAGE`, unverified users get `VERIFY_EMAIL_TO_MESSAGE`, and eligible active-listing viewers get `CONTACT_HOST`. | `src/app/listings/[id]/ListingPageClient.tsx:249-295` |
| Merged viewer state | API data is coerced through `coerceViewerContactFields`; invalid/missing paywall or review data falls back to local state and marks `loaded: true`. | `src/app/listings/[id]/ListingPageClient.tsx:298-350`; `src/lib/listings/public-contact-contract.ts:238-277` |
| Viewer-state refresh | Non-owner viewers fetch `/api/listings/{id}/viewer-state`; failures preserve fallback state instead of blocking the page. | `src/app/listings/[id]/ListingPageClient.tsx:948-1020` |

## Server Contact Contract

| State | Values / transition rules | Evidence |
| --- | --- | --- |
| `ContactDisabledReason` | `LOGIN_REQUIRED`, `EMAIL_VERIFICATION_REQUIRED`, `OWNER_VIEW`, `LISTING_UNAVAILABLE`, `MIGRATION_REVIEW`, `MODERATION_LOCKED`, or `PAYWALL_REQUIRED`. | `src/lib/listings/public-contact-contract.ts:14-21` |
| `ListingAvailabilityGateReason` | `LISTING_UNAVAILABLE`, `MIGRATION_REVIEW`, or `MODERATION_LOCKED`. | `src/lib/listings/public-contact-contract.ts:23-26` |
| `PrimaryCta` | `EDIT_LISTING`, `CONTACT_HOST`, `LOGIN_TO_MESSAGE`, or `VERIFY_EMAIL_TO_MESSAGE`. | `src/lib/listings/public-contact-contract.ts:28-32` |
| `ViewerContactContract` | Contact contract always sets `canBook: false` and `canHold: false`; contact is the first-class path. | `src/lib/listings/public-contact-contract.ts:57-65` |
| Public visibility state | Missing listing resolves to unavailable; otherwise public availability is resolved, search eligibility is evaluated, and a gate reason controls public visibility. | `src/lib/listings/public-contact-contract.ts:103-143` |
| Privacy-first contract build | Owner/login/email/listing availability determine `primaryCta`, `canContact`, and `contactDisabledReason`. | `src/lib/listings/public-contact-contract.ts:179-221` |
| Contactability enforcement | Message/contact creation reuses public visibility gates and also requires `listing.status === "ACTIVE"`. | `src/lib/messaging/listing-contactable.ts:35-64` |

## Paywall And Entitlement State

| State | Values / transition rules | Evidence |
| --- | --- | --- |
| `PaywallMode` | `OPEN`, `METERED`, `PASS_ACTIVE`, `FROZEN`, `PAYWALL_REQUIRED`, or `MIGRATION_BYPASS`. | `src/lib/payments/contact-paywall.ts:37-43` |
| `PaywallSummary` | Tracks enabled state, mode, free and paid contacts remaining, active pass expiry, purchase requirement, and offers. | `src/lib/payments/contact-paywall.ts:45-53` |
| Entitlement-state summary | Frozen/fraud state requires purchase; active pass removes purchase requirement; otherwise zero free and zero paid contacts produce `PAYWALL_REQUIRED`. | `src/lib/payments/contact-paywall.ts:98-144` |
| Missing unit context | Missing physical unit or epoch produces `MIGRATION_BYPASS` and no purchase requirement. | `src/lib/payments/contact-paywall.ts:146-167`; `src/lib/payments/contact-paywall.ts:226-244` |
| Anonymous preflight | Without user id, paywall evaluates to a metered summary rather than a user-specific remaining-credit state. | `src/lib/payments/contact-paywall.ts:246-253` |
| Direct evaluation | Free contacts, active pass grants, and pack grants derive the summary when entitlement-state is unavailable or disabled. | `src/lib/payments/contact-paywall.ts:255-329` |
| Entitlement-state evaluation | When entitlement-state is enabled, fresh state can override direct evaluation; stale/unavailable state marks the paywall as unavailable. | `src/lib/payments/contact-paywall.ts:362-402` |
| Consumption decision | Enforcement disabled, missing unit, emergency open, unavailable state, existing idempotency, existing unit consumption, active pass, free credit, pack credit, and purchase-required are explicit branches. | `src/lib/payments/contact-paywall.ts:477-730` |
| Consumption attachment | Contact consumption can be attached to a conversation after conversation creation. | `src/lib/payments/contact-paywall.ts:448-459` |

## Conversation And Message State

| Model / state | Meaning observed from source | Evidence |
| --- | --- | --- |
| `Conversation` | Listing-linked thread with participants, messages, typing statuses, admin-level `deletedAt`, and per-user deletion records. | `prisma/schema.prisma:250-263` |
| `ConversationDeletion` | Per-user hidden-conversation state, unique by conversation and user. | `prisma/schema.prisma:265-276`; `prisma/migrations/20260205000000_per_user_conversation_deletion/migration.sql:1-30` |
| `Message` | Message content, sender, conversation, read flag, created time, soft-delete metadata, and conversation/date index. | `prisma/schema.prisma:278-293` |
| `Notification` | Stores `NEW_MESSAGE` notifications with link/read state. | `prisma/schema.prisma:307-338` |
| `BlockedUser` | Directed blocker/blocked relation with unique blocker-blocked pair. | `prisma/schema.prisma:516-528` |
| `ContactAttempt` | Audit table for start-contact outcomes, unit epoch, reason code, idempotency key, conversation id, and metadata. | `prisma/schema.prisma:877-895`; `prisma/migrations/20260505000000_phase05_privacy_contact_host_ghost/migration.sql:10-35` |
| `ContactConsumption` | Contact entitlement consumption per user/listing/unit/epoch/kind with idempotency and optional conversation attachment. | `prisma/schema.prisma:768-793` |
| `EntitlementState` | Current credit/pass/freeze state keyed by `(userId, contactKind)`. | `prisma/schema.prisma:847-860`; `prisma/migrations/20260512000000_payments_entitlement_refund_queue_fix/migration.sql:19-27` |
| `PhysicalUnit` | Unit identity epoch and lifecycle/publish status source used by stale-contact and paywall checks. | `prisma/schema.prisma:931-957` |

## Transition Map

| Transition | Source evidence |
| --- | --- |
| Listing viewer fallback -> API viewer state | Fallback state is set as loading, then replaced with merged viewer-state API data or restored as loaded on failure. `src/app/listings/[id]/ListingPageClient.tsx:971-1005` |
| Contact allowed -> start conversation | Contact button calls `startConversation`; success navigates to `/messages/{conversationId}`. `src/components/ContactHostButton.tsx:98-145` |
| Contact gated -> paywall dialog | `PAYWALL_REQUIRED` or local `requiresUnlock` opens the paywall dialog. `src/components/ContactHostButton.tsx:103-106`; `src/components/ContactHostButton.tsx:127-137` |
| Paywall fulfilled -> contact allowed | Fulfilled checkout updates `canContact` to true and clears `contactDisabledReason`. `src/app/listings/[id]/ListingPageClient.tsx:818-852` |
| Existing conversation -> resurrect current user's deleted conversation | Existing conversation clears `ConversationDeletion` for the current user and returns the existing conversation id. `src/app/actions/chat.ts:208-247` |
| New conversation -> consume entitlement -> create conversation | The transaction consumes entitlement, creates conversation, attaches consumption, and records attempt. `src/app/actions/chat.ts:249-305` |
| Send message -> resurrect hidden conversations | Message send creates a message, updates `Conversation.updatedAt`, and deletes conversation-deletion rows. `src/lib/messaging/send-conversation-message.ts:161-192` |
| Incoming messages -> read state | Read marking updates unread incoming messages for the current user. `src/lib/messages.ts:93-104` |
| Typing state -> expires by freshness window | Typing status upsert writes `isTyping` and `updatedAt`; reads only return other users updated in the last five seconds. `src/app/actions/chat.ts:725-827`; `src/app/api/messages/route.ts:135-164` |
| Blocked state -> composer replacement | UI replaces the composer with `BlockedConversationBanner`; server send paths check block relationships before message creation. `src/app/messages/[id]/ChatWindow.tsx:1010-1018`; `src/lib/messaging/send-conversation-message.ts:147-152` |

## Unknowns And Gaps

- The full lifecycle of `Payment`, `EntitlementGrant`, refund restoration, and webhook fulfillment is only partially represented by manifest-listed files.
- Inventory/listing freshness state uses `PhysicalUnit` and availability fields, but the availability resolver internals are outside the current manifest and were not inspected.
- Realtime channel state is represented in `ChatWindow`, but the Supabase helper/channel implementation and database policy model are not included in this state pass.
- Message retention/deletion beyond sender soft-delete and per-user conversation deletion is not fully mapped here.
- Message length is now approved as a uniform 1000-character outbound contract in CH-E066; this Phase 4 note is historical context and focused Linux-side WSL Jest execution passed in CH-E067.
