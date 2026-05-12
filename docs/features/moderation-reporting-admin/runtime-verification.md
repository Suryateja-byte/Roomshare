# Moderation, Reporting, And Admin Runtime Verification

Status: NOT RUN in this documentation pass.

| Verification target | Result | Evidence |
| --- | --- | --- |
| Browser admin dashboard/users/listings/reports/verifications | NOT RUN | MRA-G001 |
| Browser admin listing moderation and report suppression flows | NOT RUN | MRA-G001 |
| Browser verification approve/reject/document links | NOT RUN | MRA-G001 |
| Direct HTTP `/api/reports` CSRF/status/header/private-feedback checks | NOT RUN | MRA-G002 |
| Direct HTTP verification document signed URL/no-store checks | NOT RUN | MRA-G002 |
| Verification email delivery and private-feedback telemetry | NOT RUN | MRA-G003 |
| Focused Jest/API/action/component tests | NOT RUN | MRA-E016 |

Source-only verification is recorded in `verification.json`; runtime confidence remains partial until the commands in `11-test-traceability-matrix.md` are run.
