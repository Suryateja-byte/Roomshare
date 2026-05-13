# Search / Map / Listing Discovery Feature Boundary

Feature: Search / Map / Listing Discovery

Slug: `search-map`

Status: scope boundary for the evidence-backed documentation package. Runtime
browser behavior was attempted after local Postgres became available, and the
narrow desktop-anonymous `/search` smoke, filter/URL, sort/load-more
pagination, desktop map, results-state, URL-state, anonymous saved-listing
redirect, mobile map/list, and search error-resilience specs now pass.
Authenticated saved-listing persistence, map error/a11y, and focused API/unit
Jest checks also pass. The full search release gate passes. The original real
feature-payload PII scan failed, but the P0 public payload fix now passes a
real captured payload scan for the main search/list/map public API responses.
PR #119 is merged to `main` at `89ad33ea58391452b03a2ff5c3a219503769edaa`,
and all final PR checks pass. V1-only map API mock cases and non-gate broader
E2E coverage remain outside verified evidence until they are run.

## Included

- `/search` page
- SSR listing results
- search params parsing
- filters
- sorting
- pagination, cursor, or page logic
- map markers
- Mapbox interactions
- bounds updates
- listing cards
- save or favorite behavior if connected to search cards
- contact-host entry point if reachable from listing cards
- relevant API routes
- relevant Prisma queries and schema references
- relevant migrations
- relevant tests

## Excluded

- full listing creation flow
- full auth system internals
- full messaging system
- admin and moderation
- payment or booking behavior unless current code still references it and the
  documentation labels that reference accurately

## Documentation Rules For This Run

- Do not write final documentation before `manifest.json` and
  `evidence-register.md` are complete.
- Every factual claim must cite code lines, test output, browser observation,
  schema or migration evidence, or be marked `UNKNOWN` / `NOT VERIFIED`.
- Separate current behavior, intended behavior, inferred behavior, and unknown
  behavior.
- Do not modify production code unless explicitly asked.
- If evidence is missing, record it as a gap instead of guessing.

## Boundary Questions

| Question | Why it matters | Status |
|---|---|---|
| Does current search documentation target committed `main`, the current dirty worktree, or a dedicated docs worktree snapshot? | Runtime and code evidence can differ while `codex/search-ux-fixes` has uncommitted search changes. | Partially resolved by C057: pass claims cite committed/runtime evidence, while remaining dirty or untracked entries are local-only discovery caveats. |
| Is contact-host behavior reachable from search cards in the current UI? | It determines whether contact-host entry points belong in this feature doc or only in a separate contact-host doc. | Not verified |
| Are booking references historical, removed, or still active in search/listing discovery code? | The doc must not describe removed booking behavior as current behavior. | Not verified |
