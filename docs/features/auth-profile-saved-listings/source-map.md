# Auth, Profile, And Saved Listings Source Map

| Area | Source evidence | Current claim |
| --- | --- | --- |
| Auth.js session and callbacks | APS-E001, APS-E002 | JWT sessions carry user/admin/suspension/email/image/authTime state, refresh selected DB fields, revoke stale password sessions, block unverified Google emails, block suspended users, guard protected/admin paths, and verify credentials with rate limit, Turnstile, and bcrypt. |
| Route helper security | APS-E003 | Route helpers distinguish public, protected, and read-only public endpoints and enforce live suspension/password-revocation checks on protected routes. |
| Login and signup | APS-E004, APS-E005, APS-E006, APS-E019 | Login/sign-up clients handle validation and user feedback; registration API applies CSRF/rate/Turnstile/schema/timing/token/email behavior and private no-store headers. |
| Verification and recovery | APS-E007, APS-E008, APS-E009, APS-E019 | Forgot/reset/verify/resend routes use token hashes, expiration, transactions, generic response behavior where applicable, email side effects, and private no-store headers. |
| Profile | APS-E010, APS-E011 | Profile view selects safe fields; edit validates and updates profile fields/image/languages with auth, suspension, rate limits, draft persistence, and revalidation. |
| Saved listings and favorites | APS-E012, APS-E013 | Saved listing page, server action, and favorites API provide auth-scoped saved-state read/toggle/remove behavior with private no-store API responses. |
| Saved searches | APS-E014 | Saved searches are auth-scoped, canonicalized, capped, alert-aware, paywall-aware, and expose checkout-return polling UI. |
| Settings and account deletion | APS-E015 | Settings supports notification preferences, password change, blocked user management UI, and account deletion/tombstone behavior. |
| Data model | APS-E016 | Prisma models back user identity/session fields, token hashes, saved listing uniqueness, saved search alert fields, blocked users, and audit logs. |
| Tests | APS-E017, APS-E018, APS-E019 | Relevant tests were discovered; focused route/action API tests passed for direct status, CSRF, and private no-store verification while browser/provider coverage remains unrun. |
