# Moderation, Reporting, And Admin Runtime Verification

Status: PARTIAL. Route-handler/direct API Jest checks passed on 2026-05-13; MRA-E020 records the authoritative WSL focused Jest rerun passing local mocked private-feedback telemetry helper invocation and verification approval/rejection notification helper invocation. MRA-E021 records runnable Chromium evidence for regular-user admin boundary coverage and the identity verification admin journey under controlled one-worker execution. MRA-E022 records a route-handler baseline plus live-server negative/status/header parity for missing Origin/CSRF, `OPTIONS /api/reports`, invalid document kind, and unauthenticated valid-kind document access. Admin-auth `.admin.spec.ts` browser suites, the ignored admin-host race spec, browser admin report/listing moderation coverage, authenticated admin signed-URL success, real storage/provider signed URL behavior, real provider email delivery, inbox/bounce/webhook handling, provider telemetry/observability runtime, migration SQL audit, and audit-failure runtime checks remain unverified.

| Verification target | Result | Evidence |
| --- | --- | --- |
| Browser admin boundary and verification journey Chromium coverage | PASS/PARTIAL | MRA-E021, MRA-G001 |
| Browser admin dashboard/users/listings/reports/verifications | PARTIAL | MRA-E021, MRA-G001 |
| Browser admin listing moderation and report suppression flows | NOT RUN | MRA-G001 |
| Browser verification journey | PASS/PARTIAL | MRA-E021, MRA-G001 |
| Route-handler/direct API Jest checks for `/api/reports` status/CSRF/private-feedback behavior | PASS | MRA-E019 |
| Route-handler/direct API Jest checks for verification document status/no-store/signed URL behavior | PASS | MRA-E019 |
| Live-server HTTP transport parity for reports and verification document negative paths | PASS/PARTIAL | MRA-E022, MRA-G002 |
| Authenticated admin signed-URL success and real storage/provider behavior | NOT RUN | MRA-G002 |
| Local mocked verification notification and private-feedback telemetry helper invocation after rejection assertion | PASS | MRA-E020 |
| Real provider email delivery and provider telemetry/observability | NOT RUN | MRA-G003 |
| Focused direct API/security Jest command | PASS | MRA-E019 |

Source verification, route-handler/direct API Jest evidence, focused local mocked telemetry/notification invocation evidence, partial live-server negative-path transport evidence, and partial browser runtime evidence are recorded in `verification.json`; runtime confidence remains partial until admin-auth `.admin.spec.ts` browser suites, ignored race coverage, admin report/listing moderation browser flows, authenticated admin signed-URL success, real storage/provider behavior, real provider delivery/observability, migration SQL, and audit-failure commands are run.
