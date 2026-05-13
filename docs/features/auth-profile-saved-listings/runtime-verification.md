# Auth, Profile, And Saved Listings Runtime Verification

Status: PARTIAL. Focused route/action Jest coverage has run, explicit auth-recovery private no-store headers are verified, the focused Chromium browser gate passed in APS-E020, local/mocked provider-adjacent checks passed in APS-E021 through APS-E024, and APS-E025 verified partial live HTTP transport behavior. Real Google, Cloudflare, Resend, and Stripe provider runtime checks remain unverified, and live cache-header parity remains residual because APS-E025 observed `Cache-Control: private, no-cache` instead of the route-handler/direct-test `private, no-store` expectation.

| Verification target | Result | Evidence |
| --- | --- | --- |
| Login/signup/verification/reset browser journeys | PASS | APS-E020 passed the focused Chromium auth browser gate. |
| Profile edit and settings browser journeys | PASS | APS-E020 passed the focused Chromium profile/settings browser gate after a bounded settings-client hydration reload guard stabilized settings password/preference paths. |
| Saved listings/favorites browser journeys | PASS | APS-E020 passed the focused Chromium saved-listing/favorites browser gate. |
| Saved searches browser journeys | PASS WITH PROVIDER RESIDUAL | APS-E020 passed saved-search list/delete/search browser coverage after a saved-search-list hydration wait. APS-E024 passed local mocked saved-search checkout route/session/component coverage. Real Stripe provider fulfillment remains APS-G003/APS-G005. |
| Direct route/action auth recovery/favorites/cache/CSRF checks | PASS WITH LIVE CACHE RESIDUAL | APS-E018 and APS-E019 pass route-handler CSRF short-circuit assertions for register, forgot-password, reset-password, verify-email, resend-verification, and favorites POST; auth recovery and favorites private no-store assertions; saved-listing, saved-search, and settings action coverage. APS-E025 live HTTP probes verified no-Origin/no-CSRF POST responses returned 403 JSON for register, forgot-password, reset-password, verify-email, resend-verification, and favorites POST, and unauthenticated favorites GET returned 200 with `{"savedIds":[]}`. Live cache header parity remains residual because all observed live probes returned `Cache-Control: private, no-cache`. |
| Local/mocked Google OAuth guard, account linking, Turnstile, email scheduling/token, and saved-search checkout paths | PASS | APS-E021, APS-E022, APS-E023, and APS-E024 passed the focused 11-suite / 200-test provider-adjacent command. |
| Real Google IdP OAuth, Cloudflare Turnstile siteverify, Resend delivery/inbox receipt, and Stripe hosted checkout/webhook/provider fulfillment | NOT RUN | APS-G003, APS-G005 |
| Focused Jest/API/action tests | PASS | APS-E019 and APS-E025 baseline command: 11 suites / 181 tests passed. APS-E021 through APS-E024: 11 suites / 200 tests passed. |

Source-backed verification is recorded in `verification.json`; runtime confidence remains partial until real provider checks are run and the APS-E025 live cache-header residual is resolved or explicitly accepted.
