# 12 Gaps, Unknowns, And Questions

| ID | Severity | Status | Gap or unknown | Evidence |
| --- | --- | --- | --- | --- |
| MRA-G001 | Reclassified; not an active P1 | RECLASSIFIED | Controlled Chromium admin-boundary and verification-admin journey coverage passed in MRA-E021. MRA-E025 then closed/reduced the admin-auth `.admin.spec.ts`, read-only admin, admin action, and report/listing moderation browser coverage gap by passing the focused and combined `chromium-admin` gates. MRA-E026 reclassifies ignored/unrun `tests/e2e/concurrent/admin-host-race.spec.ts` as retired booking/lifecycle-era coverage with stale API/helper assumptions, not current MRA browser coverage and not a release-blocking current MRA evidence residual. Keep the retired spec ignored unless a later product decision asks for new current admin-vs-host concurrency coverage. | MRA-E016, MRA-E021, MRA-E025, MRA-E026 |
| MRA-G002 | P2 | RESIDUAL | Route-handler/direct API Jest checks passed, and MRA-E022 verified the narrower route-handler baseline plus live-server negative/status/header parity for missing Origin/CSRF, `OPTIONS /api/reports`, invalid document kind, and unauthenticated valid-kind document access. Authenticated admin signed-URL success, real storage/provider behavior, and any admin-session success path remain unverified. | MRA-E001, MRA-E013, MRA-E019, MRA-E022 |
| MRA-G003 | P2 | RESIDUAL | Local mocked private-feedback telemetry invocation and verification approval/rejection notification email invocation are verified by MRA-E020. Real email provider delivery, inbox/bounce/webhook proof, provider observability/telemetry runtime, and other provider/runtime proof remain unverified residual gaps. | MRA-E002, MRA-E012, MRA-E019, MRA-E020 |
| MRA-G004 | P2 | RESIDUAL | Tracked migration SQL was line-audited in MRA-E024 and the related 8-suite / 74-test Jest command passed. Remaining residual is deployed production/staging database migration-state proof; this slice does not verify that those migrations have been applied outside source control/local test context. | MRA-E017, MRA-E024 |
| MRA-G005 | P2 | RESIDUAL | Reduced by MRA-E023: local Jest verifies `logAdminAction` fails open and logs operational visibility metadata when `prisma.auditLog.create` rejects, and related admin/verification/document tests still pass. Live browser/admin-operation failure injection, production observability pipeline delivery, provider telemetry, and database outage runtime proof remain unverified. | MRA-E004, MRA-E023 |

## Product Questions

| Question | Why it matters | Evidence |
| --- | --- | --- |
| Should audit logging remain fail-open for all admin operations, or should selected high-risk actions fail closed? | Source and local helper-level Jest currently show audit write failures are logged without aborting `logAdminAction`; live admin-operation failure injection is still unverified. | MRA-E004, MRA-E023, MRA-G005 |
| Should admin dashboard "Recent Activity" be connected to audit logs before release sign-off? | Admin dashboard currently renders a recent activity placeholder while audit log read helpers exist. | MRA-E004, MRA-E010 |
