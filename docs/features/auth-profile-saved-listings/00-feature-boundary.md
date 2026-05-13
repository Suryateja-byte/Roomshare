# Auth, Profile, And Saved Listings Feature Boundary

| Scope area | Included current behavior | Evidence |
| --- | --- | --- |
| Session and auth callbacks | Auth.js uses JWT sessions, 14-day max age, token refresh, session field forwarding, password-change revocation checks, Google verified-email guard, suspension guard, protected-path authorization, and credentials login with email/IP rate limit, Turnstile, and bcrypt. | APS-E001, APS-E002 |
| Route suspension/password protection | Middleware helpers define public/protected paths, allow read-only public listing GETs, block suspended users on protected routes, check live suspension state, and redirect password-invalidated sessions to login. | APS-E003 |
| Login UI | Login handles existing session sign-out, credentials sign-in, rate-limit messaging, Turnstile token reset, OAuth error focus, and safe relative callback redirects. | APS-E004 |
| Signup UI and registration API | Signup requires terms, password length/match, email format, Turnstile token, and posts to `/api/register`; registration validates input, CSRF, rate limit, Turnstile, duplicate timing, bcrypt hash, user/token transaction, background welcome email, and private no-store responses. | APS-E005, APS-E006, APS-E019 |
| Email verification and password recovery | Forgot/reset/verify/resend routes use CSRF or rate limits as applicable, token hashes, expiration checks, transactions, generic responses where needed, background email sending, and private no-store responses. | APS-E007, APS-E008, APS-E009, APS-E019 |
| Profile view/edit | `/profile` is auth-only and selects safe user/listing fields; profile edit/upload/update validates fields, profile image URL, language limits, rate limit, suspension, revalidation, and draft persistence. | APS-E010, APS-E011 |
| Saved listings and favorites | `/saved` is auth-only, renders sortable saved listings, supports remove, and server actions/API enforce auth, ID validation, rate limits, suspension checks, atomic toggle, unique saved-listing relation, private no-store cache. | APS-E012, APS-E013, APS-E016 |
| Saved searches and alerts | `/saved-searches` is auth-only, lists saved searches, handles empty state, checkout unlock, alert toggles, delete, checkout return polling, canonical filter storage, save limit lock, alert subscription upsert, and paywall-derived effective state. | APS-E014, APS-E016 |
| Settings | `/settings` is auth-only and exposes notification preferences, password change, blocked users, and account deletion; actions validate auth/rate/password/fresh session, tombstone account data, suppress/delete owned listings, and clean account-owned records. | APS-E015, APS-E016 |

## Out Of Scope

| Area | Reason | Evidence |
| --- | --- | --- |
| Admin moderation and verification review | Admin behavior is documented in `moderation-reporting-admin`, not this account package. | APS-E017 |
| Listing create/edit management | Host listing mutations are documented in `listing-management`, not this account package. | APS-E017 |
| Search/map result behavior | Search UX is documented in `search-map`; this package only includes saved-listing/favorite state and saved-search account surfaces. | APS-E012, APS-E013, APS-E014 |

## Unknowns

| Unknown | Severity | Evidence |
| --- | --- | --- |
| Full browser auth/profile/settings/saved-listings/saved-searches suite was not run in this documentation pass. | P1 | APS-G001 |
| Direct route/action checks for auth recovery, favorites, saved-search actions, settings actions, CSRF variants, and private no-store headers are verified by APS-E018 and APS-E019. Optional live HTTP transport parity remains unrun. | P2 | APS-G002 |
| External provider behavior for Google OAuth, Turnstile, email delivery, and checkout return was not runtime verified in this pass. | P1 | APS-G003 |
