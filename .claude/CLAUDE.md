# Roomshare — CLAUDE.md (Project Operating Rules)

## Mission (what “good” looks like)

Roomshare is a production web app where **trust + safety + reliability** matter as much as UX.
When making changes, prioritize (in order):

1. **Correctness & abuse-resistance** (no broken holds/bookings, no bypassable rules)
2. **User experience** (fast, predictable, accessible, mobile-safe)
3. **Cost efficiency** (avoid expensive calls; cache; minimize re-renders; avoid needless infra)
4. **Maintainability** (simple code, small diffs, strong tests)

**Conflict rule / precedence:** If guidance conflicts, follow this order:
**Non-negotiables → Reliability & Security → Architecture boundaries → Testing rules → Cost & performance → UI/UX → Code style**

---

## Non-negotiables (always enforce)

- **No raw PII in logs** (email/phone/IDs/address). Redact or hash.
- **All booking/hold/inventory state transitions validated server-side** (never trust client).
- **Any state machine / lifecycle logic must have tests** for edge cases + abuse.
- **DB changes require**: migration + rollback note + data-safety note (backfill, locks, downtime risk).
- **Never commit secrets**. Treat `.env*`, keys, service creds as off-limits.

---

## Agent operating rules (apply to every non-trivial task)

### Plan mode default

Use plan mode for any task that is:

- 3+ steps, multi-file, architectural, production-impacting, or touches auth/PII/state/DB.
  Include verification steps _inside the plan_.

If new information invalidates the plan: **stop, update the plan, then continue**.

### Stop-the-line rule (recovery)

If anything unexpected happens (test failures, build errors, behavior regressions, flaky E2E):

1. **Stop adding features**
2. **Preserve evidence** (error output + minimal repro steps)
3. **Diagnose + re-plan**
4. **Fix root cause** (not symptoms)
5. **Add regression coverage** (smallest test that would have caught it)
6. **Re-verify end-to-end** for the original report

### Subagents (keep main context clean)

Use subagents to parallelize and avoid bloating main context:

- repo exploration / pattern discovery
- test/CI failure triage
- dependency research (only if needed)
- security/risk review

Each subagent must have:

- **one focused objective**
- **a concrete deliverable** (files + key functions + recommended change points)

### Incremental delivery (reduce risk)

Prefer thin vertical slices:
implement → test → verify → expand.
Keep diffs small; avoid adjacent refactors unless they reduce risk.

### Self-improvement loop

After any user correction or discovered mistake:

- add an entry to `tasks/lessons.md` with:
  - failure mode
  - detection signal
  - prevention rule
- review `tasks/lessons.md` at session start for relevant pitfalls

### Bugfix loop (default)

For bug reports:
reproduce → localize → isolate root cause → fix → add regression coverage → verify.

Ask the user only if truly blocked; ask **one targeted question** and provide a recommended default.
If you can proceed safely with a default, do so and document the assumption.

---

## Task management (file-based, auditable)

For any non-trivial task:

- Write plan checklist to `tasks/todo.md` with:
  - acceptance criteria
  - files/modules touched
  - risks
  - verification steps
- Mark items complete as you go
- Add a short “Results + Verification story” at the end
- Update `tasks/lessons.md` after mistakes/corrections

---

## Operating workflow (do this every task)

### 0) Understand first (no changes)

- Read the relevant files and architecture before editing.
- If requirements are unclear, ask targeted questions early (don’t guess).

### 1) Plan the change

Provide a short plan:

- scope (files/modules touched)
- risk areas (auth/PII/state transitions/payments/DB)
- test plan (what will you run to prove it works)

### 2) Implement in small, reviewable steps

- Keep diffs small and local.
- Prefer minimal dependencies and minimal surface area changes.

### 3) Verify (must be explicit)

Before finishing, run the tightest proof possible:

- lint + typecheck
- unit tests (and any impacted test suite)
- e2e tests for the affected flow (Playwright if relevant)

If something can’t be run locally, explain what was verified and what remains.

---

## Commands (use pnpm; verify scripts in package.json)

