---
name: feature-documentation-harness
description: Evidence-first workflow for accurate feature documentation
---

# Evidence-First Feature Documentation Harness

Use this workflow for one complex feature at a time. It is designed to prevent
free-written documentation from drifting away from the code.

Core rule:

> No manifest plus no evidence register means no final documentation.

## Operating Constraints

- Do not modify production code unless the user explicitly asks for a fix.
- Do not write final prose documentation before the source manifest and evidence
  register exist.
- Treat facts as untrusted until backed by code lines, test results, browser
  observations, schema or migration evidence, or an explicit `UNKNOWN` /
  `NOT VERIFIED` marker.
- Separate current behavior, intended behavior, inferred behavior, and unknown
  behavior.
- Use Mermaid diagrams for technical diagrams.
- Use real subagents only when the user explicitly asks for delegation or
  subagents; keep them read-only and evidence-focused.
- If the work mutates repo-tracked files, follow the implementation triad
  workflow in `.agents/workflows/implementation-triad.md`.

## Safe Setup

Before documentation discovery:

1. Check `git status --short --branch`.
2. If the current worktree is dirty with unrelated production changes, prefer a
   separate docs worktree or ask before mixing documentation changes into it.
3. Use a docs branch such as `codex/docs-search-map-feature-doc` unless the user
   requests another name.
4. Do not run `git pull`, switch branches, or overwrite local changes when the
   worktree is dirty.
5. Keep documentation output under `docs/features/[feature-slug]/`.

## Feature Order

Recommended Roomshare documentation order:

1. `search-map` - Search / Map / Listing Discovery.
2. `contact-host` - Contact Host Flow.
3. `listing-management` - Listing Creation / Management.
4. `auth-profile-saved-listings` - Auth / Profile / Saved Listings.
5. `moderation-reporting-admin` - Moderation / Reporting / Admin.

## Phase 1: Boundary

Create `docs/features/[feature-slug]/00-feature-boundary.md`.

The boundary must include:

- feature name and slug
- included surfaces
- excluded surfaces
- documentation rules for the run
- status of the evidence pass
- open boundary questions

For `search-map`, include `/search`, SSR listing results, filters, search
params, sorting, pagination or cursor logic, map markers, Mapbox behavior, map
bounds, listing cards, save or favorite behavior connected to search cards,
contact-host entry points reachable from listing cards, relevant APIs, data
helpers, Prisma schema or migrations, and tests.

## Phase 2: Manifest

Create `manifest.json` before writing final docs.

Required shape:

```json
{
  "feature": "",
  "entryPoints": [],
  "routes": [],
  "serverComponents": [],
  "clientComponents": [],
  "apiRoutes": [],
  "dataAccessFunctions": [],
  "searchParamParsers": [],
  "databaseModels": [],
  "migrations": [],
  "tests": [],
  "externalServices": [],
  "environmentVariables": [],
  "unknowns": []
}
```

Populate the manifest by scanning the repo first with `rg`, file discovery, and
TypeScript symbol tools where available. Browse only primary sources when
external APIs, libraries, standards, security, or best-practice choices
materially affect the documentation.

## Phase 3: Source Map

Create `source-map.md` as a table:

```md
| Area | File | Symbols / components | Responsibility | Why included | Evidence | Confidence |
|---|---|---|---|---|---|---|
```

Each row must explain why the file belongs in the feature boundary.

## Phase 4: Evidence Register

Create `evidence-register.md` before any final documentation.

Required labels:

- `Verified`
- `Partially verified`
- `Inferred`
- `Not verified`
- `Contradicted`

Required table:

```md
| Claim ID | Claim | Evidence type | Source | Lines / command / observation | Confidence | Notes |
|---|---|---|---|---|---|---|
```

Record important behavior across user-visible behavior, API behavior,
state-management behavior, database/query behavior, auth and permission
behavior, error/loading/empty behavior, performance or rate-limit behavior, and
test coverage.

## Phase 5: Evidence-Only Subagents

Use only if the user explicitly asks for subagents or delegation.

Suggested read-only subagent scopes:

- UI interaction census.
- API and data flow.
- State model.
- Auth, security, and permissions.
- Test traceability.

Subagents return evidence tables only. They do not write final prose.

## Phase 6: Documentation Package

Only after manifest and evidence register exist, create:

```txt
docs/features/[feature-slug]/
  README.md
  00-feature-boundary.md
  01-source-map.md
  02-user-flows.md
  03-interaction-census.md
  04-runtime-sequences.md
  05-api-contracts.md
  06-data-model-and-invariants.md
  07-state-management.md
  08-auth-security-permissions.md
  09-errors-empty-loading-edge-cases.md
  10-performance-observability.md
  11-test-traceability-matrix.md
  12-gaps-unknowns-and-questions.md
  evidence-register.md
  manifest.json
  verification.json
  runtime-verification.md
  human-review-notes.md
  diagrams/
    context.mmd
    container.mmd
    component-[feature-slug].mmd
    sequence-primary-flow.mmd
    state-machine-[feature-slug].mmd
```

Every factual claim in these files must cite a claim ID, source file and line
range, command result, browser observation, schema/migration reference, or a gap
ID.

## Phase 7: Structured Verification

Create `claims-schema.json` for verification output:

```json
{
  "type": "object",
  "properties": {
    "claims": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "claimId": { "type": "string" },
          "claim": { "type": "string" },
          "citation": { "type": "string" },
          "verdict": {
            "type": "string",
            "enum": ["pass", "fail", "partial", "unsupported", "contradicted"]
          },
          "discrepancy": { "type": ["string", "null"] },
          "recommendedFix": { "type": ["string", "null"] }
        },
        "required": ["claimId", "claim", "citation", "verdict"]
      }
    },
    "coverageGaps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "manifestItem": { "type": "string" },
          "gap": { "type": "string" },
          "severity": { "type": "string", "enum": ["P0", "P1", "P2"] }
        },
        "required": ["manifestItem", "gap", "severity"]
      }
    }
  },
  "required": ["claims", "coverageGaps"]
}
```

Verification must check:

- every factual claim against cited evidence
- every manifest item for documentation coverage
- important behavior in code that is missing from docs
- documented behavior that appears intended but not implemented

Fix docs until there are no failed, contradicted, or high-severity unsupported
claims.

## Phase 8: Runtime Verification

For UI-heavy features, run browser or Playwright verification after code
evidence:

- document the behavior expected from docs
- observe runtime behavior
- mark match or mismatch
- record screenshots, traces, commands, or observations
- update docs from observed mismatches

For `search-map`, verify initial `/search` render, filter URL updates, sort and
pagination behavior, map movement, search-this-area behavior if implemented,
empty results, invalid URL params, anonymous save behavior, contact-host entry
points, and mobile map/list behavior.

## Phase 9: Round-Trip Review

In a fresh context, provide only the finished docs and ask for reconstruction of:

- main user flows
- public API contracts
- state machine
- URL/search param model
- key invariants
- error, empty, and loading states
- minimum test plan

If the reconstruction is missing or ambiguous, revise the docs.

## Phase 10: Final Gate

Final gate must return `PASS` only when:

- every factual claim has evidence or an explicit gap
- every manifest item appears in docs or gaps
- every user action has trigger, code path, state change, UI result, failure
  behavior, evidence, and test status
- API contracts match route handlers and schemas
- state model matches code
- diagrams match text
- test matrix separates existing tests from recommended tests
- no future or intended behavior is described as current behavior
- no booking-system assumptions remain unless marked historical or removed
- there are no P0 unsupported claims
- there are no contradicted claims
- there are no undocumented P0 manifest items
