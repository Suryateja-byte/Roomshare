# 11 Test Traceability Matrix

Status: tests discovered; route-handler/direct API Jest subset executed on 2026-05-13.

| Behavior | Existing discovered tests | Evidence | Run status |
| --- | --- | --- | --- |
| Admin actions and pages | `src/__tests__/actions/admin.test.ts`, `src/__tests__/app/admin/*.test.tsx`, `tests/e2e/admin/*.spec.ts`, `tests/e2e/a11y/wcag-gap-coverage.admin.spec.ts` | MRA-E016 | NOT RUN |
| Reports/private feedback | `src/__tests__/api/reports*.test.ts`, `src/__tests__/api/private-feedback-no-public-bleed.test.ts`, `src/__tests__/schema/reporting-abuse-hardening.test.ts` | MRA-E016, MRA-E019 | PASS for route-handler/direct API Jest subset; telemetry runtime remains MRA-G003 |
| Moderation locks/races | `src/__tests__/lib/listings/moderation-write-lock.test.ts`, `src/__tests__/db/phase01-moderation-precedence.test.ts`, `tests/e2e/concurrent/admin-host-race.spec.ts`, `tests/e2e/concurrent/api-abuse-prevention.spec.ts` | MRA-E016 | NOT RUN |
| Verification review/documents | `src/__tests__/actions/verification.test.ts`, `src/__tests__/api/verification-documents.test.ts`, `tests/e2e/journeys/09-verification-admin.spec.ts`, `src/__tests__/lib/verification-retention.test.ts`, `src/__tests__/lib/verification-token-store.test.ts` | MRA-E016, MRA-E019 | PASS for verification document route-handler Jest; browser/admin action and provider email remain MRA-G001/MRA-G003 |

## Recommended Release Gate

| Order | Command | Why | Status |
| --- | --- | --- | --- |
| 1 | `pnpm test -- src/__tests__/api/reports.test.ts src/__tests__/api/reports-route.test.ts src/__tests__/api/reports-edge-cases.test.ts src/__tests__/api/verification-documents.test.ts src/__tests__/api/private-feedback-no-public-bleed.test.ts src/__tests__/schema/reporting-abuse-hardening.test.ts src/__tests__/security/injection-prevention.test.ts --runInBand` | Focused route-handler/direct API and security coverage for reports, verification documents, private-feedback no-public-bleed, abuse hardening, and injection prevention. | PASS on 2026-05-13; MRA-E019 |
| 2 | `pnpm playwright test tests/e2e/admin tests/e2e/journeys/09-verification-admin.spec.ts tests/e2e/concurrent/admin-host-race.spec.ts` | Browser admin/moderation/verification/race coverage. | NOT RUN |
| 3 | Live-server HTTP checks for `/api/reports` and `/api/admin/verifications/[id]/documents/[kind]` | Optional transport parity for status/cache/header and signed URL route verification beyond route-handler Jest. | NOT RUN; MRA-G002 |
