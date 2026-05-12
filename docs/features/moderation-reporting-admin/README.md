# Moderation, Reporting, And Admin

Status: COMPLETE with P1 verification gaps.

Evidence base: this package is source-audited from the report API, admin auth helper, audit helper, admin actions, admin pages, verification actions, verification document route, moderation write-lock helper, Prisma schema, migration inventory, and discovered tests. Exact ranges are in `evidence-register.md`.

## Verification

Current-behavior claims are source-backed. Runtime/browser, direct HTTP, document-storage signed URL, email delivery, and full admin regression commands were not run during this pass; those gaps are tracked in `verification.json` and `runtime-verification.md`.
