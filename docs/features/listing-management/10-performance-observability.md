# 10 Performance And Observability

| Area | Current behavior | Evidence |
| --- | --- | --- |
| Create rate limiting | Create API applies IP-level and per-user create-listing rate limits. | LM-E005 |
| Create transaction serialization | Create API uses a per-user PostgreSQL advisory transaction lock before counting active/paused listings and creating a listing. | LM-E007 |
| Create transaction timeout | Non-idempotent create uses a Prisma transaction timeout of 15000 ms. | LM-E007 |
| Update row locks | PATCH and status actions use `FOR UPDATE` row locks before version-sensitive writes. | LM-E011, LM-E012, LM-E015 |
| Delete row lock | DELETE uses `FOR UPDATE` before ownership/delete/suppress decisions. | LM-E013 |
| Search freshness | Create/update/status/delete paths mark listing search state dirty and sync canonical/lifecycle projections where applicable. | LM-E007, LM-E011, LM-E012, LM-E013, LM-E015 |
| Post-create search sync | Create fires synchronous search doc upsert, optional semantic embedding, and instant alerts after transaction success. | LM-E007 |
| Logging | Create logs metadata, geocode/listing issues, and create success; delete logs suppression and storage cleanup failures. | LM-E005, LM-E006, LM-E007, LM-E013 |
| Sentry | Client upload/edit paths and route errors capture exceptions in Sentry where implemented. | LM-E004, LM-E009, LM-E010, LM-E014 |

Observability gap: no log/trace capture or browser performance run was executed for this documentation pass; see `runtime-verification.md`.
