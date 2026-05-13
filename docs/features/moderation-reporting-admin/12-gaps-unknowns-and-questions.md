# 12 Gaps, Unknowns, And Questions

| ID | Severity | Status | Gap or unknown | Evidence |
| --- | --- | --- | --- | --- |
| MRA-G001 | P1 | PARTIAL | Controlled Chromium admin-boundary and verification-admin journey coverage passed in MRA-E021, reducing the prior fully unrun browser gap. Admin-auth `.admin.spec.ts` suites, ignored admin-host race coverage, and admin report/listing moderation browser coverage remain unverified residual blockers. | MRA-E016, MRA-E021 |
| MRA-G002 | P2 | RESIDUAL | Route-handler/direct API Jest checks passed, and MRA-E022 verified the narrower route-handler baseline plus live-server negative/status/header parity for missing Origin/CSRF, `OPTIONS /api/reports`, invalid document kind, and unauthenticated valid-kind document access. Authenticated admin signed-URL success, real storage/provider behavior, and any admin-session success path remain unverified. | MRA-E001, MRA-E013, MRA-E019, MRA-E022 |
| MRA-G003 | P2 | RESIDUAL | Local mocked private-feedback telemetry invocation and verification approval/rejection notification email invocation are verified by MRA-E020. Real email provider delivery, inbox/bounce/webhook proof, provider observability/telemetry runtime, and other provider/runtime proof remain unverified residual gaps. | MRA-E002, MRA-E012, MRA-E019, MRA-E020 |
| MRA-G004 | P2 | PARTIAL | Relevant migrations were discovered by path, but migration SQL was not line-audited for every report/moderation/verification invariant. | MRA-E017 |
| MRA-G005 | P2 | NOT VERIFIED | Audit logging fails open by design in source, but no runtime test was run to verify operational visibility of audit write failures. | MRA-E004 |

## Product Questions

| Question | Why it matters | Evidence |
| --- | --- | --- |
| Should audit logging remain fail-open for all admin operations, or should selected high-risk actions fail closed? | Source currently logs audit write failures without aborting admin operations. | MRA-E004, MRA-G005 |
| Should admin dashboard "Recent Activity" be connected to audit logs before release sign-off? | Admin dashboard currently renders a recent activity placeholder while audit log read helpers exist. | MRA-E004, MRA-E010 |
