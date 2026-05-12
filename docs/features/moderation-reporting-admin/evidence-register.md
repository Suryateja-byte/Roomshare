# Moderation, Reporting, And Admin Evidence Register

Status date: 2026-05-10.

| Evidence ID | Type | Source | What it supports |
| --- | --- | --- | --- |
| MRA-E001 | Source | `src/app/api/reports/route.ts:25-166` | Report/private-feedback schema, duplicate response helper, private-feedback preview, CSRF, report rate limit, auth, JSON parse, Zod validation. |
| MRA-E002 | Source | `src/app/api/reports/route.ts:169-352` | Suspension check, listing owner lookup, self-report block, private-feedback feature/email/self/target/prior-conversation gates, duplicate active report, report create, private-feedback submission telemetry, response. |
| MRA-E003 | Source | `src/lib/admin-auth.ts:20-60` | Admin auth session requirement, database admin/suspension check, error codes. |
| MRA-E004 | Source | `src/lib/audit.ts:6-180` | Admin audit action/target types, fail-open audit write, filtered audit log reads, target/admin history reads. |
| MRA-E005 | Source | `src/app/actions/admin.ts:24-247` | `requireAdmin`, user list/filter/select, toggle admin with self-demotion prevention, suspend user with self-suspension prevention, admin write rate limit, audit logs, revalidation. |
| MRA-E006 | Source | `src/app/actions/admin.ts:251-480` | Admin listing list/filter/select, admin status update with row lock, expected version, moderation lock restoration guard, dirty marker, lifecycle sync, audit log, revalidation. |
| MRA-E007 | Source | `src/app/actions/admin.ts:482-768` | Unsuppress listing with row lock/version/lock requirement, retired migration review action, admin delete with row lock, suppress-if-reported, tombstone/delete otherwise, audit logs, revalidation. |
| MRA-E008 | Source | `src/app/actions/admin.ts:772-940` | Admin report list/filter/select, resolve/dismiss report with row lock, open-state check, audit log, revalidation. |
| MRA-E009 | Source | `src/app/actions/admin.ts:942-1147` | Resolve report and suppress listing in one transaction, report/listing row locks, report/listing audit events, revalidation, admin stats counts. |
| MRA-E010 | Source | `src/app/admin/page.tsx:52-221`, `src/app/admin/users/page.tsx:33-132`, `src/app/admin/listings/page.tsx:33-155`, `src/app/admin/reports/page.tsx:35-156` | Admin dashboard/users/listings/reports auth/admin gates, filters, selected data, counts, and client component handoff. |
| MRA-E011 | Source | `src/app/admin/verifications/page.tsx:15-123`, `src/app/admin/verifications/VerificationList.tsx:1-338` | Admin verification page auth/admin gate, safe document availability booleans, pending count, verification list state/actions/filter/document links/approve disable/rejection UI. |
| MRA-E012 | Source | `src/app/actions/verification.ts:1-663` | Verification submit schemas/rate/suspension/upload validation/cooldown/transaction/status, pending fetch, approve/reject row locks, document availability, user verification update, notification emails, audit logs, revalidation. |
| MRA-E013 | Source | `src/app/api/admin/verifications/[id]/documents/[kind]/route.ts:1-125` | Admin document signed URL route, kind parse, admin auth, rate limit, deleted/expired/unavailable checks, signed URL, document-view audit log, no-store redirect. |
| MRA-E014 | Source | `src/lib/listings/moderation-write-lock.ts:1-90` | Moderation lock reasons, public search blocked reasons, host lock result shape, host lock behavior. |
| MRA-E015 | Schema | `prisma/schema.prisma:197-235`, `prisma/schema.prisma:340-390`, `prisma/schema.prisma:531-545` | Report status/kind/model, verification request/upload models, audit log model. |
| MRA-E016 | Test inventory | 2026-05-10 command `rg --files tests/e2e src/__tests__ \| rg '(admin|report|moderation|verification|private-feedback|abuse|Audit|moderation-write-lock)'` | Existing admin/report/moderation/verification/private-feedback tests were discovered. They were not executed in this pass. |
| MRA-E017 | Migration inventory | 2026-05-10 command `rg --files prisma/migrations \| rg '(moderation|report|verification|abuse)'` | Relevant moderation, reporting, private-feedback, and verification migrations were discovered. Migration SQL line audit remains a gap. |
| MRA-E018 | Schema | `prisma/schema.prisma:42-82`, `prisma/schema.prisma:107-157` | User and Listing fields/relations used by admin/user/listing/report/verification actions. |

## Gap IDs

| Gap ID | Severity | Description | Evidence |
| --- | --- | --- | --- |
| MRA-G001 | P1 | Full browser admin/report/listing moderation/verification suites were not executed in this documentation pass. | MRA-E016 |
| MRA-G002 | P1 | Direct HTTP checks for reports, admin document route, status/cache headers, CSRF variants, and signed URL behavior were not executed. | MRA-E001, MRA-E013 |
| MRA-G003 | P1 | Email delivery and private-feedback telemetry/runtime behavior were source-observed but not runtime verified. | MRA-E002, MRA-E012 |
| MRA-G004 | P2 | Migration SQL paths were discovered but not line-audited for every report/moderation/verification invariant. | MRA-E017 |
| MRA-G005 | P2 | Audit logging intentionally fails open; no runtime assertion was run that failed audit writes are observable without breaking admin operations. | MRA-E004 |
