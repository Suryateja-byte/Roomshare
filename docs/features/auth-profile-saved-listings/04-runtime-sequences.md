# 04 Runtime Sequences

## Login Sequence

| Step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | Login client collects email, password, and optional Turnstile token. | APS-E004 |
| 2 | Existing session is signed out before credentials sign-in. | APS-E004 |
| 3 | Credentials provider rate-limits email and IP, verifies Turnstile, loads minimal user fields, and compares bcrypt password. | APS-E002 |
| 4 | Auth callbacks seed session/JWT fields and set authTime. | APS-E001 |
| 5 | Login client redirects to a safe relative callback URL or `/`. | APS-E004 |

## Registration And Verification Sequence

| Step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | Signup validates terms, password length/match, and email format. | APS-E005 |
| 2 | Register API validates CSRF, rate limit, Turnstile, and schema. | APS-E006 |
| 3 | API normalizes email, hashes password, creates user and verification token in a transaction, and returns generic accepted response timing. | APS-E006 |
| 4 | Verify-email POST validates token format/hash/expiry and transactionally deletes token plus sets `emailVerified`. | APS-E009 |

## Saved State Sequence

| Step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | `/saved` requires auth and calls `getSavedListings`. | APS-E012 |
| 2 | Saved listings action queries user saved relations and returns listing card data. | APS-E012 |
| 3 | Client sorts locally and remove action deletes the user/listing relation. | APS-E012 |
| 4 | `/api/favorites` GET/POST provide API saved-state read/toggle with private no-store response headers. | APS-E013 |

## Settings Delete Account Sequence

| Step | Runtime behavior documented from source | Evidence |
| --- | --- | --- |
| 1 | Settings client requires typed `DELETE` and password modal before delete action. | APS-E015 |
| 2 | Delete action validates auth, rate limit, password or fresh OAuth session. | APS-E015 |
| 3 | Transaction locks user and owned listings, suppresses reported listings, tombstones/deletes unreported listings, removes account-owned records, clears identity fields, marks user suspended, and returns summary. | APS-E015 |

Runtime/browser observation: the focused Chromium browser gate passed in APS-E020; provider-backed OAuth, Turnstile, email delivery, and saved-search checkout fulfillment remain unverified in APS-G003/APS-G005.
