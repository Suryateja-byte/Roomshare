# Moderation, Reporting, And Admin Feature Boundary

| Scope area | Included current behavior | Evidence |
| --- | --- | --- |
| Report submission | `POST /api/reports` validates report/private-feedback schema, previews private-feedback metadata, applies CSRF and rate limit, requires auth, validates JSON, checks suspension, prevents self-reporting, gates private feedback by feature flag, email verification, target owner, prior conversation, duplicate active report, and creates reports. | MRA-E001, MRA-E002 |
| Admin authorization | Admin helpers require a session, database-backed admin flag, and non-suspended admin user before admin actions proceed. | MRA-E003 |
| Audit logging | Admin audit helper defines action/target types, writes audit log rows, fails open on audit logging errors, and supports filtered/history reads. | MRA-E004, MRA-E015 |
| Admin user management | Admin user actions list/filter users, toggle admin status with self-demotion prevention, suspend/unsuspend with self-suspension prevention, rate-limit writes, log audit events, and revalidate admin users. | MRA-E005 |
| Admin listing moderation | Admin listing actions list/filter listings, update status with row lock/version/moderation lock handling, unsuppress locked listings, retire migration review, delete or suppress listings depending on report count, update projections, log audit events, and revalidate admin listings. | MRA-E006, MRA-E007, MRA-E014 |
| Admin reports | Admin report actions list reports, resolve/dismiss open reports with row locks, resolve and suppress listing in one transaction, log report/listing audit events, and revalidate report/listing pages. | MRA-E008, MRA-E009 |
| Admin UI pages | Admin dashboard/users/listings/reports/verifications pages require auth/admin checks, parse filters/pagination, fetch safe selected fields, and render client list components. | MRA-E010, MRA-E011 |
| Verification review | User verification submission validates uploads and cooldowns; admin approval/rejection row-lock pending requests, update user/request state, send notification emails, write audit events, and revalidate pages. | MRA-E012 |
| Verification document access | Admin document route checks admin auth, rate-limits document views, rejects invalid/deleted/expired/unavailable documents, creates signed URL, logs document view, redirects with no-store. | MRA-E013 |
| Data model | Prisma defines report status/kind/report fields, verification request/upload fields, audit log fields, and user/listing fields used by admin actions. | MRA-E015, MRA-E018 |

## Out Of Scope

| Area | Reason | Evidence |
| --- | --- | --- |
| Host listing create/edit flows | Host listing mutations are documented in `listing-management`; this package only covers admin/moderation writes and report-triggered locks. | MRA-E006, MRA-E007 |
| Contact-host messaging UI | Contact and messaging behavior is documented in `contact-host`; this package covers only private-feedback report submission and no-bleed schema intent. | MRA-E001, MRA-E015 |
| Account profile/settings flows | Account flows are documented in `auth-profile-saved-listings`; this package covers admin user management and verification review only. | MRA-E005, MRA-E012 |

## Unknowns

| Unknown | Severity | Evidence |
| --- | --- | --- |
| Full browser admin/report/verification/moderation suites were not run in this documentation pass. | P1 | MRA-G001 |
| Route-handler/direct API Jest checks passed for reports, verification documents, private-feedback no-public-bleed, abuse hardening, and injection prevention; optional live-server HTTP transport parity was not run. | P2 | MRA-E019, MRA-G002 |
| Local mocked private-feedback telemetry invocation and verification approval/rejection notification email invocation are verified; real email provider delivery, inbox/bounce/webhook proof, provider observability/telemetry runtime, and other provider/runtime proof remain unverified. | P2 residual | MRA-E020, MRA-G003 |
