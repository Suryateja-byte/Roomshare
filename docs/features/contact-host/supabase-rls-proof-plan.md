# Supabase Realtime/RLS Proof Plan

Status date: 2026-05-12.

Status: `PLAN ONLY / P1 BLOCKED`.

This document is an approval-ready proof path for Contact Host messaging
delivery and isolation at the Supabase provider/RLS layer. It does not prove the
provider path. It does not close the current P1. It does not edit production
code, tests, schema, migrations, provider configuration, or secrets.

Current evidence remains CH-E062 and CH-E070: fallback polling, API
read/unread isolation, and mocked client-side realtime insert handling are
locally verified, but provider-level Supabase realtime delivery, JWT
authorization, publication behavior, and database RLS are blocked because this
repo state has no committed `Message`/conversation RLS policies, no
`supabase/config.toml`, no local Supabase directory, no Supabase provider test
script, and no Supabase Realtime/Auth docker service.

## Decision Needed

Approve one safe verification path before any provider proof work starts.

| Option | Path | Use when | Approval required |
|---|---|---|---|
| A | Local Supabase/provider harness with disposable project/database | Preferred. The team needs repeatable proof without live customer data or production provider access. | Security owner and test/platform owner approve local provider setup, disposable credentials, seed data, RLS/policy expectations, and cleanup rules. Any schema/RLS/policy change needs separate explicit approval before implementation. |
| B | Isolated staging/provider verification runbook | Fallback. Local provider fidelity is insufficient for Supabase Realtime/Auth/JWT behavior. | Security owner, product owner, and test/platform owner approve staging project, disposable test accounts, access scope, evidence capture, and teardown. |

Reject Option C, which would waive provider proof and accept only local mock/API
coverage, unless the security owner explicitly records a release risk
acceptance. That would keep the P1 open or convert it into an accepted security
risk; it would not be a proof.

## Scope

In scope:

- Contact Host `Conversation`, `_ConversationParticipants`, `Message`, and
  read/isolation behavior that affects realtime delivery.
- Supabase JWT/session identity used by participants and nonparticipants.
- Realtime authorization for inserts/updates that could expose message content,
  sender identity, conversation membership, read state, typing/presence, or
  publication metadata.
- Evidence that the application fallback/API isolation remains intact when
  realtime is disabled or denied.

Out of scope for this proof:

- Real production data or production Supabase projects.
- Real payment provider flows.
- Real email provider delivery.
- Search/map or listing-management behavior except where needed to seed a
  contactable listing.
- Broad browser visual coverage. Browser checks may be added later as
  confidence coverage after provider isolation is proven.

## Safety And PII Constraints

- Use only disposable synthetic users, listings, conversations, messages, and
  email addresses under test-controlled domains.
- Do not use production secrets, production service-role keys, production anon
  keys, production refresh tokens, or customer data.
- Do not paste JWTs, refresh tokens, service-role keys, provider URLs with
  secrets, email addresses, phone numbers, or message bodies into docs or logs.
- Redact evidence with stable labels such as `tenant_a`, `tenant_b`,
  `host_a`, `conversation_allowed`, and `conversation_denied`.
- Store provider logs only if they are redacted and tied to a disposable run id.
- Teardown must delete seeded users, conversations, messages, listings,
  realtime channels, and any temporary project/database resources.
- If a required assertion needs service-role access, isolate that access to
  setup/teardown. Assertions that represent user behavior must run with
  user-scoped JWTs, not service-role privileges.

## Option A: Local Provider Harness

### Prerequisites

- Approved local Supabase provider target that includes Auth, Postgres, and
  Realtime with JWT/RLS semantics close enough to production.
- A disposable database/project namespace that can be created and destroyed
  without touching developer or production data.
- A documented way to apply the current Prisma schema plus any separately
  approved Supabase RLS/policy/publication setup.
- Seed fixtures for:
  - `host_a`
  - `tenant_a`
  - `tenant_b`
  - `nonparticipant`
  - one contactable listing owned by `host_a`
  - one allowed conversation between `host_a` and `tenant_a`
  - one denied conversation between `host_a` and `tenant_b`
- User-scoped Supabase sessions/JWTs for every seeded actor.
- Test runner command that can run without live production credentials.

### Phase A1: Provider Baseline

Goal: prove the harness starts the intended local provider, not the app's mocked
client behavior.

Evidence to collect:

- Provider startup command and version output.
- Redacted local provider URL and run id.
- Confirmation that Auth, Postgres, and Realtime are reachable.
- Confirmation that setup uses disposable credentials only.
- Confirmation that production/staging environment variables are absent or
  blocked.

