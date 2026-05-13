# Contact Host Provider Realtime/RLS Goal Progress

Status date: 2026-05-13.

Outcome: `LOCAL OPTION A VERIFIED / P1 CLOSED LOCALLY`. The local Supabase
provider/RLS proof now passes for Contact Host messaging isolation. This is
local provider evidence only; it does not claim production or staging RLS
policies exist. Promoting the local proof policies into production Prisma
migrations or RLS policy rollout requires separate approval.

## Checklist

- [x] Create `docs/features/contact-host/goal-progress-provider-rls.md` with
  checklist and progress.
- [x] Audit current Contact Host docs and `documentation-inventory.md` for
  provider-level realtime/RLS wording.
- [x] Inspect Supabase/realtime implementation and configuration:
  `src/lib/supabase.ts`, `ChatWindow`, `MessagesPageClient`, message
  APIs/actions/helpers, Prisma migrations/schema, env/config/scripts, docker
  config, and tests mentioning Supabase/RLS/realtime.
- [x] Determine and execute the safe local/test provider path to prove Supabase
  realtime auth/RLS without real credentials or production provider calls.
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
| Database RLS/policies | Historical CH-E070 focused search of `prisma/` returned `0` matches for policy statements. CH-E076 local-only audit then showed RLS/policies for `Conversation`, `_ConversationParticipants`, `Message`, `ConversationDeletion`, and `TypingStatus` in the local Supabase proof DB. | Local proof policies verified in the disposable/local context. | Production Prisma migration/RLS rollout is not claimed and requires separate approval. |
| Supabase local provider harness | Commits `76db6d8a`, `8d53e4bd`, `5204d14f`, `4a1268ab`, `7a483ca1`, and `252e2c4e` add and verify the local-only harness/proof path. Local Supabase stack started and preflight passed with redacted local endpoints. | Safe local Supabase provider path executed. | Local Option A proof is verified. |
| Realtime publication evidence | Historical adjacent hardening removes `BlockedUser` from `supabase_realtime` when present. CH-E076 local-only audit showed only `Message` in `supabase_realtime` and forbidden tables absent. | Local publication scope verified for Option A. | Production/staging publication state is not claimed. |
| CI/env evidence | `.github` workflows use fake Supabase URL values; env examples expose variable names only. CH-E076 used local redacted endpoints and local Auth actors. | CI/env examples remain non-provider evidence; local proof used disposable local provider state. | Do not infer production/staging state from CI/env examples. |

## Current Disposition

This local Option A P1 is closed. The closure is precise:

- Local Supabase stack preflight passed with redacted local endpoints.
- Schema apply passed against the local Supabase DB.
- Local-only RLS proof SQL passed: audit showed RLS/policies for
  `Conversation`, `_ConversationParticipants`, `Message`,
  `ConversationDeletion`, and `TypingStatus`.
- Only `Message` was in `supabase_realtime`; forbidden tables were absent.
- Direct RLS verifier passed 28 assertions.
- Local Realtime verifier passed with 4 local Auth actors, 9 `Message`
  subscriptions, 2 allowed inserts, 2 denied writes, 4 delivery assertions,
  15 non-delivery assertions, and 34 total assertions.
- Rollback passed; post-rollback audit returned the expected blocker state and
  cleanup checks passed.
- Critic approved both local RLS proof and local Realtime proof.

The warning for the unrelated untracked local migration
`prisma/migrations/20260515030000_fix_semantic_score_casts/` is a workspace
caveat, not staged evidence for this proof.

## Safe Next Step

Keep production/staging proof optional unless a release gate requires it. Do not
claim production/staging RLS policies exist. If the local proof policies are to
be promoted, require a separate approved schema/RLS migration and rollout plan.
`docs/features/contact-host/supabase-rls-proof-plan.md` now records both the
historical plan and the local Option A evidence caveats.

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
