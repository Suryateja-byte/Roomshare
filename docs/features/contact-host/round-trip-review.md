# Phase 11 Round-Trip Reconstruction Review

Documentation reconstruction status: PASS after the Phase 11 correction pass,
with P1/P2 gaps still open. Runtime status: PARTIALLY VERIFIED. This review
uses only `docs/features/contact-host/` and treats Phase 1/2 and Phase 4 files
as historical snapshots unless a later current-status document supersedes them.

## Reconstruction Result

| Item | Mark | Result |
|---|---|---|
| Main user flows | Clear with scoped gaps | Listing detail contact CTA, login/verify/owner variants, contact start, paywall handoff, inbox, thread, send, notification side effects, mobile inbox/thread behavior, and runnable messaging functional-core CI coverage are reconstructable. Checkout runtime, Supabase RLS, skipped/fixme messaging realtime cases, email, suspended/paywall/unavailable listing states, and broader browser matrix remain explicit gaps. |
| Public API contracts | Partially clear | `/api/messages` branches, viewer-state, checkout, and checkout-session are documented with inputs, outputs, errors, cache/privacy status, evidence, and test status. Direct HTTP/status/cache-header verification is still a P1 gap for viewer-state and checkout surfaces. |
| State machine | Partially clear | Contact CTA, conversation identity, message list, read/unread, typing, block, checkout return, and realtime/polling states are documented. Supabase RLS, skipped/fixme messaging realtime cases, checkout fulfillment/webhook/refund, and message-length boundary behavior remain P1 gaps. |
| Auth/security/permissions | Partially clear | Auth, email verification, suspension, self-contact, listing contactability, block, rate-limit, checkout ownership, private-cache controls, and CSRF helper/missing-Origin route evidence are listed. Expanded per-route CSRF variants, Supabase RLS, payment fulfillment permissions, and broader profile gates remain P1 gaps. |
| Key invariants | Clear with one unresolved contract | Contact-first/no-booking, auth/email/suspension gates, no self-contact, listing contactability, block enforcement, duplicate reuse, and paywall states are clear. Message length remains explicitly unresolved across 500/1000/2000 limits. |
| Error/empty/loading states | Partially clear | The docs inventory source-observed failures and focused runtime coverage. Exact visible copy and focus/accessibility remain gaps for checkout, blocked/delete/search/mark-all-read, suspended/paywall/unavailable listing states, and full matrix. |
| Minimum release-blocking test plan | Clear | `11-test-traceability-matrix.md` now distinguishes currently accepted P0 release-blocking checks from P1 confidence-building/runtime gaps and explains when P1 items should be promoted to P0. |
| Remaining gaps/unknowns | Clear | `12-gaps-unknowns-and-questions.md`, `unknowns.md`, and `verification.json` list remaining P1/P2 gaps without claiming them as verified. |

## Historical Snapshot Rules

- `00-feature-boundary.md` records the Phase 1/2 source-discovery boundary.
  Later runtime/test status lives in `runtime-verification.md`,
  `11-test-traceability-matrix.md`, and `evidence-register.md` CH-E032-CH-E049.
- `phase-4/*` files are historical source-only evidence passes. Their `NOT RUN`
  cells describe Phase 4 only and are superseded by later command evidence where
  the final docs cite CH-E032-CH-E049.
- `source-map.md` and `01-source-map.md` use source-verification labels for
  inspected files; runtime proof is only claimed where command evidence is
  cited.

## P1/P2 Gaps Preserved

| Gap | Classification | Why not P0 in current docs |
|---|---|---|
| Viewer-state direct HTTP/status/cache proof | P1 | Source contract is documented and not claimed as direct HTTP verified. |
| Checkout browser return/runtime | P1 | Focused checkout, checkout-session, paywall, and contact-restoration tests passed in CH-E044/CH-E047; paid unlock browser return remains a gap. Promote to P0 if paid unlock runtime is release-blocking. |
| Expanded CSRF route variants | P1 | CSRF helper tests and route-level missing-Origin rejection passed in CH-E044; per-route malformed/mismatched Origin variants remain optional confidence coverage. |
| Supabase realtime/RLS and skipped/fixme messaging realtime cases | P1 | Messaging has polling/API evidence; the local focused functional E2E attempt in CH-E048 was blocked before spec execution by missing local `DATABASE_URL`, while CH-E049 adds green CI evidence for runnable messaging functional-core cases. Supabase RLS, skipped two-user polling, unread badge fixme, and failed-message retry fixme remain explicitly unverified. |
| Message length mismatch | P1 | The contradiction is documented as unresolved and needs product decision plus tests. |
| Broader profile-completion gates | P1 | Docs only claim email verification and suspension gates, not broader profile requirements. |
| Full Firefox-WebKit/browser matrix | P1 | Focused current gates, including setup-backed Mobile Chrome, pass; full matrix is marked incomplete. |
| Email delivery | P2 | Source send calls and helper tests are documented, but actual delivery is environment dependent and unverified. |

Ready for Phase 12 human validation: yes, as a documentation package with no P0
documentation blockers and explicit P1/P2 open gaps.
