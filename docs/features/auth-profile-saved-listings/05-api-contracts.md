# 05 API And Action Contracts

| Contract | Current behavior | Evidence |
| --- | --- | --- |
| `POST /api/register` | CSRF, register rate limit, Turnstile, schema, duplicate-safe timing, normalized email, bcrypt hash, user plus verification token transaction, background welcome email, generic accepted response. | APS-E006 |
| Auth.js credentials provider | Email/password/Turnstile schema, email/IP rate limits, Turnstile before DB lookup, minimal user select, bcrypt compare. | APS-E002 |
| `POST /api/auth/forgot-password` | CSRF, IP/email rate limits, production email-provider guard, input validation, Turnstile, generic missing-user response, hashed one-hour token, background email. | APS-E007 |
| `GET/POST /api/auth/reset-password` | GET validates token presence/format/hash; POST validates CSRF/rate/schema/token format, consumes reset token and updates password in transaction, invalidates password state. | APS-E008 |
| `GET/POST /api/auth/verify-email` | GET redirects to verification UI; POST validates CSRF/rate/token/hash/expiry/current token and transactionally deletes token plus sets `emailVerified`. | APS-E009 |
| `POST /api/auth/resend-verification` | CSRF/rate/auth/user lookup/already-verified checks, token rotation, email send, pending-token cleanup/promotion, success response. | APS-E009 |
| `updateProfile` | Auth, suspension, profile-update rate limit, schema validation, user update, and profile/user route revalidation. | APS-E011 |
| `toggleSaveListing`, `getSavedListings`, `removeSavedListing` | ID validation where mutating, auth, rate limit for toggle, suspension check for mutations, transaction toggle, selected listing data, delete relation, revalidation. | APS-E012 |
| `GET/POST /api/favorites` | GET rate limit/auth optional/query validation/private no-store; POST CSRF/rate/auth/suspension/JSON/Zod/toggle/P2002 idempotent success/private no-store. | APS-E013 |
| Saved-search actions | Auth, suspension, mutation rate limit, canonical filter storage, user limit advisory lock, alert subscription create/upsert, paywall-derived effective state, delete/toggle/rename, revalidation. | APS-E014 |
| Settings actions | Notification preference schema/update, password change with rate/current-password/new length/token cleanup/password invalidation, verify password, password presence, account delete with password/fresh session/row locks/tombstone cleanup. | APS-E015 |

Focused route/action status and CSRF checks passed in APS-E018 for register, auth recovery, resend/verify email, favorites, saved-listing, saved-search, and settings coverage; favorites private no-store headers are asserted. Auth recovery explicit no-store headers, live HTTP transport parity, provider failures, and checkout return remain unverified; see APS-G002 and APS-G003.
