# 09 Errors, Empty, Loading, And Edge Cases

| Case | Current behavior | Evidence | Verification gap |
| --- | --- | --- | --- |
| Login bad credentials/rate limit | Login displays generic credential error or rate-limit message and resets Turnstile. | APS-E004, APS-E020 | Focused Chromium browser gate passed; provider Turnstile remains APS-G003. |
| Login open redirect | Login only redirects to callback URLs that start with `/` and not `//`. | APS-E004, APS-E020 | Focused Chromium browser gate passed. |
| Signup terms/password/email errors | Signup blocks missing terms, password shorter than 12, password mismatch, and invalid email before API call. | APS-E005, APS-E020 | Focused Chromium browser gate passed. |
| Duplicate registration | Registration returns accepted response timing rather than leaking existing account state with private no-store route-handler headers. | APS-E006, APS-E019, APS-E025 | Live no-Origin/no-CSRF status/JSON is verified; live cache-header parity remains APS-G002. |
| Missing forgot-password user | Forgot-password returns accepted timing without revealing missing user with private no-store route-handler headers. | APS-E007, APS-E019, APS-E025 | Live no-Origin/no-CSRF status/JSON is verified; live cache-header parity remains APS-G002. |
| Reset token invalid/expired/stale | Reset route returns specific invalid/expired/stale handling with private no-store route-handler headers and consumes tokens transactionally on success. | APS-E008, APS-E019, APS-E025 | Live no-Origin/no-CSRF status/JSON is verified; live cache-header parity remains APS-G002. |
| Verify token invalid/expired/used | Verify route maps missing/malformed/invalid/expired/already-used token cases with private no-store route-handler headers. | APS-E009, APS-E019, APS-E025 | Live no-Origin/no-CSRF status/JSON is verified; live cache-header parity remains APS-G002. |
| Profile edit upload timeout | Profile image upload uses an abort timeout and shows timeout/upload errors. | APS-E011, APS-E020 | Focused Chromium browser gate passed. |
| Saved listings empty | Saved listings client renders empty state with link to `/search`. | APS-E012, APS-E020 | Focused Chromium browser gate passed. |
| Favorites anonymous GET | Favorites GET returns empty saved IDs with private no-store for anonymous users in route-handler scope; APS-E025 live GET returned 200 `{"savedIds":[]}` with `private, no-cache`. | APS-E013, APS-E019, APS-E025 | Live behavior is partially verified; live cache-header parity remains APS-G002. |
| Favorites concurrent create | Favorites POST catches unique-constraint duplicate create and returns idempotent saved true; APS-E025 live no-Origin/no-CSRF POST returned 403 JSON with `private, no-cache`. | APS-E013, APS-E019, APS-E025 | Live CSRF status/JSON is verified; live cache-header parity remains APS-G002. |
| Saved searches empty | Saved searches page renders empty state with link to `/search`. | APS-E014, APS-E020 | Focused Chromium browser gate passed. |
| Saved search limit | Save search transaction locks and rejects when count is at least 10. | APS-E014, APS-E019 | None for action-test scope. |
| Checkout return pending/fail/cancel | Saved search UI polls checkout-session and maps fulfilled, failed, canceled, pending timeout, auth, and not-found states. | APS-E014 | APS-G003, APS-G005 |
| Settings password mismatch/min length | Settings client blocks password mismatch and new password shorter than 12 before action call. | APS-E015, APS-E020 | Focused Chromium browser gate passed. |
| Account delete stale OAuth session | Delete account returns `SESSION_FRESHNESS_REQUIRED` and client signs out to login callback. | APS-E015, APS-E019, APS-E020 | Focused Chromium browser gate passed for covered settings flows; OAuth provider behavior remains APS-G003. |
