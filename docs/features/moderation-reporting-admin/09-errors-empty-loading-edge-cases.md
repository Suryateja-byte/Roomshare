# 09 Errors, Empty, Loading, And Edge Cases

| Case | Current behavior | Evidence | Verification gap |
| --- | --- | --- | --- |
| Report invalid request | Returns 400 with flattened field errors for schema validation. | MRA-E001, MRA-E019 | MRA-G002 for optional live-server parity |
| Report unauthenticated | Returns 401. | MRA-E001, MRA-E019 | MRA-G002 for optional live-server parity |
| Report suspended user | Returns 403 with `ACCOUNT_SUSPENDED`; private-feedback denial is recorded. | MRA-E002, MRA-E019 | MRA-G002 for optional live-server parity; MRA-G003 for telemetry runtime |
| Self report | Returns 400 and records private-feedback denial when applicable. | MRA-E002, MRA-E019 | MRA-G002 for optional live-server parity |
| Private feedback disabled/unverified/invalid target/no prior conversation | Returns 403 or 400 depending on gate failure and records denial telemetry. | MRA-E002, MRA-E019 | MRA-G002 for optional live-server parity; MRA-G003 for telemetry runtime |
| Duplicate active report | Returns 409 duplicate response. | MRA-E001, MRA-E002, MRA-E019 | MRA-G002 for optional live-server parity |
| Admin not logged in/not admin/suspended | Admin auth returns structured errors and pages redirect. | MRA-E003, MRA-E010, MRA-E011 | MRA-G001 |
| Listing version conflict | Admin status/unsuppress actions return version conflict when expected version is stale. | MRA-E006, MRA-E007 | MRA-G001 |
| Direct activate moderation-locked listing | Admin status update returns `LISTING_REQUIRES_UNSUPPRESS`. | MRA-E006 | MRA-G001 |
| Report already reviewed | Report actions return `STATE_CONFLICT`. | MRA-E008, MRA-E009 | MRA-G001 |
| Verification document unavailable/expired | Approval returns `DOCUMENT_UNAVAILABLE`; document route returns 410/404 depending on deleted/expired/unavailable state. | MRA-E012, MRA-E013, MRA-E019 | MRA-G002 for optional live-server parity |
| Verification rejection empty/invalid reason | Reject action validates reason with length/no-HTML requirements and client warns on empty reason. | MRA-E011, MRA-E012 | MRA-G001 |
| Audit write failure | Audit helper logs error and does not throw. | MRA-E004 | MRA-G005 |
