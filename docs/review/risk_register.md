# Risk Register

Use this file for hypotheses, unknowns, accepted risks, scanner exceptions, and
release decisions that are not confirmed findings.

Confirmed code-backed issues belong in `docs/review/review_ledger.md`.

## Risk Status Values

- `Hypothesis`: plausible risk, not yet confirmed by evidence.
- `Investigating`: currently being checked.
- `Accepted`: explicitly accepted for this release with rationale.
- `Mitigated`: mitigation exists and evidence is recorded.
- `PromotedToFinding`: confirmed and moved to the review ledger.
- `Rejected`: disproven or no longer applicable.

## Risk Table

| Risk ID | Status | Severity if confirmed | Area | Description | Evidence needed | Owner | Decision / notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Unknowns To Resolve

| Unknown | Why it matters | How to resolve | Blocking? | Status |
| --- | --- | --- | --- | --- |
| Intended audit baseline branch | Dirty worktree can mix unrelated work into review findings | User approved auditing the current dirty working tree as the release candidate | Yes | Resolved: branch `codex/search-ux-fixes`, HEAD `b3e3b0f4`, 100 changed/untracked entries captured `2026-05-06T23:45:04Z` |
| Repo-local Codex config | `.codex` is a tracked empty file, not a directory, so `.codex/config.toml` cannot be added without replacing it | Decide whether to convert `.codex` into a directory or use global config | No | Open |

## Accepted Risk Template

```md
### RISK-000 - Short title

- Status: Accepted
- Severity if confirmed:
- Area:
- Rationale:
- Evidence:
- Mitigation:
- Rollback:
- Owner:
- Expiration or follow-up date:
```
