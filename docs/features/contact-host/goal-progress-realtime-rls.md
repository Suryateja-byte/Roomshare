# Contact Host Realtime/RLS/Fallback Goal Progress

Status date: 2026-05-11.

Outcome: `P1 REDUCED / PROVIDER BLOCKED`. Fallback polling, API access isolation, read/unread isolation, and mocked client-side realtime subscription handling are locally verified. CH-E070 confirms provider-level Supabase realtime authorization/RLS remains blocked because this repo does not contain local `Message`/conversation RLS policies, local Supabase config, a Supabase provider test script, or a Supabase Realtime/Auth docker service.

Next proof-path plan: `supabase-rls-proof-plan.md` documents the approval-ready
Option A local provider harness and Option B staging fallback. It is docs-only
and does not close the provider-level P1.

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
| Supabase RLS/provider authorization | `git grep` found no `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` policy for `Message`, `Conversation`, or `_ConversationParticipants`; only `BlockedUser` publication hardening exists. `ChatWindow` source comments that `Message` has no RLS and relies on client guard for cross-conversation bleed. | No safe local provider path or live credentials were used. | Blocked; not closed. |
| Provider-path re-audit | CH-E070 found zero Prisma RLS/policy statements, no `supabase/config.toml`, no local Supabase directory, no Supabase CLI/provider test script, and `docker-compose.yml` with only Postgres. | Docs-only audit; no live credentials, provider calls, production code, schema, migration, policy, or auth/security behavior changed. | Blocked; requires approved local/staging provider harness or approved schema/RLS policy work. |
| BlockedUser realtime exposure | `useBlockStatus` fetches via server action and does not subscribe to `BlockedUser`; reporting/abuse hardening test asserts `BlockedUser` removal from `supabase_realtime` publication. | `pnpm test -- src/__tests__/hooks/useBlockStatus.test.ts src/__tests__/schema/reporting-abuse-hardening.test.ts --runInBand` passed: 2 suites, 9 tests. | Verified adjacent abuse-control evidence. |

## Progress Notes

- Read-only audit found the old bundled P1 wording in `verification.json`, `runtime-verification.md`, `11-test-traceability-matrix.md`, `12-gaps-unknowns-and-questions.md`, and `docs/features/documentation-inventory.md`.
- Initial broad API command failed in `src/__tests__/api/messages-pagination.test.ts` because a fixed `lastConfirmedAt: 2026-04-20T12:00:00.000Z` fixture had aged into the 21-day stale-listing contactability gate by 2026-05-11. A test-only freshness helper repaired that fixture; reruns passed.
- No production code changed.
- No live Supabase credentials were required.
