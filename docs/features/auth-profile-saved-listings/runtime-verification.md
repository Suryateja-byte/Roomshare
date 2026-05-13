# Auth, Profile, And Saved Listings Runtime Verification

Status: PARTIAL. Focused route/action Jest coverage has run and explicit auth-recovery private no-store headers are verified; browser, provider, and optional live HTTP transport parity remain unverified.

| Verification target | Result | Evidence |
| --- | --- | --- |
| Login/signup/verification/reset browser journeys | NOT RUN | APS-G001 |
| Profile edit and settings browser journeys | NOT RUN | APS-G001 |
| Saved listings/favorites browser journeys | NOT RUN | APS-G001 |
| Saved searches and checkout-return browser journeys | NOT RUN | APS-G001, APS-G003, APS-G005 |
| Direct route/action auth recovery/favorites/cache/CSRF checks | PASS | APS-E018 and APS-E019 pass route-handler CSRF short-circuit assertions for register, forgot-password, reset-password, verify-email, resend-verification, and favorites POST; auth recovery and favorites private no-store assertions; saved-listing, saved-search, and settings action coverage. Optional live HTTP transport parity remains unrun as P2 confidence coverage. |
| Google OAuth, Turnstile, email delivery, and payment checkout provider behavior | NOT RUN | APS-G003 |
| Focused Jest/API/action tests | PASS | APS-E019: 11 suites / 181 tests passed. |

Source-backed verification is recorded in `verification.json`; runtime confidence remains partial until browser/provider checks and any optional live HTTP transport checks are run.
