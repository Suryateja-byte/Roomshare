# Phase 05: Privacy, Contact Flow, Phone Reveal & Host-Ghost

## Goal

Finish Phase 05 by hardening public-location privacy, making public autocomplete
projection-safe, delivering the primary contact-host admission path, adding a
dedicated phone-reveal audit path, and wiring host-ghost SLA detection to durable
restoration signals. Credit issuance and Stripe entitlement changes remain Phase 06
unless existing code already supplies a rollback-safe stub.

## Current Repo Baseline

- Phase 02/04 already added `exact_point`, `public_point`, `public_cell_id`, and
  `public_area_name` projection fields plus grouped search projection reads.
- Public autocomplete already has a projection-safe reader in
  `src/lib/geocoding/public-autocomplete.ts` behind `features.publicAutocompleteContract`.
- Contact UI and server action already exist through `ContactHostButton` and
  `startConversation`, including email verification, listing visibility gates,
  block checks, idempotency, and contact-consumption integration.
- Contact restoration models and jobs already exist for host ban, mass deactivation,
  and host-ghost SLA restoration, but Phase 05 acceptance requires verifying the
  signal semantics and preserving Phase 06 credit issuance boundaries.
- No phone-reveal route or dedicated reveal audit path was found in the local scan.

## Success Criteria

1. Approximate public listing/search payloads never expose `exact_point`, raw street
   address, unit number, or private host/contact fields unless the viewer is explicitly
   authorized for a private route.
2. Autocomplete reads only projection-safe public area/cell labels and sanitized tokens,
   rejects raw-address-like input, and records privacy violations without returning unsafe
   labels.
3. Contact-host admission is server-authoritative: authenticated, verified, rate-limited,
   idempotent, current unit epoch checked, owner-self-contact denied, moderation locks
   return sanitized `423 Locked`, and host blocking uses a neutral response.
4. Contact flow remains Phase 06-compatible: any existing consumption/paywall code is
   respected, but new Phase 05 work does not expand credit ledger or Stripe behavior.
5. Phone reveal uses a dedicated route/action with auth, rate limiting, kill switch,
   fail-closed dependency behavior, neutral blocked-host response, and audit logging.
6. Host-ghost detection enqueues or records a durable `RESTORED_HOST_GHOST_SLA` signal
   after the 48-hour SLA when no qualifying host read/reply activity exists.
7. Outbound message content scanning soft-flags obvious phone/email leakage for review
   without hard-blocking the send path.
8. Required Phase 05, Phase 04, Phase 03, Phase 02, Prisma, typecheck, and lint checks pass,
   with unrelated pre-existing broad-suite failures recorded separately.

## Ordered Slices

1. Privacy schema and fixtures: add or verify any missing additive schema support for
   public geometry/privacy mode/autocomplete projection, PGlite fixtures, privacy indexes,
   and rollback notes.
2. Public reads and autocomplete: enforce public geometry selection in listing/search/detail
   surfaces, keep autocomplete on public projection-safe fields, and add static leak guards
   for exact coordinates/raw address fields in public routes.
3. Contact-host contract: normalize the server-side contact admission contract around
   `unit_identity_epoch_observed`, idempotency, moderation precedence, host-blocking,
   host mass-deactivation checks, neutral errors, and Phase 06 paywall stubs.
4. Phone reveal: add the reveal route/action, `disable_phone_reveal` flag, rate-limit
   fail-closed behavior, audit event, and tests that prove contact-host still works when
   reveal is disabled.
5. Host-ghost and abuse controls: verify read-receipt semantics, host-ghost SLA signal
   generation, mass-deactivation detector behavior, outbound PII soft-flagging, and
   restoration telemetry.
6. Artifacts and approval: generator note, validation evidence, Critic verdict, `APPROVED`
   marker, and `.orchestrator/state.json` advancement to Phase 06 pending only after approval.

## Target Subsystems

- `prisma/schema.prisma` and additive migrations for any missing Phase 05 privacy/contact
  support, plus PGlite fixtures under `src/__tests__/utils/`.
- `src/lib/projections/*`, `src/lib/search/*`, `src/lib/listings/*`, and public listing/search
  routes for privacy-safe read contracts.
- `src/lib/geocoding/public-autocomplete.ts` and `src/app/api/geocoding/autocomplete/route.ts`
  for autocomplete privacy and telemetry.
- `src/app/actions/chat.ts`, `src/lib/messaging/*`, `src/lib/messages.ts`, and contact UI
  components for contact-host admission and outbound content soft-flagging.
