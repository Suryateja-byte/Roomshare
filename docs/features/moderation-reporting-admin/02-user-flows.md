# 02 User Flows

## Report Submission

| Step | Current behavior | Evidence |
| --- | --- | --- |
| Submit report | Report route previews private-feedback metadata, validates CSRF and report rate limit, requires auth, parses JSON, and validates schema. | MRA-E001 |
| Account/listing gates | Route blocks suspended users, missing listings, and self-reporting. | MRA-E002 |
| Private feedback gates | Private feedback requires feature flag, verified email, target not self, target listing owner, and prior conversation with a message from reporter. | MRA-E002 |
| Duplicate and create | Route blocks duplicate active reports and creates a report row; private-feedback submissions invoke telemetry helpers. | MRA-E002 |

## Admin Moderation

| Flow | Current behavior | Evidence |
| --- | --- | --- |
| Admin entry | Admin pages require authenticated admin users and redirect non-admins. | MRA-E010, MRA-E011 |
| User management | Admins can list/filter users, toggle admin except self-demotion, suspend/unsuspend except self-suspension, rate-limit writes, audit actions, and revalidate. | MRA-E005 |
| Listing moderation | Admins can list/filter listings, update status with row lock and version, prevent direct activation of moderation-locked listings, unsuppress locked listings, and delete/suppress with report-aware behavior. | MRA-E006, MRA-E007, MRA-E014 |
| Report resolution | Admins can resolve/dismiss open reports or resolve and suppress listing in one transaction with report/listing audit events. | MRA-E008, MRA-E009 |

## Verification Review

| Flow | Current behavior | Evidence |
| --- | --- | --- |
| Submit verification | User action validates auth/suspension/rate/schema, pending request, already verified, rejection cooldown, usable uploads, request creation, upload consumption, and revalidation. | MRA-E012 |
| Admin verification page | Admin page maps private document paths to booleans and passes safe request fields to `VerificationList`. | MRA-E011 |
| Approve | Admin action checks admin/rate, row-locks pending request, requires available document, updates request/user verification state, invokes notification helper, audits, and revalidates. | MRA-E012 |
| Reject | Admin action checks admin/rate, validates rejection reason, row-locks pending request, updates request, invokes rejection notification helper, audits, and revalidates; MRA-E020 verifies the local mocked `verificationRejected` notification helper invocation. | MRA-E012, MRA-E020 |
| View document | Admin document route checks auth/rate/document availability, creates signed URL, audits view, and no-store redirects. | MRA-E013 |
