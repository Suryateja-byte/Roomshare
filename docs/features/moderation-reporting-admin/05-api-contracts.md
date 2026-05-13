# 05 API And Action Contracts

| Contract | Current behavior | Evidence |
| --- | --- | --- |
| `POST /api/reports` | Validates schema, CSRF, rate, auth, JSON, suspension, listing, self-report, private-feedback gates, duplicate active report, create, local telemetry helper invocation, and returns report JSON or error. | MRA-E001, MRA-E002, MRA-E019, MRA-E022 |
| `requireAdminAuth` | Requires session, DB user admin flag, and non-suspended status; returns structured error codes. | MRA-E003 |
| Audit helper | Writes admin audit log rows with adminId/action/target/details/ip, and logs but does not throw on audit write failure. | MRA-E004 |
| User admin actions | `getUsers`, `toggleUserAdmin`, and `suspendUser` enforce admin auth, filters, write rate limit, self-action prevention, user updates, audit logs, and revalidation. | MRA-E005 |
| Listing admin actions | Listing list/status/unsuppress/delete actions enforce admin auth, rate limits, row locks/version where relevant, moderation lock logic, suppression/delete behavior, projection sync, audit logs, and revalidation. | MRA-E006, MRA-E007, MRA-E014 |
| Report admin actions | Report list/resolve/dismiss/suppress-listing actions enforce admin auth, rate limits, row locks/open-state checks, report/listing updates, audit logs, and revalidation. | MRA-E008, MRA-E009 |
| Verification user actions | Verification submit/status actions enforce auth, suspension, rate, schemas, pending/cooldown/upload validity, request creation/upload consumption, status lookup, and revalidation. | MRA-E012 |
| Verification admin actions | Admin pending/approve/reject actions enforce admin auth, rate, row locks, request state, document availability, rejection validation, user/request updates, notification helper invocation, audit logs, and revalidation. | MRA-E012 |
| Verification document route | GET route enforces kind/admin/rate/request/deleted/expired/path checks, signed URL creation, document-view audit, no-store redirect, and error statuses. | MRA-E013, MRA-E019, MRA-E022 |

Route-handler/direct API Jest status/CSRF/private-feedback/document checks passed in MRA-E019. The focused local mocked telemetry/notification helper invocation command passed in MRA-E020. MRA-E022 verified live-server HTTP negative/status/header parity for missing Origin/CSRF on `POST /api/reports`, `OPTIONS /api/reports`, invalid document kind, and unauthenticated valid-kind document access. Authenticated admin signed-URL success, real storage/provider behavior, and admin-session success-path parity remain unverified; see MRA-G002.
