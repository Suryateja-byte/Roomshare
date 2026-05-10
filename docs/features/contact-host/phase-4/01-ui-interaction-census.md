# Phase 4 Evidence Pass 01: UI Interaction Census

Status: Phase 4 source-only evidence pass. Browser/runtime behavior was not verified during this pass.

## Listing Detail Contact Entry

| Surface | Interaction / state | Evidence |
| --- | --- | --- |
| Listing sidebar card | Shows availability copy and a contact-first explanation, then renders `MessagingCta`; it also states that no booking request or hold is created from the page. | `src/app/listings/[id]/ListingPageClient.tsx:494-523` |
| Listing host section | On smaller layouts, the host section renders `MessagingCta` with `viewerState.primaryCta`, `viewerState.canContact`, `viewerState.contactDisabledReason`, `viewerState.paywallSummary`, and checkout-disabled props. | `src/app/listings/[id]/ListingPageClient.tsx:1349-1365` |
| Sticky guest card | On large layouts, `ContactFirstSidebarCard` receives the same viewer contact state and checkout-disabled props. | `src/app/listings/[id]/ListingPageClient.tsx:1533-1550` |
| CTA routing | `MessagingCta` renders `ContactHostButton` only when `primaryCta === "CONTACT_HOST"` and either contact is allowed or an unlock is required. Login and verify-email states render links instead. | `src/app/listings/[id]/ListingPageClient.tsx:529-597` |

## Contact Host Button

| Interaction / state | Evidence |
| --- | --- |
| Local state tracks loading, checkout offer in progress, paywall dialog open state, a synchronous double-click guard, and a client idempotency key. | `src/components/ContactHostButton.tsx:51-58` |
| Unlock checkout posts `{ listingId, productCode }` to `/api/payments/checkout`, sends unauthenticated users to `/login`, shows an error toast if no checkout URL is returned, and redirects to the returned checkout URL. | `src/components/ContactHostButton.tsx:62-95` |
| Contact click returns early when disabled, opens the paywall dialog when unlock is required, otherwise calls `startConversation` with `listingId`, `clientIdempotencyKey`, and optional `unitIdentityEpochObserved`. | `src/components/ContactHostButton.tsx:98-124` |
| Contact errors route unauthorized users to login, open the paywall on `PAYWALL_REQUIRED`, show retry-later copy on `PAYWALL_UNAVAILABLE`, otherwise toast the returned error. | `src/components/ContactHostButton.tsx:126-140` |
| Successful contact navigates to `/messages/{conversationId}`. Cleanup clears the idempotency key, double-click guard, and loading state. | `src/components/ContactHostButton.tsx:143-153` |
| Button labels cover disabled, starting chat, redirecting, unlock, and normal contact states. | `src/components/ContactHostButton.tsx:156-173` |
| Paywall dialog lists offers and disables offer buttons while checkout is opening. | `src/components/ContactHostButton.tsx:175-214` |

## Checkout Return Interaction

| Interaction / state | Evidence |
| --- | --- |
| Listing page parses `contactCheckout`, `phoneRevealCheckout`, and `session_id` search params. | `src/app/listings/[id]/ListingPageClient.tsx:618-620` |
| Cancelled checkout shows an informational notice and removes checkout params from the URL. Missing session id shows an error notice. | `src/app/listings/[id]/ListingPageClient.tsx:720-760` |
| Successful checkout polls `/api/payments/checkout-session` with `session_id`, `listing_id`, and purchase context. | `src/app/listings/[id]/ListingPageClient.tsx:768-786` |
| Fulfilled contact checkout updates viewer state to allow contact, clears `PAYWALL_REQUIRED` mode to `METERED`, optionally refreshes viewer state, and shows success copy. | `src/app/listings/[id]/ListingPageClient.tsx:818-852` |
| Failed, canceled, expired, timeout, and polling-error states set user-visible notices and clean checkout params where applicable. | `src/app/listings/[id]/ListingPageClient.tsx:853-903` |

## Messages Inbox