- Install: `pnpm i`
- Dev: `pnpm dev`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`

### E2E (if configured)

- Prefer the repo’s script (check `package.json`): e.g. `pnpm test:e2e` or `pnpm playwright test`
- When debugging flake: run one spec, one browser, headed mode if needed.

---

## Architecture boundaries (don’t blur layers)

- **UI must not call the DB**.
- **Business rules live in the server/service layer**, not inside components.
- **Schema, constraints, RLS live in db/migrations layer** (and are enforced server-side).
- External services (Maps/Places/Payments/Email/SMS) must be wrapped behind a small adapter module.

### Data flow rules

- Client components: UI state, rendering, user interactions only.
- Server layer: validation, authorization, business invariants, idempotency, transactional writes.
- DB layer: constraints that prevent impossible states; indexes; RLS/policies (if used).

---

## Reliability rules (holds, bookings, inventory)

Any “hold/reserve/apply/book” logic must satisfy:

- **Idempotency** (retries do not double-write)
- **Race safety** (two users competing cannot create impossible states)
- **Time-bounded holds** (auto-expire; server is source of truth)
- **Authorization** on every transition
- **Auditability** (structured events without PII; include IDs, not raw user data)

If a change touches these flows, add/extend tests covering:

- double-click / repeated requests
- two concurrent users
- expired hold
- unauthorized transition attempt
- rollback behavior when downstream fails

---

## Security & privacy checklist (apply by default)

- Validate and sanitize all inputs server-side (never trust query params).
- Avoid leaking sensitive info through error messages.
- Do not log request bodies that can contain PII.
- Prefer allowlists over denylists for filters/sort options.
- Rate-limit/abuse-protect endpoints that can be spammed (apply/apply-like actions, search if expensive).

Secrets:

- Never read or print `.env` contents.
- Never add analytics/telemetry SDKs without explicit need (cost + privacy).

---

## Cost & performance rules (Roomshare priorities)

- **Cache aggressively** for expensive lookups (places, geocoding, listings counts).
- Debounce user-driven queries (filters/search typing/map move) and **cancel stale requests** (AbortController).
- Avoid unnecessary client-side fetching if SSR/route handlers already provide data.
- Prefer **thin client wrappers** + server rendering where possible (better perf + cheaper).
- On map/search pages:
  - batch updates when appropriate
  - avoid “fetch on every pixel pan”
  - keep payloads small (select only needed fields)

---

## UI/UX quality rules

- Mobile-first, responsive, and keyboard accessible.
- No layout shifts in critical flows (loading skeletons / reserved space).
- Always handle empty/error/loading states.
- A11y basics: labels, focus management, aria where needed, contrast, tab order.
- Map "Search as I move" defaults ON per session (no cross-session localStorage persistence).
- Area count requests on map move: 600ms debounce, AbortController cancel, 30s client cache, max 1 in-flight request.

### Search pagination invariants

- **Cursor reset**: `SearchResultsClient` is keyed by `searchParamsString` — any filter/sort/query change remounts the component and resets cursor + accumulated listings.
- **No duplicate listings**: `seenIdsRef` (Set of listing IDs) deduplicates across all "Load more" appends. Always filter by ID before appending.
- **60-item cap**: Client stops loading more at MAX_ACCUMULATED=60 to protect low-end devices.
- **URL shareability**: URLs contain only initial search params (no cursor). "Load more" state is ephemeral client state.

### Mobile bottom sheet rules

- Map is always visible on mobile; list results appear in a draggable bottom sheet overlay.
- Sheet has 3 snap points: collapsed (~15vh), half (~50vh), expanded (~85vh). Default is half.
- Drag gestures are limited to the sheet handle/header — map receives all other touch events.
- When expanded and list is scrolled to top, dragging down collapses the sheet.
- Escape key collapses sheet to half position. Body scroll is locked when expanded.

---

## Testing rules (minimum bar)

- New behavior must be test-backed:
  - unit tests for pure logic
  - integration tests for server routes/services
  - Playwright e2e for critical flows (search filters, apply, holds, booking flow)
- Tests must be deterministic:
  - mock external APIs (Places/Maps) behind adapters
  - use fixed time where needed
  - avoid reliance on network unless explicitly marked as e2e

---

## Code style & review standards

- Prefer clarity over cleverness.
- Keep functions small; name things after domain concepts (Hold, Spot, Booking, Listing).
- Avoid “magic” state in components; prefer explicit state machines for complex flows.
- Add comments only when the “why” is not obvious (don’t narrate code).

---

## Database & migrations (Prisma / SQL safety)

If touching DB:

- Add migration and ensure it’s safe for existing data.
- Include a rollback note:
  - “reversible” vs “requires manual data restore”
- Include a data-safety note:
  - locking risk, backfill plan, index creation strategy
- Add or update indexes when queries change (especially search/filter endpoints).

---

## PR / delivery checklist (Definition of Done)

Before final output:

- ✅ Lint passes
- ✅ Typecheck passes
- ✅ Tests pass (and e2e if applicable)
- ✅ No PII leaks in logs/errors
- ✅ Server-side validation + auth enforced
- ✅ Docs/comments updated where needed
- ✅ Small diff, clear commit message(s)

---

## When you must ask questions (don’t guess)

Ask if any of these are unclear:

- The desired UX behavior (especially around holds/reservations/apply)
- The source of truth for a state (client vs server)
- External API limits/cost constraints
- Existing conventions in the repo (folder structure, patterns, naming)

---

## Quick repo orientation (run/read these first for any non-trivial task)

- `package.json` (scripts, tooling)
- Next.js entry structure (`app/` or `src/app/`) and API routes
- DB layer (e.g., `prisma/schema.prisma` + migrations)
- Shared libs/adapters (maps/places/auth/db)
- Test setup + Playwright config (if present)

---

## Templates (appendix)

### Plan template (paste into tasks/todo.md)

- Goal + acceptance criteria:
- Scope (files/modules):
- Risks (auth/PII/state/DB/cost):
- Approach (minimal design):
- Verification (lint/typecheck/tests/e2e):
- Rollback notes (if DB/behavior risk):
- Results + verification story:

### Bugfix template

- Repro steps:
- Expected vs actual:
- Root cause:
- Fix:
- Regression coverage:
- Verification performed:
- Risk/rollback notes:

### Lesson template (tasks/lessons.md)

- Date:
- Mistake / failure mode:
- Detection signal:
- Root cause:
- Prevention rule:
- Follow-up (if any):
