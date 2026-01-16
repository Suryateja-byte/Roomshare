# Roomshare — CLAUDE.md (Project Operating Rules)

## Mission (what “good” looks like)

Roomshare is a production web app where **trust + safety + reliability** matter as much as UX.
When making changes, prioritize (in order):

1. **Correctness & abuse-resistance** (no broken holds/bookings, no bypassable rules)
2. **User experience** (fast, predictable, accessible, mobile-safe)
3. **Cost efficiency** (avoid expensive calls; cache; minimize re-renders; avoid needless infra)
4. **Maintainability** (simple code, small diffs, strong tests)

---

## Non-negotiables (always enforce)

- **No raw PII in logs** (email/phone/IDs/address). Redact or hash.
- **All booking/hold/inventory state transitions validated server-side** (never trust client).
- **Any state machine / lifecycle logic must have tests** for edge cases + abuse.
- **DB changes require**: migration + rollback note + data-safety note (backfill, locks, downtime risk).
- **Never commit secrets**. Treat `.env*`, keys, service creds as off-limits.

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

If a change touches these flows:

- Add/extend tests covering:
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