| Interaction / state | Evidence |
| --- | --- |
| Inbox state includes conversations, active conversation, composer input, search, loaded messages, typing users, block dialogs, mark-all-read state, deletion state, and scroll-to-bottom state. | `src/components/MessagesPageClient.tsx:104-135` |
| Mark all as read calls `markAllMessagesAsRead`, toasts success/error, and zeroes unread counts locally. | `src/components/MessagesPageClient.tsx:143-162` |
| Search filters by participant name, listing title, or latest message content. | `src/components/MessagesPageClient.tsx:716-728` |
| The conversation list shows unread badges, participant names, last-message previews, listing titles, and an empty state with a `/search` link. | `src/components/MessagesPageClient.tsx:730-887` |
| Conversation click opens `/messages/{id}` on mobile and sets `activeId` in the desktop split view. | `src/components/MessagesPageClient.tsx:796-809` |
| Active conversation header supports back-to-list, block/unblock, and per-user delete conversation flows. | `src/components/MessagesPageClient.tsx:897-1032` |
| Message area shows loading state, message bubbles, failed-message retry affordance, read/delivered labels, typing indicator, and a scroll-to-latest button. | `src/components/MessagesPageClient.tsx:1034-1163` |
| Blocked conversations replace the composer with `BlockedConversationBanner`; otherwise the composer shows offline copy, attachment placeholder toast, input, send button, and character counter. | `src/components/MessagesPageClient.tsx:1166-1228` |

## Conversation Thread

| Interaction / state | Evidence |
| --- | --- |
| Thread state includes messages, input, sending, polling, typing, online status, realtime/polling transport mode, block/private-feedback dialogs, rate limiting, offline state, and message refs. | `src/app/messages/[id]/ChatWindow.tsx:105-151` |
| Before unload warns while sending or when unsent input exists; mount restores a saved draft from `sessionStorage` and focuses the input. | `src/app/messages/[id]/ChatWindow.tsx:203-238` |
| Input changes broadcast typing in realtime mode and stop typing after debounce. | `src/app/messages/[id]/ChatWindow.tsx:286-317` |
| Polling fallback fetches `/api/messages?conversationId=...&poll=1`, deduplicates incoming messages, updates the cursor, and marks incoming messages read. | `src/app/messages/[id]/ChatWindow.tsx:319-386` |
| Realtime subscription listens for `Message` inserts, typing broadcasts, and presence events, then falls back to polling when closed, errored, or timed out. | `src/app/messages/[id]/ChatWindow.tsx:388-533` |
| Send flow blocks offline/rate-limited/empty sends, adds an optimistic message, handles session expiry with draft restore, handles rate limit errors, marks failures, and replaces optimistic messages on success. | `src/app/messages/[id]/ChatWindow.tsx:549-633` |
| Failed message retry and delete actions are local UI interactions; retry reuses `sendMessage` and preserves error state on failure. | `src/app/messages/[id]/ChatWindow.tsx:636-696` |
| Header exposes back navigation, connection status, private feedback when eligible, block/unblock actions, and the block confirmation dialog. | `src/app/messages/[id]/ChatWindow.tsx:733-864` |
| Message render includes date grouping, outgoing/incoming bubbles, optimistic spinner, failed icon, retry/delete controls, typing indicator, offline banner, rate-limit countdown, input, send button, and character counter. | `src/app/messages/[id]/ChatWindow.tsx:866-1065` |
| `BlockedConversationBanner` distinguishes "blocked by other user" from "current user blocked other user" and optionally exposes an unblock button. | `src/components/chat/BlockedConversationBanner.tsx:24-65` |

## Unknowns And Gaps

- Runtime visual behavior for listing contact CTAs, paywall dialog, checkout return notices, inbox split view, mobile thread route, and chat composer is NOT VERIFIED.
- Browser accessibility behavior, focus management, and keyboard interaction are NOT VERIFIED.
- Search/map listing-card direct contact entry point remains UNKNOWN; no manifest-listed file shows a search card contact CTA.
- Supabase realtime delivery, presence accuracy, typing broadcast behavior, and polling fallback behavior are source-observed but NOT VERIFIED at runtime.
- Message length limits differ by surface: inbox composer uses 1000 characters, thread composer uses 500, while server/API schemas allow 2000. Evidence: `src/components/MessagesPageClient.tsx:53`, `src/app/messages/[id]/ChatWindow.tsx:69`, `src/app/actions/chat.ts:43-46`, `src/app/api/messages/route.ts:23-27`.
