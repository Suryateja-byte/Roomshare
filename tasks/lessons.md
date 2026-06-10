- Date: 2026-04-17
- Mistake / failure mode: Codex-CFM-903 exported a non-async `Set<string>` (`BOOKING_EMAIL_TEMPLATE_KEYS`) from `src/lib/email.ts`, a `"use server"` file. `pnpm typecheck` PASSED, `pnpm test` PASSED, but `pnpm build` FAILED with "A 'use server' file can only export async functions, found object."
- Detection signal: `pnpm build` at the coordinator stage caught it; Codex's self-verification only ran typecheck + test + lint, not build.
- Root cause: Next.js enforces the `"use server"` export contract at build-time through its own plugin, not through `tsc --noEmit`. Unit tests can import non-async exports from a `"use server"` file without the error firing.
- Prevention rule: **Any CFM Codex task that modifies a `"use server"` file MUST run `pnpm build` as part of its verification checklist**, not just typecheck + test. The project CLAUDE.md and critic charters should include `pnpm build` when the diff touches a `"use server"` file. Alternative: keep data constants (Sets, maps, arrays) in separate non-`"use server"` helper modules so they can be shared with tests safely.
- Follow-up: Fixed in commit `4faa94bd` by moving the constant to `src/lib/email-booking-gate.ts`.

- Date: 2026-04-17
- Mistake / failure mode: the stale 2026-04-16 CFM-1002 plan proposed a single-shot cleanup sweep without re-verifying at current `HEAD` that telemetry was unavailable from branch-only inspection, that internal `viewer-state` readers still existed, or that `availableSlots` was a canonical Prisma/search column rather than an alias.
- Detection signal: `planner-cfm1002` caller-grep sweep plus runtime telemetry audit at `HEAD b6b4e0b8`.
- Root cause: planning from a pre-dependency snapshot instead of re-grepping the live branch before proposing deletions.
- Prevention rule: cleanup tickets must re-grep callers at merge `HEAD` and confirm telemetry is actually observable from the branch or dashboard before proposing bulk deletion.

- Date: 2026-06-10
- Mistake / failure mode: after a rebase-merge of PR #142, ran `git reset --hard origin/main` on local `main` assuming it held only the PR's commits — but two map-theme commits (47f1d880, 38130f0a) had been added from a parallel session during the CI wait, and the reset moved `main` past them.
- Detection signal: a pre-reset `git diff origin/main main --stat` printed 13 files / +7967 lines where an empty diff was expected; `git reflog` identified the orphaned commits.
- Root cause: assumed exclusive ownership of the local working copy across a ~40-minute CI wait; ran a destructive ref move without first checking `git log origin/main..main` for unexpected local-only commits.
- Prevention rule: before any `git reset --hard` / branch -f on a shared local clone, list local-only commits (`git log --oneline @{u}..`) and abort if any commit is not one you authored this session. Recovery: cherry-pick from reflog, verify with `git diff <old-tip> HEAD` for byte-identical trees.
