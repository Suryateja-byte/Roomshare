# 11 Test Traceability Matrix

Status: focused route/action command executed for APS-E018; browser and provider checks remain unrun.

| Behavior | Existing discovered tests | Evidence | Run status |
| --- | --- | --- | --- |
| Login/signup/auth journeys | `tests/e2e/auth/login-signup.anon.spec.ts`, `tests/e2e/journeys/02-auth.spec.ts`, `tests/e2e/journeys/20-auth-journeys.anon.spec.ts`, `src/__tests__/pages/login.test.tsx`, `src/__tests__/pages/signup.test.tsx` | APS-E017 | NOT RUN |
| Verify/reset auth APIs | `tests/e2e/auth/verify*.spec.ts`, `tests/e2e/auth/reset-password.anon.spec.ts`, `src/__tests__/api/auth/*.test.ts` | APS-E017, APS-E018 | PARTIAL PASS: route-handler Jest passed; browser specs not run |
| Auth helpers/session expiry | `src/__tests__/lib/auth*.test.ts`, `tests/e2e/session-expiry/*.spec.ts`, `src/__tests__/edge-cases/auth-edge-cases.test.ts` | APS-E017 | NOT RUN |
| Profile | `tests/e2e/profile/profile-edit.spec.ts`, `tests/e2e/mobile/mobile-profile.spec.ts`, `src/__tests__/actions/profile.test.ts`, `src/__tests__/app/users/UserProfilePage.visibility.test.tsx` | APS-E017 | NOT RUN |
| Settings | `tests/e2e/settings/settings.spec.ts`, `tests/e2e/journeys/08-profile-settings.spec.ts`, `src/__tests__/actions/settings.test.ts` | APS-E017, APS-E018 | ACTION PASS; browser specs not run |
| Saved listings/favorites | `tests/e2e/search/search-saved-listing.spec.ts`, `tests/e2e/journeys/04-favorites-saved-searches.spec.ts`, `tests/e2e/session-expiry/session-expiry-favorites.spec.ts`, `src/__tests__/actions/saved-listings.test.ts`, `src/__tests__/api/favorites*.test.ts` | APS-E017, APS-E018 | ACTION/API PASS; browser specs not run |
| Saved searches | `tests/e2e/saved/saved-searches.spec.ts`, `tests/e2e/search/search-saved-search.spec.ts`, `src/__tests__/actions/saved-search*.test.ts`, `src/__tests__/app/saved-searches/*.test.tsx` | APS-E017, APS-E018 | ACTION PASS; browser/checkout runtime not run |

## Recommended Release Gate

| Order | Command | Why | Status |
| --- | --- | --- | --- |
| 1 | `pnpm test -- src/__tests__/api/register.test.ts src/__tests__/api/register-edge-cases.test.ts src/__tests__/api/auth/forgot-password.test.ts src/__tests__/api/auth/reset-password.test.ts src/__tests__/api/auth/verify-email.test.ts src/__tests__/api/auth/resend-verification.test.ts src/__tests__/api/favorites.test.ts src/__tests__/api/favorites-get.test.ts src/__tests__/actions/saved-listings.test.ts src/__tests__/actions/saved-search.test.ts src/__tests__/actions/settings.test.ts --runInBand` | Focused route/action status, CSRF, favorites cache, saved-search, saved-listing, and settings coverage. | PASS in APS-E018 |
| 2 | `pnpm playwright test tests/e2e/auth tests/e2e/profile tests/e2e/settings tests/e2e/saved tests/e2e/search/search-saved-listing.spec.ts tests/e2e/search/search-saved-search.spec.ts` | Browser auth/profile/settings/saved flows. | NOT RUN |
| 3 | Provider-mocked OAuth/Turnstile/email/checkout return checks | External-provider edge coverage without hitting real providers. | NOT RUN |
