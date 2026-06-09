# Roomshare — Codex Project Rules

This `AGENTS.md` file is the canonical source of truth for project-specific
operating rules, guidelines, and conventions.

Reusable task playbooks may live under [`.agents/workflows`](.agents/workflows).
Those workflow files extend this document, but they do not replace it.

These repo instructions guide Codex behavior inside this workspace. They do not
override higher-priority platform, system, developer, or tool constraints.

## Implementation Triad Workflow

For this repo, `implementation` means any task that mutates repo-tracked files
or otherwise applies repo-tracked changes.

Implementation work uses a phase-gated workflow coordinated by
`Workflow Orchestrator` and these exact role names:

- `Workflow Orchestrator`
- `Planning agent`
- `Generating agent`
- `Critic`

### Required Workflow

- `Workflow Orchestrator` controls the sequence and approves plans for
  normal-risk tasks.
- Require user approval before leaving `Plan` for high-risk changes: schema or
  migration changes, new production dependencies, external API contract changes,
  auth/security-sensitive behavior changes, or destructive operations.
- `Planning agent` runs first. It must scan the local repo first and browse
  primary sources only when external APIs, libraries, standards, security, or
  best-practice choices materially affect the plan.
- `Planning agent` must produce an approved planning artifact before any edits
  begin.
- `Generating agent` is the only role allowed to edit repo-tracked files.
- `Critic` is review-only and may review only after a concrete slice artifact
  exists.
- Do not advance to the next slice until the current slice has explicit
  `Critic` approval.
- Escalate to `Replan` if a slice fails review twice, critique feedback
  conflicts across rounds, or the requested fix would change plan assumptions.
- `Workflow Orchestrator` is the managing agent. It coordinates the workflow,
  approves normal-risk plans, and must not act as `Planning agent`,
  `Generating agent`, or `Critic`.
- For every implementation task, `Workflow Orchestrator` must spawn separate
  sub-agent instances for `Planning agent`, `Generating agent`, and `Critic`.
  These required sub-agents must be spawned sequentially, one after another, and
  must not be replaced by in-thread role switching.
- `Critic` is review-only, must be separate from `Generating agent`, and may
  review only after a concrete slice artifact exists.
- Optional helper subagents may be used only for read-only research, tests, log
  analysis, security review, or other specialist review. Never run parallel
  writers.
- If the current platform or tool constraints prevent spawning separate
  required sub-agents, stop before implementation and report the workflow
  blocker rather than falling back to in-thread role switching.
- Follow the detailed procedure in
  [`.agents/workflows/implementation-triad.md`](.agents/workflows/implementation-triad.md)
  and the reusable skill in
  [`.agents/skills/implementation-triad/SKILL.md`](.agents/skills/implementation-triad/SKILL.md).

## Feature Documentation Harness

Use the evidence-first feature documentation harness when documenting a complex
feature.

1. Do not write final documentation first.
2. First create or update:
   - `manifest.json`
   - `source-map.md`
   - `evidence-register.md`
   - `interaction-census.md`
3. Every factual claim must cite evidence:
   - file path and line range
   - test command and result
   - browser observation
   - schema or migration reference
   - or `UNKNOWN` / `NOT VERIFIED`
4. Separate current behavior, intended behavior, inferred behavior, and unknown
   behavior.
5. Do not modify production code unless explicitly asked.
6. Documentation output goes under `docs/features/[feature-slug]/`.
7. If evidence is missing, mark it as a gap instead of guessing.
8. Final documentation must pass an adversarial verification pass.

Follow the detailed playbook in
[`.agents/workflows/feature-documentation-harness.md`](.agents/workflows/feature-documentation-harness.md).

## Code Navigation

### Tool Selection: LSP vs Grep/Glob

**Use LSP for semantic operations (understanding code):**

- `goToDefinition` — find where a symbol is declared (NEVER use grep for this)
- `findReferences` — find all usages of a function/variable/type (not grep)
- `hover` — check type signatures, return types, and doc comments
- `getDiagnostics` — after EVERY file edit to catch type errors immediately
- `documentSymbol` — list all symbols in a file (functions, classes, types)

