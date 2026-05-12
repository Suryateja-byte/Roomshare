# 02 User Flows

## Authentication

| Step | Current behavior | Evidence |
| --- | --- | --- |
| Login submit | Login clears stale sessions, calls `signIn("credentials")`, maps errors, resets Turnstile, and redirects to a safe relative callback or `/`. | APS-E004 |
| Credentials verify | Credentials provider validates schema, rate-limits email/IP, verifies Turnstile before DB lookup, loads minimal user fields, and bcrypt-compares password. | APS-E002 |
| Signup submit | Signup requires terms, password length/match, email format, posts to `/api/register`, handles 429 retry messaging, and attempts auto sign-in. | APS-E005 |
| Register API | Registration validates CSRF/rate/Turnstile/schema, performs duplicate-safe timing behavior, creates user and verification token transactionally, and sends welcome email after response path setup. | APS-E006 |
| Google OAuth | Google sign-in is blocked when the profile email is not verified; account linking is enabled with that guard. | APS-E002 |

## Verification And Recovery

| Step | Current behavior | Evidence |
| --- | --- | --- |
| Forgot password | Route validates CSRF/rate/input/Turnstile/email rate, returns generic success for missing users, deletes old tokens, stores a hashed one-hour token, and sends reset email after response path setup. | APS-E007 |
| Reset password | Route validates token/password, token format/hash/expiry/stale user state, consumes token and updates password in one transaction, invalidates password state, and exposes a GET token validity check. | APS-E008 |
| Verify email | Route redirects GET to UI and POST validates CSRF/rate/token/hash/expiry/current token before transactionally deleting token and setting `emailVerified`. | APS-E009 |
| Resend verification | Route requires auth, rate-limits, rejects already verified users, rotates/prepares token, sends verification email, promotes pending token, and reports email-service failure. | APS-E009 |

## Profile, Settings, And Saved State

| Flow | Current behavior | Evidence |
| --- | --- | --- |
| Profile view | Auth-only page selects safe fields and user listings, converts Decimal prices, and renders profile identity/email trust state plus edit/logout and listing cards. | APS-E010 |
| Profile edit | Client uploads profile image, persists draft, manages language list, calls `updateProfile`, clears draft on success, and redirects; action validates auth/suspension/rate/schema/image/languages and revalidates profile paths. | APS-E011 |
| Saved listings | Auth-only page lists saved listings; client sorts, shows empty state, links to search/detail, and removes saved listing through a server action. | APS-E012 |
| Favorites API | GET returns private saved IDs for requested listing IDs; POST toggles favorite state with CSRF/rate/auth/suspension/validation and private no-store response. | APS-E013 |
| Saved searches | Auth-only page lists searches and paywall summary; client handles checkout unlock, alert toggle, delete, and checkout return polling; actions canonicalize filters, enforce limit/rate/access, and upsert alert subscriptions. | APS-E014 |
| Settings | Auth-only page loads preferences and blocked users; client toggles preferences, changes password, unblocks users, and confirms delete; actions validate and persist preferences/password/account deletion state. | APS-E015 |
