# 04 Runtime Sequences

## Report Submission Sequence

| Step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | Report API previews request kind/listing/target for private-feedback telemetry before normal validation. | MRA-E001 |
| 2 | API validates CSRF, rate limit, auth, JSON, and schema. | MRA-E001 |
| 3 | API checks suspension, listing existence, and self-report block. | MRA-E002 |
| 4 | Private-feedback requests pass feature, email, target owner, self-target, and prior-conversation gates. | MRA-E002 |
| 5 | API blocks duplicate active reports and creates a `Report` row. | MRA-E002 |

## Report Resolution With Listing Suppression

| Step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | Admin action requires admin and admin-delete rate limit. | MRA-E009 |
| 2 | Transaction row-locks report and rejects missing or non-open reports. | MRA-E009 |
| 3 | Transaction row-locks listing and rejects missing listing. | MRA-E009 |
| 4 | Transaction resolves report, pauses listing with `SUPPRESSED`, increments version, marks dirty, and syncs lifecycle. | MRA-E009 |
| 5 | Action writes report and listing audit events and revalidates admin reports/listings. | MRA-E009 |

## Verification Document View

| Step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | Route parses document kind and checks admin auth. | MRA-E013 |
| 2 | Route rate-limits per admin/IP. | MRA-E013 |
| 3 | Route checks request exists, not deleted, not expired, and has requested storage path. | MRA-E013 |
| 4 | Route creates signed URL, logs `VERIFICATION_DOCUMENT_VIEWED`, sets `Cache-Control: no-store`, and redirects. | MRA-E013 |

Runtime/browser observation gap: controlled Chromium admin-boundary and verification-admin journey coverage passed in MRA-E021, and focused plus combined `chromium-admin` `.admin.spec.ts` admin browser coverage passed in MRA-E025. Ignored admin-host race coverage remains unverified; see MRA-G001 and `runtime-verification.md`.
