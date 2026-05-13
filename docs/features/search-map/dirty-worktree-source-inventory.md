# Dirty Worktree Source Inventory

Date: 2026-05-13.

Purpose: reduce the old broad G009 source-of-truth warning by separating
committed/verified evidence from local-only dirty worktree discovery. This file
does not claim the worktree is clean.

## Commands

```bash
git status --short
grep -RIn "dirty\|Dirty\|untracked\|Untracked\|source of truth\|G009" docs/features/search-map docs/features/documentation-inventory.md
```

## Inventory Result

The dirty worktree is broad and not limited to Search Map. It includes unrelated
Create Listing, Listing Management, review, UI, geocoding, and E2E files.

Search Map-adjacent local-only or dirty files remain in these families:

| Family | Examples | Documentation treatment |
|---|---|---|
| Search/geocoding source and tests | `SearchForm`, `LocationSearchInput`, geocoding helpers, search-doc query helpers, search scenarios | Local discovery inputs only unless a specific command/evidence ID cites a passing result. |
| Search UI components | `DesktopHeaderSearch`, `FilterModal`, `InlineFilterStrip`, `MobileSearchOverlay`, `SplitStayCard`, `HeaderFilterDrawer` | Existing docs may mention discovered components; uncommitted/untracked entries are not standalone pass evidence. |
| Search E2E/page objects/utilities | focused `tests/e2e/search/*` files, page objects, seed/reset/cursor helpers | Passing status must cite the exact command and evidence ID; unrun files remain broader coverage gaps. |
| Committed desktop parity slice | `SearchListResultsContext`, desktop parity spec, related map/list wiring | No longer local-only for this package: committed as `7e80c899` and recorded as C056. |

## Reduced Risk

G009 is reduced from a P1 source-of-truth blocker to a P2 branch-hygiene warning
because current Search Map pass claims now cite one of these explicit evidence
sources instead of relying on a vague dirty tree:

- post-merge `origin/main` / PR #119 evidence for the public-payload fix;
- focused command rows in `runtime-verification.md`;
- C056 for the committed desktop list/map parity slice;
- this C057 inventory for the remaining dirty/local-only caveat.

## Remaining Risk

The worktree still contains many dirty and untracked files. A future docs or
release claim should not rely on those files unless it adds a new evidence row
with exact file paths, commands, and results. Reviewers should still preserve or
stage intended search-related files before treating the whole local branch as
stable.