- New or extended `src/app/api/contact/*` and `src/app/api/phone-reveal/*` surfaces if the
  implementation needs route-level contracts beyond existing server actions.
- `src/lib/flags/*`, `src/lib/env.ts`, `src/lib/rate-limit.ts`, `src/lib/audit/*`, and
  `src/lib/payments/contact-restoration.ts` for kill switches, limits, audit, and SLA signals.
- Focused tests under `src/__tests__/lib/privacy/`, `src/__tests__/api/contact/`,
  `src/__tests__/api/phone-reveal/`, `src/__tests__/lib/payments/`, and existing contact/search
  suites.
- `docs/runbooks/privacy-audit.md` for rollback, audit, and incident checks.

## Invariants

- AuthZ checks on every mutation and reveal path.
- Prevent enumeration: blocked, missing, unavailable, and not-allowed contact/reveal failures
  use neutral public responses unless the viewer is explicitly allowed to know the reason.
- Do not log PII, raw addresses, exact coordinates, phone numbers, message bodies, or block
  relationships.
- Rate-limit contact, reveal, read-receipt, and autocomplete paths; privacy-critical dependency
  outages fail closed.
- Keep public search/list/detail rollback-safe and compatible with Phase 04
  `FEATURE_PHASE04_PROJECTION_READS=false`.
- Preserve unrelated dirty worktree changes and avoid broad refactors.
- Do not introduce production dependencies.

## Acceptance Criteria By Slice

1. Schema/fixtures: additive migration or explicit no-op proof exists; rollback notes are
   documented; `pnpm exec prisma validate` passes.
2. Public reads/autocomplete: tests prove exact/private fields are absent from public payloads,
   raw-address-like autocomplete input returns no unsafe suggestions, and public autocomplete
   uses only public area/cell data.
3. Contact-host: tests cover happy path, idempotent double-submit, stale/changed unit epoch,
   owner self-contact, moderation `423 Locked`, blocked host neutral response, and no duplicate
   consumption/conversation creation.
4. Phone reveal: tests cover auth, rate limit outage fail-closed, disabled flag, audit logging,
   neutral blocked response, and no public phone exposure.
5. Host-ghost/abuse: fake-clock tests prove `RESTORED_HOST_GHOST_SLA` signaling after 48 hours
   with no qualifying host read/reply, non-qualifying conversations are skipped, mass
   deactivation remains covered, and outbound phone/email content is soft-flagged only.
6. Artifacts: implementation artifact, review verdict JSON, `APPROVED` marker, and state
   advancement are written only after focused checks pass and Critic approves.

## Validation Commands

- Phase 05 targeted Jest set:
  - `pnpm test -- --runTestsByPath <phase 05 privacy/contact/reveal/restoration tests> --runInBand`
- Regression sets:
  - `pnpm test -- --runTestsByPath <Phase 04 targeted set> --runInBand`
  - `pnpm test -- --runTestsByPath <Phase 03 targeted set> --runInBand`
  - `pnpm test -- --runTestsByPath <Phase 02 focused set> --runInBand`
  - `pnpm test -- --runTestsByPath <existing messaging/contact/payments focused set> --runInBand`
- Required checks:
  - `pnpm exec prisma validate`
  - `pnpm typecheck`
  - `pnpm lint`
- Optional: broad `pnpm test --runInBand`; record unrelated existing heap/OOM or legacy search
  failures as deferred if they recur.

## Rollback Notes

- Schema changes must be expand-only and nullable/defaulted where possible.
- Rollback for Phase 05 migrations must be limited to dropping newly added indexes/tables/columns
  after dependent code paths are disabled.
- `disable_phone_reveal` must immediately fail reveal requests closed without affecting
  contact-host.
- Existing contact/paywall flags remain the rollback for monetized contact behavior.
- Phase 04 public read rollback remains `FEATURE_PHASE04_PROJECTION_READS=false`.

## Approval Gate

Phase 05 includes schema/migration work plus auth, privacy, messaging, audit, and contact-flow
behavior. Per the implementation-triad rules, implementation must not begin until the user
explicitly approves this plan.

## Research Summary

No external browsing was required. The plan is based on the repo-local Phase 05 definition in
`.orchestrator/phases.md`, master-plan v10 contact/privacy sections, existing Phase 02-04
projection code, current contact-host implementation, public autocomplete, block checks, message
read-receipt handling, and contact-restoration jobs.
