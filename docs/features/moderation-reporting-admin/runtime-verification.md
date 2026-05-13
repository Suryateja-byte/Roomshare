# Moderation, Reporting, And Admin Runtime Verification

Status: PARTIAL. Route-handler/direct API Jest checks passed on 2026-05-13; browser, live-server HTTP parity, real storage/provider signed URL behavior, provider email delivery, telemetry runtime, migration SQL audit, and audit-failure runtime checks were not run.

| Verification target | Result | Evidence |
| --- | --- | --- |
| Browser admin dashboard/users/listings/reports/verifications | NOT RUN | MRA-G001 |
| Browser admin listing moderation and report suppression flows | NOT RUN | MRA-G001 |
| Browser verification approve/reject/document links | NOT RUN | MRA-G001 |
| Route-handler/direct API Jest checks for `/api/reports` status/CSRF/private-feedback behavior | PASS | MRA-E019 |
| Route-handler/direct API Jest checks for verification document status/no-store/signed URL behavior | PASS | MRA-E019 |
| Optional live-server HTTP transport parity for reports and verification documents | NOT RUN | MRA-G002 |
| Verification email delivery and private-feedback telemetry | NOT RUN | MRA-G003 |
| Focused direct API/security Jest command | PASS | MRA-E019 |

Source-only verification and route-handler/direct API Jest evidence are recorded in `verification.json`; runtime confidence remains partial until the remaining browser, live-server HTTP parity, provider, telemetry, migration SQL, and audit-failure commands are run.