**Use Grep/Glob for text operations (finding things):**

- String literals, error messages, config values, comments
- File discovery by name pattern (`**/*.spec.ts`, `src/**/utils.*`)
- Regex pattern matching across files (`TODO:`, `console\.log`)
- Non-code files (JSON, YAML, Markdown, Dockerfile, .env.example)
- Broad exploration when you don't yet know which files are relevant
- Cross-language searching (SQL migrations, Docker configs, CI files)

### Mandatory Workflow

1. **Grep/Glob** to find candidate files and narrow the search space
2. **LSP goToDefinition** to jump to the exact symbol declaration
3. **LSP findReferences** to understand blast radius before making changes
4. **LSP hover** to verify types and signatures
5. **After editing → LSP getDiagnostics** for immediate error feedback

### Hard Rules

- **NEVER grep to find a function/class/type definition** — use `goToDefinition`
- **NEVER grep find-and-replace for symbol renaming** — use LSP rename
- **ALWAYS check LSP diagnostics after editing a file** — catches type errors immediately
- **NEVER read an entire file just to understand one symbol** — use `hover` or `goToDefinition`
- **DO use grep for string literals and comments** — LSP does not index these
- **DO use glob for file discovery** — LSP has no file search equivalent

### Why This Matters

- LSP returns the ONE correct definition; grep returns every text match (imports, comments, string literals, test mocks)
- LSP understands scope; grep conflates a local `config` with a module-level `config`
- LSP catches type errors in ~50ms; `tsc --noEmit` takes 30-60s
- LSP queries consume ~75% fewer tokens than grep-based analysis
- Grep is strictly better for non-code content (configs, docs, string literals)

### Fallback

- If LSP server is not running or still initializing → fall back to grep
- If LSP returns no results (dynamic code, untyped JS) → supplement with grep
- For files LSP doesn't cover (JSON, YAML, Markdown, config) → always use grep

## Roomshare E2E Testing Rules

When implementing search/map user-flow tests:

- Use Playwright Test with TypeScript.
- Test user-visible behavior first: roles, labels, text, URLs, visible warnings,
  focused listing, modal states, and bottom-sheet states.
- Prefer `getByRole`, `getByLabel`, `getByText`, and `getByTestId` only where
  semantic locators are not stable enough.
- Do not use long CSS/XPath chains.
- Each test must be isolated and able to run independently.
- Use fixtures for seeded users, listings, search data, auth state, and cleanup.
- Use `storageState` for logged-in user tests.
- Mock external APIs when needed: geocoding, map tile/style failures,
  map/search API failures, rate-limit responses, checkout/paywall routes.
- Never hit real payment APIs in E2E.
- Avoid fixed sleeps. Use Playwright auto-waiting and web-first assertions.
- For every implemented flow, assert:
  - no page crash
  - no unhandled console error or page error
  - expected visible UI state
  - canonical URL state
  - correct result behavior
  - correct auth/paywall redirect behavior when applicable
- Run the narrow test first, then the related spec file, then the full search
  suite.
- Return a final verification report with commands run, passing/failing tests,
  files changed, and known gaps.

## Roomshare Create Listing E2E Testing Rules

When implementing host `/listings/create` user-flow tests:

- Use Playwright Test with TypeScript.
- Keep create-listing form tests under `tests/e2e/create-listing`.
- Keep duplicate-listing/collision tests under `tests/e2e/dedupe`.
- Reuse and extend `tests/e2e/page-objects/create-listing.page.ts` before
  adding one-off selectors in specs.
- Test user-visible behavior first: warnings, field errors, focused invalid
  fields, disabled submit states, upload cards, dialogs, toasts, redirects, and
  preserved form values.
- Prefer `getByRole`, `getByLabel`, `getByText`, and existing `data-testid`
  values only where semantic locators are not stable enough.
