# 07 State Management

| State area | Owner | Current behavior | Evidence |
| --- | --- | --- | --- |
| Report state | Reports API and admin report actions | Reports start as `OPEN`, can become `RESOLVED` or `DISMISSED`, store admin notes/reviewer/resolvedAt, and private-feedback target fields. | MRA-E002, MRA-E008, MRA-E009, MRA-E015 |
| Listing moderation state | Admin listing actions | Listing status/statusReason/version are updated under row lock; `SUPPRESSED` and `ADMIN_PAUSED` participate in moderation locks. | MRA-E006, MRA-E007, MRA-E014 |
| Search/listing projection state | Admin listing/report actions | Listing moderation writes mark listings dirty and sync lifecycle projections. | MRA-E006, MRA-E007, MRA-E009 |
| Admin page filter state | Admin pages and client lists | Pages parse search/status/kind/page filters and pass initial data/page state to client list components. | MRA-E010, MRA-E011 |
| Verification state | Verification actions | Requests move through `PENDING`, `APPROVED`, `REJECTED`; uploads are consumed by request ID; request rows are locked for review. | MRA-E012, MRA-E015 |
| Verification document availability | Admin verification page and document route | Server maps private paths/expiry/deleted status to booleans and document route rechecks availability before signed URL redirect. | MRA-E011, MRA-E013 |
| Audit state | Audit helper | Admin actions attempt to persist immutable audit rows, but audit write failure does not abort the admin operation. | MRA-E004 |
