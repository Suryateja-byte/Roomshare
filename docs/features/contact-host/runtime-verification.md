# Runtime Verification

Status: `PARTIALLY VERIFIED`.

Current deterministic verification passes for viewer-state route
contract/status/cache, viewer-state/private-feedback no-bleed plus listing-page
viewer-state/paywall/checkout-return component behavior, checkout creation
route, checkout-session polling/status helpers, CSRF/auth/messages API variants,
messaging/contact-host actions/components, affected contact/payment coverage,
direct `/api/messages` route-handler status/cache-header branches, focused
historical message-length cap assertions, fallback polling, API read/unread
isolation, and mocked client-side realtime subscription handling. The
checkout-route stale-fixture failure documented in CH-E048 is closed by CH-E053
as a test/setup issue, not a product bug; the adjacent phone-reveal
stale-fixture failure found during affected payment/contact validation is closed
by CH-E054; the direct message API stale-fixture failure found in CH-E055 is
likewise closed as a test/setup issue after the exact focused WSL command
passed. CH-E056 initially failed because of a new-test mock hoisting issue, then
passed after test-only mock setup repair. Current focused listing-detail Contact
Host browser runtime passes in Chromium after a non-authoritative parallel
dev-server collision was rerun sequentially. CH-E057 closes the clean full
Chromium messaging rerun P1 after a narrow J25 test/setup hydration fix. CH-E058
closes checkout browser return / paid-unlock runtime in Chromium with mocked
checkout-session and viewer-state responses; it does not verify real Stripe
redirect or webhook/provider fulfillment. CH-E059 closes listing-detail browser
state proof for paywall-required, unavailable, migration-review, and
moderation-locked states using mocked viewer-state/status routes. CH-E061 is the
historical pre-implementation blocker classification for suspended and blocked
pre-click states. CH-E068 implements the approved Option A contract and fixture
path with explicit viewer-state disabled reasons, disabled listing-detail copy,
route tests, and focused E2E test source. CH-E069 is the historical
environment-blocker classification. CH-E073 closes the suspended/blocked
listing-detail Chromium browser P1: the focused four-state command and the full
listing-detail Contact Host Chromium spec passed from the Linux-side workspace.
CH-E062 reduces the earlier realtime/RLS/fallback P1 with local fallback
polling, mocked realtime insert handling, message delivery isolation, and
read/unread isolation. CH-E076 closes the active local Option A provider/RLS
P1: the local Supabase stack preflight passed with redacted local endpoints;
schema apply passed against the local Supabase DB; local-only RLS proof SQL
showed RLS/policies for `Conversation`, `_ConversationParticipants`, `Message`,
`ConversationDeletion`, and `TypingStatus`; only `Message` was in
`supabase_realtime`; forbidden tables were absent; the direct RLS verifier
passed 28 assertions; the local Realtime verifier passed with 4 local Auth
actors, 9 `Message` subscriptions, 2 allowed inserts, 2 denied writes, 4
delivery assertions, 15 non-delivery assertions, and 34 total assertions; and
rollback plus cleanup checks passed. This is local provider evidence only and
does not claim production or staging RLS policies exist. Production Prisma
migration/RLS policy rollout requires separate approval. CH-E066 records the
approved uniform 1000-character message-limit
implementation across source and focused test sources, and CH-E067 records the
passing focused Linux-side WSL Jest command for the updated boundary tests.
CH-E063 reduces the focused browser-matrix P1 with WebKit,
Mobile Chrome, and Mobile Safari passes. CH-E064 closes the prior Firefox
missing-executable blocker, and CH-E065 closes the post-install Firefox
blockers: listing-detail now uses deterministic SVG image mocks instead of
Firefox-corrupting tiny PNG fixture bytes, direct navigation helpers now treat
Firefox `NS_BINDING_ABORTED` as the same retryable test navigation race as
existing abort spellings, the focused Firefox listing-detail and messaging specs
pass individually, and the practical combined Firefox two-spec run passes. Email
delivery is locally reduced in CH-E074: mocked Contact Host payload coverage and
template escaping pass without real provider calls, while real provider
acceptance/inbox delivery remain not verified. Optional direct HTTP live-server
API parity, real provider/webhook payment fulfillment, and optional
production/staging Supabase provider proof remain not verified.
Evidence:
`evidence-register.md` CH-E046-CH-E076 plus historical CH-E032-CH-E045;
`unknowns.md` CH-U001, CH-U003-CH-U008;
`12-gaps-unknowns-and-questions.md` CH-G001-CH-G008.

## Required Runtime Checks

