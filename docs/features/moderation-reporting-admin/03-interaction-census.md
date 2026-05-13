# 03 Interaction Census

This file is the final-form copy of `interaction-census.md`.

| Interaction | Primary state owner | Current behavior | Evidence | Gap |
| --- | --- | --- | --- | --- |
| Abuse/private-feedback report submit | Reports API | Validates schema, auth, account state, listing owner, private-feedback gates, duplicates, creates report, and invokes local telemetry helpers. | MRA-E001, MRA-E002, MRA-E019, MRA-E020 | MRA-G002 for optional live-server parity; MRA-G003 only for provider/runtime residual proof |
| Admin user action | Admin action | Requires admin, rate-limits write, prevents self-demotion/self-suspension, updates user, audits, revalidates. | MRA-E003, MRA-E005 | MRA-G001 |
| Admin listing status/update | Admin action | Row-locks listing, checks version/lock, updates status/reason, dirty/lifecycle projection, audits, revalidates. | MRA-E006, MRA-E014 | MRA-G001 |
| Admin listing delete | Admin action | Row-locks listing, suppresses if reports exist, tombstones/deletes otherwise, audits, revalidates. | MRA-E007 | MRA-G001 |
| Admin report resolution | Admin action | Row-locks report, enforces open-state, updates report, optionally suppresses listing, audits, revalidates. | MRA-E008, MRA-E009 | MRA-G001 |
| Verification review | Verification action | Row-locks request, validates state/document/reason, updates request/user, invokes notification helper, audits, revalidates. | MRA-E012, MRA-E020 | MRA-G001; MRA-G003 only for real provider delivery, inbox/bounce/webhook, and provider observability/runtime proof |
| Document view | Admin document route | Admin-only, rate-limited, availability-checked signed URL redirect with audit log and no-store. | MRA-E013, MRA-E019 | MRA-G002 for optional live-server parity |
