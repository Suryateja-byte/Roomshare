# 10 Performance And Observability

| Area | Current behavior | Evidence |
| --- | --- | --- |
| Report rate limit | Report API uses create-report rate limiting before auth body handling completes. | MRA-E001 |
| Admin write/delete rate limits | Admin user/listing/report/verification writes use admin write or delete rate-limit buckets. | MRA-E005, MRA-E006, MRA-E007, MRA-E008, MRA-E009, MRA-E012 |
| Document view rate limit | Verification document route rate-limits per admin/IP. | MRA-E013 |
| Row-lock race control | Listing/report/verification state transitions use `FOR UPDATE` before critical writes. | MRA-E006, MRA-E007, MRA-E008, MRA-E009, MRA-E012 |
| Projection freshness | Listing moderation writes mark search dirty and sync lifecycle projection. | MRA-E006, MRA-E007, MRA-E009 |
| Audit logs | Admin actions and document views attempt to write audit records with action/target/details/IP where available. | MRA-E004, MRA-E005, MRA-E006, MRA-E007, MRA-E008, MRA-E009, MRA-E012, MRA-E013 |
| Logging | Admin/report/verification actions log failure paths with action context. | MRA-E004, MRA-E005, MRA-E006, MRA-E007, MRA-E008, MRA-E009, MRA-E012, MRA-E013 |

Observability gap: local mocked telemetry invocation is verified by MRA-E020, but provider telemetry/observability runtime and audit-failure runtime capture were not executed in this pass; see MRA-G003 and MRA-G005.
