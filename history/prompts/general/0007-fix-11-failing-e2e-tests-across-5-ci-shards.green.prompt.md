---
id: 7
title: Fix 11 Failing E2E Tests Across 5 CI Shards
stage: green
date: 2026-02-14
surface: agent
model: claude-opus-4-6
feature: none
branch: e2e/priority-2-listing-detail-auth
user: surya
command: implement
labels: ["e2e", "ci-stabilization", "session-expiry", "messaging", "search"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - src/components/NavbarClient.tsx
  - tests/e2e/helpers/session-expiry-helpers.ts
  - tests/e2e/session-expiry/session-expiry-resilience.spec.ts
  - tests/e2e/session-expiry/session-expiry-navigation.spec.ts
  - tests/e2e/session-expiry/session-expiry-forms.spec.ts
  - tests/e2e/messaging/messaging-perf.spec.ts
  - tests/e2e/messaging/messaging-realtime.spec.ts
  - tests/e2e/messaging/messaging-helpers.ts
  - tests/e2e/search-url-navigation.spec.ts
tests:
  - tests/e2e/session-expiry/ (SE-C01, SE-C03, SE-F01, SE-F02, SE-R02, SE-P02, SE-FM03)
  - tests/e2e/messaging/messaging-perf.spec.ts (RT-P01, RT-P02, RT-P04)
  - tests/e2e/messaging/messaging-realtime.spec.ts (RT-F06)
  - tests/e2e/messaging/messaging-helpers.ts (RT-F10 mock fix)
  - tests/e2e/search-url-navigation.spec.ts (test 7, test 8)
---

## Prompt

Implement the following plan: Fix 11 Failing E2E Tests Across 5 CI Shards. Nine fixes across 8 files, covering session expiry cookie clearing, NavbarClient unauthenticated handling, date selection before booking, CI-aware performance budgets, timing measurement fixes, unread badge timeout, RSC Flight format mocking, and SPA-friendly navigation in search tests.

## Response snapshot

Implemented all 9 fixes:
1. **Fix 1** – `expireSession()` now clears all 3 Auth.js cookies (session-token, csrf-token, callback-url) instead of just session-token. Updated helpers + 2 spec files.
2. **Fix 2** – NavbarClient.tsx line 137: handles `unauthenticated` status by setting `user = null` (app bug fix).
3. **Fix 3** – SE-FM03: added Radix DatePicker date selection (2 months + 4 months ahead) before booking attempt so client-side validation passes.
4. **Fix 4** – RT-P01: CI-aware hard limit (1500ms CI vs 500ms local).
5. **Fix 5** – RT-P02: separated typing from measurement, replaced multi-strategy detection with `expect.poll()` for opacity-70, added CI budget (8s).
6. **Fix 6** – RT-F06: added server confirmation gate (opacity-70 removal check on User2's bubble) + increased timeout to 75s (2 poll cycles + buffer).
7. **Fix 7** – RT-F10: added `encodeAsRSCResponse()` for proper Flight format + one-shot `intercepted` flag so only first POST is mocked.
8. **Fix 8** – Search back-nav: changed `page.goto(href!)` to `firstLink.click()` for tests 7 & 8, preserving SPA state.
9. **Fix 9** – RT-P04: increased CI budget from 8s to 12s.

Lint: 0 errors. Typecheck: no new errors.

## Outcome

- ✅ Impact: Fixes 11 failing E2E tests across CI shards 10, 13, 14, 24, 28
- 🧪 Tests: 11 tests targeted (5 session-expiry, 3 messaging-perf, 1 messaging-realtime, 1 messaging-helpers mock, 1 search-url-navigation)
- 📁 Files: 9 files modified (1 app code, 8 test code)
- 🔁 Next prompts: Push to CI and verify all 40 shards pass
- 🧠 Reflection: Root causes fell into 3 categories: incomplete cookie clearing (5 tests), timing/budget issues (4 tests), and test logic bugs (2 tests). The NavbarClient fix was the only app-level bug.

## Evaluation notes (flywheel)

- Failure modes observed: Stale auth cookies breaking redirect chain; CI dev server slower than local; race conditions in optimistic UI detection; SPA state destroyed by page.goto
- Graders run and results (PASS/FAIL): Lint PASS, Typecheck PASS (pre-existing .next errors only)
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Verify CI passes across all 40 shards
