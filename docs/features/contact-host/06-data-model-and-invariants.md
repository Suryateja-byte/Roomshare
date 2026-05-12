# Data Model And Invariants

## Data Model

| Model / store | Role in Contact Host | Evidence |
|---|---|---|
| `User` | Auth identity, email verification, suspension, notification preference, participant relation. | CH-E023 |
| `Listing` | Owner/status/availability/unit context for contactability and paywall. | CH-E023 |
| `Conversation` | Listing-linked thread with participants and messages. | CH-E023 |
| `ConversationDeletion` | Per-user hidden conversation state. | CH-E023 |
| `Message` | Thread content, sender, read state, and soft-delete metadata. | CH-E023 |
| `Notification` | Internal `NEW_MESSAGE` notification rows. | CH-E014, CH-E023 |
| `BlockedUser` | Directed block relationship used by start and send paths. | CH-E022, CH-E023 |
| `ContactAttempt` | Audit log for contact outcomes, reason codes, unit epoch, idempotency, and metadata. | CH-E011, CH-E023 |
| `ContactConsumption` | Message-start contact credit/pass consumption and conversation attachment. | CH-E010, CH-E023 |
| `EntitlementState` | Current contact credits/pass/freeze state. | CH-E010, CH-E023 |
| `PhysicalUnit` | Unit identity epoch used for stale-contact and paywall checks. | CH-E007, CH-E023 |
| `HostContactChannel` | Adjacent phone reveal channel; not primary message-start behavior. | `manifest.json`; `unknowns.md` CH-U009 |

## Key Field / Constraint Reference

This is a reconstruction table, not a full Prisma reference. It records the
fields and constraints most likely to matter for Contact Host maintenance.

| Model | Relevant fields | Relations / constraints | Evidence |
|---|---|---|---|
| `Conversation` | `id: String`; `listingId: String`; `createdAt`; `updatedAt`; `deletedAt?: DateTime` | FK `listingId -> Listing.id`; many-to-many `participants`; `messages`; `typingStatuses`; `deletions`; index on `listingId` | `prisma/schema.prisma:250-263` |
| `ConversationDeletion` | `id`; `conversationId`; `userId`; `deletedAt` | FK to `Conversation` and `User` with cascade; unique `(conversationId, userId)`; index on `userId` | `prisma/schema.prisma:265-276` |
| `Message` | `id`; `senderId`; `conversationId`; `content`; `read: Boolean`; `createdAt`; `deletedAt?`; `deletedBy?` | FK to `User` and `Conversation` with cascade; index `(conversationId, createdAt)` | `prisma/schema.prisma:278-293` |
| `Notification` | `id`; `userId`; `type`; `title`; `message`; `link?`; `read`; timestamps | FK to `User`; indexes `(userId, read)` and `(userId, createdAt)` | `prisma/schema.prisma:307-338` |
| `BlockedUser` | Directed blocker/blocked user relation fields | Used by block actions and send/contact guards | CH-E022; `prisma/schema.prisma:516-527` |
| `ContactConsumption` | `userId`; `listingId`; `unitId`; `unitIdentityEpoch`; `inventoryId?`; `contactKind`; `source`; optional `clientIdempotencyKey`; optional `conversationId`; `metadata?`; `consumedAt` | Unique `(userId, unitId, unitIdentityEpoch, contactKind)`; unique `(userId, clientIdempotencyKey)`; indexes by user/kind/time, grant, conversation, inventory/kind | `prisma/schema.prisma:768-793` |
| `EntitlementState` | `userId`; `contactKind`; free/paid credit counts; active pass window; freeze/fraud/source fields; timestamps | Composite primary key `(userId, contactKind)`; freeze/recompute index | `prisma/schema.prisma:847-860` |
| `ContactAttempt` | `userId`; `listingId`; optional unit/epoch fields; `contactKind`; `outcome`; optional `clientIdempotencyKey`; optional `conversationId`; `reasonCode?`; `metadata?`; `createdAt` | Unique `(userId, clientIdempotencyKey, contactKind)`; indexes by listing/time and user/kind/time | `prisma/schema.prisma:877-895` |
| `HostContactChannel` | `hostUserId`; encrypted phone fields; phone reveal enabled flag; verification timestamp; timestamps | Unique `hostUserId`; index `(phoneRevealEnabled, verifiedAt)` | `prisma/schema.prisma:898-909` |

There is no source-backed database unique constraint for
`(listing_id, requester_id)` on `Conversation`. Duplicate contact prevention is
currently application-level: serializable transaction, advisory lock,
idempotency keys, existing conversation lookup/resurrection, and contact
consumption uniqueness. Evidence: CH-E008-CH-E011, CH-E033.

## Invariants

| Invariant | Why it matters | Enforced where | Evidence | Test status | Risk if broken |
|---|---|---|---|---|---|
| Contact-host must not create booking requests or holds. | Preserves contact-first product direction. | Listing detail copy and contact contract. | CH-E001, CH-E020 | Not run | Users/developers could assume inventory is reserved. |
| Only authenticated, non-suspended, email-verified users can start or send messages. | Prevents anonymous or unsafe contact. | `startConversation`, `sendMessage`, `/api/messages`, checkout. | CH-E006, CH-E012, CH-E016 | Source tests only | Abuse, spam, or bypassed account controls. |
| Listing owners cannot contact themselves. | Prevents meaningless/self threads. | `startConversation`, checkout. | CH-E007; `phase-4/04-auth-security-permissions.md` | Not run | Duplicate/self conversations. |
| Listing contactability is checked at start and send time. | Existing threads should not bypass unavailable or locked listings. | `evaluateListingContactable`, `sendConversationMessage`. | CH-E007, CH-E013, CH-E021 | Source tests only | Contact continues against unavailable/moderated listings. |
| Block relationships stop both contact start and later sends. | Enforces user safety. | `checkBlockBeforeAction`, shared send helper. | CH-E007, CH-E013, CH-E022 | API source tests only | Harassment or ignored block state. |
| Duplicate conversation creation is prevented or reduced by transaction/idempotency design. | Avoids duplicate threads and duplicate paid contact consumption. | Serializable transaction, advisory lock, idempotency keys. | CH-E008-CH-E011, CH-E033 | Chromium dedupe E2E passed; Firefox/WebKit/mobile dedupe matrix remains outside the CH-E063 focused browser-matrix pass | Duplicates, double-charge/consumption, confusing inbox. |
| Contact attempt metadata must not contain PII-like keys. | Avoids private contact data in audit metadata. | `recordContactAttempt`. | CH-E011 | Not run | Sensitive data in audit rows. |
| Message send creates notification/email side effects only after persistence. | Keeps notification state tied to real messages. | `sendConversationMessage`. | CH-E014 | API source tests only | Ghost notifications or missing notifications. |
| Outbound messages must not exceed the approved 1000-character application-layer limit. | Keeps UI and server validation consistent while limiting oversized abuse payloads. | Shared `OUTBOUND_MESSAGE_MAX_LENGTH`, thread composer, inbox composer, `sendMessage`, and direct `/api/messages` POST; database remains unconstrained text. | CH-E030, CH-E060, CH-E066, CH-E067 | Source and focused test sources updated; focused Linux-side WSL Jest command passed | Message-length P1 is closed; database text remains unconstrained by design, so the application-layer contract stays authoritative. |
