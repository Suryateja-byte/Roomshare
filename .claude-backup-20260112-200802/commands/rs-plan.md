---
description: Roomshare plan (spec + file targets + risks)
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(ls:*), Bash(find:*), Bash(rg:*)
---

## Context

- Branch: !`git branch --show-current`
- Status: !`git status -sb`
- Recent commits: !`git log --oneline -8`

## Task

Use feature-dev:code-explorer to find all relevant files for: $ARGUMENTS.
Then use feature-dev:code-architect to produce:

1. spec + acceptance criteria
2. list of files to touch
3. DB changes (if any) + migration outline
4. test plan
   Also ask context-management:context-manager for a 10-line project snapshot after planning.
