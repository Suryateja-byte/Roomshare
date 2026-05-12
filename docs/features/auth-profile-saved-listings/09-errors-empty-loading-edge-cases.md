# 09 Errors, Empty, Loading, And Edge Cases

| Case | Current behavior | Evidence | Verification gap |
| --- | --- | --- | --- |
| Login bad credentials/rate limit | Login displays generic credential error or rate-limit message and resets Turnstile. | APS-E004 | APS-G001 |
| Login open redirect | Login only redirects to callback URLs that start with `/` and not `//`. | APS-E004 | APS-G001 |
| Signup terms/password/email errors | Signup blocks missing terms, password shorter than 12, password mismatch, and invalid email before API call. | APS-E005 | APS-G001 |
| Duplicate registration | Registration returns accepted response timing rather than leaking existing account state. | APS-E006 | APS-G002 |
| Missing forgot-password user | Forgot-password returns accepted timing without revealing missing user. | APS-E007 | APS-G002 |
| Reset token invalid/expired/stale | Reset route returns specific invalid/expired/stale handling and consumes tokens transactionally on success. | APS-E008 | APS-G002 |
| Verify token invalid/expired/used | Verify route maps missing/malformed/invalid/expired/already-used token cases. | APS-E009 | APS-G002 |
| Profile edit upload timeout | Profile image upload uses an abort timeout and shows timeout/upload errors. | APS-E011 | APS-G001 |
| Saved listings empty | Saved listings client renders empty state with link to `/search`. | APS-E012 | APS-G001 |
| Favorites anonymous GET | Favorites GET returns empty saved IDs with private no-store for anonymous users. | APS-E013 | APS-G002 |
| Favorites concurrent create | Favorites POST catches unique-constraint duplicate create and returns idempotent saved true. | APS-E013 | APS-G002 |
| Saved searches empty | Saved searches page renders empty state with link to `/search`. | APS-E014 | APS-G001 |
| Saved search limit | Save search transaction locks and rejects when count is at least 10. | APS-E014 | APS-G002 |
| Checkout return pending/fail/cancel | Saved search UI polls checkout-session and maps fulfilled, failed, canceled, pending timeout, auth, and not-found states. | APS-E014 | APS-G003, APS-G005 |
| Settings password mismatch/min length | Settings client blocks password mismatch and new password shorter than 12 before action call. | APS-E015 | APS-G001 |
| Account delete stale OAuth session | Delete account returns `SESSION_FRESHNESS_REQUIRED` and client signs out to login callback. | APS-E015 | APS-G001, APS-G002 |
