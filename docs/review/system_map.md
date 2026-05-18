# System Map

Phase 1 status: `MappedFromLocalScan`

Baseline:

- Branch: `codex/search-ux-fixes`
- HEAD: `b3e3b0f4`
- Baseline captured: `2026-05-06T23:45:04Z`
- Worktree: current dirty working tree accepted by the user as the release
  candidate, with 100 changed/untracked entries at capture time.

Notes:

- This map is not a findings ledger. Confirmed issues belong in
  `docs/review/review_ledger.md`.
- Read-only helper subagents were started for Phase 1, but they did not return
  before the local mapping pass completed and were closed. This map is based on
  direct local repository evidence.

## 1. System Overview

Roomshare is a Next.js 16 App Router application with React 19, Prisma,
PostgreSQL/PostGIS, pgvector, NextAuth v5, Stripe, Supabase Storage, Upstash
Redis, Sentry, Playwright, Jest, and Zod.

Major domains:

- Public discovery: homepage, search, map, listing detail, nearby places,
  reviews, saved listings, and saved searches.
- Host workflows: create listing, edit listing, upload images, collision/dedupe
  flows, inventory projection, search synchronization, and listing freshness.
- Auth and identity: credentials auth, Google OAuth, email verification,
  password reset, suspension, profile/settings, verification documents, and
  admin verification review.
- Contact and messaging: conversations, messages, blocking, phone reveal,
  paid contact gates, contact restoration, and notification delivery.
- Payments and entitlements: Stripe checkout, webhook processing, contact
  packs/passes, refunds, disputes, abuse controls, and emergency paywall modes.
- Search infrastructure: listing search docs, inventory projections,
  semantic inventory projection, query snapshots, public cache, cache
  invalidation, saved search alerts, and release-gate search scenarios.
- Operations: cron routes, health/readiness, metrics, public cache push,
  Sentry, runbooks, launch drills, and CI workflows.

Runtime and deployment assumptions:

- Node.js 20 and pnpm 10 are used in CI.
- Production build uses `next build --webpack`.
- Database requires PostgreSQL with PostGIS; recent migrations also require
  pgvector and custom SQL functions/indexes.
- Vercel-style cron and deployment are implied by `vercel.json`, cron API
  routes, Sentry config, and GitHub workflows.

## 2. Route, API, And Server-Action Map

### Page Surfaces

