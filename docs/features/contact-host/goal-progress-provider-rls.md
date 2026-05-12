# Contact Host Provider Realtime/RLS Goal Progress

Status date: 2026-05-12.

Outcome: `P1 BLOCKED`. The remaining provider-level Supabase realtime/RLS proof
cannot be closed from this repo state without approved provider/schema/policy
setup. This slice did not edit production code, migrations, schema, Supabase
policies, or auth/security behavior.

## Checklist

- [x] Create `docs/features/contact-host/goal-progress-provider-rls.md` with
  checklist and progress.
- [x] Audit current Contact Host docs and `documentation-inventory.md` for
  provider-level realtime/RLS wording.
- [x] Inspect Supabase/realtime implementation and configuration:
  `src/lib/supabase.ts`, `ChatWindow`, `MessagesPageClient`, message
  APIs/actions/helpers, Prisma migrations/schema, env/config/scripts, docker
  config, and tests mentioning Supabase/RLS/realtime.
- [x] Determine whether the repo has a safe local/test provider path to prove
  Supabase realtime auth/RLS without real credentials or production provider
  calls.
- [x] Do not invent live-provider verification.
- [x] Do not edit production/security/migration/schema/policy behavior.
- [x] Update docs with exact evidence and disposition.
- [x] Validate `verification.json` and `manifest.json` parse.
- [x] Run `git diff --check` for touched files.
- [x] Run stale wording scan for contradictory provider-level realtime/RLS
  status.

## Provider/RLS Evidence Table

| Area | Evidence | Result | Disposition |
|---|---|---|---|
| Supabase client/channel setup | `src/lib/supabase.ts` creates a client only when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist, and creates broadcast/presence channels named `chat:{conversationId}`. | Client-side realtime channel helper exists. | Not provider/RLS proof. |
| Thread realtime path | `src/app/messages/[id]/ChatWindow.tsx` imports Supabase helpers, subscribes to realtime, falls back to polling, and locally guards message payload `conversationId`. Existing CH-E062 mocked tests cover fallback and mocked insert handling. | Local client handling is already reduced/verified. | Does not prove Supabase JWT authorization or database RLS. |
| Inbox path | `src/components/MessagesPageClient.tsx` uses authenticated `/api/messages` polling; no provider realtime subscription was observed there. | Inbox delivery is API/polling based. | Provider realtime proof not applicable to this component. |
| Server API isolation | `/api/messages`, `src/lib/messages.ts`, and `sendConversationMessage` enforce session, participant access, unread/read scoping, and send authorization through Next/Prisma code. | Server-side application isolation exists and is locally tested in earlier evidence. | Separate from provider RLS. |
| Database RLS/policies | Focused search of `prisma/` returned `0` matches for `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `ALTER POLICY`, `DROP POLICY`, and `FORCE ROW LEVEL SECURITY`. | No committed local `Message`/conversation RLS policy evidence found. | Blocks provider-level RLS proof. |
| Supabase local provider harness | No `supabase/config.toml` exists and recursive search found no `supabase/` directory. `package.json` has no Supabase CLI/provider test script. `docker-compose.yml` starts only a Postgres service, not Supabase Realtime/auth. | No safe local Supabase provider path found. | Blocks provider-level delivery/JWT/RLS proof. |
| Realtime publication evidence | `prisma/migrations/20260514000000_reporting_abuse_controls_hardening/migration.sql` removes `BlockedUser` from `supabase_realtime` when present. | Adjacent hardening exists for BlockedUser exposure. | Does not prove `Message`/conversation provider authorization/RLS. |
| CI/env evidence | `.github` workflows use fake Supabase URL values; env examples expose variable names only. | Test env does not provide a real or local provider proof target. | Not provider proof. |

## Current Disposition

This P1 remains blocked, not closed. The blocker is precise:

- No local `Message`, `Conversation`, `_ConversationParticipants`, or
  participant-join RLS policies are committed.
- No local Supabase provider configuration or command exists to run Realtime
  with auth/RLS semantics.
- Existing deterministic tests use mocked Supabase client behavior or
  application-level `/api/messages` polling/API isolation.
- Proving provider behavior would require either approved schema/RLS/policy
  work or an approved staging/local Supabase provider harness with credentials
  and seeded users.

## Safe Next Step

Add an approved local Supabase verification harness or approved staging
verification plan that can seed two users and one nonparticipant, subscribe with
user-scoped JWTs, and prove authorized participants receive only their own
conversation events while nonparticipants receive none. Do not mark this P1
closed until provider-level delivery/JWT/RLS behavior is proven by that harness.
The docs-only approval plan is now captured in
`docs/features/contact-host/supabase-rls-proof-plan.md`; it is a plan artifact,
not provider proof.

## Validation

- `node -e "..."` parsing `docs/features/contact-host/verification.json` and
  `docs/features/contact-host/manifest.json`: passed.
- `git diff --check -- docs/features/contact-host/goal-progress-provider-rls.md
  docs/features/contact-host/goal-progress-realtime-rls.md
  docs/features/contact-host/runtime-verification.md
  docs/features/contact-host/08-auth-security-permissions.md
  docs/features/contact-host/11-test-traceability-matrix.md
  docs/features/contact-host/12-gaps-unknowns-and-questions.md
  docs/features/contact-host/evidence-register.md
  docs/features/contact-host/verification.json
  docs/features/contact-host/manifest.json
  docs/features/documentation-inventory.md`: passed.
