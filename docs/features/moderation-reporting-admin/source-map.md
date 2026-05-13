# Moderation, Reporting, And Admin Source Map

| Area | Source evidence | Current claim |
| --- | --- | --- |
| Report submission | MRA-E001, MRA-E002, MRA-E019 | Report API validates abuse/private-feedback requests, auth/account state, private-feedback eligibility, duplicate active reports, and creates report rows; route-handler/direct API Jest checks passed for the covered report paths. |
| Admin auth and audit | MRA-E003, MRA-E004 | Admin operations require DB-backed admin/non-suspended status, and admin writes create audit-log attempts. |
| Admin user actions | MRA-E005 | Admin user management supports listing/filtering users, toggling admin, suspension changes, rate limits, self-action prevention, audit logs, and revalidation. |
| Admin listing actions | MRA-E006, MRA-E007, MRA-E014 | Listing moderation supports filtering, status updates, unsuppress, delete/suppress, row locks, versions, moderation locks, dirty markers, lifecycle sync, audits, and revalidation. |
| Admin report actions | MRA-E008, MRA-E009 | Reports can be listed, resolved/dismissed, or resolved while suppressing listings with row locks and audit logs. |
| Admin pages | MRA-E010, MRA-E011 | Admin pages enforce auth/admin gates, parse filters, fetch selected data, and hand off to client list components. |
| Verification review and documents | MRA-E012, MRA-E013, MRA-E019 | Verification submission/status/admin approval/rejection/document access enforce rate/auth/state/document availability checks, transactions, audit logs, and no-store signed document redirect; route-handler/direct API Jest checks passed for the document route. |
| Schema and migrations | MRA-E015, MRA-E017, MRA-E018 | Prisma models and migration inventory back report, verification, audit, user, and listing behavior; migration SQL line audit remains gapped. |
| Tests | MRA-E016, MRA-E019 | Relevant tests were discovered; the focused route-handler/direct API and security Jest command passed on 2026-05-13. |
