# User Flows

These flows describe current source behavior plus later focused verification.
Runtime coverage is partial, not absent: focused Contact Host Jest/API/security,
`MessagesPageClient` Jest, Chromium messaging/listing-detail, Mobile Chrome
no-deps messaging, setup-backed Mobile Chrome messaging, and P1 unit/API
follow-up checks pass. PR #123 full sharded Playwright CI also passed with
runnable messaging functional-core coverage. CH-E050 records source/test-source
inspection for realtime/polling and a repo scan that found no messaging
RLS/publication proof. Checkout browser return, production Supabase
policies/publications, skipped/fixme messaging realtime cases, actual email delivery,
suspended/paywall-required/unavailable listing states, and browser coverage
outside configured CI projects remain gaps. Evidence: CH-E032-CH-E050.

## Listing Detail Contact Entry

1. User opens `/listings/{id}`.
2. Listing detail builds fallback viewer contact state.
3. Non-owner viewers fetch `/api/listings/{id}/viewer-state`.
4. `MessagingCta` chooses contact, login, verify-email, or edit-listing UI.
5. The page communicates contact-first behavior and states that no booking request or hold is created.

Evidence: CH-E001, CH-E002, CH-E019, CH-E020, CH-E035, CH-E040;
`phase-4/01-ui-interaction-census.md`.

## Start Or Resume Conversation

1. Eligible viewer clicks Contact Host.
2. `ContactHostButton` calls `startConversation` with `listingId`, a client idempotency key, and optional unit epoch.
3. The server action validates input, auth, account state, listing state, block state, paywall state, and duplicate conversation conditions.
4. Existing conversations are returned or resurrected; new conversations are created in a serializable transaction.
5. On success, the client navigates to `/messages/{conversationId}`.

Evidence: CH-E003, CH-E005-CH-E011, CH-E032, CH-E034, CH-E040.

## Login Or Verify Email

If the viewer is anonymous, listing detail renders a login CTA and `ContactHostButton` also routes unauthorized start attempts to `/login`. If the viewer is authenticated but email is unverified, listing detail can render verify-email CTA state and `startConversation` rejects the attempt. Evidence: CH-E002, CH-E003, CH-E006.

Current source behavior does not prove automatic post-login contact resumption
from listing detail. The listing CTA and button route to `/login` without a
documented callback URL, so a user may need to return to the listing and click
Contact Host again after login unless another route supplies a callback.
Evidence: `src/app/listings/[id]/ListingPageClient.tsx:571`;
`src/components/ContactHostButton.tsx:131`; `src/app/login/LoginClient.tsx:114`.

## Paywall Unlock

1. Viewer-state or start-conversation result can require paywall unlock.
2. `ContactHostButton` opens a paywall dialog with offers.
3. Selecting an offer posts to `/api/payments/checkout`.
4. The checkout route validates account, listing, contactability, paywall state, and metadata, then returns a Stripe `checkoutUrl`.
5. Listing detail handles checkout return params and polls `/api/payments/checkout-session`.
6. Fulfilled contact checkout updates viewer state to allow contact.
7. The checkout return path does not create a conversation by itself. After a
   fulfilled contact checkout, the CTA is unlocked and the user must click
   Contact Host again to start or resume the conversation.

Evidence: CH-E004, CH-E010, CH-E025; `phase-4/02-api-data-flow.md` Flow 3;
`src/app/listings/[id]/ListingPageClient.tsx:818-852`.

## Messages Inbox

1. Authenticated user opens `/messages`.
2. Server page loads conversations with `getConversations`.
3. `MessagesPageClient` renders list/search/empty states.
4. Selecting a conversation opens `/messages/{id}` on mobile or updates the active split-view conversation on desktop.
5. The inbox supports mark-all-read, block/unblock dialogs, per-user delete, input, and message send flows.

Evidence: CH-E017, CH-E034, CH-E038, CH-E040;
`phase-4/01-ui-interaction-census.md`.

## Message Thread

1. Authenticated user opens `/messages/{id}`.
2. Server page denies access when conversation is missing, admin-deleted, hidden for the user, or the user is not a participant.
3. `ChatWindow` manages messages, draft, sending, typing, polling, realtime fallback, optimistic messages, rate-limit state, offline state, blocked state, and private-feedback UI.
4. Sending delegates to `sendMessage`, which delegates to `sendConversationMessage`.

Evidence: CH-E012-CH-E018, CH-E032, CH-E034, CH-E038, CH-E040;
`phase-4/01-ui-interaction-census.md`.

## Viewer-State Loading

Listing detail starts from fallback viewer contact state, fetches
`/api/listings/{id}/viewer-state` for non-owner viewers, and preserves fallback
state when the fetch fails. The current docs do not verify a dedicated
viewer-state loading copy; source evidence shows the CTA continues from fallback
state while the fetch resolves. Evidence:
`src/app/listings/[id]/ListingPageClient.tsx:971-1005`.

## Notification And Email Side Effects

Successful message persistence creates internal `NEW_MESSAGE` notifications and calls preference-aware email sending for other participants with email addresses. Actual email delivery is not runtime verified. Evidence: CH-E014; `unknowns.md` CH-U004.
