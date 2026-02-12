---
id: 0002
title: Fix Booking E2E Tests and Idempotency Bug
stage: green
date: 2026-02-12
surface: agent
model: claude-opus-4-6
feature: booking-lifecycle
branch: main
user: surya
command: /implement
labels: ["e2e", "playwright", "booking", "idempotency", "bugfix", "testing"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - tests/e2e/journeys/21-booking-lifecycle.spec.ts
  - src/lib/idempotency.ts
tests:
  - tests/e2e/journeys/21-booking-lifecycle.spec.ts (J21, J22, J23, J24 across 5 browser projects)
---

## Prompt

Implement plan to fix broken E2E booking lifecycle tests:
1. Rewrite J24 (Double-Booking Prevention) — was a no-op that only submitted one booking and matched /error/i as success
2. Strengthen J21-J23 assertions — had weak `expect(hasToast || x).toBeTruthy()` patterns where any toast (including errors) passed
3. No production code changes expected

Then: run J24 on chromium, install Playwright browsers when missing, investigate CI failures, find root causes, and fix until CI is green.

## Response snapshot

Implemented all 4 test changes, then discovered and fixed 2 hidden production/test bugs exposed by the tighter assertions:

**Commit 1 (`6883f9a`)**: Rewrote J24 as a real two-phase double-booking test (submit booking → clear sessionStorage → attempt duplicate → assert server rejection via `[role="alert"]` containing "already have a booking"). Strengthened J21-J23 assertions to require success/rejection/cancellation-specific text instead of matching any toast. Added `selectBookingDates()` helper with hydration-aware DatePicker interaction, per-browser month offsets to prevent date collisions, and retry jitter.

**Commit 2 (`68a8129`)**: Fixed production bug in `src/lib/idempotency.ts:127` — the raw SQL INSERT into `IdempotencyKey` was missing the `id` column. Prisma's `@default(cuid())` only applies to ORM calls, not `$executeRaw`, so PostgreSQL received NULL for the NOT NULL primary key (error 23502). Every booking submission through the UI was failing. Added `gen_random_uuid()::text` for the `id` value.

**Commit 3 (`359ee54`)**: Fixed J21 which was clicking "Request to Book" without selecting dates. The BookingForm validates dates are required, so the submission always failed with a validation error. The old weak assertion matched this error toast as success. Added `selectBookingDates(page, 14)` call with month offset 14 (outside J24's 3-11 range) and confirmation modal handling.

Final result: CI fully green — 41/41 Playwright E2E jobs passed, 0 failures.

## Outcome

- Impact: Fixed a production bug where all UI-initiated bookings were silently failing (idempotency INSERT missing id column). Replaced 4 false-positive E2E tests with real assertions that catch actual failures.
- Tests: All 22 booking lifecycle tests pass across 5 browser projects (chromium, firefox, webkit, Mobile Chrome, Mobile Safari). CI green 41/41.
- Files: 2 files modified — `tests/e2e/journeys/21-booking-lifecycle.spec.ts` (test rewrites), `src/lib/idempotency.ts` (1-line production fix)
- Next prompts: Consider adding a unit test for `withIdempotency` raw INSERT to prevent regression. Investigate flaky `mobile-bottom-sheet.spec.ts:773` test (unrelated, seen in Shard 24 of first CI run).
- Reflection: Tightening E2E assertions from permissive OR-patterns to specific text matching is high-value — it exposed a real production bug that had been silently breaking all booking submissions. The old tests were worse than no tests because they gave false confidence.

## Evaluation notes (flywheel)

- Failure modes observed: (1) Raw SQL bypassing Prisma ORM defaults for auto-generated fields. (2) E2E tests using `expect(a || b).toBeTruthy()` patterns that match error states as success. (3) Tests not exercising required form fields (dates) before submission.
- Graders run and results (PASS/FAIL): TypeCheck PASS, Playwright --list PASS (22 tests), CI Playwright E2E PASS (41/41 shards), CI Smoke Tests PASS, CI Build PASS
- Prompt variant (if applicable): Plan mode with detailed implementation spec provided upfront
- Next experiment (smallest change to try): Add a regression unit test for idempotency INSERT to catch raw SQL / Prisma default mismatches early without needing E2E