| Flow | Required observation | Status |
|---|---|---|
| Listing detail contact CTA | Anonymous, unverified, verified tenant, owner, paywall-required, unavailable/migration/moderation, and suspended/blocked listing states | Current focused `tests/e2e/listing-detail/contact-host-runtime.spec.ts` sequential reruns passed in Chromium for authenticated non-owner contact-first sidebar/no-booking copy, anonymous sign-in CTA, checkout return / paid-unlock, paywall-required unlock dialog, unavailable warning/no CTA, migration-review warning/no CTA, and moderation-locked warning/no CTA. CH-E063 adds focused WebKit, Mobile Chrome, and Mobile Safari listing-detail passes. CH-E064 installed Firefox and reproduced clean-console image decode failures. CH-E065 replaced the test image mock with deterministic SVG responses and the focused Firefox listing-detail command passed. CH-E068 adds source, fixture, passing route coverage, and focused test coverage for suspended viewer, suspended host, viewer-blocks-host, and host-blocks-viewer disabled pre-click states; CH-E073 passes the focused four-state Chromium browser proof and the full listing-detail Contact Host Chromium spec. |
| Start conversation | Successful navigation to `/messages/{id}` and duplicate-click behavior | Deterministic `startConversation`, ContactHostButton, listing-contactable, and chat-dedup tests passed in CH-E050. Historical Chromium dedupe passed in CH-E033. Full Chromium messaging passed in CH-E057 after a test/setup synchronization fix. CH-E063 adds focused WebKit, Mobile Chrome, and Mobile Safari messaging passes after a narrow WebKit test-navigation retry. CH-E064/CH-E065 reproduced Firefox `NS_BINDING_ABORTED` in direct navigation and then fixed it with targeted helper recognition; the focused Firefox messaging command passed after the helper change. |
| Paywall dialog and checkout handoff | Dialog, offer click, checkout URL, checkout return notice paths | Component-level paywall/checkout-return behavior passed in CH-E046/CH-E050, checkout creation route and checkout-session/status tests passed in CH-E053, affected payment/contact coverage passed in CH-E054, and Chromium checkout return / paid-unlock runtime passed with mocked checkout-session and viewer-state responses in CH-E058. Real Stripe redirect and webhook/provider fulfillment were not run. |
| Messages inbox | Empty state, conversation list, search, mark-all-read, mobile/desktop navigation | Deterministic MessagesPageClient and `/api/messages` tests passed in CH-E049-CH-E050. Historical Mobile Chrome no-deps and setup-backed Mobile Chrome specs passed after the second-pass fix. Full Chromium messaging passed in CH-E057; search and mark-all-read browser checks not run. |
| Message thread | Send, optimistic state, retry, blocked banner, unread/read state, draft restore | Deterministic action/API/component tests passed in CH-E049-CH-E050. Full Chromium J25 send flow passed in CH-E057 after the test waited for the controlled composer to settle before typing. Retry, blocked banner, unread/read browser assertions, draft restore, and full matrix not run. |
| Realtime/polling | Realtime insert, typing/presence, fallback to polling | CH-E062 verifies mocked `ChatWindow` realtime insert subscription, conversation-id guard, presence tracking handoff, inbound mark-read, no-Supabase fallback polling, thread polling, inbox polling, and API poll/read isolation. CH-E076 closes the active local Option A provider/RLS P1 with local Supabase stack preflight, schema apply, local-only RLS/publication audit, 28 direct RLS assertions, 34 local Realtime assertions, rollback, and cleanup. This is local Supabase provider proof only; production/staging provider proof and production policy rollout are not claimed. |
| API behavior | `/api/messages`, viewer-state, checkout, checkout-session status | Current focused Jest/API suite passed for `/api/messages`, message read/unread/pagination, viewer-state route contract/status/cache, checkout creation route, checkout-session polling/status, private-feedback viewer-state no-bleed, listing-page viewer-state component behavior, and CSRF helper/messages-route coverage. CH-E055 passed `/api/messages` status/cache-header assertions for successful route-handler branches after a test-only stale-fixture repair. CH-E056 passed viewer-state route-handler tests for rate-limit status, auth variants, privacy-safe fields, missing/unavailable/moderation-locked states, paywall-required state, fallback behavior, and `private, no-store` headers. Optional direct HTTP live-server API parity is P2. |

## Runtime Acceptance

Runtime acceptance is reduced but still partial. Deterministic API/action/component coverage is current and strong for message auth/CSRF, listing contactability, conversation starts, message sends, viewer-state route contract/status/cache, viewer-state no-bleed, listing-page paywall UI, checkout creation, checkout-session polling, affected contact/payment coverage, `/api/messages` route-handler status/cache-header behavior, fallback polling, mocked client-side realtime insert handling, read/unread isolation, local Supabase Option A provider/RLS proof, the full Chromium messaging journey, mocked Chromium checkout return / paid-unlock runtime, the scoped listing-detail browser state matrix for paywall-required/unavailable/migration-review/moderation-locked states, focused WebKit/Firefox/Mobile Chrome/Mobile Safari listing-detail and messaging matrix evidence, installed Firefox browser availability, practical combined Firefox two-spec evidence, historical message-length cap classification, CH-E066 source/test alignment for the approved 1000-character message limit, CH-E067 focused Linux-side WSL Jest verification for that limit, CH-E068 source/test/fixture implementation for the four suspended/blocked listing-detail states, CH-E073 focused plus full Chromium browser proof for those suspended/blocked states, and CH-E074 local Contact Host email payload/template coverage. No active local Option A provider/RLS P1 remains after CH-E076. The original Firefox missing-executable blocker, the focused Firefox test/setup blockers, the message-length execution blocker, the suspended/blocked listing-detail Chromium blocker, and the local provider/RLS blocker are closed by CH-E064/CH-E065/CH-E067/CH-E073/CH-E076. Optional direct HTTP live-server API parity, optional production/staging Supabase provider proof, real email provider delivery, and real provider/webhook payment fulfillment are P2 confidence or production-hardening coverage.
