# Auth, Security, And Permissions

| Action/API | Public or protected | Enforcement location | Failure behavior | Evidence | Unknowns |
|---|---|---|---|---|---|
| `/search` page | Public, rate-limited | `checkServerComponentRateLimit` | Rate-limited state | `src/app/search/page.tsx`:L383-L402 | Rate-limit quota details not traced |
| `/api/search/v2` | Public, rate-limited | `withRateLimitRedis`; public payload sanitizer | Rate-limit response, 404 disabled, errors | `phase-4/04-auth-security-permissions.md`; `evidence-register.md` C050 | Exact response field extraction still pending |
| `/api/search/listings` | Public, rate-limited | `withRateLimitRedis`; public payload sanitizer | Rate-limit, fallback, sanitized errors | `phase-4/04-auth-security-permissions.md`; `evidence-register.md` C050 | Exact response field extraction still pending |
| `/api/search/facets` | Public, rate-limited | `withRateLimitRedis`, bounds guards | Empty no-store, 400, 500 | `phase-4/04-auth-security-permissions.md` | Facet SQL field audit pending |
| `/api/map-listings` | Public, rate-limited | `withRateLimitRedis`, bounds validation, map sanitizer | 400/409/500 | `phase-4/04-auth-security-permissions.md`; `evidence-register.md` C050 | V1-only browser mock cases not run |
| `/api/geocoding/autocomplete` | Public, rate-limited | `withRateLimit`, query sanitization | Invalid/timeout/unavailable/rate-limit errors | `src/app/api/geocoding/autocomplete/route.ts`:L119-L179 | External provider data not audited |
| `/api/favorites` GET | Public endpoint, private user-specific response | Rate limit and optional `auth()` | Anonymous returns empty saved ids; invalid ids 400 | `src/app/api/favorites/route.ts`:L18-L70 | Enumeration stress not run |
| `/api/favorites` POST | Protected | CSRF, rate limit, `auth()`, suspension, schema | 401, 403, 400, idempotent duplicate success | `src/app/api/favorites/route.ts`:L73-L171 | Client CSRF source not traced |
| Favorite button | Public UI, protected effect | Server API enforcement | 401 redirects to `/login`; errors revert optimistic state | `src/components/FavoriteButton.tsx`:L43-L87 | Runtime redirect not verified |
| Save search | Protected write | `saveSearch` server action | Unauthorized/rate-limit/suspended/invalid/limit/generic errors | `src/app/actions/saved-search.ts`:L67-L194 | Checkout/paywall branch partial |
| Listing detail navigation from card | Public | Link only in card evidence | No auth failure in card code | `src/components/listings/ListingCard.tsx`:L349-L352, L492-L499 | Listing detail route not audited |
| Direct contact-host from search card | Not verified | No direct search-card action found | Card navigates to listing detail | `evidence-register.md` C029 | Needs contact-host feature pass |
| Public cache behavior | Public search/map APIs; private favorites | Cache headers in route handlers and public payload sanitizer | Public cache for search/map, no-store/private for user-specific/error paths | `phase-4/04-auth-security-permissions.md`; `evidence-register.md` C050 | Deterministic no-arg scanner wrapper not implemented |

Security verification status: the original real search/map public-payload PII scan failed, but the P0 public payload fix now passes focused privacy tests and a real captured payload scan for `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and `/api/listings`. Broader non-gate security/E2E coverage and a deterministic no-arg scanner wrapper remain incomplete. Evidence: `phase-4/05-test-traceability.md`, `unknowns.md` G001-G002, `evidence-register.md` C045-C051.
