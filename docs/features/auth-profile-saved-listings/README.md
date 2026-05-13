# Auth, Profile, And Saved Listings

Status: COMPLETE with reduced P2 provider verification gaps.

Evidence base: this package is source-audited from `src/auth.ts`, `src/lib/auth-helpers.ts`, login/signup clients, registration and auth recovery APIs, profile pages/actions, settings pages/actions, saved listings/actions/favorites API, saved searches page/client/actions, `prisma/schema.prisma`, and discovered auth/profile/saved tests. Exact ranges are in `evidence-register.md`.

Saved searches are included because `/saved-searches` is a protected account collection surface that shares session, user, saved-state, and alert/paywall state with the broader saved-listings account area. Evidence: APS-E014.

## Verification

Current-behavior claims are source-backed. Focused route/action tests now cover APS-E018 and APS-E019, including auth/favorites CSRF short-circuiting and auth recovery plus favorites private no-store headers. The focused Chromium browser gate passed in APS-E020 for auth/profile/settings/saved-listings/saved-searches flows. APS-E021 through APS-E024 pass local/mocked provider-adjacent coverage for Auth.js/Google guards and account linking, Turnstile helper/route integration, auth email scheduling/token routes, and saved-search checkout route/session/component behavior. Optional live HTTP transport parity and real Google IdP, Cloudflare Turnstile, Resend delivery, and Stripe hosted checkout/webhook/provider runtime checks remain tracked as P2 residuals in `verification.json` and `runtime-verification.md`.
