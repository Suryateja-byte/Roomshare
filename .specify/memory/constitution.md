<!--
  Sync Impact Report
  Version change: 0.0.0 → 1.0.0 (initial ratification)
  Added sections: All (initial constitution)
  Removed sections: None
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ (aligned — constitution check referenced)
    - .specify/templates/spec-template.md ✅ (aligned — user story priority model matches)
    - .specify/templates/tasks-template.md ✅ (aligned — task grouping by story matches incremental delivery principle)
  Follow-up TODOs: None
-->

# Roomshare Constitution

## Core Principles

### I. Correctness & Abuse-Resistance

All booking, hold, and inventory state transitions MUST be validated server-side. The client is never the source of truth for lifecycle state. Every state machine and lifecycle transition MUST have tests covering edge cases, concurrent access, expired holds, unauthorized attempts, and rollback behavior. Idempotency MUST be enforced on all mutating operations to prevent double-writes from retries or double-clicks.

### II. Privacy & Security

No raw PII (email, phone, IDs, addresses) in logs — redact or hash. Secrets (`.env*`, keys, service credentials) MUST never be committed. All inputs MUST be validated and sanitized server-side. Error messages MUST NOT leak sensitive internal details. Rate-limiting MUST be applied to abuse-prone endpoints (apply, search, messaging). Prefer allowlists over denylists for filters and sort options.

### III. User Experience

Mobile-first, responsive, keyboard-accessible. No layout shifts in critical flows — use loading skeletons and reserved space. Always handle empty, error, and loading states. Accessibility basics enforced: labels, focus management, ARIA attributes, contrast, tab order. Performance budgets: sub-3s load on 3G, sub-1s on WiFi. Debounce user-driven queries with AbortController cancellation of stale requests.

### IV. Cost Efficiency

Cache aggressively for expensive lookups (places, geocoding, listing counts). Avoid unnecessary client-side fetching when SSR or route handlers already provide data. Prefer thin client wrappers plus server rendering. On map/search pages: batch updates, avoid fetch-on-every-pixel-pan, select only needed fields. No analytics or telemetry SDKs without explicit justification.

### V. Testing Discipline

New behavior MUST be test-backed: unit tests for pure logic, integration tests for server routes/services, Playwright E2E for critical flows. Tests MUST be deterministic: mock external APIs behind adapters, use fixed time where needed, no network reliance unless explicitly E2E. Minimum coverage targets: 80% unit, 70% integration for critical paths. Red-green-refactor cycle enforced for new features.

### VI. Maintainability & Simplicity

Prefer clarity over cleverness. Keep functions small; name things after domain concepts (Hold, Spot, Booking, Listing). Avoid magic state in components — prefer explicit state machines for complex flows. Smallest viable diff; no unrelated refactors in feature work. Comments explain "why", not "what". YAGNI: implement only current requirements.

## Architecture Boundaries

- **UI MUST NOT call the DB directly.** Client components handle UI state, rendering, and user interactions only.
- **Business rules live in the server/service layer**, not inside components. Server layer owns validation, authorization, business invariants, idempotency, and transactional writes.
- **Schema, constraints, and RLS live in the DB/migrations layer.** DB constraints prevent impossible states. Indexes MUST be added when queries change.
- **External services (Maps, Places, Payments, Email, SMS) MUST be wrapped behind adapter modules.** No direct SDK calls from components or route handlers.

## Database & Migration Safety

- All schema changes require a migration file.
- Every migration MUST include a rollback note: "reversible" vs "requires manual data restore".
- Every migration MUST include a data-safety note: locking risk, backfill plan, index creation strategy.
- Never apply direct schema changes outside migrations.

## Governance

- This constitution is the highest-authority document for the Roomshare project. All PRs, code reviews, and agent actions MUST verify compliance.
- **Conflict precedence**: Non-negotiables → Reliability & Security → Architecture boundaries → Testing rules → Cost & performance → UI/UX → Code style.
- **Amendments**: Any change to this constitution requires documentation of the change, rationale, and a version bump. MAJOR for principle removals/redefinitions, MINOR for additions/expansions, PATCH for clarifications.
- **Compliance review**: Constitution principles MUST be checked during plan and implementation phases. Violations block merge.

**Version**: 1.0.0 | **Ratified**: 2026-02-02 | **Last Amended**: 2026-02-02
