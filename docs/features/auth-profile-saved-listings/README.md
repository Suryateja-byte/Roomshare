# Auth, Profile, And Saved Listings

Status: COMPLETE with reduced P1 verification gaps.

Evidence base: this package is source-audited from `src/auth.ts`, `src/lib/auth-helpers.ts`, login/signup clients, registration and auth recovery APIs, profile pages/actions, settings pages/actions, saved listings/actions/favorites API, saved searches page/client/actions, `prisma/schema.prisma`, and discovered auth/profile/saved tests. Exact ranges are in `evidence-register.md`.

Saved searches are included because `/saved-searches` is a protected account collection surface that shares session, user, saved-state, and alert/paywall state with the broader saved-listings account area. Evidence: APS-E014.

## Verification

Current-behavior claims are source-backed. Focused route/action tests now cover APS-E018 and APS-E019, including auth/favorites CSRF short-circuiting and auth recovery plus favorites private no-store headers. Runtime browser flows, optional live HTTP transport parity, email delivery, OAuth provider, Turnstile provider, and payment checkout runtime checks remain tracked in `verification.json` and `runtime-verification.md`.
