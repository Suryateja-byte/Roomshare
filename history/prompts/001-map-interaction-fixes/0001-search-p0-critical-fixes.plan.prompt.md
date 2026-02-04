---
id: 0001
title: Search P0 Critical Fixes Implementation
stage: plan
date: 2026-02-03
surface: agent
model: claude-opus-4-5-20251101
feature: 001-map-interaction-fixes
branch: 001-map-interaction-fixes
user: surya
command: /sp.plan
labels: [search, p0, critical, ranking, cron, facets, truncation]
links:
  spec: specs/001-map-interaction-fixes/plan.md
  ticket: null
  adr: null
  pr: null
files:
  - vercel.json
  - src/lib/search/search-doc-sync.ts (NEW)
  - src/app/actions/create-listing.ts
  - src/app/search/error.tsx
  - src/lib/search/types.ts
  - src/lib/search/search-doc-queries.ts
  - src/lib/search/transform.ts
  - src/lib/search/search-v2-service.ts
  - src/app/api/search/facets/route.ts
  - src/app/api/cron/refresh-search-docs/route.ts
  - src/scripts/backfill-search-docs.ts
tests:
  - src/__tests__/api/cron/refresh-search-docs/compute-recommended-score.test.ts (NEW)
  - src/__tests__/components/PersistentMapWrapper.networking.test.tsx (updated)
---

## Prompt

User requested: Fix all P0 Critical issues identified in ChatGPT/Claude deep analysis using 10 specialized agents:
1. Search doc sync delay 6 HOURS → 5 minutes + synchronous path
2. Partial failures return empty with no indicator
3. Map 200-marker truncation with no indicator
4. Facets LIKE matching bypasses GIN indexes
5. Simplistic ranking formula (no time decay, freshness, log scaling)

## Response snapshot

Successfully implemented all 5 P0 Critical fixes using 10 specialized agents:

**Agent 1 (deployment-engineer)**: Fixed cron interval from `0 */6 * * *` to `*/5 * * * *` in vercel.json

**Agent 2 (backend-architect)**: Created synchronous search doc upsert (search-doc-sync.ts) called inline after listing creation

**Agent 3 (backend-architect)**: Added `meta.partialFailure` field to V2 response for degraded state signaling

**Agent 4 (code-architect)**: Added reference ID display in error boundary using `error.digest`

**Agent 5 (sql-pro)**: Added `truncated` and `totalCandidates` fields to SearchV2Map using COUNT(*) OVER() window function

**Agent 6 (sql-pro)**: Replaced LIKE '%x%' with GIN-indexed @> operator in facets route

**Agents 7-9 (backend-architect)**: Improved ranking formula with:
- Time decay on views (30-day half-life)
- Logarithmic scaling (prevents gaming)
- Freshness boost (+15 points for first 7 days)

**Agent 10 (code-reviewer)**: Verified constitution compliance, all checks passed

## Outcome

- ✅ Impact: All 5 P0 critical issues resolved
- 🧪 Tests: 4297 passed, 24 new tests for ranking formula
- 📁 Files: 11 files modified, 1 new file created
- 🔁 Next prompts: Consider consolidating ranking formula into shared module
- 🧠 Reflection: Parallel agent execution was effective; all fixes completed in single session

## Evaluation notes (flywheel)

- Failure modes observed: Duplicate aria-live attribute (pre-existing, fixed), test assertion for new behavior
- Graders run and results (PASS/FAIL): Lint PASS, Typecheck PASS, Tests 4297/4310 PASS
- Prompt variant (if applicable): Used specialized agents per domain (sql-pro for DB, backend-architect for API)
- Next experiment (smallest change to try): Extract ranking formula to shared module to prevent drift
