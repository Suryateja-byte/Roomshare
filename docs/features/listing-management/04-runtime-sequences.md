# 04 Runtime Sequences

## Create Listing Sequence

| Sequence step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | Server page authenticates and renders the create form for authenticated users. | LM-E001 |
| 2 | Client form keeps draft state and a navigation guard active while work exists. | LM-E002 |
| 3 | Image uploader posts files to `/api/upload` and stores uploaded URLs or per-image errors. | LM-E004 |
| 4 | Client submit checks uploading/zero-image/partial-failure states and validates fields/language before network submit. | LM-E003 |
| 5 | Client posts to `/api/listings` with JSON and `X-Idempotency-Key`. | LM-E003 |
| 6 | API applies CSRF, rate, auth, suspension, email, profile, schema, language, geocode, and image ownership checks. | LM-E005, LM-E006 |
| 7 | API transaction serializes per-user creates, enforces active-listing cap, detects collision candidates, writes listing/location/PostGIS, syncs canonical availability, and marks search dirty. | LM-E007 |
| 8 | API wraps the create path in idempotency when a valid key is present and only runs side effects for non-cached creates. | LM-E007 |
| 9 | Client handles `409 COLLISION_CANDIDATES`, field errors, or success redirect. | LM-E003 |

## Edit Listing Sequence

| Sequence step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | Server page authenticates, fetches listing/location, and verifies owner. | LM-E008 |
| 2 | Edit form submits either host-managed availability or listing profile payloads to `PATCH /api/listings/[id]`. | LM-E009, LM-E010 |
| 3 | PATCH applies CSRF, rate, auth, suspension, email, ownership, schema/date/language/image validation. | LM-E011, LM-E012 |
| 4 | PATCH row-locks the listing, enforces moderation write lock and expected version, then updates listing/location/canonical availability/search dirty state. | LM-E011, LM-E012, LM-E018 |
| 5 | Client handles lock/version/field errors, preserves draft where implemented, and redirects or refreshes on success. | LM-E009, LM-E010 |

## Delete Sequence

| Sequence step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | DELETE validates CSRF, rate limit, auth, password or fresh OAuth session. | LM-E013 |
| 2 | DELETE row-locks the listing and checks owner. | LM-E013 |
| 3 | Reported listings are paused with `SUPPRESSED`; unreported listings are tombstoned and deleted. | LM-E013 |
| 4 | Image cleanup runs outside the transaction on a best-effort basis. | LM-E013 |

Runtime/browser observation: listing-edit/status/delete browser coverage is present and passing for the current host-managed UI, and the latest selected create/listing-edit/dedupe Chromium browser session passed with 117 passed and 2 skipped after LM-G006 focused diagnosis. See LM-G001, LM-G006, LM-E043, LM-E049, and `runtime-verification.md`.
