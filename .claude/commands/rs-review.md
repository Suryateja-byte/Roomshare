---
description: Deep PR-quality review for Roomshare changes
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(pnpm:*)
---

## Context

- Status: !`git status -sb`
- Diff: !`git diff HEAD`

## Task

Run:

- pr-review-toolkit:type-design-analyzer
- pr-review-toolkit:silent-failure-hunter
- pr-review-toolkit:code-simplifier

Output:

- risks
- must-fix
- nice-to-have
- tests missing
