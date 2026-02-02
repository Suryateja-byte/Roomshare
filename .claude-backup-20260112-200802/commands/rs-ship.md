---
description: Implement a Roomshare feature end-to-end (db + backend + tests + review)
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(pnpm:*), Bash(npm:*), Bash(node:*), Bash(git add:*), Bash(git commit:*)
---

## Context

- Status: !`git status -sb`
- Diff: !`git diff HEAD`

## Task

Feature: $ARGUMENTS

1. Use feature-dev:code-architect to restate plan + acceptance criteria.
2. If schema needed: use database-design:database-architect then database-design:sql-pro for migration.
3. Use backend-development:backend-architect to implement server-side rules.
4. Use backend-development:tdd-orchestrator to add tests + make them pass.
5. Use pr-review-toolkit:silent-failure-hunter then pr-review-toolkit:code-reviewer.
6. Run: pnpm lint, pnpm typecheck, pnpm test (fix failures).
7. Summarize final changes + any rollback notes.
