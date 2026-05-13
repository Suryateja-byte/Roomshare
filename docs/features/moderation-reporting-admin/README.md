# Moderation, Reporting, And Admin

Status: COMPLETE with P1/P2 verification gaps.

Evidence base: this package is source-audited from the report API, admin auth helper, audit helper, admin actions, admin pages, verification actions, verification document route, moderation write-lock helper, Prisma schema, migration inventory, and discovered tests. Exact ranges are in `evidence-register.md`.

## Verification

Current-behavior claims are source-backed. Route-handler/direct API Jest checks for reports, verification documents, private-feedback no-public-bleed, abuse hardening, and injection prevention passed in MRA-E019. MRA-E020 records the authoritative WSL focused Jest rerun passing local mocked private-feedback telemetry invocation and verification approval/rejection notification email invocation, including the rejection-path notification assertion. MRA-E021 records controlled Chromium admin-boundary and verification-admin journey passes, reducing MRA-G001 from fully unrun to partial. Admin-auth `.admin.spec.ts` suites, ignored admin-host race coverage, admin report/listing moderation browser coverage, optional live-server HTTP parity, real document-storage/provider signed URL behavior, real email delivery, inbox/bounce/webhook handling, provider telemetry/observability runtime, migration SQL audit, and audit-failure runtime checks remain tracked in `verification.json` and `runtime-verification.md`.
