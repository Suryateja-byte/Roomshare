# 12 Gaps, Unknowns, And Questions

| ID | Severity | Status | Gap or unknown | Evidence |
| --- | --- | --- | --- | --- |
| APS-G001 | P1 | Closed | Full browser auth/profile/settings/saved-listings/saved-searches Chromium gate passed. | APS-E017, APS-E020 |
| APS-G002 | P2 | PARTIAL LIVE TRANSPORT PARITY | Focused route/action commands verify status paths, CSRF short-circuiting for register/auth-recovery/favorites mutation routes, auth recovery and favorites private no-store headers, and saved-listing/saved-search/settings action behavior. APS-E025 live HTTP probes verify no-Origin/no-CSRF POST status/JSON behavior for register, forgot-password, reset-password, verify-email, resend-verification, and favorites POST, plus unauthenticated favorites GET `{"savedIds":[]}` behavior. Live cache-header parity remains residual because observed live responses returned `Cache-Control: private, no-cache`, not the route-handler/direct-test `private, no-store` expectation. | APS-E006, APS-E007, APS-E008, APS-E009, APS-E013, APS-E015, APS-E018, APS-E019, APS-E025 |
| APS-G003 | P2 | REDUCED TO REAL-PROVIDER RESIDUAL | Local/mocked provider-adjacent checks passed for Google OAuth/Auth.js guards and account linking, Turnstile helper/route integration, auth email scheduling/token routes, and saved-search checkout route/session/component behavior. Real Google IdP OAuth, Cloudflare Turnstile `siteverify`, Resend delivery/inbox receipt, and Stripe hosted checkout/webhook/provider fulfillment remain unverified. | APS-E002, APS-E006, APS-E007, APS-E009, APS-E014, APS-E020, APS-E021, APS-E022, APS-E023, APS-E024 |
| APS-G004 | P2 | UNKNOWN | Product/legal retention expectations for account deletion are not verified beyond source tombstone behavior. | APS-E015, APS-E016 |
| APS-G005 | P2 | NOT VERIFIED FOR REAL STRIPE | Saved-search alert paywall and checkout routes/components have local mocked coverage, but real Stripe hosted checkout, webhook, and provider fulfillment are not payment-runtime verified. | APS-E014, APS-E024 |

## Product Questions

| Question | Why it matters | Evidence |
| --- | --- | --- |
| Should saved searches remain in this account package or split into a separate saved-search-alerts package later? | Saved searches share account/saved state, but checkout/paywall behavior adds a payment-adjacent domain. | APS-E014 |
| What is the release acceptance standard for account deletion retention copy versus legal data-retention requirements? | Source tombstones identity and cleans many records, but policy expectations are outside source evidence. | APS-E015, APS-G004 |
