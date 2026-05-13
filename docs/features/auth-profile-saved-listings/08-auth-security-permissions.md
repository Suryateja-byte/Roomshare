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
| Registration enumeration defense | Registration returns generic accepted response timing for valid new and existing emails with private no-store route-handler responses; APS-E025 live no-Origin/no-CSRF POST returned 403 JSON with `private, no-cache`. | APS-E006, APS-E019, APS-E025 |
| Password reset enumeration defense | Forgot-password returns generic accepted behavior when no user exists with private no-store route-handler responses; APS-E025 live no-Origin/no-CSRF POST returned 403 JSON with `private, no-cache`. | APS-E007, APS-E019, APS-E025 |
| Token storage | Verification and reset tokens use token hashes and expiration checks. | APS-E006, APS-E007, APS-E008, APS-E009, APS-E016 |
| Auth recovery and favorites cache privacy | Register, forgot-password, reset-password, verify-email, resend-verification, and favorites route-handler responses return private no-store headers. APS-E025 live probes returned `private, no-cache`, leaving live cache-header parity as an APS-G002 residual. | APS-E006, APS-E007, APS-E008, APS-E009, APS-E013, APS-E019, APS-E025 |
| Account deletion confirmation | Settings requires typed confirmation plus password or fresh OAuth session before tombstoning account state. | APS-E015 |

Security verification gap: APS-E018 and APS-E019 verify direct route/action CSRF/status/cache coverage. APS-E025 verifies live HTTP status/CSRF/JSON behavior for the listed routes, but live cache-header parity and external provider runtime checks remain unverified; see APS-G002 and APS-G003.