- Separate anonymous, authenticated host, incomplete-profile, suspended,
  unverified, mocked-failure, and dedupe/collision flows.
- Use `storageState` for authenticated host flows; use an empty storage state
  for anonymous redirect tests.
- Mock external or flaky dependencies when the UI behavior is the target:
  image upload/storage, geocoding, rate-limit responses, CSRF failures, network
  failures, and search-sync delay/failure states.
- Do not hit real third-party storage, payment, or geocoding providers in CI.
- Avoid fixed sleeps. Use Playwright auto-waiting, request/response waits, and
  web-first assertions.
- For upload tests, use fixture images or in-memory `FilePayload` data. Do not
  commit large binary files just to prove the 5MB limit.
- Any test that creates a real listing must clean it up through an existing test
  helper or deterministic cleanup path.
- For successful publish flows, assert:
  - no page crash
  - no unhandled console error or page error
  - success toast appears
  - draft storage is cleared
  - navigation guard is disabled
  - redirect lands on `/listings/{id}`
  - duplicate submits do not create duplicate records when applicable
- For failure flows, assert:
  - form data is preserved
  - the user sees a usable error
  - server field errors map to the right fields
  - focus moves to the first invalid field where the UI owns focus behavior
- Run the narrow test first, then the related create-listing or dedupe spec
  file, then the relevant suite/project in CI.
- Return a final verification report with commands run, passing/failing tests,
  files changed, known gaps, and any product bugs found.

## Production Readiness Review Rules

Use the release-readiness harness under `docs/review` for whole-project audits.
The harness is evidence-gated: a finding is valid only when it is tied to exact
code evidence and a concrete failure mode.

### Audit Phase Rules

- Treat this repository as a production system, not a demo.
- Do not edit code during audit phases unless the user explicitly asks for a
  fix.
- Before suggesting a finding, cite exact files, functions, routes, actions, or
  migrations.
- Explain the failure mode, impact, and a reproduction path or test idea.
- Assign severity `P0`, `P1`, `P2`, or `P3`, plus confidence
  `High`, `Medium`, or `Low`.
- Mark speculative items as `HYPOTHESIS`; do not record them as confirmed
  issues until code, test, runtime, or scanner evidence supports them.
- Check `docs/review/review_ledger.md` before recording an issue and mark
  duplicates explicitly.
- Challenge every `P0` or `P1` finding for plausible false positives before it
  becomes release-blocking.

### Severity Model

- `P0`: exploitable security issue, data corruption, auth bypass, production
  cannot build or deploy.
- `P1`: serious regression, broken critical flow, missing validation on a public
  surface, high-risk race condition, or critical privacy leak.
- `P2`: important reliability, UX, performance, observability, or test gap that
  is not release-blocking for MVP.
- `P3`: cleanup, refactor, maintainability, or non-critical polish.

`P0` and `P1` issues are release blockers. `P2` and `P3` issues are not release
blockers unless several combine into a material production risk.

### High-Risk Areas

Treat these as `P0` or `P1` unless proven otherwise:

- Authentication bypass.
- Authorization or RBAC bypass.
- PII leakage.
- Secret exposure.
- SQL, command, template, XSS, CSRF, or SSRF injection.
- Unsafe file upload.
- Broken payment, booking, contact, messaging, listing, or availability
  invariant.
- Data corruption or unsafe migration.
- Race condition in critical writes.
- Missing server-side validation on a public API route or server action.
- Logging sensitive data.
- Production build, deploy, or migration failure.
- Missing regression test for a critical bug fix.

### Fix Verification

Before any issue is marked fixed in `docs/review/review_ledger.md`:

- Add or update a regression test when practical.
- Run the smallest relevant test first.
- Run the relevant release gates from
  `docs/review/production_readiness_matrix.md`.
- Record commands run, pass/fail results, files changed, remaining risk, and
  verification gaps in the ledger.
- Run an adversarial re-review against fixed `P0` and `P1` findings before
  declaring a release candidate.
