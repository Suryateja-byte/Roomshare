# 08 Auth, Security, And Permissions

| Control | Current behavior | Evidence |
| --- | --- | --- |
| Minimal auth user lookup | Credentials auth selects only fields required for auth/session seeding. | APS-E001 |
| JWT session hardening | Session max age is 14 days, authTime is recorded on sign-in, and password changes can invalidate stale sessions. | APS-E001, APS-E003 |
| OAuth token minimization | OAuth tokens are cleared after account link where possible. | APS-E001 |
| Google verified email guard | Google OAuth is blocked when `email_verified` is not exactly true. | APS-E002, APS-E003 |
| Credentials abuse controls | Credentials login rate-limits email/IP and verifies Turnstile before DB lookup. | APS-E002 |
| Protected path authorization | Protected account paths include `/settings`, `/profile`, `/saved`, `/saved-searches`, and related paths; admin routes require admin and non-suspended session. | APS-E002 |
| Suspension enforcement | Auth helper blocks protected routes for suspended users while allowing read-only public listing GETs. | APS-E003 |
| Registration enumeration defense | Registration returns generic accepted response timing for valid new and existing emails. | APS-E006 |
| Password reset enumeration defense | Forgot-password returns generic accepted behavior when no user exists. | APS-E007 |
| Token storage | Verification and reset tokens use token hashes and expiration checks. | APS-E006, APS-E007, APS-E008, APS-E009, APS-E016 |
| Favorites cache privacy | Favorites API returns private no-store responses for saved-state reads and writes. | APS-E013 |
| Account deletion confirmation | Settings requires typed confirmation plus password or fresh OAuth session before tombstoning account state. | APS-E015 |

Security verification gap: APS-E018 reduces direct route/action CSRF/status/cache coverage, but auth recovery explicit no-store headers, live HTTP transport parity, and external provider runtime checks remain unverified; see APS-G002 and APS-G003.
