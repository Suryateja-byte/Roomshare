# Auth, Profile, And Saved Listings

Status: COMPLETE with reduced P2 provider verification gaps and a partial APS-G002 live cache-header residual.

Evidence base: this package is source-audited from `src/auth.ts`, `src/lib/auth-helpers.ts`, login/signup clients, registration and auth recovery APIs, profile pages/actions, settings pages/actions, saved listings/actions/favorites API, saved searches page/client/actions, `prisma/schema.prisma`, and discovered auth/profile/saved tests. Exact ranges are in `evidence-register.md`.

Saved searches are included because `/saved-searches` is a protected account collection surface that shares session, user, saved-state, and alert/paywall state with the broader saved-listings account area. Evidence: APS-E014.

## Verification

Current-behavior claims are source-backed. Focused route/action tests now cover APS-E018, APS-E019, and APS-E025, including auth/favorites CSRF short-circuiting and auth recovery plus favorites private no-store headers. The focused Chromium browser gate passed in APS-E020 for auth/profile/settings/saved-listings/saved-searches flows. APS-E021 through APS-E024 pass local/mocked provider-adjacent coverage for Auth.js/Google guards and account linking, Turnstile helper/route integration, auth email scheduling/token routes, and saved-search checkout route/session/component behavior. APS-E025 partially reduces live HTTP transport parity by verifying live status/CSRF/JSON behavior for the listed auth/favorites routes, but live cache-header parity remains a P2 residual because observed live responses returned `Cache-Control: private, no-cache`, not the route-handler/direct-test `private, no-store` expectation. Real Google IdP, Cloudflare Turnstile, Resend delivery, and Stripe hosted checkout/webhook/provider runtime checks remain tracked as P2 residuals in `verification.json` and `runtime-verification.md`.
