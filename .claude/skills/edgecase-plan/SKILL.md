---
name: edgecase-plan
description: Produce a risk-ranked edge-case plan before implementing features. Use for feature planning, production hardening, API design, state-machine design, incident prevention, sad path analysis, failure mode enumeration, robustness planning, or when user mentions edge cases, error handling, failure scenarios, risk matrix, safety nets, defensive programming, unhappy paths, or production readiness review.
---

# Edge Case Planning Skill

Create an **Edge Case Register + Safety Nets Plan** for the specified feature or scope.

**Mode**: Planning only. Do NOT modify files. Use Read/Grep/Glob to gather context.

## Inputs to Gather

Ask if missing:
1. **Feature statement** - what changes, who uses it, success criteria
2. **Surfaces** - UI routes, API endpoints, jobs, DB tables, external deps
3. **Constraints** - latency, scale, cost, SLOs
4. **Risk tolerance** - P0 vs acceptable degradation
5. **Rollout** - flagged? staged? backwards compatibility?

If code paths provided, scan relevant files for context.

## Core Strategy

Handle "infinite" edge cases through:
- **Categorize** failures into repeatable classes (see `references/taxonomy.md`)
- **Prioritize** using Probability × Impact scoring
- **Add safety nets** for low-prob/high-impact unknowns (generic controls, not bespoke)

## Risk Scoring

**Score** = Probability (1-5) × Impact (1-5)

| Priority | Criteria | Action |
|----------|----------|--------|
| **P0** | (Prob ≥4 & Impact ≥4) OR data loss/security/money | Must fix now |
| **P1** | Score 9-15, user-visible correctness | Should fix |
| **P2** | Score 4-8 OR low-prob/high-impact | Safety net |
| **P3** | Score ≤3, low impact | Accept risk |

## Output Format

Follow this structure exactly:

### 1) Feature Summary
- What changes / Users / Success criteria / Non-goals

### 2) Invariants & Trust Boundaries
- Invariants (must always be true)
- Trust boundaries (user→server, server→DB, server→3rd party)
- Data classification (PII? payments? auth?)

### 3) Happy Path
5-10 step narrative of ideal flow.

### 4) Edge Case Register

Use template from `templates/edge-case-register.md`:

| ID | Category | Scenario | Prob | Impact | Score | Priority | Mitigation | Tests | Observability |
|----|----------|----------|------|--------|-------|----------|------------|-------|---------------|

**Rules:**
- Prefer category-level rules over one-off conditions
- Every P0/P1 needs: mitigation + test + observable signal
- Reference `references/taxonomy.md` for comprehensive coverage

### 5) Safety Nets Checklist

Select applicable controls:
- [ ] Input validation + normalization (server-side)
- [ ] Idempotency (retries/double-click/duplicate webhooks)
- [ ] Timeouts + retries + backoff (external calls)
- [ ] Circuit breaker / fallback behavior
- [ ] Concurrency control (locks/uniqueness/transactions)
- [ ] Consistent error mapping (no leaks, stable codes)
- [ ] Rate limits + abuse controls
- [ ] Feature flags + kill switch + safe defaults
- [ ] Rollback / compensating actions
- [ ] Monitoring: logs, metrics, traces, alerts

### 6) Test Plan

Use template from `templates/test-matrix.md`:
- Unit / Integration / E2E / Load / Chaos (as needed)

### 7) Release & Monitoring Plan
- Rollout strategy
- Backwards compatibility concerns
- Alerts + dashboards
- Rollback steps

### 8) Open Questions
List unknowns blocking confident planning.

## Stop Condition

Stop after delivering the plan. Only implement if user explicitly requests.

## References

- **Failure taxonomy**: `references/taxonomy.md` - comprehensive edge case categories
- **Safety nets guide**: `references/safety-nets.md` - detailed implementation patterns
- **Templates**: `templates/` - copy-ready output formats
