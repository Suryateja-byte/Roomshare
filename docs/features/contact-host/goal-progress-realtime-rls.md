# Contact Host Realtime/RLS/Fallback Goal Progress

Status date: 2026-05-13.

Outcome: `LOCAL OPTION A VERIFIED / P1 CLOSED LOCALLY`. Fallback polling, API
access isolation, read/unread isolation, mocked client-side realtime
subscription handling, and local Supabase provider/RLS assertions are locally
verified. CH-E076 records local Supabase preflight/schema apply, local-only
RLS/publication audit, direct RLS assertions, realtime delivery/non-delivery
assertions, rollback, and cleanup.

Production/staging provider proof remains optional P2 or production-hardening
evidence. This proof does not claim production/staging RLS policies exist.
Production Prisma migration/RLS policy rollout requires separate approval.

## Checklist

- [x] Create or update `docs/features/contact-host/goal-progress-realtime-rls.md` with this checklist and progress notes.
- [x] Audit current Contact Host docs and `documentation-inventory.md` for the exact realtime/RLS/fallback P1 wording.
- [x] Inspect messaging realtime implementation, Supabase client/server helpers, RLS policies/migrations if present, fallback polling behavior, `ChatWindow` behavior, message APIs, and existing tests.
- [x] Determine what can be proven locally: RLS policy evidence, mocked realtime behavior, fallback polling behavior, unread/read isolation, message delivery isolation, or provider setup blocker.
- [x] Run existing focused tests first for messaging APIs, `ChatWindow`, `MessagesPageClient`, and Supabase/realtime-adjacent helpers.
- [x] Add the smallest test-only proof for mocked realtime subscription behavior without real provider calls.
- [x] Do not edit production behavior unless a real product bug is proven and explicitly approved.
- [x] Do not require live Supabase credentials unless the repo already provides a safe local/test path.
- [x] Update Contact Host docs and inventory with the reduced/blocked classification.
- [x] Run JSON parse validation for `docs/features/contact-host/verification.json` and `manifest.json`.
- [x] Run `git diff --check` for touched files.
- [x] Run stale wording scan for old realtime/RLS/fallback P1 language.
- [x] Final report states whether the P1 is closed, reduced, or blocked.

## Evidence Table

| Area | Local evidence | Result | Status |
|---|---|---|---|
| Realtime client subscription | `ChatWindow` subscribes to `postgres_changes` for `Message` filtered by `conversationId`, tracks presence on `SUBSCRIBED`, guards payload `conversationId`, and marks inbound messages read. Test `src/__tests__/components/ChatWindow.test.tsx:371-478` mocks the channel and asserts those behaviors. | `pnpm test -- src/__tests__/components/ChatWindow.test.tsx --runInBand` passed: 1 suite, 6 tests. | Locally verified with mock; provider delivery/auth not verified. |
| Fallback polling | `ChatWindow` polls `/api/messages?conversationId=...&poll=1` with `lastMessageId`, dedupes, aborts on unmount, and marks inbound messages read; `MessagesPageClient` does the same for inbox split-view polling. Tests cover both clients. | `ChatWindow` passed 6 tests; `MessagesPageClient` passed 6 tests. | Verified locally. |
| API/message isolation | `GET /api/messages` requires auth, verifies participant access before thread/polling reads, scopes unread count to participant conversations, returns private cache headers, and `POST action=markRead` verifies participant access before marking only inbound unread rows. | Combined messages API command passed after a stale max-length fixture repair: 4 suites, 49 tests. | Verified locally. |
| Supabase RLS/provider authorization | CH-E070 is historical pre-harness blocker evidence. CH-E076 local-only RLS proof SQL passed: audit showed RLS/policies for `Conversation`, `_ConversationParticipants`, `Message`, `ConversationDeletion`, and `TypingStatus`; only `Message` was in `supabase_realtime`; forbidden tables were absent. | Direct RLS verifier passed 28 assertions. | Local Option A verified; production/staging RLS policies are not claimed. |
| Provider-path verification | Commits `76db6d8a`, `8d53e4bd`, `5204d14f`, `4a1268ab`, `7a483ca1`, and `252e2c4e` record the preflight/config/status/audit/RLS/realtime proof path. | Local Supabase stack started and preflight passed with redacted local endpoints; schema apply passed against the local Supabase DB. | Local Option A verified. |
| Local Realtime authorization | Local Realtime verifier used 4 local Auth actors, 9 `Message` subscriptions, 2 allowed inserts, and 2 denied writes. | 4 delivery assertions, 15 non-delivery assertions, 34 total assertions passed. | Local Option A verified. |
| Rollback and cleanup | Rollback passed; post-rollback audit returned expected blocker state and cleanup checks passed. | Critic approved local RLS proof and local Realtime proof. | Verified locally. |
| BlockedUser realtime exposure | `useBlockStatus` fetches via server action and does not subscribe to `BlockedUser`; reporting/abuse hardening test asserts `BlockedUser` removal from `supabase_realtime` publication. | `pnpm test -- src/__tests__/hooks/useBlockStatus.test.ts src/__tests__/schema/reporting-abuse-hardening.test.ts --runInBand` passed: 2 suites, 9 tests. | Verified adjacent abuse-control evidence. |

## Progress Notes

- Historical read-only audit found the old bundled P1 wording in
  `verification.json`, `runtime-verification.md`,
  `11-test-traceability-matrix.md`,
  `12-gaps-unknowns-and-questions.md`, and
  `docs/features/documentation-inventory.md`; CH-E076 supersedes that active
  local Option A blocker.
- Initial broad API command failed in `src/__tests__/api/messages-pagination.test.ts` because a fixed `lastConfirmedAt: 2026-04-20T12:00:00.000Z` fixture had aged into the 21-day stale-listing contactability gate by 2026-05-11. A test-only freshness helper repaired that fixture; reruns passed.
- The warning for unrelated untracked local migration
  `prisma/migrations/20260515030000_fix_semantic_score_casts/` is a local
  workspace caveat, not staged evidence.
- No production code changed in this docs slice.
- No production or staging Supabase credentials are claimed by this evidence.
