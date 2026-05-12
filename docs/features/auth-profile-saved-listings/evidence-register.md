# Auth, Profile, And Saved Listings Evidence Register

Status date: 2026-05-10.

| Evidence ID | Type | Source | What it supports |
| --- | --- | --- | --- |
| APS-E001 | Source | `src/auth.ts:18-185` | Minimal user select, Auth.js config, JWT session strategy, token cleanup on OAuth link, session field forwarding, JWT DB refresh, authTime, password-change revocation. |
| APS-E002 | Source | `src/auth.ts:186-324` | Google verified-email sign-in guard, suspension check for all providers, protected/admin/auth page authorization, Google account linking safety comment, credentials schema, email/IP rate limit, Turnstile before DB lookup, bcrypt compare. |
| APS-E003 | Source | `src/lib/auth-helpers.ts:16-276` | Public/protected/read-only route definitions, suspension response, password-changed redirect, live suspension cache/query, protected route suspension check, read-only allowance, password revocation redirect, Google email verification helper. |
| APS-E004 | Source | `src/app/login/LoginClient.tsx:33-129` | Login state, OAuth error focus, credentials submit, stale-session sign-out, sign-in error mapping, Turnstile reset, safe callback redirect. |
| APS-E005 | Source | `src/app/signup/SignUpClient.tsx:32-147` | Signup state, terms requirement, password length/match, email format validation, `/api/register` request, rate-limit error handling, auto sign-in fallback. |
| APS-E006 | Source | `src/app/api/register/route.ts:15-227` | Registration schema, generic accepted response timing, duplicate detection, CSRF/rate/Turnstile, input validation, normalized email, bcrypt hash, user plus verification token transaction, background welcome email. |
| APS-E007 | Source | `src/app/api/auth/forgot-password/route.ts:52-182` | Forgot-password CSRF/rate/provider guard, input validation, Turnstile, email rate limit, generic no-user response, token deletion/create, one-hour token, background email, errors. |
| APS-E008 | Source | `src/app/api/auth/reset-password/route.ts:15-95`, `src/app/api/auth/reset-password/route.ts:142-264` | Reset password schema, token validation, expiry/stale/user checks, POST CSRF/rate/input/token format/transaction consume and update, password-state invalidation, GET token validation. |
| APS-E009 | Source | `src/app/api/auth/verify-email/route.ts:60-216`, `src/app/api/auth/resend-verification/route.ts:19-118` | Email verification redirect/POST CSRF/rate/token format/hash/expiry/transaction, verification statuses, resend auth/rate/email verified check/token rotation/email/promotion. |
| APS-E010 | Source | `src/app/profile/page.tsx:13-61`, `src/app/profile/ProfileClient.tsx:21-170`, `src/app/profile/ProfileClient.tsx:215-310` | Profile auth gate, safe selected fields, price conversion, profile/listing card fields, edit/logout handlers, trust/email/identity display. |
| APS-E011 | Source | `src/app/actions/profile.ts:21-153`, `src/app/profile/edit/EditProfileClient.tsx:72-201` | Profile validation schema, language sanitization/dedup/max, update auth/suspension/rate/update/revalidate, getProfile safe select, edit upload to `/api/upload`, draft persistence, language edit, submit/clear/redirect. |
| APS-E012 | Source | `src/app/saved/page.tsx:11-23`, `src/app/saved/SavedListingsClient.tsx:20-275`, `src/app/actions/saved-listings.ts:14-202` | Saved page auth, saved listing fetch/price conversion, sort/remove/empty/card UI, ID validation, auth/rate/suspension, atomic toggle, saved lookup, list query, remove/revalidate. |
| APS-E013 | Source | `src/app/api/favorites/route.ts:18-171` | Favorites GET rate/auth optional/private no-store/query validation, POST CSRF/rate/auth/suspension/JSON/Zod/toggle, P2002 idempotency, private no-store responses. |
| APS-E014 | Source | `src/app/saved-searches/page.tsx:18-78`, `src/app/saved-searches/SavedSearchList.tsx:70-376`, `src/app/actions/saved-search.ts:29-375` | Saved searches auth, paywall summary, empty/list UI, checkout unlock, alert toggle, delete, checkout polling statuses, canonical filter schema, mutation access/rate, save limit lock, alert subscription create/upsert, list parse, delete/toggle/rename. |
| APS-E015 | Source | `src/app/settings/page.tsx:14-63`, `src/app/settings/SettingsClient.tsx:46-161`, `src/app/settings/SettingsClient.tsx:196-507`, `src/app/actions/settings.ts:45-500` | Settings auth, preferences/password/delete/block UI state, notification preferences read/update, change password, verify password, password existence, delete account validation, row locks, listing suppression/delete, account tombstone, settings fetch. |
| APS-E016 | Schema | `prisma/schema.prisma:42-105`, `prisma/schema.prisma:159-169`, `prisma/schema.prisma:397-430`, `prisma/schema.prisma:516-545` | User, verification token, password reset token, SavedListing, SavedSearch, AlertSubscription, BlockedUser, and AuditLog schema fields/indexes. |
| APS-E017 | Test inventory | 2026-05-10 command `rg --files tests/e2e src/__tests__ \| rg '(auth|login|signup|profile|settings|saved|favorites|saved-search|session-expiry|UserProfilePage)'` | Existing auth/profile/settings/saved/favorites/saved-search/session-expiry tests were discovered. They were not executed in this pass. |

## Gap IDs

| Gap ID | Severity | Description | Evidence |
| --- | --- | --- | --- |
| APS-G001 | P1 | Full browser auth/profile/settings/saved-listings/saved-searches suite was not executed in this documentation pass. | APS-E017 |
| APS-G002 | P1 | Direct HTTP status/cache/header/CSRF checks for auth recovery, favorites, and account actions were not executed in this pass. | APS-E006, APS-E007, APS-E008, APS-E009, APS-E013, APS-E015 |
| APS-G003 | P1 | External provider runtime behavior for Google OAuth, Turnstile, email delivery, and checkout return was not verified in this pass. | APS-E002, APS-E004, APS-E005, APS-E006, APS-E007, APS-E009, APS-E014 |
| APS-G004 | P2 | Account deletion data-retention expectations require product/legal confirmation beyond source behavior. | APS-E015, APS-E016 |
| APS-G005 | P2 | Saved-search alert paywall/checkout behavior is source-observed but not payment-runtime verified in this pass. | APS-E014 |