| Surface | Paths | Auth boundary | Main side effects / notes |
| --- | --- | --- | --- |
| Public/static | `/`, `/about`, `/privacy`, `/terms`, `/offline`, auth layouts | Anonymous | Public rendering, SEO/open graph, offline fallback. |
| Search/discovery | `/search`, `/listings/[id]`, `/users/[id]` | Mostly anonymous with authenticated viewer state | Search URL state, map/list sync, public listing payloads, contact CTAs, viewer state. |
| Auth | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify`, `/verify-email`, `/verify-expired` | Anonymous/login state dependent | Credentials/OAuth entry, token flows, email verification. |
| Authenticated account | `/profile`, `/profile/edit`, `/settings`, `/notifications`, `/saved`, `/recently-viewed`, `/saved-searches`, `/messages`, `/messages/[id]`, `/bookings` | NextAuth authorized callback protects several paths; page/action guards also need review | Profile/settings mutations, notifications, saved data, conversations, booking/contact views. |
| Host listing management | `/listings/create`, `/listings/[id]/edit` | Auth-sensitive; verify page/action/API guards because these are not in the proxy protected path list | Listing create/edit, uploads, profile warnings, navigation guards, dedupe/collision states. |
| Admin | `/admin`, `/admin/audit`, `/admin/bookings`, `/admin/bookings/[id]`, `/admin/listings`, `/admin/reports`, `/admin/users`, `/admin/verifications` | Admin-only in NextAuth authorized callback and admin helpers | User/listing/report/verification review, audit trail, private verification documents. |

### API Groups

| API group | Routes | Auth required | Inputs | Side effects / risk notes |
| --- | --- | --- | --- | --- |
| Auth | `/api/auth/[...nextauth]`, `/api/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/resend-verification`, `/api/auth/verify-email`, `/api/verify` | Mixed anonymous and session | Credentials, OAuth callback state, tokens, email | Turnstile, rate limits, bcrypt, verification/reset tokens, email sends. |
| Public search/listing | `/api/listings` GET, `/api/listings/[id]`, `/api/map-listings`, `/api/search/listings`, `/api/search/v2`, `/api/search-count`, `/api/search/facets`, `/api/geocoding/autocomplete`, `/api/nearby`, `/api/reviews` GET | Mostly anonymous | Query params, bounds, filters, pagination, listing IDs | Public payload privacy, query normalization, search projections, rate limits, geocoding. |
| Authenticated listing/user actions | `/api/listings` POST, `/api/listings/[id]` PATCH/DELETE, `/api/listings/[id]/status`, `/api/listings/[id]/can-delete`, `/api/listings/[id]/view`, `/api/listings/[id]/viewer-state`, `/api/favorites`, `/api/upload`, `/api/verification/upload` | Session and sometimes owner/admin | JSON, multipart/form-data, listing ID, image/document data | Ownership checks, image/doc upload safety, status transitions, view tracking, saved listings. |
| Messaging/contact | `/api/messages`, `/api/phone-reveal`, `/api/chat`, `/api/reports`, `/api/reviews` write paths | Session for writes; some public reads | Message content, conversation ID, listing ID, report/review payloads | Participant authorization, blocking, PII exposure, contact paywall, phone reveal, abuse reports. |
| Payments | `/api/payments/checkout`, `/api/payments/checkout-session`, `/api/stripe/webhook` | Session for checkout/status; Stripe signature for webhook | Product code, success/cancel URLs, Stripe events | Entitlements, idempotency, refund/dispute handling, webhook replay protection. |
| Public cache | `/api/public-cache/state`, `/api/public-cache/events`, `/api/public-cache/push-subscription` | Mixed anonymous/session | Cursor/subscription data | Public cache privacy, push subscription encryption, cache invalidation, rate limits. |
| Metrics/health | `/api/health/live`, `/api/health/ready`, `/api/metrics`, `/api/metrics/ops`, `/api/metrics/search`, `/api/web-vitals` | Mixed; ops metrics uses secret/origin assumptions | Metrics payloads | Request validation, safe logs, operational visibility. |
| Cron/background | `/api/cron/*` including search alerts, refresh search docs, cleanup, outbox drain, payment refund queue, freshness, stale auto-pause, contact restoration | Expected `CRON_SECRET` or Vercel cron auth pattern | Cron request headers/query | Batch writes, external calls, idempotency, retry, time budgets. |
| Admin documents | `/api/admin/verifications/[id]/documents/[kind]` | Admin helper | Verification request ID/kind | Private document access from Supabase Storage. |
| Test helpers | `/api/test/[...slug]`, `/api/test-helpers` | Expected env-gated test-only | Test fixture controls | Must be unavailable or strongly gated in production. |

### Server Actions And Core Libraries

| Area | Files / modules | Side effects |
| --- | --- | --- |
| Admin actions | `src/app/actions/admin.ts`, `src/lib/admin-auth.ts`, `src/lib/audit.ts` | Admin mutations, audit events, verification/report/listing/user management. |
| Listing actions | `src/app/actions/create-listing.ts`, `src/app/actions/listing-status.ts`, `src/lib/listings/*` | Listing create/update/status, canonical inventory, collision detection, moderation locks. |
| Saved data | `src/app/actions/saved-listings.ts`, `src/app/actions/saved-search.ts`, `src/lib/search-alerts.ts` | Saved listings/searches, alert subscriptions/deliveries. |
| User/settings | `src/app/actions/profile.ts`, `src/app/actions/settings.ts`, `src/app/actions/verification.ts`, `src/app/actions/block.ts`, `src/app/actions/suspension.ts` | Profile settings, notification prefs, verification, blocking, suspension checks. |
| Payments/contact | `src/lib/payments/*`, `src/lib/contact/*`, `src/lib/messaging/*` | Contact consumption, entitlement grants/state, phone reveal, webhook/refund handling, message sending. |
| Search/projections | `src/lib/search/*`, `src/lib/projections/*`, `src/lib/embeddings/*`, `src/lib/public-cache/*` | Search docs, semantic embeddings, public projection, query snapshots, cache invalidation. |

## 3. Auth And Authorization Boundaries

Trust boundaries:

- Anonymous user: can view public pages and public discovery APIs, submit auth
  flows, geocoding/autocomplete, nearby/search requests, and some metrics.
- Authenticated user: can manage own profile/settings, saved listings/searches,
  messages, reviews/reports, listing contacts, uploads, and viewer state.
- Host/listing owner: can create/edit/delete/status own listings and manage
  listing inventory/collisions.
- Admin: can access `/admin*`, verification documents, reports, users, listings,
  and audit views.
- Suspended user: should be blocked from protected actions and admin access.
- Cron caller: should be limited to trusted cron using `CRON_SECRET` or Vercel
  cron headers.
- Stripe: webhook caller authenticated by Stripe signature.
- External APIs: OAuth, Turnstile, Supabase, Redis, Stripe, email, maps,
  geocoding, AI providers.
- Database: source of truth for auth/session, listings, messages, payments,
  projections, cache state, audit events, and idempotency.
- Browser/client: receives public payloads only; secrets/service-role keys must
  remain server-only.

Observed boundary mechanisms:

- `src/auth.ts` configures NextAuth v5 with JWT sessions, 14-day max age,
  credentials provider, Google OAuth, email verification checks, suspension
  checks, token minimization after OAuth linking, and password-change
  invalidation.
- `src/auth.config.ts` duplicates the authorized callback for edge-compatible
  use.
- `src/proxy.ts` is the Next.js 16 proxy entrypoint. It applies suspension
  checks, CSP/security headers, nonce propagation, and request IDs.
- Route and action code commonly uses `auth()`, `withRateLimit`,
  `withRateLimitRedis`, `checkRateLimit`, Zod schemas, and admin helpers.

Auth areas that need specialist review:

- `/listings/create` and `/listings/[id]/edit` are not listed in the top-level
  protected path array, so page/action/API ownership enforcement must be mapped
  carefully.
- Cron route auth is implemented per route and should be checked consistently.
- Test helper routes must be gated by environment and shared secrets.
- Public APIs with optional sessions must not leak private viewer state.

## 4. Data Model And Migration Map

### Model Groups

| Group | Models / tables | Critical notes |
| --- | --- | --- |
| Auth/session | `User`, `Account`, `Session`, `VerificationToken`, `PasswordResetToken` | Unique email/session/token constraints; password revocation; OAuth token minimization. |
| Listings/location | `Listing`, `Location`, `SavedListing`, `RecentlyViewed`, `Review`, `ReviewResponse`, `Report` | Owner cascade, location PostGIS, public/private report split, status and slot constraints. |
| Messaging | `Conversation`, `ConversationDeletion`, `Message`, `TypingStatus`, `BlockedUser`, `Notification` | Participant authorization, per-user deletion, soft delete, unread/read states, blocking. |
| Verification | `VerificationRequest`, `VerificationUpload` | Private storage paths, expiry, admin review, document retention. |
| Saved search alerts | `SavedSearch`, `AlertSubscription`, `AlertDelivery` | Query spec/hash, delivery idempotency, schedule/drop status, target listing/unit/inventory fields. |
| Rate/idempotency/audit | `RateLimitEntry`, `IdempotencyKey`, `AuditLog`, `AuditEvent` | Rate-limit fallback, duplicate prevention, immutable operational/admin history. |
| Payments/contact | `StripeEvent`, `Payment`, `Refund`, `EntitlementGrant`, `PaymentDispute`, `ContactConsumption`, `PaymentAbuseSignal`, `RefundQueueItem`, `FraudAuditJob`, `EntitlementState`, `ContactRestoration`, `ContactAttempt`, `HostContactChannel`, `PhoneRevealAudit` | Stripe event replay, checkout/payment state, entitlements, chargeback/fraud, contact privacy/restoration. |
| Canonical inventory | `PhysicalUnit`, `HostUnitClaim`, `ListingInventory`, `IdentityMutation`, `OutboxEvent`, `CacheInvalidation`, `PublicCachePushSubscription` | Unit identity epoch, canonical address hash, inventory rows, outbox, cache invalidation, encrypted push subscriptions. |
| Search projections | `InventorySearchProjection`, `UnitPublicProjection`, `SemanticInventoryProjection`, `QuerySnapshot` | Projection epoch, semantic embedding version, public projection payload, query snapshot expiry. |

### Migration / DDL Assumptions

- Migrations are raw SQL-heavy and include PostGIS, pgvector, partial indexes,
  check constraints, triggers/functions, semantic search functions, search docs,
  projection tables, contact paywall, payments, verification documents, and
  saved search alerts.
- Recent migrations include:
  - `20260513000000_private_verification_documents`
  - `20260514000000_reporting_abuse_controls_hardening`
  - `20260515000000_embedding_ga_version_isolation`
  - `20260515010000_embedding_ga_model_status_index`
  - `20260515020000_embedding_ga_hnsw_index`
  - `20260515030000_fix_semantic_score_casts`
- The latest dirty-tree migration
  `20260515030000_fix_semantic_score_casts/migration.sql` is function-only DDL
  that replaces `search_listings_semantic` and explicitly casts ranking scores.

Migration review priorities:

- Verify `prisma migrate deploy` against an empty Postgres/PostGIS/pgvector DB.
- Verify rollback notes for raw SQL/function/index changes.
- Verify Prisma schema and migration SQL do not drift for unsupported/partial
  index behavior.
- Verify PGlite test compatibility does not hide production PostgreSQL issues.

## 5. External Dependency And Environment Map

| Dependency | Purpose | Main env vars | Failure mode / degraded behavior |
| --- | --- | --- | --- |
| PostgreSQL + PostGIS + pgvector | Primary data, geospatial search, semantic vectors | `DATABASE_URL` | App cannot persist or search; readiness should fail. |
| NextAuth/Auth.js | Sessions, credentials, OAuth | `NEXTAUTH_SECRET`, `AUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login/session failure; OAuth callback risk. |
| Cloudflare Turnstile | Bot protection on auth | `TURNSTILE_ENABLED`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Auth abuse or blocked login depending fail mode. |
| Upstash Redis | Rate limiting primary | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Falls back to DB rate limiting in many paths; fail-open/fail-closed must be reviewed per endpoint. |
| Supabase Storage | Listing images and private verification docs | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Upload failures or private document access risk. |
| Stripe | Checkout, webhooks, refunds, entitlements | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs | Payment/contact entitlement failure, replay/fraud risk. |
| Resend/email | Verification, reset, alert, notification email | `RESEND_API_KEY`, `FROM_EMAIL` | Auth and alert delivery degradation. |
| Maps/geocoding/places | Map rendering, autocomplete, nearby places | `NEXT_PUBLIC_STADIA_API_KEY`, `RADAR_SECRET_KEY`, `NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY`, `HERE_API_KEY`, Google/Mapbox keys for optional paths | Search/map degraded states, external rate limits. |
| AI/embeddings | Agent/chat and semantic search | `GROQ_API_KEY`, `GEMINI_API_KEY`, embedding budget/version flags | Chat/semantic search fallback or stale embeddings. |
| Sentry | Client/server/edge error tracking | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Reduced production observability. |
| Vercel cron/deploy | Cron jobs, env, build metadata | `CRON_SECRET`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` | Cron auth/deploy visibility issues. |
| Public cache push | Public cache coherence and push notifications | public cache secrets/VAPID vars | Stale public cache or failed fanout. |

High-impact feature flags / kill switches:

- Search/projection: `ENABLE_SEARCH_DOC`, `ENABLE_SEMANTIC_SEARCH`,
  `ENABLE_CLIENT_SIDE_SEARCH`, projection phase flags, search ranking flags.
- Contact/payments: `ENABLE_CONTACT_PAYWALL`,
  `ENABLE_CONTACT_PAYWALL_ENFORCEMENT`, entitlement/contact restoration flags,
  `KILL_SWITCH_DISABLE_PAYMENTS`, `KILL_SWITCH_EMERGENCY_OPEN_PAYWALL`.
- Inventory/listings: canonical write/projection flags, dedupe flags,
  moderation write locks, stale auto-pause, whole-unit/multi-slot flags.
- Operations: pause backfills, pause embedding/geocode publish, public cache
  push disable, semantic search disable, alert disable.

## 6. Critical User Flows

| Flow | Primary surfaces | Current verification signals |
| --- | --- | --- |
| Anonymous search/map | `/search`, search APIs, map APIs, geocoding/autocomplete, facets/count | Extensive Jest and Playwright search tests exist; baseline Jest has search/date/projection failures. |
| Listing detail | `/listings/[id]`, viewer state, reviews, phone/contact CTAs | Component/API tests and E2E listing-detail tests exist. |
| Save/unsave and saved searches | `/saved`, `/saved-searches`, saved-search actions, favorites API | Action tests, saved-search tests, E2E saved flows, alert tests. |
| Host create listing | `/listings/create`, `/api/listings`, upload API, create-listing page object | Many dedicated E2E specs under `tests/e2e/create-listing`; baseline not yet run due full E2E timeout. |
| Listing edit/status/delete | `/listings/[id]/edit`, listing PATCH/DELETE/status APIs/actions | API/action tests for IDOR, status, can-delete, host-managed patch. |
| Messaging/contact host | `/messages`, `/api/messages`, phone reveal, contact paywall | API/action/unit tests and E2E messaging flows. |
| Auth/account | auth pages/APIs, profile/settings, verification pages | Auth API tests, edge-case tests, auth E2E specs. |
| Admin/reporting/verification | `/admin*`, reports/reviews APIs, verification docs | Admin component tests, API tests, E2E admin specs. |
| Payments/entitlements | checkout/session/webhook routes, payments libs, refund queue cron | Payment library and API tests, cron tests, runbooks. |
| Cron/ops | cron routes, health, metrics, Sentry, launch/runbooks | Cron Jest tests and GitHub workflow coverage; staging evidence still unknown. |

## 7. Critical Invariants

| # | Invariant | Owner area | Test evidence / audit target | Risk if broken |
| --- | --- | --- | --- | --- |
| 1 | Admin routes and admin APIs are inaccessible to non-admin and suspended users. | Auth/Admin | Admin helper, auth callback, admin tests, admin E2E | Privilege escalation. |
| 2 | Listing mutations require authenticated owner or admin authorization. | Listings | Listing API/action tests, IDOR tests | Unauthorized data changes. |
| 3 | Suspended users cannot perform protected actions. | Auth/Safety | proxy/auth/action tests | Abuse after suspension. |
| 4 | Password reset/email verification tokens are hashed, expire, and cannot be replayed unsafely. | Auth | auth API tests, token store tests | Account takeover. |
| 5 | Google OAuth links only verified emails and does not retain provider tokens unnecessarily. | Auth | auth code review/tests | Account linking or token exposure risk. |
| 6 | Public listing/search/map payloads exclude private feedback, verification docs, private contact data, secrets, and raw PII. | Privacy/Search | PII scanner, public payload tests | Privacy breach. |
| 7 | Search URL normalization preserves canonical filters including dates, bounds, pagination, and aliases. | Search | Baseline failing tests in `P1-TEST-001` | Wrong results, stale links, alert mismatch. |
| 8 | Map and list results are projection-compatible and privacy-compatible. | Search/Map | map/list projection tests, E2E | Inconsistent or unsafe discovery payloads. |
| 9 | Canonical unit identity and unit identity epoch prevent cross-unit or cross-host inventory corruption. | Inventory | canonical inventory tests, migration checks | Data corruption, wrong contact/availability. |
| 10 | Listing collision/dedupe flows never merge separate owners and never create duplicate records from duplicate submits. | Create listing | dedupe E2E, collision detector tests | Data corruption or UX dead ends. |
| 11 | Slot/open-bed/availability constraints cannot go negative or exceed capacity. | Listings/Inventory | schema constraints, listing tests | Invalid availability and search results. |
| 12 | Contact paywall and entitlement state consume exactly one eligible credit/pass per protected contact. | Payments/Contact | payment/contact tests | Revenue loss or user overcharge. |
| 13 | Stripe webhook processing is signature-verified, idempotent, and replay-safe. | Payments | webhook tests, StripeEvent unique constraints | Fraud, duplicate grants/refunds. |
| 14 | Refunds, disputes, and chargebacks freeze/revoke/restore entitlements correctly. | Payments | refund/dispute tests, runbooks | Financial/user entitlement mismatch. |
| 15 | Phone reveal never exposes host phone without authorization, payment/free grant, and audit trail. | Contact/Privacy | phone reveal API/lib tests | PII leak. |
| 16 | Messages are visible only to conversation participants and respect blocking/deletion semantics. | Messaging | messages API/lib/E2E tests | Private message exposure. |
| 17 | Uploads enforce size/type/storage rules and private verification documents remain private. | Uploads/Verification | upload tests, verification tests | Malware/PII exposure. |
| 18 | Cron routes are authenticated, idempotent, bounded by budgets, and safe to retry. | Ops/Cron | cron tests, runbooks | Unauthorized batch writes or runaway jobs. |
| 19 | Rate limits protect public and sensitive endpoints, with documented fail-open/fail-closed behavior. | Abuse/Security | rate-limit tests | Abuse or accidental lockout. |
| 20 | Public cache and push invalidation never serve stale private/suppressed data after moderation or identity changes. | Public cache/Search | cache tests, runbooks, E2E | Privacy or moderation bypass. |

## 8. Review-Slice DAG

Recommended specialist audit order:

1. `Testing/CI/release gates`
   - Start here because Phase 0 already found release-blocking gate failures.
   - Clarify whether failures are stale tests, regressions, or blocked tooling.
2. `Auth/AuthZ/Sessions`
   - Map `auth()`, proxy, admin helpers, ownership checks, suspension, test
     helpers, and auth-sensitive pages not in the protected path list.
3. `API validation/server actions`
   - Review public inputs, Zod coverage, rate limits, body parsing, CSRF-like
     paths, and error responses.
4. `Database/Prisma/migrations/data integrity`
   - Review raw SQL, migration deploy, constraints/indexes, unsupported types,
     pgvector/PostGIS functions, rollback notes, and drift.
5. `Business invariants/concurrency`
   - Review listings, canonical inventory, dedupe, contact, payments,
     idempotency, outbox, cache invalidation, and state transitions.
6. `Search/map/projections`
   - Review query normalization, semantic search, projection read eligibility,
     map/list parity, saved search alerts, public cache, and failing tests.
7. `Security/OWASP ASVS`
   - Review injection, XSS/CSRF/SSRF, upload safety, secret exposure, privacy,
     abuse, auth/session, logging, and public payloads.
8. `Frontend/SSR/CSR/state/a11y`
   - Review hydration/URL state, client search mode, create-listing UX,
     responsive/mobile map/list, accessibility, loading/error states.
9. `Observability/performance/deployment`
   - Review Sentry, health, metrics, cron budgets, Lighthouse, load tests,
     runbooks, rollback, staging parity.
10. `Dependencies/supply chain/secrets`
    - Triage `pnpm audit`, CodeQL/Dependabot/secret scanning coverage, ignored
      pnpm build scripts, lockfile, and deploy settings.

Parallelizable after Phase 1:

- Auth/AuthZ and database/migrations can run independently.
- Frontend/a11y and observability/deployment can run independently.
- Supply-chain can run independently.

Do not parallelize writers during fixes in shared auth, routing, validation,
Prisma/migrations, payments, inventory, or search projection code.

## 9. Unknowns / Missing Docs

| Unknown | Impact | Owner | Resolution |
| --- | --- | --- | --- |
| E2E full-suite timeout root cause | Blocks browser release evidence | Testing/CI slice | Inspect Playwright report/process behavior and run scoped smoke suites. |
| Public payload PII scanner inputs | Blocks privacy gate | Security/Testing slice | Add or identify deterministic payload JSON fixture generation. |
| CodeQL/Dependabot/secret scanning GitHub settings | Repo workflows show CI, but some GitHub security settings live outside repo | Supply-chain slice | Inspect GitHub settings or document unavailable evidence. |
| Staging parity | Local gates do not prove production-like env, secrets, DB, cron, or external providers | Deployment slice | Run staging smoke/preflight with real deployment settings. |
| Current dirty worktree ownership | 100 changed/untracked entries are included in the release candidate baseline | Workflow owner | Keep audit ledger tied to this baseline until user changes it. |
| Subagent map outputs | Helper explorers did not return before closure | Workflow Orchestrator | Continue with local map; use fresh bounded specialist audits in Phase 2 if needed. |
| `.codex/config.toml` repo-local config | `.codex` is a tracked empty file, not a directory | Repo owner | Decide whether to convert `.codex` to a directory or rely on global config. |
