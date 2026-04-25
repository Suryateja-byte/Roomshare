# CFM Planning — Open Questions

Running log of questions, decisions deferred, or clarifications needed during planning/execution.
Append new entries at the top.

---

## CFM-502-F1 - 2026-04-17

- [x] Helper choice: `hashIdForLog` vs `logSafeId`? — **Decided: `hashIdForLog`**. CFM-003/101/104 already use it; dev-fallback is a stable 16-hex SHA256 slice (logSafeId's `"dev-" + slice(0,8)` is not uniform length). No user decision needed.
- [x] Commit-message correction path? — **Decided: follow-up commit's own message**. `git notes` is invisible to `git log` default + review tools. Force-push is blocked on this branch.
- [ ] If prod log pipeline already applies Sentry UUID scrubbers, is B1 still a blocker? — Proceeding with fix regardless per `cfm-observability.md:167` "structured logger redaction is last line of defense; migration MUST NOT rely on it as primary protection".
- [ ] `DEFAULT_BACKFILL_RUN_ID = "cfm-backfill-untracked"` become a required parameter? — **Deferred** to future cleanup (audit nit N-4).
- [ ] Convert-path CAS vs FOR UPDATE model? — **Decided: keep FOR UPDATE** (pessimistic lock is equivalent and cheaper). Documented inline + in runbook.

---

## CFM-502 - 2026-04-17

- [ ] Should `--reset-optional-fields` mode exist to null out `availableUntil` / reset `minStayMonths=1` for auto-converted rows? — **Default: NO** (preserve valid host data; classifier already gates against invalid values). Blocks implementation branch choice.
- [ ] Should blocked-cohort `needsMigrationReview=true` stamp also write a search-doc dirty mark? — **Default: NO** (no observable field changes from a reader's POV; search-doc projection does not depend on this flag). Confirm with CFM-601 owner before implementation.
- [ ] Exit-code policy when `> X%` of rows are `deferred` after retries? — **Default: exit 0 with warning**; next scheduled run picks up. Alternative: exit 1 to force operator inspection. Operator preference needed.
- [ ] Runbook on-call owner? — **Default: backend reliability on-call**. Confirm with team lead.
- [ ] `Listing.version` schema field — confirm present and `Int @default(0)` before first implementation PR. Applier already references it; blocker if absent.
- [ ] `logger.sync.info` call signature — confirm accepts structured `{ event, ... }` object vs. `(message, meta)` form. Check `src/lib/logger.ts`.
- [ ] `features.contactFirstListings` flag state during backfill — prompt says "NOT assumed on yet"; confirm via CFM-406 status.
- [ ] Jest integration lane presence (`JEST_INTEGRATION=1` or equivalent) — drop integration test vs. fall back to expanded unit coverage.
