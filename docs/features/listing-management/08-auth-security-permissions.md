# 08 Auth, Security, And Permissions

| Security control | Current behavior | Evidence |
| --- | --- | --- |
| Create page auth | `/listings/create` redirects unauthenticated users to `/login`. | LM-E001 |
| Create API CSRF and rate limit | `POST /api/listings` validates CSRF and applies create listing rate limits before auth/user processing. | LM-E005 |
| Create API account gates | `POST /api/listings` requires auth, non-suspended account, verified email, existing user, and profile completion threshold. | LM-E005 |
| Create API validation | `POST /api/listings` validates schema, language policy, geocode result, and image URL ownership before writing. | LM-E006 |
| Create API privacy logging | Create route logs metadata and avoids logging the full request body. | LM-E005 |
| Edit page ownership | `/listings/[id]/edit` redirects non-owners to public listing detail. | LM-E008 |
| PATCH gates | `PATCH /api/listings/[id]` validates CSRF, rate limit, auth, suspension, email verification, JSON body, and owner before mutation. | LM-E011 |
| PATCH write locks | Host-managed availability and profile PATCH paths enforce moderation write lock and expected version after row lock. | LM-E011, LM-E012, LM-E018 |
| DELETE gates | `DELETE /api/listings/[id]` validates CSRF, rate limit, auth, password or session freshness, row lock, and ownership. | LM-E013 |
| Image path ownership | Create and profile update reject image URLs outside the owner listing path for new images. | LM-E006, LM-E012 |
| Idempotency replay safety | Create route validates idempotency key format and uses user/endpoint/key scoped idempotency storage. | LM-E007, LM-E017 |

Security test status: direct API route-handler/security tests and CSRF helper tests passed; live route-level CSRF/status/header checks were not run in this documentation pass. See LM-E022 and LM-G002.
