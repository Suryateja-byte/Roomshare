# State Management

Status: source-backed state model with runtime evidence cited where available; unverified state transitions remain listed as gaps.

Diagram reference: `diagrams/state-machine-contact-host.mmd` is the compact
state-machine view. The table below is the textual source-of-truth reference for
state ownership and drift risk.

Drift risk scale:

| Risk | Meaning |
|---|---|
| High | Multiple owners or source/runtime gaps can cause user-visible or security-sensitive drift. |
| Medium | State is mostly centralized but has client/server or runtime-verification gaps. |
| Low | State has one clear owner and direct verification evidence. |

| State | Owner | Source of truth | Read by | Written by | Reset / transition condition | Drift risk | Evidence |
|---|---|---|---|---|---|---|---|
| Viewer contact state | Listing detail client plus viewer-state API | Fallback local state until API merge; server privacy-first contract after fetch | `MessagingCta`, sidebar, host section | Fallback builder, viewer-state fetch, checkout return update | Listing/session changes, viewer-state fetch result, checkout return | Medium | CH-E002, CH-E019, CH-E020; `phase-4/03-state-model.md` |
| Contact button state | `ContactHostButton` | Local React state | Button/dialog | Click handler and checkout handler | Success/failure/finally blocks | Medium | CH-E003, CH-E004 |
| Paywall summary | Paywall evaluator and viewer state | Server paywall evaluation | Listing detail, button dialog, checkout route | Viewer-state API, start action, checkout return | Entitlement changes, purchase fulfillment, emergency flags | High | CH-E010, CH-E025 |
| Conversation identity | Database | `Conversation` row and participants | Start action, pages, APIs | Start transaction, message send resurrection | Existing/resurrected/new conversation branches | High | CH-E008, CH-E009, CH-E023 |
| Contact attempt audit | Database | `ContactAttempt` | Audit/review paths | `recordContactAttempt` | Each success/failure outcome | Medium | CH-E011 |
| Message list | Database plus client local/optimistic state | `Message` rows after commit | Inbox/thread UI and APIs | Send helper, polling/realtime, optimistic UI | Send success/failure, polling, realtime, navigation | High | CH-E012-CH-E015; `phase-4/01-ui-interaction-census.md` |
| Read/unread state | Database and local UI counts | `Message.read`, grouped unread counts | Inbox/thread/API | Mark-read helpers and UI local updates | Thread open, mark all, poll/read actions | Medium | CH-E015, CH-E016 |
| Typing state | Database/actions plus realtime client | Typing status rows or broadcasts | Thread/inbox UI | Typing debounce, typing actions/broadcasts | Debounce stop, freshness window | High | `phase-4/03-state-model.md` |
| Block state | Database plus thread UI | `BlockedUser` relation | Start/send gates, `BlockedConversationBanner` | Block/unblock actions | Block/unblock dialogs/actions | High | CH-E022 |
| Conversation deletion state | Database | `ConversationDeletion` per user | `/messages`, `/messages/[id]`, API reads | Delete conversation action; message send resurrects | User delete or new message | Medium | `phase-4/03-state-model.md` |
| Checkout return phase | Listing detail client | URL params plus checkout-session API response | Listing detail notices and viewer state | Return effect and polling loop | Fulfilled, canceled, failed, expired, timeout, polling error | High | `phase-4/01-ui-interaction-census.md` |
| Realtime/polling mode | `ChatWindow` | Local connection state plus Supabase/polling behavior | Thread UI | Realtime subscription and fallback timers | Close/error/timeout/offline | High | `phase-4/01-ui-interaction-census.md`; `unknowns.md` CH-U005 |

## Transition Matrix

| From state | Event | Guard / condition | Action | To state | Evidence | Verification status |
|---|---|---|---|---|---|---|
| Listing detail fallback | Session/viewer-state fetch starts | Non-owner viewer and session loading complete | Fetch `/api/listings/{id}/viewer-state` | Viewer-state loading | `src/app/listings/[id]/ListingPageClient.tsx:971-1005` | Source verified |
| Viewer-state loading | Viewer-state fetch succeeds | API returns contact contract | Merge viewer state into listing detail | Contact-ready/login/verify/owner/disabled/paywall state | CH-E019, CH-E020 | Source verified; route test gap |
| Viewer-state loading | Viewer-state fetch fails | Network/API failure | Preserve fallback state and mark loaded | Fallback contact state | `src/app/listings/[id]/ListingPageClient.tsx:1001-1005` | Source verified |
| Contact ready | User clicks Contact Host | Authenticated, email-verified, contactable listing, no required paywall | Call `startConversation` with listing/idempotency/unit epoch | Starting conversation | CH-E003, CH-E005-CH-E011 | Focused Jest/Chromium partial |
| Starting conversation | Success | Conversation created/reused/resurrected | Navigate to `/messages/{conversationId}` | Message thread | CH-E003, CH-E008, CH-E009, CH-E034, CH-E040 | Focused runtime verified |
| Starting conversation | Recoverable failure | Generic server/action failure | Toast/error handling, clear loading/idempotency guard | Contact ready / retry possible | `src/components/ContactHostButton.tsx:124-146` | Source verified |
| Starting conversation | Unauthorized/session expired | No valid session | Navigate to `/login` | Login required | CH-E003, CH-E006 | Component/source verified |
| Starting conversation | Paywall required | Action returns paywall-required result | Open paywall dialog | Paywall required | CH-E004, CH-E010 | Component verified; checkout runtime gap |
| Paywall required | User selects offer | Offer available | POST `/api/payments/checkout` | Checkout opening | CH-E004; `phase-4/02-api-data-flow.md` | Component source/mock only |
| Checkout return | Checkout fulfilled | Checkout-session classifies fulfilled | Update viewer state to contactable | Contact ready | `src/app/listings/[id]/ListingPageClient.tsx:818-852` | Source verified; runtime gap |
| Checkout return | Canceled/failed/expired/timeout | Checkout-session not fulfilled | Show notice and keep/restore paywall state | Paywall required / retry | `phase-4/01-ui-interaction-census.md` | Source verified; runtime gap |
| Message thread | User sends message | Participant, valid content, not blocked/listing-gated | Persist message and update conversation | Message thread | CH-E012-CH-E014, CH-E032, CH-E034 | Focused tests partial |
| Message thread | Realtime unavailable | Channel close/error/timeout/offline | Fall back to polling | Polling | `phase-4/01-ui-interaction-census.md` | Realtime/RLS runtime gap |
| Message thread | Block relationship exists | Either participant blocked the other | Replace composer with blocked banner | Blocked | CH-E022 | UI runtime gap |
| Blocked | Current user unblocks | User owns block action | Unblock action updates state | Message thread | CH-E022 | UI runtime gap |
| Conversation visible | User hides/deletes conversation | Participant action | Upsert `ConversationDeletion` for current user | Conversation hidden for current user | `phase-4/03-state-model.md` | Runtime gap |

## State Gaps

- Supabase realtime authorization and database policy behavior remain unknown. PR #123 CI covers runnable messaging functional-core behavior, not RLS. Evidence: `phase-4/04-auth-security-permissions.md`; CH-E049.
- Message length state is inconsistent between inbox, thread, server action, and API. Evidence: CH-E030.
- Runtime visual state transitions are partially verified by focused browser checks and PR #123 CI; checkout, blocked/delete/search/mark-all-read, suspended/paywall/unavailable, and skipped/fixme realtime states remain gaps. Evidence: CH-E029, CH-E049.
