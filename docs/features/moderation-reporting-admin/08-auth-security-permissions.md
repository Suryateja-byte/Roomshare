# 08 Auth, Security, And Permissions

| Control | Current behavior | Evidence |
| --- | --- | --- |
| Report CSRF/rate/auth | Report creation validates CSRF, rate limit, auth, JSON, and schema. | MRA-E001 |
| Report abuse controls | Report creation blocks suspended users, self-reports, invalid listings, duplicate active reports, and private-feedback abuse states. | MRA-E002 |
| Admin auth | Admin helper checks session, DB admin flag, and suspended status. | MRA-E003 |
| Admin write rate limits | User/listing/report/verification admin writes use admin write or admin delete rate limits. | MRA-E005, MRA-E006, MRA-E007, MRA-E008, MRA-E009, MRA-E012 |
| Admin self-action prevention | Admin user actions prevent self-demotion and self-suspension. | MRA-E005 |
| Row locks | Listing/report/verification admin state changes use `FOR UPDATE` where version or state races matter. | MRA-E006, MRA-E007, MRA-E008, MRA-E009, MRA-E012 |
| Verification document privacy | Admin page exposes booleans rather than document paths; document route checks admin, rate, expiry/deletion/path, and redirects to signed URL with no-store. | MRA-E011, MRA-E013 |
| Auditability | Admin actions and document views write audit log attempts with action, target, and details. | MRA-E004, MRA-E005, MRA-E006, MRA-E007, MRA-E008, MRA-E009, MRA-E012, MRA-E013 |

Security verification gap: direct HTTP CSRF/status/cache and signed URL checks were not run in this pass; see MRA-G002.
