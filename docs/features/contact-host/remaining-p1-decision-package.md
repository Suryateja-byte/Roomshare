# Contact Host Remaining P1 Decision Package

Status date: 2026-05-12.

Decision update: P1-3 Message-Length Authoritative Limit is approved as
Option A, one uniform 1000-character outbound message limit. Implementation
progress and current focused-test execution status are tracked in
`goal-progress-message-limit-1000.md` and CH-E066. The option analysis below is
retained as historical decision context.

Decision update: P1-1 Suspended/Blocked Listing-Detail Proof is approved as
Option A. Implementation progress is tracked in
`goal-progress-suspended-blocked-contract.md`, CH-E068, and CH-E073. The
focused/full listing-detail Chromium proof for the four suspended/blocked states
is now closed by CH-E073.

Scope: decision package only. This document does not change production code,
tests, schema, fixtures, or provider configuration.

Decision owners:

- Product owner: listing-detail suspended/blocked user experience and
  authoritative outbound message-length policy.
- Security owner: Supabase realtime/RLS verification path and required
  authorization evidence.
- Test/platform owner: E2E fixture shape and safe provider/local verification
  harness after product/security decisions are approved.

## Decision Summary

| P1 | Current status | Recommended decision |
|---|---|---|
| Suspended/blocked listing-detail proof | Approved Option A implemented in source/test/fixtures; focused/full listing-detail Chromium proof closed by CH-E073. | Historical decision retained; no current P1 gate remains for the scoped listing-detail Chromium proof. |
| Provider-level Supabase realtime/RLS proof | Local fallback/API/mocked-realtime proof exists; provider delivery/JWT/RLS proof is blocked. | Approve a safe local Supabase provider harness as the primary path; use an isolated staging/provider runbook only if local provider fidelity is insufficient. |
| Message-length authoritative limit | Historical pre-approval behavior was verified as inconsistent. | Adopt one uniform 1000-character outbound message limit across thread, inbox, server action, API, and docs. Approved after this package; see CH-E066. |

## P1-1: Suspended/Blocked Listing-Detail Proof

### Historical Evidence

- The scoped listing-detail state matrix already has Chromium proof for
  paywall-required, unavailable, migration-review, and moderation-locked states;
  suspended/blocked proof was unresolved before CH-E068. Evidence:
  `docs/features/contact-host/goal-progress-suspended-blocked.md:27-34`.
- `contactDisabledReason` currently covers login, email verification, owner
  view, listing unavailable, migration review, moderation locked, and paywall
  required only. Evidence:
  `docs/features/contact-host/goal-progress-suspended-blocked.md:35-39` and
  `docs/features/contact-host/05-api-contracts.md:82-84`.
- The viewer-state route does not select host suspension, viewer suspension, or
  block relationship state for pre-click listing-detail disabling. Evidence:
  `docs/features/contact-host/goal-progress-suspended-blocked.md:40-43`.
- Server actions and helpers enforce suspended viewer, suspended host, and both
  block directions after contact start, but that is not browser-visible
  pre-click listing-detail proof. Evidence:
  `docs/features/contact-host/goal-progress-suspended-blocked.md:44-47`.
- Current E2E auth/seed fixtures do not create suspended auth states or
  listing-detail viewer-host block relationships. Evidence:
  `docs/features/contact-host/goal-progress-suspended-blocked.md:48-52`.
- Existing focused Chromium state-matrix and full focused listing-detail spec
  passed for currently supported states. Evidence:
  `docs/features/contact-host/goal-progress-suspended-blocked.md:78-85`.

### Historical Blocker

Before CH-E068, the listing-detail browser could not represent suspended viewer,
suspended host, viewer-blocks-host, or host-blocks-viewer as pre-click disabled
states because the public viewer-state contract lacked those disabled reasons
and the E2E seed set lacked targeted suspended/block fixtures. Adding
route-mocked browser tests at that point would have invented product behavior
instead of proving an approved contract.
Evidence: `docs/features/contact-host/12-gaps-unknowns-and-questions.md:18`.

CH-E068 implemented the approved contract and fixtures. CH-E073 supersedes the
execution-pending status by closing the focused and full listing-detail Chromium
proof for the suspended/blocked states.

### Risk If Left Open

Users in suspended or blocked states may see an enabled or misleading Contact
Host CTA until the server action rejects the click. That weakens abuse UX,
creates inconsistent product copy, and leaves a release-blocking browser proof
gap for a security-sensitive contact surface.

### Why Current Tests Alone Cannot Close It

The current tests can prove click-time server enforcement and supported
viewer-state disabled states. They cannot prove pre-click listing-detail behavior
for states that the public contract cannot express and the fixtures cannot seed.

