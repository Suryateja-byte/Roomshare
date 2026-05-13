# 12 Gaps, Unknowns, And Questions

| ID | Severity | Status | Gap or unknown | Evidence |
| --- | --- | --- | --- | --- |
| APS-G001 | P1 | NOT VERIFIED | Full browser auth/profile/settings/saved-listings/saved-searches suite was not executed in this pass. | APS-E017 |
| APS-G002 | P1 | REDUCED | Focused route/action command now verifies status paths, CSRF short-circuiting for register/auth-recovery/favorites mutation routes, favorites private no-store headers, and saved-listing/saved-search/settings action behavior. Auth recovery explicit no-store headers and live HTTP transport parity remain unverified and unchanged. | APS-E006, APS-E007, APS-E008, APS-E009, APS-E013, APS-E015, APS-E018 |
| APS-G003 | P1 | NOT VERIFIED | Google OAuth, Turnstile, email delivery, and checkout return behavior were not runtime verified. | APS-E002, APS-E006, APS-E007, APS-E009, APS-E014 |
| APS-G004 | P2 | UNKNOWN | Product/legal retention expectations for account deletion are not verified beyond source tombstone behavior. | APS-E015, APS-E016 |
| APS-G005 | P2 | NOT VERIFIED | Saved-search alert paywall and checkout fulfillment are source-observed but not payment-runtime verified. | APS-E014 |

## Product Questions

| Question | Why it matters | Evidence |
| --- | --- | --- |
| Should saved searches remain in this account package or split into a separate saved-search-alerts package later? | Saved searches share account/saved state, but checkout/paywall behavior adds a payment-adjacent domain. | APS-E014 |
| What is the release acceptance standard for account deletion retention copy versus legal data-retention requirements? | Source tombstones identity and cleans many records, but policy expectations are outside source evidence. | APS-E015, APS-G004 |
