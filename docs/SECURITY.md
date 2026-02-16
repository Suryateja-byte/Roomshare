# Security Guide

Security architecture and implementation details for Roomshare. Covers authentication, authorization, input validation, rate limiting, PII protection, and compliance.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Email Verification](#email-verification)
3. [Password Security](#password-security)
4. [CAPTCHA (Turnstile)](#captcha-turnstile)
5. [Rate Limiting](#rate-limiting)
6. [Input Validation](#input-validation)
7. [User Blocking](#user-blocking)
8. [PII Protection](#pii-protection)
9. [Admin Security](#admin-security)
10. [Fair Housing Compliance](#fair-housing-compliance)
11. [CORS and Origin Validation](#cors-and-origin-validation)
12. [Security Headers](#security-headers)

---

## Authentication

Roomshare uses **NextAuth v5** (Auth.js) with two authentication providers and JWT-based sessions.

### Configuration

**File:** `src/auth.ts`

| Setting | Value | Rationale |
|---------|-------|-----------|
| Session strategy | JWT | Stateless, no session table needed |
| Session max age | 14 days | Security hardening (reduced from 30 days) |
| Token refresh interval | 24 hours | Balances freshness with performance |
| Adapter | `@auth/prisma-adapter` | Stores users, accounts, tokens in PostgreSQL |

### Providers

#### Email/Password (Credentials)

- Email is normalized to lowercase and trimmed before lookup (`normalizeEmail`)
- Password minimum: 12 characters (validated with Zod)
- Turnstile CAPTCHA is verified before any database lookup
- Password is compared using `bcryptjs.compare`
- Failed attempts log a warning without revealing which field was wrong

#### Google OAuth

- Uses `allowDangerousEmailAccountLinking: true` for account linking
- **Safety guarantee:** email verification is enforced in the `signIn` callback -- `email_verified` must be exactly `true` (not truthy)
- If email is not verified, sign-in is blocked and user is redirected to `/login?error=EmailNotVerified`
- After account linking, OAuth tokens (access, refresh, ID tokens) are immediately cleared from the database to minimize exposure if records are compromised

### Session and JWT Callbacks

**`signIn` callback:**
1. Blocks Google OAuth if email is not verified
2. Checks suspension status in the database for all providers (credentials and OAuth)
3. Redirects suspended users to `/login?error=AccountSuspended`

**`jwt` callback:**
- On sign-in, update, or account link: refreshes `emailVerified`, `isAdmin`, `isSuspended`, `image`, `name` from the database
- On DB errors: retains existing token values (does not invalidate session)

**`session` callback:**
- Exposes `id`, `emailVerified`, `isAdmin`, `isSuspended`, `image` on `session.user`

### Suspension Enforcement

**Middleware-level:** `src/lib/auth-helpers.ts` provides `checkSuspension()` for Edge Runtime.

- Public routes (/, /login, /signup, /listings, /search) are always accessible
- Protected API paths (`/api/listings`, `/api/bookings`, `/api/messages`, `/api/reviews`) block suspended users for write operations
- Protected page paths (`/dashboard`, `/listings/create`) block suspended users entirely
- Read-only GET requests to public endpoints (`/api/listings`) are allowed for suspended users
- Two-layer check: fast path from JWT token + live database query to catch newly suspended users

### Auth Error Handling

`src/lib/auth-errors.ts` maps NextAuth error codes to user-friendly messages with metadata:

| Error Code | Message | Severity |
|------------|---------|----------|
| `EmailNotVerified` | Google account email not verified | Warning |
| `OAuthAccountNotLinked` | Unable to link Google account | Warning |
| `CredentialsSignin` | Invalid email or password | Error |
| `AccountSuspended` | Account has been suspended | Error |
| `AccessDenied` | Sign-in was cancelled | Info |

Each error optionally includes hints, password reset links, and email form suggestions.

---

## Email Verification

### Flow

1. **Registration** (`POST /api/register`):
   - Creates user with `emailVerified: null`
   - Generates a 32-byte random token via `crypto.randomBytes`
   - Stores only the SHA-256 hash of the token (`tokenHash`) in the `VerificationToken` table
   - Sends the raw token in a verification URL to the user's email
   - Token expires in 24 hours

2. **Verification** (`GET /api/auth/verify-email?token=...`):
   - Rate-limited (10 per hour per IP)
   - Validates token format (64-character hex string)
   - Hashes the provided token and looks up the hash in the database
   - If expired: deletes token, redirects to `/verify-expired`
   - If valid: sets `emailVerified` timestamp on user, deletes the used token
   - Redirects to `/?verified=true`

### Token Security

**File:** `src/lib/token-security.ts`

- Tokens are 32 bytes (256 bits) of cryptographic randomness
- Only SHA-256 hashes are stored in the database -- raw tokens never touch persistent storage
- Token format validation (`/^[a-f0-9]{64}$/i`) prevents garbage input from hitting the database
- Tokens are single-use: deleted after verification

---

## Password Security

### Hashing

- Algorithm: **bcryptjs** with cost factor 10
- Consistent across registration and password reset
- Password hash is never returned in API responses

### Minimum Requirements

- **12 characters minimum** (enforced by Zod schema on both registration and password reset)
- Validated server-side on `POST /api/register` and `POST /api/auth/reset-password`

### Password Reset Flow

1. **Request** (`POST /api/auth/forgot-password`):
   - Rate-limited: 3 per hour per IP
   - Turnstile CAPTCHA verification required
   - Email is normalized before lookup
   - **Anti-enumeration:** always returns the same success message regardless of whether the email exists
   - Deletes any existing reset tokens for the email before creating a new one
   - Generates a 32-byte token; stores only the SHA-256 hash
   - Token expires in 1 hour
   - Sends reset link via Resend email

2. **Token Validation** (`GET /api/auth/reset-password?token=...`):
   - Rate-limited: 5 per hour per IP
   - Validates token format before database lookup
   - Returns `{ valid: true }` or `{ valid: false }` without leaking details

3. **Reset** (`POST /api/auth/reset-password`):
   - Rate-limited: 5 per hour per IP
   - Validates new password (12-character minimum)
   - Validates token format, hashes and looks up in database
   - Checks expiry, hashes new password with bcrypt, updates user, deletes used token

---

## CAPTCHA (Turnstile)

**File:** `src/lib/turnstile.ts`

Cloudflare Turnstile provides bot protection for authentication forms.

### Kill Switch

Turnstile can be disabled via environment variable:
- `TURNSTILE_ENABLED=true` AND `TURNSTILE_SECRET_KEY` must be set for verification to be active
- When disabled, `verifyTurnstileToken()` returns `{ success: true }` immediately

### Enforced On

| Endpoint | Method |
|----------|--------|
| `/api/register` | POST |
| `/api/auth/forgot-password` | POST |
| Credentials sign-in (via auth.ts authorize) | POST |

### Verification Process

1. Client renders Turnstile widget and receives a token
2. Token is sent to the server with the form data
3. Server calls Cloudflare's `siteverify` API with a 5-second timeout
4. **Fails closed:** network errors, timeouts, or non-OK responses all result in verification failure
5. Logs warnings via the structured logger (no PII)

### Test Keys

For development and E2E testing, Cloudflare provides test keys that auto-pass:
- Secret: `1x0000000000000000000000000000000AA`
- Site: `1x00000000000000000000AA`

---

## Rate Limiting

Roomshare implements a dual-layer rate limiting system with automatic failover.

### Architecture

```
Request --> Redis Rate Limiter (Upstash) --> Handler
               |
               | (Redis unavailable)
               v
         Circuit Breaker --> In-Memory Fallback
               |
               | (Redis completely unconfigured)
               v
         Database Rate Limiter (PostgreSQL)
```

### Layer 1: Redis-Backed (Upstash)

**File:** `src/lib/rate-limit-redis.ts`

Uses `@upstash/ratelimit` with sliding window algorithm. Each rate-limited feature has burst and sustained limits:

| Feature | Burst Limit | Sustained Limit |
|---------|-------------|-----------------|
| Chat | 5/min | 30/hour |
| Metrics | 100/min | 500/hour |
| Map | 60/min | 300/hour |
| Search Count | 30/min | 200/hour |

**Protection layers:**
- **Circuit breaker** (`circuitBreakers.redis`): Opens after 3 failures, resets after 10 seconds
- **Timeout wrapper**: Prevents indefinite hangs on slow Redis
- **In-memory fallback**: When Redis is unavailable, a `Map`-based fixed window limiter maintains rate limiting with matching thresholds

### Layer 2: Database-Backed (PostgreSQL)

**File:** `src/lib/rate-limit.ts`

Used when Redis is not configured, or as a general-purpose rate limiter for API endpoints.

**Per-endpoint limits:**

| Endpoint | Limit | Window |
|----------|-------|--------|
| Register | 5 | 1 hour |
| Forgot Password | 3 | 1 hour |
| Resend Verification | 3 | 1 hour |
| Verify Email | 10 | 1 hour |
| Reset Password | 5 | 1 hour |
| Messages (read) | 60 | 1 hour |
| Send Message | 100 | 1 hour |
| Create Listing | 5 | 24 hours |
| Update Listing | 20 | 24 hours |
| Delete Listing | 10 | 24 hours |
| Listings (general) | 10 | 24 hours |
| Create Review | 10 | 24 hours |
| Update Review | 30 | 24 hours |
| Delete Review | 30 | 24 hours |
| Get Reviews | 60 | 1 minute |
| Create Report | 10 | 24 hours |
| Listings Read (scraping) | 100 | 1 hour |
| Search | 30 | 1 minute |
| Nearby Search | 30 | 1 minute |
| Upload | 20 | 1 hour |
| Upload Delete | 20 | 1 hour |
| Agent (AI Chat) | 20 | 1 hour |
| Toggle Favorite | 60 | 1 hour |
| Unread Count | 60 | 1 minute |

**Failure behavior:**
- On database errors, falls back to an in-process `Map`-based limiter (10 requests/minute per identifier)
- If even the degraded mode limit is exceeded, request is denied

### Wrapper Functions

**`withRateLimit(request, { type })`** (`src/lib/with-rate-limit.ts`):
- Wraps any API route handler with database-backed rate limiting
- Returns a 429 response with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `x-request-id` headers

**`withRateLimitRedis(request, { type })`** (`src/lib/with-rate-limit-redis.ts`):
- Wraps any API route handler with Redis-backed rate limiting
- Returns a 429 response with similar headers

### Client-Side Handling

**File:** `src/lib/rate-limit-client.ts`

- `rateLimitedFetch()` -- drop-in replacement for `fetch` that:
  - Rejects immediately when globally throttled
  - Parses `Retry-After` header on 429 responses
  - Sets a shared backoff window across all consumers
- `isThrottled()` / `getRetryAfterMs()` -- check current throttle status
- `RateLimitError` class for typed error handling

### IP Detection

**File:** `src/lib/rate-limit.ts` (`getClientIP`)

Priority order for IP extraction:
1. `x-real-ip` (Vercel Edge, trusted)
2. `cf-connecting-ip` (Cloudflare)
3. `true-client-ip` (CDN)
4. `x-forwarded-for` (first entry, trusted in dev, with `TRUST_PROXY=true`, or when `x-forwarded-proto` header is present)
5. Anonymous fingerprint (SHA-256 hash of User-Agent + Accept-Language + sec-ch-ua)

### Cleanup

Expired `RateLimitEntry` records are cleaned up by the daily cron job (`/api/cron/cleanup-rate-limits`).

---

## Input Validation

### Zod Schemas

**File:** `src/lib/schemas.ts`

All API inputs are validated server-side with Zod schemas. Key validations:

**Listing creation (`createListingSchema` / `createListingApiSchema`):**
- Title: 1-100 characters
- Description: 10-1,000 characters
- Price: positive number, max $50,000/month, must be finite
- Amenities: comma-separated, max 20 items, each max 50 chars
- House rules: comma-separated, max 20 items, each max 50 chars
- Total slots: positive integer, max 20
- Address: 1-200 characters
- City: 1-100 characters
- State: 1-50 characters
- Zip: US format (5 digits or 5+4)
- Images: 1-10 URLs, must match Supabase storage URL pattern
- Language codes: validated against ISO 639-1 list
- Enum fields (room type, lease duration, gender preference, household gender): validated against allowlists, `any` value stripped (filter-only)
- Move-in date: YYYY-MM-DD format, valid calendar date, not in the past, max 2 years in future

**Booking creation (`createBookingSchema`):**
- Listing ID required
- Start date: valid date, not in the past
- End date: must be after start date
- Minimum duration: 30 days
- Price per month: positive number

**Registration (`registerSchema` in `src/app/api/register/route.ts`):**
- Name: minimum 2 characters
- Email: valid email format
- Password: minimum 12 characters

### Bounds Validation

**File:** `src/lib/validation.ts`

Map bounding box parameters are validated to prevent:
- **NaN/Infinity attacks:** `Number.isFinite` check on all coordinates
- **World-query full-table scans:** maximum span limits enforced
- **Out-of-range coordinates:** latitude -90 to 90, longitude -180 to 180
- Oversized bounds are clamped to max span (centered on viewport) rather than rejected

### Metrics Payload Validation

**File:** `src/app/api/metrics/route.ts`

Strict allowlist validation for place types (28 allowed types). Non-informative error messages reduce probing surface. Max body size: 10 KB.

---

## User Blocking

### Model

```prisma
model BlockedUser {
  id        String   @id @default(cuid())
  blockerId String
  blockedId String
  createdAt DateTime @default(now())
  @@unique([blockerId, blockedId])
}
```

### Behavior

- Users can block other users
- Blocked users cannot send messages to the blocker
- Block relationship is one-directional (A blocks B does not mean B blocks A)
- Email verification and block status are enforced in the messages API

---

## PII Protection

### Logging Rules

**File:** `src/lib/logger.ts`

All log output is automatically redacted:

**Field-level redaction** (key name matching, case-insensitive):
`password`, `token`, `secret`, `apikey`, `api_key`, `authorization`, `cookie`, `sessiontoken`, `accesstoken`, `refreshtoken`, `bearer`, `credential`, `private_key`, `privatekey`, `ssn`, `creditcard`, `credit_card`, `cardnumber`, `cvv`, `cvc`

**Pattern-level redaction** (regex on string values):

| Pattern | Replacement |
|---------|-------------|
| JWT tokens | `[REDACTED]` |
| Email addresses | `[REDACTED]` |
| Phone numbers (international) | `[REDACTED_PHONE]` |
| Phone numbers (US format) | `[REDACTED_PHONE]` |
| Street addresses | `[REDACTED_ADDRESS]` |

### HMAC Hashing for Metrics

**File:** `src/app/api/metrics/route.ts`

Listing IDs in metrics are hashed with HMAC-SHA256 using `LOG_HMAC_SECRET` before logging. The raw listing ID is never stored. The HMAC output is truncated to 16 hex characters.

### OAuth Token Minimization

After Google OAuth account linking, the application immediately clears `access_token`, `refresh_token`, and `id_token` from the Account record. These tokens are not needed after sign-in and their removal reduces impact if the database is compromised.

### Email Normalization

**File:** `src/lib/normalize-email.ts`

All email addresses are normalized to lowercase and trimmed before storage or lookup to prevent case-variant duplicate accounts and login/reset mismatches.

### Partial IP Logging

When logging rate limit events, only the first 8 characters of the IP address are included (e.g., `192.168.` followed by `...`).

---

## Admin Security

### Audit Logging

**File:** `src/lib/audit.ts`

All admin actions create immutable `AuditLog` records:

**Logged actions:**

| Action | Target Type |
|--------|------------|
| `USER_SUSPENDED` / `USER_UNSUSPENDED` | User |
| `USER_DELETED` / `USER_VERIFIED` / `USER_UNVERIFIED` | User |
| `LISTING_DELETED` / `LISTING_HIDDEN` / `LISTING_RESTORED` | Listing |
| `REPORT_RESOLVED` / `REPORT_DISMISSED` | Report |
| `VERIFICATION_APPROVED` / `VERIFICATION_REJECTED` | VerificationRequest |
| `ADMIN_GRANTED` / `ADMIN_REVOKED` | User |

Each audit log entry includes:
- Admin ID (who performed the action)
- Action type
- Target type and ID
- Optional details JSON (old/new values, reason)
- IP address
- Timestamp

**Non-blocking:** audit log failures are caught and logged but never prevent the admin operation from completing.

**Query capabilities:**
- Filter by admin, action, target type, target ID, date range
- Paginated results (default 50 per page)
- Target audit history (all actions on a specific entity)
- Admin action history (recent actions by a specific admin)

### Admin Role

The `isAdmin` flag on the User model controls admin access. It is stored in the JWT token and refreshed from the database on sign-in and token update.

---

## Fair Housing Compliance

**File:** `src/lib/fair-housing-policy.ts`

The Fair Housing Policy Gate blocks queries that could lead to Fair Housing Act violations in the AI-powered neighborhood intelligence feature.

### Protected Classes

Race, color, religion, national origin, sex, familial status, and disability (per the Federal Fair Housing Act).

### Blocked Categories

| Category | Example Patterns |
|----------|-----------------|
| `race-neighborhood` | "white neighborhood", "asian area" |
| `demographic-location` | "where do blacks live" |
| `demographic-exclusion` | "no hispanics", "avoid arabs" |
| `safety-crime` | "safe area", "dangerous neighborhood" |
| `crime-statistics` | "crime rate", "violent area" |
| `negative-area` | "bad neighborhood", "sketchy area" |
| `positive-area-vague` | "good neighborhood", "nice area" |
| `religion-neighborhood` | "christian community", "muslim area" |
| `no-children` | "no kids", "no children" |
| `adults-only` | "adults only area", "child free" |
| `no-disability` | "no disabled", "no wheelchairs" |
| `gender-only-area` | "men only area" |
| `citizenship` | "american only", "no immigrants" |
| `school-ranking` | "best school district" |
| `property-value-trends` | "property values going up" |
| `gentrification` | "gentrifying", "up and coming" |

### Behavior

- Queries are checked case-insensitively against regex patterns
- Blocked queries return a standardized refusal message that redirects to concrete amenity searches
- The refusal message does not reveal which specific pattern was matched (prevents gaming)
- Very short queries (< 3 characters) are skipped
- Blocked reason category is tracked for metrics but is not exposed to the user

---

## CORS and Origin Validation

### Allowed Origins / Hosts

Configured via environment variables:
- `ALLOWED_ORIGINS` -- comma-separated full origin URLs (e.g., `https://roomshare.com`)
- `ALLOWED_HOSTS` -- comma-separated hostnames (e.g., `roomshare.com`)

In development, `http://localhost:3000` and `localhost` are automatically added.

### Enforcement Points

| Endpoint | Origin Check | Host Check |
|----------|-------------|------------|
| `POST /api/metrics` | Yes (production only) | Yes (fallback when no origin) |
| `POST /api/chat` | Yes (production only) | Yes (fallback when no origin) |

Both endpoints use exact-match comparison (no wildcard patterns). Requests with disallowed origin/host receive a `403 Forbidden` response.

---

## Security Headers

Configured in `next.config.ts` and applied to all routes (`/(.*)`).

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | See below | XSS prevention, resource loading control |
| `X-Frame-Options` | `DENY` | Clickjacking prevention |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self), interest-cohort=()` | Restrict browser features, opt out of FLoC |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter |
| `X-DNS-Prefetch-Control` | `on` | Performance optimization |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing prevention |
| `Referrer-Policy` | `origin-when-cross-origin` | Limit referrer information leakage |

### Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://maps.googleapis.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
object-src 'none';
font-src 'self' https://tiles.openfreemap.org;
connect-src 'self' https://photon.komoot.io https://nominatim.openstreetmap.org
  https://tiles.openfreemap.org https://maps.googleapis.com
  https://places.googleapis.com https://*.supabase.co https://api.groq.com
  wss://*.supabase.co https://api.radar.io https://tiles.stadiamaps.com
  https://api.stadiamaps.com;
worker-src 'self' blob:;
child-src blob:;
frame-src 'self' https://accounts.google.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests;
```

In development, `'unsafe-eval'` is added to `script-src` for Next.js hot reloading.

### Additional Headers

- **`X-Powered-By`**: Disabled (`poweredByHeader: false` in next.config.ts)
- **Service worker (`/sw.js`)**: `Cache-Control: no-cache, no-store, must-revalidate` and `Service-Worker-Allowed: /`

### Environment Validation

**File:** `src/lib/env.ts`

All environment variables are validated at startup using Zod schemas:

- **Server-side:** DATABASE_URL, NEXTAUTH_SECRET (min 32 chars), NEXTAUTH_URL (valid URL), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET are required. CRON_SECRET is required in production and must not contain placeholder values.
- **Client-side:** All variables are optional with graceful degradation.
- **Production:** fails fast on invalid configuration. Development: warns but continues.
- Feature flags (`features.email`, `features.redis`, `features.turnstile`, etc.) provide runtime checks for optional service availability.
- Startup warnings are logged in production for missing optional services.
