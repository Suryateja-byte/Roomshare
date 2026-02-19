# P3 Low Fixes + Test Coverage Gaps — Design

**Date**: 2026-02-19
**Scope**: All remaining P3 Low audit items (40 findings) + P1 test coverage gaps (#61-66)
**Team**: 6 Opus 4.6 agents, maximum parallelism

---

## 6-Agent Team Structure

### Agent 1: `aria-a11y-agent`
**Scope**: ARIA gaps, skip-to-search link, Escape key conflicts
- Add `aria-expanded` to SearchForm toggle buttons
- Add skip-to-search landmark link
- Audit Escape key handlers across MobileBottomSheet, Map, BookingForm — resolve conflicts
- Files: `src/components/SearchForm.tsx`, `src/components/search/FilterModal.tsx`, `src/components/search/MobileBottomSheet.tsx`, `src/components/Map.tsx`

### Agent 2: `cron-sitemap-agent`
**Scope**: TypingStatus cron cleanup, sitemap pagination
- Add TypingStatus TTL cleanup (delete entries older than 5 minutes) to existing cron infrastructure
- Paginate sitemap.ts — split into sitemap index + chunked sitemaps (50K URLs per chunk)
- Files: `src/app/api/cron/`, `src/app/sitemap.ts`, `prisma/schema.prisma` (read only)

### Agent 3: `backend-fixes-agent`
**Scope**: SavedSearch validation, ServiceWorker leak, geocoding cache, PII audit, JWT timing
- Add Zod validation for SavedSearch.filters on read/write
- Fix ServiceWorker interval leak (clearInterval on unmount)
- Audit `src/scripts/verify_listing.ts` for PII in logs
- Fix SessionProvider polling if still at 60s (should be 300s)
- Document non-atomic operations that rely on DB constraints
- Files: `src/components/ServiceWorkerRegistration.tsx`, `src/scripts/verify_listing.ts`, server actions touching SavedSearch

### Agent 4: `search-v2-tests-agent`
**Scope**: search-v2-service.ts test suite
- Create comprehensive tests for `src/lib/search/search-v2-service.ts`
- Cover: normal search flow, error handling, map query failures, caching, pagination
- Files: `src/__tests__/lib/search/search-v2-service.test.ts` (new)

### Agent 5: `component-tests-agent`
**Scope**: Context tests, FilterModal test, ErrorBoundary test
- Create `src/__tests__/contexts/SearchV2DataContext.test.tsx`
- Create `src/__tests__/contexts/MobileSearchContext.test.tsx`
- Create `src/__tests__/components/search/FilterModal.test.tsx`
- Create `src/__tests__/components/error/ErrorBoundary.test.tsx`
- Files: `src/__tests__/contexts/`, `src/__tests__/components/`

### Agent 6: `test-quality-agent`
**Scope**: Fix global.fetch pattern, improve $transaction mocks, timezone edge case tests
- Replace `global.fetch = jest.fn()` with proper mock patterns in affected test files
- Audit and improve `$transaction` mock to not pass empty object
- Add timezone edge case test suite
- Files: `src/__tests__/security/email-linking.test.ts`, jest setup files, new timezone test file

---

## File Ownership (no conflicts)

| Agent | Owns | Does NOT touch |
|-------|------|----------------|
| aria-a11y | Components: SearchForm, FilterModal, MobileBottomSheet, Map | Tests, server code |
| cron-sitemap | Cron routes, sitemap.ts | Components, tests |
| backend-fixes | ServiceWorkerRegistration, scripts, SavedSearch actions | Tests, cron routes |
| search-v2-tests | `__tests__/lib/search/search-v2-service.test.ts` | Source code |
| component-tests | `__tests__/contexts/`, `__tests__/components/` | Source code |
| test-quality | `__tests__/security/`, jest setup, timezone tests | Source code, components |

---

## Success Criteria

- All P3 items addressed or documented as "won't fix" with rationale
- New test files pass locally
- No regressions in existing test suite
- `pnpm typecheck` passes
- CI green after push