### Options

| Option | Implementation scope | Production risk | Test plan | Docs impact | Recommendation |
|---|---|---|---|---|---|
| A. Add explicit viewer-state disabled reasons and targeted fixtures | Add approved disabled reasons such as `VIEWER_SUSPENDED`, `HOST_SUSPENDED`, `VIEWER_BLOCKED_HOST`, and `HOST_BLOCKED_VIEWER`; update viewer-state selection; add suspended auth state and block relationship fixtures for listing-detail tests. | Medium. Changes user-visible CTA states and public API contract; requires product/security review. | Route-handler tests for each reason, component CTA tests, focused Chromium listing-detail state matrix, then relevant browser matrix. | Update API contracts, state model, test traceability, evidence register, verification JSON, and this decision package status. | Recommended. It closes the actual pre-click P1 and gives users clear, early feedback. |
| B. Declare suspension/block as click-time server-action behavior only | Do not add viewer-state reasons. Document that listing detail may render the normal CTA and `startConversation` is the authoritative enforcement point. | Low code risk, higher product/security risk because UX remains late-failing. | Keep existing action/helper tests as release gate; add one browser test for visible click-time rejection if product requires it. | Reclassify pre-click listing-detail proof as intentionally out of scope; preserve server-action enforcement evidence. | Not recommended unless product explicitly rejects pre-click disabled UX. |
| C. Add test-only route mocks without production contract changes | Extend E2E mocks to inject synthetic suspended/blocked reasons not accepted by production contract. | High evidence risk. Tests would not describe production behavior. | Browser tests could pass but would be non-authoritative. | Would require strong caveats and should not close the P1. | Reject. This would create false confidence. |

Decision needed: should listing detail expose suspended/block states before click
through the viewer-state contract? Recommended answer: yes, approve Option A.

## P1-2: Provider-Level Supabase Realtime/RLS Proof

### Current Evidence

- The realtime/RLS/fallback P1 is reduced: fallback polling, API access
  isolation, read/unread isolation, and mocked client-side realtime subscription
  handling are locally verified. Evidence:
  `docs/features/contact-host/goal-progress-realtime-rls.md:5`.
- `ChatWindow` mocked tests prove subscription setup, conversation-id filtering,
  presence subscription handoff, and inbound mark-read behavior only at the
  client/mock level. Evidence:
  `docs/features/contact-host/goal-progress-realtime-rls.md:25-28`.
- API/message isolation tests pass locally. Evidence:
  `docs/features/contact-host/goal-progress-realtime-rls.md:29`.
- RLS/provider authorization remains blocked because no `Message`,
  `Conversation`, or `_ConversationParticipants` RLS policy evidence was found,
  and no safe local provider path or live credentials were used. Evidence:
  `docs/features/contact-host/goal-progress-realtime-rls.md:30` and
  `docs/features/contact-host/12-gaps-unknowns-and-questions.md:9`.
- The evidence pass explicitly avoided live Supabase credentials. Evidence:
  `docs/features/contact-host/goal-progress-realtime-rls.md:37-38`.

### Exact Blocker

There is no approved safe path to verify provider-level realtime delivery,
Supabase JWT authorization, and database RLS behavior. Local tests verify app
fallback and client guards, but not Supabase provider authorization boundaries.

### Risk If Left Open

Message delivery and conversation isolation are security-sensitive. Without
provider-level proof, a client guard could hide a cross-conversation payload in
the UI while the provider or database still exposes data to unauthorized
subscriptions.

### Why Current Tests Alone Cannot Close It

Mocked realtime tests do not execute Supabase provider authorization, JWT
claims, publication behavior, or database RLS. API tests prove server route
isolation, not realtime subscription isolation. Closing this P1 requires either
a local Supabase provider harness or an approved isolated provider/staging run.

### Options

