# 09 Errors, Empty, Loading, And Edge Cases

| Case | Current behavior | Evidence | Verification gap |
| --- | --- | --- | --- |
| Create while unauthenticated | Page redirects to `/login`; API returns 401 for unauthenticated create. | LM-E001, LM-E005 | None recorded. |
| Suspended or unverified create/update | Create and update APIs return 403 with account/email verification errors. | LM-E005, LM-E011 | Route-handler coverage is partial; live HTTP/curl not run, LM-G002. |
| Incomplete create profile | Create API returns 403 with required/current completion and missing profile fields. | LM-E005 | Route-handler coverage passed; live HTTP/curl not run, LM-E022, LM-G002. |
| Invalid create body | Create API returns 400 with `fields`; client maps field errors and focuses the first error. | LM-E003, LM-E006 | Focused/browser coverage is partial; latest broad Chromium gate is green, LM-E049. |
| Geocode not found | Create/update return 400 address error. | LM-E006, LM-E012 | Route-handler coverage is partial; live HTTP/curl not run, LM-G002. |
| Geocode provider/service error | Create/update return 503 with `Retry-After`. | LM-E006, LM-E012 | Route-handler coverage is partial; live HTTP/curl not run, LM-G002. |
| Invalid image URL | Create/update return 400 for invalid image URLs. | LM-E006, LM-E012 | Route-handler coverage passed for create image validation; live HTTP/curl not run, LM-E022, LM-G002. |
| Upload oversized file | Uploader skips files over 5 MB and shows a size error. | LM-E004 | Latest broad Chromium gate is green; per-file upload reruns were not repeated separately in this slice, LM-E049. |
| Upload partial failure | Create form opens a partial upload dialog unless forced. | LM-E003 | Latest broad Chromium gate is green; per-file upload reruns were not repeated separately in this slice, LM-E049. |
| Collision candidates | Create API returns 409 with siblings; client stores siblings/body and opens collision path. | LM-E003, LM-E007 | Collision helper setup was fixed, the generic limiter masking issue was isolated for dedupe runs, and focused/broad dedupe collision verification passed, LM-E036, LM-E045, LM-E046, LM-E047, LM-E049, LM-G006. |
| Collision rate limit | Create API returns 429 with `LISTING_CREATE_COLLISION_RATE_LIMITED`. | LM-E007 | Collision-specific moderation 429 remains covered after dedupe tests bypass only the non-production generic create-listing limiter; focused dedupe verification and broad gate passed, LM-E046, LM-E047, LM-E049. |
| Max active listings | Create API returns 400 when active/paused owner listing count is at least 10. | LM-E007 | Route-handler coverage passed; live HTTP/curl not run, LM-E022, LM-G002. |
| Version conflict | PATCH/status paths return version conflict behavior when expected version differs. | LM-E009, LM-E011, LM-E012, LM-E015 | Listing-edit/status browser coverage now passes for current visible flows; direct API/action tests passed, LM-E021, LM-E022, LM-E043, LM-G001. |
| Moderation lock | PATCH/status paths return lock behavior for host writes against locked status reasons. | LM-E011, LM-E012, LM-E015, LM-E018 | Direct API/action coverage passed where included; current listing-edit/status browser flows pass, LM-E021, LM-E022, LM-E043, LM-G001. |
| Delete confirmation | DELETE requires password for password accounts or fresh OAuth session for accounts without password. | LM-E013 | Route-handler coverage passed, and browser delete preflight/password-modal cancel coverage passed; live HTTP/curl final-delete route check not run, LM-E022, LM-E043, LM-G002. |
| Reported listing delete | DELETE suppresses instead of hard-deleting when reports exist. | LM-E013 | Route-handler coverage passed; live HTTP/curl not run, LM-E022, LM-G002. |
| Storage cleanup failure | Image cleanup failures are logged but do not roll back edit/delete success. | LM-E012, LM-E013 | Provider runtime not run, LM-G005. |
