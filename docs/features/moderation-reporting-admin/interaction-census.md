# Moderation, Reporting, And Admin Interaction Census

| Surface | Actor | Trigger | System behavior | Evidence | Verification |
| --- | --- | --- | --- | --- | --- |
| Abuse report | Authenticated user | POST `/api/reports` with default kind | CSRF/rate/auth/JSON/schema/suspension/self-report/listing/duplicate checks run before report creation. | MRA-E001, MRA-E002 | Source-audited; direct HTTP not run, MRA-G002. |
| Private feedback | Authenticated user | POST `/api/reports` with `PRIVATE_FEEDBACK` | Additional feature flag, email verification, target owner, self-target, prior conversation, duplicate, and telemetry paths apply. | MRA-E001, MRA-E002 | Source-audited; telemetry runtime not run, MRA-G003. |
| Admin dashboard | Admin | Opens `/admin` | Requires session/admin, fetches stats, and links to verification, users, listings, and reports. | MRA-E010 | Source-audited; browser not run, MRA-G001. |
| Admin users | Admin | Filters or writes user status | User page filters/searches users; actions toggle admin/suspension with rate limits, self-action prevention, audit logs, and revalidation. | MRA-E005, MRA-E010 | Source-audited; browser not run, MRA-G001. |
| Admin listings | Admin | Updates status, unsuppresses, deletes | Listing actions row-lock/version-check where relevant, apply moderation lock rules, suppress/delete depending on reports, update projections, audit, and revalidate. | MRA-E006, MRA-E007, MRA-E014 | Source-audited; browser not run, MRA-G001. |
| Admin reports | Admin | Resolves/dismisses report or suppresses listing | Report actions row-lock open reports, enforce state conflict, update report/listing state, audit, and revalidate. | MRA-E008, MRA-E009 | Source-audited; browser not run, MRA-G001. |
| Verification admin | Admin | Approves/rejects verification | Verification UI filters requests and calls approve/reject; actions row-lock pending request, validate document availability/rejection reason, update user/request state, email, audit, and revalidate. | MRA-E011, MRA-E012 | Source-audited; browser/email not run, MRA-G001, MRA-G003. |
| Verification document view | Admin | Opens document/selfie link | Route validates admin auth and rate limit, rejects invalid/deleted/expired/unavailable documents, creates signed URL, logs view, and returns no-store redirect. | MRA-E013 | Source-audited; signed URL runtime not run, MRA-G002. |