| Option | Implementation scope | Production risk | Test plan | Docs impact | Recommendation |
|---|---|---|---|---|---|
| A. Build a safe local Supabase provider harness | Define local Supabase setup, apply migrations/policies, seed two users and two conversations, mint or obtain role-appropriate JWTs, subscribe as each user, and assert only authorized realtime events are delivered. If policies are missing, stop and require a migration/security plan. | Medium to high. If new RLS policies or publication changes are required, this becomes schema/security-sensitive and needs explicit approval before implementation. | Local provider tests for allowed participant delivery, denied nonparticipant delivery, denied blocked/suspended path if in scope, polling fallback when realtime unavailable, and no `BlockedUser` exposure. | Update RLS evidence, security docs, test matrix, verification JSON, and production readiness ledger if schema policy work is required. | Recommended primary path because it avoids live credentials and gives repeatable security evidence. |
| B. Run an isolated staging/provider verification runbook | Use a locked-down staging Supabase project with disposable users, seeded conversations, scoped credentials, and an auditable manual/automated runbook. | Medium. Avoids local fidelity gaps but introduces credential, cleanup, and environment drift risk. | Same authorization matrix as Option A, plus cleanup verification and provider logs/screenshots as evidence. | Add provider-run evidence with date, environment, command/runbook, cleanup result, and remaining non-reproducibility caveats. | Recommended fallback only if local provider realtime/JWT fidelity is insufficient. |
| C. Accept local mock/API proof and waive provider proof | Keep current tests and document provider authorization as not verified. | High release risk for a security-sensitive message channel. | No new provider tests. Existing fallback/API/mocked realtime tests remain. | Reclassify the P1 as an accepted security risk or release exception. | Not recommended. Requires explicit security-owner risk acceptance. |

Decision needed: should the team invest in a repeatable local provider harness
or approve an isolated staging/provider runbook? Recommended answer: approve
Option A first, with Option B as fallback.

Approval-ready plan artifact:
`docs/features/contact-host/supabase-rls-proof-plan.md` defines the docs-only
proof path, prerequisites, evidence, PII constraints, validation commands,
cleanup, rollback, and closure decision points. It does not mark provider proof
complete and does not close this P1.

## P1-3: Message-Length Authoritative Limit

### Current Evidence

- Historical source and focused Jest evidence proved a contradictory
  pre-approval contract. Evidence: CH-E060.
- The intended product policy is now selected as Option A, uniform 1000
  characters. Evidence: CH-E066 and `goal-progress-message-limit-1000.md`.
- The focused Linux-side WSL Jest command for the updated boundary tests passed:
  5 suites and 97 tests. Evidence: CH-E067.

### Exact Blocker Status

The product-policy blocker is resolved by Option A approval, and the execution
gate is closed by the focused Linux-side WSL Jest pass in CH-E067.

### Risk If Left Open

Users can hit different validation behavior depending on where they compose a
message. That creates support friction, brittle tests, and inconsistent server
contract documentation.

### Why Historical Tests Alone Could Not Close It

Tests can lock current behavior, but current behavior is contradictory. Closing
the P1 requires a product decision so tests align with intended behavior rather
than preserving an accidental mismatch.

### Options

| Option | Implementation scope | Production risk | Test plan | Docs impact | Recommendation |
|---|---|---|---|---|---|
| A. Uniform 1000-character limit | Align thread composer, inbox composer, server action schema, `/api/messages` schema, visible counters, and error copy to 1000. | Low to medium. Expands thread from 500 and tightens server/API from 2000; existing >1000 accepted server payloads would be rejected after change. | Boundary tests at 999/1000/1001 for both clients, server action, and API; regression check for trimming and empty messages. | Update API contracts, state model, user-flow docs, evidence register, verification JSON, and test matrix. | Recommended. It balances usability and abuse control while keeping one simple contract. |
| B. Uniform 500-character limit | Align all surfaces to the strictest current UI cap. | Low UX risk for short inquiries, higher product risk for longer housing context; tightens inbox/server/API. | Same boundary matrix at 499/500/501. | Docs become simple but should explain concise-contact intent. | Acceptable if product wants intentionally short first-contact messages. |
| C. Long-form or surface-specific policy | Either align all surfaces to 2000, or explicitly keep thread/inbox/server limits different with rationale and matching copy. | Medium to high. Uniform 2000 increases abuse/spam payload size; surface-specific limits are harder to explain and maintain. | Boundary tests for each selected surface limit plus copy assertions explaining why the limits differ. | Docs must mark each limit as intentional, not contradictory, and explain support/product rationale. | Not recommended unless product has a clear long-form or surface-specific requirement. |

Decision outcome: Option A, uniform 1000, is approved. The alternatives remain
above as historical context.

## Cross-Cutting Next Goal After Decisions

After the product/security owner approves the recommended decisions, the next
implementation goal should be:

1. Update the viewer-state disabled-reason contract and listing-detail fixtures
   for suspended/blocked states, then add route, component, and focused browser
   proof.
2. Build the safe Supabase realtime/RLS provider verification path approved by
   security, stopping for explicit approval before any schema/RLS migration.
3. Message-length production behavior, tests, and docs are aligned to the
   approved authoritative limit and verified in CH-E067.

Any schema/RLS migration, external provider contract change, or
security-sensitive behavior change must go through explicit approval before
implementation.