Decision point:

- If Auth, Realtime, or JWT/RLS semantics are missing, stop Option A and choose
  Option B or create a separately approved provider-harness implementation
  slice.

### Phase A2: Schema, RLS, And Publication Audit

Goal: establish whether provider-level isolation can be tested from the current
schema/policy state.

Evidence to collect:

- Applied migration list or schema setup command.
- Query output showing RLS enabled or not enabled for each relevant table.
- Policy definitions for `Conversation`, `_ConversationParticipants`,
  `Message`, `TypingStatus`, and any join tables used in realtime filters.
- Realtime publication membership for message-related tables.
- Negative evidence if policies are absent.

Required assertions:

- `Message` content must not be readable by a nonparticipant using a user JWT.
- Conversation metadata must not disclose another user's private thread to a
  nonparticipant.
- Realtime publication must not include adjacent sensitive tables unless
  explicitly approved and separately tested.

Decision point:

- If RLS policies are absent or insufficient, stop. Do not patch policies inside
  this proof run. Open a separate security/schema plan for approved RLS policy
  implementation.

### Phase A3: Seed And Identity Isolation

Goal: create deterministic synthetic data without PII.

Evidence to collect:

- Seed command and redacted seed manifest.
- Actor map using stable labels, not raw emails or IDs.
- Conversation map showing which actors are participants.
- Cleanup manifest listing every inserted resource.

Required assertions:

- `tenant_a` and `host_a` are participants in `conversation_allowed`.
- `tenant_b` and `nonparticipant` are not participants in
  `conversation_allowed`.
- `tenant_a` is not a participant in `conversation_denied`.
- All seeded listings/conversations/messages are tagged by run id for teardown.

Decision point:

- If seed creation requires production-like data, stop and revise the harness.

### Phase A4: Direct RLS Assertions

Goal: prove database read/write isolation before realtime is tested.

Evidence to collect:

- User-JWT query results for allowed participant reads.
- User-JWT query results for denied nonparticipant reads.
- User-JWT insert/update attempts for participant and nonparticipant paths.
- Exact SQL or SDK operations, with IDs redacted to stable labels.

Required assertions:

- Participant can read only their own conversation and messages.
- Participant cannot read unrelated conversations/messages.
- Nonparticipant cannot read any message body or private conversation metadata.
- Nonparticipant cannot insert, update, mark read, or spoof sender/participant
  state.
- Blocked/suspended actor assertions are included only if the approved RLS
  policy scope covers those states; otherwise they remain a documented gap.

Decision point:

- If direct RLS fails, stop before realtime. Record the failed assertion and
  required policy change as a separate approval item.

### Phase A5: Realtime Authorization Assertions

Goal: prove provider delivery and non-delivery with user-scoped JWTs.

Evidence to collect:

- Realtime subscribe commands or test logs for each actor/channel.
- Redacted event log showing delivered event labels and suppressed event labels.
- Insert/update command that triggered each event.
- Timeout threshold used for expected non-delivery.
- Provider log excerpt or SDK status showing subscription authorization result.

Required assertions:

- `host_a` receives only events for conversations where `host_a` is a
  participant.
- `tenant_a` receives inserts/updates for `conversation_allowed`.
- `tenant_a` receives no events for `conversation_denied`.
- `tenant_b` receives no events for `conversation_allowed`.
- `nonparticipant` receives no events for any seeded conversation.
- Payloads do not include fields outside the approved client contract.
- A denied or unavailable realtime path falls back to authenticated
  `/api/messages` polling without exposing unauthorized data.

Decision point:

- If denied users receive any message content, participant IDs, private
  metadata, or read/typing state from unauthorized conversations, classify as a
  P0/P1 security failure and do not close the P1.

### Phase A6: Cleanup And Repeatability

Goal: prove the run is disposable and repeatable.

Evidence to collect:

- Teardown command output.
- Query output showing no seeded messages, conversations, listings, users, or
  run-tagged resources remain.
- Provider project/database destruction confirmation if a disposable project was
  created.
- Rerun result on a clean harness.

Required assertions:

- Cleanup succeeds even if a verification assertion fails.
- No synthetic PII or tokens are left in docs, logs, screenshots, or committed
  files.
- A second run produces the same pass/fail classification.

## Option B: Staging Provider Runbook

Use this only if Option A cannot faithfully exercise Supabase Realtime/Auth/JWT
behavior.

### Prerequisites

- Approved isolated staging Supabase project or database branch.
- Explicit confirmation that no production data is present.
- Disposable test accounts and listings owned by the verification team.
- Staging-only anon/service credentials available to the runner through an
  approved secret manager, never committed to the repo.
