# Suspended / Blocked Listing-Detail Proof Progress

Goal: close, reduce, or precisely block the Contact Host suspended/blocked
listing-detail browser proof P1 gap with exact Chromium evidence.

## Checklist

- [x] Create or update this progress file with the checklist and progress notes.
- [x] Audit the current Contact Host docs and inventory for the exact suspended/blocked P1 wording.
- [x] Inspect listing-detail Contact Host UI, viewer-state route, startConversation, block logic, suspension logic, auth fixtures, E2E fixtures, and existing listing-detail/contact-host tests.
- [x] Determine whether suspended viewer, suspended host, blocked viewer-host relationship, and blocked host-viewer relationship can be exercised in Chromium without production code changes.
- [x] If existing fixtures/helpers can support it, add or run focused Playwright coverage for the feasible suspended/blocked states.
- [x] If a state cannot be exercised, document the exact blocker: missing fixture, missing disabled-reason contract, product behavior ambiguity, or test setup limitation.
- [x] Do not edit production behavior unless a real product bug is proven and explicitly approved.
- [x] Update Contact Host docs: evidence-register.md, runtime-verification.md, verification.json, 11-test-traceability-matrix.md, 12-gaps-unknowns-and-questions.md, 08-auth-security-permissions.md, README.md if status changes, manifest.json if tests are added, and docs/features/documentation-inventory.md.
- [x] Run focused listing-detail/contact-host Chromium tests.
- [x] Run the full relevant listing-detail Contact Host Chromium spec if practical.
- [x] Run JSON parse validation for docs/features/contact-host/verification.json and manifest.json.
- [x] Run git diff --check for touched files.
- [x] Run a stale wording scan for old suspended/blocked P1 language.
- [x] Final report states whether the P1 is closed, reduced, or blocked.

## Progress Notes

2026-05-11 scan:

- Current P1 wording appears in `README.md`, `runtime-verification.md`,
  `verification.json`, `11-test-traceability-matrix.md`,
  `12-gaps-unknowns-and-questions.md`, and
  `docs/features/documentation-inventory.md`. The wording says the scoped
  listing-detail state matrix has Chromium proof for paywall-required,
  unavailable, migration-review, and moderation-locked states, while
  suspended/blocked listing-detail browser proof was unresolved before this
  CH-E061 pass.
- `src/lib/listings/public-contact-contract.ts` currently allows
  `contactDisabledReason` values only for login, email verification, owner view,
  listing unavailable, migration review, moderation locked, and paywall required.
  There is no suspended-viewer, suspended-host, blocked-by-viewer, or
  blocked-by-host disabled-reason contract.
- `src/app/api/listings/[id]/viewer-state/route.ts` builds the viewer contract
  from listing availability, owner, auth, email verification, and paywall
  summary. It does not select host suspension, viewer suspension, or block
  relationship state for pre-click listing-detail contact disabling.
- `src/app/actions/chat.ts`, `src/app/actions/suspension.ts`, and
  `src/app/actions/block.ts` enforce suspended viewer, suspended host, and both
  block directions at contact-start time. Existing Jest coverage records those
  branches, but that is not listing-detail Chromium pre-click state proof.
- `tests/e2e/auth.setup.ts` creates `user.json`, `user2.json`, and
  `reviewer.json`; no suspended auth state is created. `scripts/seed-e2e.js`
  seeds one settings-only block from the main user to admin and explicitly avoids
  poisoning messaging fixtures. It does not seed a block relationship between a
  listing-detail viewer and the reviewer listing host.
- `tests/e2e/listing-detail/contact-host-runtime.spec.ts` supports route-mocked
  viewer-state/status proof for paywall-required, unavailable, migration-review,
  and moderation-locked states. Because the public contract rejects
  suspended/blocked disabled reasons, those states cannot be represented in the
  same browser-state matrix without product/test-contract design.

Feasibility classification:

| State | Chromium pre-click state exercisable with current fixtures/contracts? | Blocker |
|---|---|---|
| Suspended viewer | No | Missing suspended auth fixture plus missing viewer-state disabled-reason contract. Existing server action can block after click, but listing-detail cannot receive a suspended-viewer disabled contract. |
| Suspended host | No | Missing suspended-host listing fixture plus missing viewer-state disabled-reason contract. Existing server action checks listing owner suspension after click. |
| Viewer blocks host | No | Missing listing-detail viewer-host block fixture plus missing viewer-state disabled-reason contract. Seeded block is user-to-admin for settings only, not user-to-reviewer listing host. |
| Host blocks viewer | No | Missing listing-detail host-viewer block fixture plus missing viewer-state disabled-reason contract. Existing block logic can fail contact start, but listing detail has no pre-click contract. |

Historical CH-E061 status: blocked for suspended/blocked listing-detail browser
state proof because the disabled-reason contract and fixtures did not yet exist.
Current status: superseded by CH-E073. The scoped suspended/blocked
listing-detail Chromium proof is closed for the focused suspended/blocked states
and the full listing-detail Contact Host Chromium spec.

2026-05-11 verification:

- Windows-side UNC execution failed before tests because `pnpm exec playwright`
  could not resolve the WSL `node_modules` Playwright CLI path. This is a local
  command-path issue, not Contact Host product evidence.
- WSL focused state-matrix command passed:
  `wsl -e bash -lc 'cd /home/surya/roomshare && pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=chromium --reporter=list --workers=1 -g "state matrix"'`.
  `test-results/.last-run.json` reported `status: passed`,
  `failedTests: []`.
- WSL full focused listing-detail Contact Host Chromium spec passed:
  `wsl -e bash -lc 'cd /home/surya/roomshare && pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=chromium --reporter=list --workers=1'`.
  `test-results/.last-run.json` reported `status: passed`,
  `failedTests: []`.
- No new tests were added, so `manifest.json` was validated but not changed.
- Contact Host docs now cite CH-E061 for the suspended/blocked blocker
  classification.
- JSON parse validation passed for `verification.json` and `manifest.json`.
- Scoped `git diff --check` passed for touched documentation files.
- Historical stale-wording scan for old suspended/blocked P1 language returned
  no matches after replacing the last progress-note occurrence. Later CH-E073
  updates supersede this note and close the focused/full listing-detail Chromium
  proof.
