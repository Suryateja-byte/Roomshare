# 05 API And Action Contracts

| Contract | Current behavior | Evidence |
| --- | --- | --- |
| `POST /api/reports` | Validates schema, CSRF, rate, auth, JSON, suspension, listing, self-report, private-feedback gates, duplicate active report, create, telemetry, and returns report JSON or error. | MRA-E001, MRA-E002, MRA-E019 |
| `requireAdminAuth` | Requires session, DB user admin flag, and non-suspended status; returns structured error codes. | MRA-E003 |
| Audit helper | Writes admin audit log rows with adminId/action/target/details/ip, and logs but does not throw on audit write failure. | MRA-E004 |
| User admin actions | `getUsers`, `toggleUserAdmin`, and `suspendUser` enforce admin auth, filters, write rate limit, self-action prevention, user updates, audit logs, and revalidation. | MRA-E005 |
| Listing admin actions | Listing list/status/unsuppress/delete actions enforce admin auth, rate limits, row locks/version where relevant, moderation lock logic, suppression/delete behavior, projection sync, audit logs, and revalidation. | MRA-E006, MRA-E007, MRA-E014 |
| Report admin actions | Report list/resolve/dismiss/suppress-listing actions enforce admin auth, rate limits, row locks/open-state checks, report/listing updates, audit logs, and revalidation. | MRA-E008, MRA-E009 |
| Verification user actions | Verification submit/status actions enforce auth, suspension, rate, schemas, pending/cooldown/upload validity, request creation/upload consumption, status lookup, and revalidation. | MRA-E012 |
| Verification admin actions | Admin pending/approve/reject actions enforce admin auth, rate, row locks, request state, document availability, rejection validation, user/request updates, emails, audit logs, and revalidation. | MRA-E012 |
| Verification document route | GET route enforces kind/admin/rate/request/deleted/expired/path checks, signed URL creation, document-view audit, no-store redirect, and error statuses. | MRA-E013, MRA-E019 |

Route-handler/direct API Jest status/CSRF/private-feedback/document checks passed in MRA-E019. Optional live-server HTTP transport parity for status/cache/header and signed URL behavior was not run; see MRA-G002.