- Approved maintenance window or low-risk run window if staging is shared.
- Cleanup owner assigned before the run starts.

### Required Runbook Steps

1. Record staging project identifier in redacted form and run id.
2. Confirm no production data or production credentials are in scope.
3. Apply or verify the currently approved schema/RLS/publication state.
4. Seed disposable users, listing, conversations, participant links, and
   messages.
5. Generate user-scoped sessions/JWTs for `host_a`, `tenant_a`, `tenant_b`, and
   `nonparticipant`.
6. Run the direct RLS assertion matrix from Option A4.
7. Run the realtime authorization matrix from Option A5.
8. Capture redacted logs and command output.
9. Tear down seeded records and revoke/delete disposable users.
10. Verify cleanup with direct database/provider checks.

### Staging-Specific Evidence

- Approval record for staging access and run window.
- Redacted project/run id.
- Seed manifest and cleanup manifest.
- Provider logs or screenshots with secrets and PII removed.
- Command transcript with secret values redacted.
- Post-run cleanup query output.
- Any environment drift from local/dev documented as a caveat.

Decision point:

- If staging proof passes but local proof remains unavailable, close only the
  scoped staging-provider assertion and keep repeatability caveats visible in
  `runtime-verification.md`, `verification.json`, and the evidence register.

## Required Validation Commands

Exact command names may change after the approved harness exists, but the proof
must include commands equivalent to:

```bash
# Static docs/config hygiene before provider work
node -e "JSON.parse(require('fs').readFileSync('docs/features/contact-host/verification.json','utf8')); JSON.parse(require('fs').readFileSync('docs/features/contact-host/manifest.json','utf8'));"
git diff --check -- docs/features/contact-host docs/features/documentation-inventory.md

# Option A placeholders to replace with approved harness commands
pnpm supabase:rls-proof:setup
pnpm supabase:rls-proof:seed
pnpm supabase:rls-proof:assert-rls
pnpm supabase:rls-proof:assert-realtime
pnpm supabase:rls-proof:cleanup

# Stale status scan after evidence is recorded
grep -RIn "provider-level Supabase realtime/RLS.*verified\|P1.*closed" docs/features/contact-host docs/features/documentation-inventory.md
```

The placeholder `pnpm supabase:rls-proof:*` commands are not present in the
current repo and must not be described as available until implemented and
approved.

## Acceptance Criteria

The current P1 can be proposed for closure only when all of these are true:

- Approved Option A or Option B path exists.
- Provider proof runs with user-scoped JWTs for at least two participants and
  one nonparticipant.
- Direct RLS assertions pass for allowed and denied reads/writes.
- Realtime assertions pass for allowed delivery and denied non-delivery.
- Evidence includes provider version, run id, redacted actor map, commands,
  pass/fail output, cleanup proof, and caveats.
- No production credentials, secrets, or customer PII are used or recorded.
- Any required schema/RLS/publication change was separately approved,
  implemented, tested, and documented.
- `goal-progress-provider-rls.md`, `goal-progress-realtime-rls.md`,
  `runtime-verification.md`, `11-test-traceability-matrix.md`,
  `12-gaps-unknowns-and-questions.md`, `evidence-register.md`,
  `verification.json`, `manifest.json`, and `documentation-inventory.md` are
  updated from blocked to the exact proven status.

Until then, status remains `P1 BLOCKED`.

## Rollback And Cleanup

Docs-only plan rollback:

- Revert this document and its references from status docs if the plan is
  superseded.
- Do not alter code, tests, schema, migrations, provider config, or secrets as
  part of docs rollback.

Future provider-proof cleanup:

- Revoke user sessions/JWTs used during verification.
- Delete disposable users, listings, conversations, messages, participant
  links, notifications, typing/read state, and any run-tagged rows.
- Destroy disposable local/staging provider resources when applicable.
- Remove local secret files created for the run.
- Record cleanup command output and final zero-row checks.

## Documentation Updates After Approval

After an approved proof run, update the Contact Host package with evidence, not
claims:

- Add a new evidence-register row with command output and provider run id.
- Update `verification.json` with pass/partial/fail verdicts for the exact
  provider assertions.
- Update `runtime-verification.md` and `11-test-traceability-matrix.md` to
  distinguish direct RLS, realtime delivery, and fallback/API proof.
- Update `12-gaps-unknowns-and-questions.md` only if the P1 is actually closed
  or narrowed.
- Update `docs/features/documentation-inventory.md` with the new status.

Do not mark provider-level Supabase realtime/RLS as verified until the approved
provider proof evidence exists.
