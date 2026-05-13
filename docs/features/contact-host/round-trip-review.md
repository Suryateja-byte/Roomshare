# Phase 11 Round-Trip Reconstruction Review

Documentation reconstruction status: PASS after the Phase 11 correction pass,
with P1/P2 gaps still open. Runtime status: PARTIALLY VERIFIED. This review
uses only `docs/features/contact-host/` and treats Phase 1/2 and Phase 4 files
as historical snapshots unless a later current-status document supersedes them.

## Reconstruction Result

| Item | Mark | Result |
|---|---|---|
| Main user flows | Clear with scoped gaps | Listing detail contact CTA, login/verify/owner variants, contact start, paywall handoff, inbox, thread, send, notification side effects, mobile inbox/thread behavior, checkout return, paywall/unavailable/migration/moderation listing-detail states, focused WebKit/Firefox/Mobile Chrome/Mobile Safari listing-detail and messaging behavior, fallback polling, mocked realtime insert handling, local Supabase Option A provider/RLS proof, Firefox browser availability, CH-E068 suspended/blocked source/test/fixture behavior, and CH-E073 focused suspended/blocked Chromium listing-detail proof are reconstructable. Optional production/staging Supabase provider proof and email are P2 or production-hardening gaps. |
| Public API contracts | Partially clear | `/api/messages` branches, viewer-state, checkout, and checkout-session are documented with inputs, outputs, errors, cache/privacy status, evidence, and test status. Direct route-handler status/cache verification now passes for `/api/messages` and viewer-state; mocked checkout browser/runtime return is closed by CH-E058, and optional live-server API parity plus real provider fulfillment are P2. |
| State machine | Partially clear | Contact CTA, conversation identity, message list, read/unread, typing, block, checkout return, and realtime/polling states are documented. CH-E062 reduces realtime/RLS/fallback through local fallback/API/mocked realtime proof and CH-E076 closes local Option A provider/RLS proof; message length is approved as a uniform 1000-character contract in CH-E066 and verified by the focused Linux-side WSL Jest command in CH-E067; real provider checkout fulfillment/webhook/refund proof is P2 confidence coverage after CH-E058 closed mocked browser return. |
| Auth/security/permissions | Partially clear | Auth, email verification, suspension, self-contact, listing contactability, block, rate-limit, checkout ownership, private-cache controls, fallback polling, mocked realtime insert handling, local Option A provider/RLS proof, and CSRF helper/route-variant evidence are listed. Expanded per-route CSRF variants are closed for deterministic route-handler Jest by CH-E071; optional production/staging provider proof, payment fulfillment permissions, and broader profile gates remain gaps. |
| Key invariants | Clear with scoped runtime gaps | Contact-first/no-booking, auth/email/suspension gates, no self-contact, listing contactability, block enforcement, duplicate reuse, paywall states, and the approved 1000-character message limit are clear. Message-limit focused Linux-side WSL Jest execution passed in CH-E067. |
| Error/empty/loading states | Partially clear | The docs inventory source-observed failures and focused runtime coverage. Exact visible copy and focus/accessibility remain gaps for blocked/delete/search/mark-all-read, optional production/staging provider proof, and email; CH-E073 closes the scoped suspended/blocked listing-detail Chromium pre-click proof. |
| Minimum release-blocking test plan | Clear | `11-test-traceability-matrix.md` now distinguishes currently accepted P0 release-blocking checks from P1 confidence-building/runtime gaps and explains when P1 items should be promoted to P0. |
| Remaining gaps/unknowns | Clear | `12-gaps-unknowns-and-questions.md`, `unknowns.md`, and `verification.json` list remaining P1/P2 gaps without claiming them as verified. |

## Historical Snapshot Rules

- `00-feature-boundary.md` records the Phase 1/2 source-discovery boundary.
  Later runtime/test status lives in `runtime-verification.md`,
  `11-test-traceability-matrix.md`, and `evidence-register.md` CH-E032-CH-E062.
- `phase-4/*` files are historical source-only evidence passes. Their `NOT RUN`
  cells describe Phase 4 only and are superseded by later command evidence where
  the final docs cite CH-E032-CH-E062.
- `source-map.md` and `01-source-map.md` use source-verification labels for
  inspected files; runtime proof is only claimed where command evidence is
  cited.

## P1/P2 Gaps Preserved

| Gap | Classification | Why not P0 in current docs |
|---|---|---|
| Viewer-state direct HTTP live-server parity | P2 | Route-handler status/cache/contract proof passed in CH-E056; live-server capture is optional confidence coverage unless release acceptance requires transport-level proof. |
| Checkout browser return/runtime | Closed P1 | Checkout creation route and checkout-session route/status tests passed in CH-E053 after fixture freshness repair; CH-E058 passed mocked Chromium checkout return / paid-unlock runtime. Real Stripe redirect and webhook/provider fulfillment remain P2 confidence coverage. |
| Expanded CSRF route variants | Closed | CSRF helper/messages-route tests passed in CH-E049, checkout missing-Origin rejection passed inside CH-E053, and CH-E071 passed missing/malformed/mismatched Origin plus valid same-origin and localhost-development route-handler variants for `/api/messages` and `/api/payments/checkout`. |
| Supabase realtime/RLS | Local P1 closed; P2 production-hardening | Messaging has polling/API evidence and CH-E076 local Option A provider/RLS proof. Production/staging provider proof and production Prisma migration/RLS policy rollout are not claimed and require separate approval if pursued. |
| Suspended/blocked listing-detail pre-click browser proof | Closed by CH-E073 | CH-E061 found the historical missing contract/fixture gap. CH-E068 added explicit viewer-state disabled reasons, safe disabled UI copy, suspended/block fixtures, focused route tests, and focused Chromium test source. CH-E073 closes the historical execution gap with focused four-state Chromium listing-detail proof and a full listing-detail Contact Host Chromium spec rerun. |
| Message length limit | Closed P1 | CH-E066 implements the approved uniform 1000-character limit across source and focused test sources, and CH-E067 records the passing focused Linux-side WSL Jest command. The prior Windows/UNC failure was an execution-environment issue, not a product failure. |
| Broader profile-completion gates | P2 / unknown | Docs only claim email verification and suspension gates, not broader profile requirements; this is not a current Contact Host P1 unless product requirements add a broader profile gate. |
| Focused Firefox browser-matrix blockers | Closed P1 | CH-E065 closes the two named focused Firefox blockers: listing-detail image decode clean-console noise and messaging `NS_BINDING_ABORTED` navigation races. The practical combined two-spec Firefox run now passes, and no broad non-focused browser matrix is claimed. |
| Email delivery | P2 | Source send calls are documented, but delivery is environment dependent and unverified. |

Ready for Phase 12 human validation: yes, as a documentation package with no P0
documentation blockers and explicit P1/P2 open gaps.
