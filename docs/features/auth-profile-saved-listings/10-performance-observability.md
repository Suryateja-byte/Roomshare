# 10 Performance And Observability

| Area | Current behavior | Evidence |
| --- | --- | --- |
| Login rate limits | Credentials auth checks email and IP rate limits before Turnstile and DB lookup. | APS-E002 |
| Registration timing | Registration accepted responses enforce a minimum delay plus jitter for valid accepted attempts. | APS-E006 |
| Forgot-password timing | Forgot-password uses accepted timing for missing users and sends emails asynchronously after token creation. | APS-E007 |
| Saved search limit race control | Save search acquires a user-specific advisory transaction lock before counting saved searches. | APS-E014 |
| Account deletion race control | Delete account locks user and owned listing rows before suppression/delete/tombstone work. | APS-E015 |
| Cache privacy | Favorites API marks route-handler saved-state responses `private, no-store`; APS-E025 live probes observed `private, no-cache`, leaving live cache-header parity as APS-G002 residual. | APS-E013, APS-E019, APS-E025 |
| Logging | Auth/register/recovery/profile/saved/settings actions log security and failure events with sanitized or reduced context where implemented. | APS-E001, APS-E002, APS-E006, APS-E007, APS-E008, APS-E009, APS-E011, APS-E012, APS-E014, APS-E015 |
| Sentry | Reset/verify/resend and other error paths capture exceptions where implemented. | APS-E008, APS-E009 |

Observability gap: no runtime log, metrics, email delivery, OAuth, Turnstile, or checkout trace was captured in this pass; see APS-G003.
