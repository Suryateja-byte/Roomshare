# Deployment Guide

Production deployment guide for Roomshare. Covers environment setup, local development, Vercel deployment, database configuration, and cron jobs.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Local Development](#local-development)
4. [Vercel Deployment](#vercel-deployment)
5. [Database Setup](#database-setup)
6. [Cron Jobs](#cron-jobs)
7. [Post-Deployment Checklist](#post-deployment-checklist)

---

## Prerequisites

### Required Services and Accounts

| Service | Purpose | Required | Free Tier |
|---------|---------|----------|-----------|
| [PostgreSQL 16+](https://www.postgresql.org/) with [PostGIS](https://postgis.net/) | Primary database with geospatial queries | Yes | Yes (Supabase/Neon) |
| [Vercel](https://vercel.com/) | Hosting and deployment | Yes (production) | Yes |
| [Google Cloud Console](https://console.cloud.google.com/) | OAuth, Maps, Places APIs | Yes | Limited |
| [Supabase](https://supabase.com/) | Image storage and realtime messaging | Recommended | Yes |
| [Resend](https://resend.com/) | Transactional email (verification, password reset) | Recommended | Yes |
| [Upstash](https://upstash.com/) | Redis-backed rate limiting | Recommended | Yes |
| [Sentry](https://sentry.io/) | Error tracking and performance monitoring | Recommended | Yes |
| [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) | Bot protection (CAPTCHA) | Recommended | Yes |
| [Groq](https://groq.com/) | AI chat (neighborhood intelligence) | Optional | Yes |
| [Radar](https://radar.com/) | Nearby places search | Optional | Yes |
| [Stadia Maps](https://stadiamaps.com/) | Basemap tiles (Alidade Smooth style) | Optional | Yes (non-commercial) |

### Required Tools

- **Node.js** 20+
- **pnpm** (package manager)
- **Docker** and **Docker Compose** (for local database)
- **Git**

---

## Environment Variables

Copy `.env.example` to `.env` and configure each variable. Variables are grouped by service.

```bash
cp .env.example .env
```

### Database

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string with PostGIS | See [Database Setup](#database-setup) |

**Format:** `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public`

Local Docker default: `postgresql://postgres:password@localhost:5433/roomshare?schema=public`

### Authentication (NextAuth v5)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `NEXTAUTH_SECRET` | Yes | JWT signing secret (min 32 chars) | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | Application URL | `http://localhost:3000` for dev |
| `AUTH_TRUST_HOST` | Yes | Trust proxy headers | Set to `true` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID | Google Cloud Console > APIs & Services > Credentials > Create OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret | Same as above |

**Google OAuth Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Navigate to APIs & Services > Credentials
4. Create OAuth 2.0 Client ID (Web application)
5. Add authorized redirect URI: `https://your-domain.com/api/auth/callback/google`
6. For local dev, also add: `http://localhost:3000/api/auth/callback/google`

### Security Secrets

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `CRON_SECRET` | Prod only | Authenticates cron job requests (min 32 chars) | `openssl rand -base64 32` |
| `LOG_HMAC_SECRET` | Recommended | HMAC key for privacy-safe metric logging | `openssl rand -hex 32` |
| `METRICS_SECRET` | Prod only | Bearer token for `/api/metrics/ops` endpoint, min 32 chars (default-deny if unset) | `openssl rand -base64 32` |

### Origin/Host Security (Production)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ALLOWED_ORIGINS` | Prod only | Comma-separated allowed origins | `https://roomshare.com,https://www.roomshare.com` |
| `ALLOWED_HOSTS` | Prod only | Comma-separated allowed hosts | `roomshare.com,www.roomshare.com` |

These are enforced by `/api/agent`, `/api/chat`, and `/api/metrics` to reject cross-origin requests.

### Error Tracking (Sentry)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `SENTRY_DSN` | Recommended | Sentry Data Source Name | Sentry > Project Settings > Client Keys (DSN) |
| `SENTRY_AUTH_TOKEN` | Recommended | For source map uploads | Sentry > Settings > Auth Tokens |

**Important:** Client-side error tracking requires `NEXT_PUBLIC_SENTRY_DSN` to be set explicitly (it is NOT auto-mapped from `SENTRY_DSN`). Set both `SENTRY_DSN` (server-side) and `NEXT_PUBLIC_SENTRY_DSN` (client-side) in your environment.

### Supabase (Storage and Realtime)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Recommended | Supabase project URL | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Recommended | Public anonymous key | Same location |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Server-side service role key (never expose to client) | Same location |

### Email (Resend)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `RESEND_API_KEY` | Recommended | Resend API key for transactional email | [Resend Dashboard](https://resend.com/api-keys) |
| `FROM_EMAIL` | Recommended | Sender email address | e.g., `RoomShare <noreply@yourdomain.com>` |

Used for email verification, password reset, and search alert notifications.

### AI Chat (Groq)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `GROQ_API_KEY` | Optional | Groq API key for AI-powered neighborhood chat | [Groq Console](https://console.groq.com/keys) |

### Rate Limiting (Upstash Redis)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `UPSTASH_REDIS_REST_URL` | Recommended | Upstash Redis REST URL | [Upstash Console](https://console.upstash.com/) > Create Database |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Upstash Redis REST token | Same location |

Falls back to database-backed rate limiting if not configured (slower but functional).

### Google Maps / Places

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional | Browser key for Maps (HTTP referrer restricted) | Google Cloud Console > APIs & Services > Credentials |
| `NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY` | Optional | Browser key for Places UI Kit | Same location |
| `GOOGLE_PLACES_API_KEY` | Optional | Server key for backend geocoding (IP restricted) | Same location |

**Note:** Primary geocoding uses Photon + Nominatim (free, no API key needed). Google keys are optional for enhanced features.

### Radar (Nearby Places)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `RADAR_SECRET_KEY` | Optional | Server-side secret key (IP restricted, never expose to client) | [Radar Dashboard](https://radar.com/dashboard) |
| `NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY` | Optional | Publishable key (browser-safe) | Same location |
| `NEXT_PUBLIC_NEARBY_ENABLED` | Optional | Feature flag (`true` / `false`) | Set to `true` to enable |

### Stadia Maps (Basemap Tiles)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `NEXT_PUBLIC_STADIA_API_KEY` | Optional | API key for Alidade Smooth map tiles | [Stadia Maps Dashboard](https://client.stadiamaps.com/) |

**Authentication options:**
- **Domain auth (recommended for production):** Add your domain at client.stadiamaps.com -- no API key needed in code.
- **API key (fallback):** Set this variable for query-string auth.
- **Development:** localhost/127.0.0.1 works without an API key.

**Commercial use:** Free tier is non-commercial only. Production requires a paid subscription.

### Cloudflare Turnstile (Bot Protection)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `TURNSTILE_ENABLED` | Recommended | Kill switch (`true` / `false`) | Set to `true` to enable |
| `TURNSTILE_SECRET_KEY` | Recommended | Server-side secret key | [Cloudflare Turnstile Dashboard](https://dash.cloudflare.com/turnstile) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Recommended | Client-side site key | Same location |

**Test keys (for dev/E2E):**
- Secret: `1x0000000000000000000000000000000AA`
- Site: `1x00000000000000000000AA`

### Feature Flags and Application

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `ENABLE_SEARCH_DOC` | Prod: Yes | Enable denormalized search docs (`true`/`false`). Without this, text search falls back to slow LIKE queries. | Set to `true` in production |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical app URL for metadata, sitemap, robots.txt, and structured data | e.g., `https://roomshare.com` |
| `NODE_ENV` | Auto | Node environment (`development`, `production`, `test`) | Auto-set by platform |
| `TRUST_PROXY` | Prod only | Trust `X-Forwarded-For` headers for rate limiting behind a reverse proxy | Set to `true` behind a load balancer |

### HERE Maps (Geocoding Comparison)

| Variable | Required | Description | How to Obtain |
|----------|----------|-------------|---------------|
| `HERE_API_KEY` | Optional | HERE Maps API key for geocoding accuracy comparison | [HERE Developer](https://developer.here.com/) |

### E2E Testing

| Variable | Required | Description |
|----------|----------|-------------|
| `E2E_BASE_URL` | Dev only | Defaults to `http://localhost:3000` |
| `E2E_TEST_EMAIL` | Dev only | Test user email |
| `E2E_TEST_PASSWORD` | Dev only | Test user password |
| `E2E_ADMIN_EMAIL` | Dev only | Admin test user email |
| `E2E_ADMIN_PASSWORD` | Dev only | Admin test user password |

---

## Local Development

### 1. Clone and Install

```bash
git clone <repository-url>
cd roomshare
pnpm install
```

`pnpm install` automatically runs `prisma generate` via the `postinstall` script.

### 2. Start the Database

Docker Compose provides PostgreSQL 16 with PostGIS 3.4:

```bash
# Set the required password
export POSTGRES_PASSWORD=password

# Start the database
docker compose up -d
```

The database runs on port **5433** (mapped from container port 5432) and is bound to localhost only (`127.0.0.1:5433`).

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values (DATABASE_URL default works with Docker Compose)
```

### 4. Run Database Migrations

```bash
npx prisma migrate dev
```

This applies all migrations and seeds the PostGIS extension.

### 5. Start the Dev Server

```bash
pnpm dev
```

The application runs at `http://localhost:3000`.

### Available Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run Jest tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm test:e2e` | Run Playwright E2E tests |

---

## Vercel Deployment

### Build Configuration

The project uses standard Next.js build settings. No custom build commands are needed.

| Setting | Value |
|---------|-------|
| Framework | Next.js |
| Build Command | `next build` (default) |
| Install Command | `pnpm install` (runs `prisma generate` via postinstall) |
| Output Directory | `.next` (default) |
| Node.js Version | 20.x |

### next.config.ts Features

- **Image optimization:** AVIF and WebP formats with remote patterns for Supabase, Unsplash, Google profile images
- **Bundle optimization:** `optimizePackageImports` for lucide-react, framer-motion, date-fns, Radix UI, Heroicons
- **Security headers:** CSP, HSTS, X-Frame-Options (DENY), X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Service worker:** Cache-busted with git commit SHA, `Cache-Control: no-cache` on `/sw.js`
- **`poweredByHeader: false`** to hide `X-Powered-By: Next.js`

### Environment Variables in Vercel

1. Go to your Vercel project > Settings > Environment Variables
2. Add all required variables from the tables above
3. For `NEXT_PUBLIC_*` variables, ensure they are available at **Build Time**
4. For server-only variables (`DATABASE_URL`, `NEXTAUTH_SECRET`, etc.), set them for **Production**, **Preview**, and **Development** as needed

**Vercel auto-populates:**
- `VERCEL_ENV` (production / preview / development)
- `VERCEL_GIT_COMMIT_SHA` (used for release tracking in Sentry)
- `VERCEL_URL` (deployment URL)

### vercel.json

The `vercel.json` file configures three cron jobs (see [Cron Jobs](#cron-jobs)). No other configuration overrides are needed.

### Prisma Binary Targets

The Prisma schema includes binary targets for deployment compatibility:

```prisma
binaryTargets = ["native", "debian-openssl-3.0.x", "windows"]
```

- `native` -- local development (auto-detected)
- `debian-openssl-3.0.x` -- Vercel serverless functions (Amazon Linux 2)
- `windows` -- Windows local development

---

## Database Setup

### PostgreSQL with PostGIS

Roomshare requires PostgreSQL 16+ with the PostGIS extension for geospatial queries (location-based search, bounding box filtering, distance calculations).

#### Local (Docker Compose)

The included `docker-compose.yml` uses the `postgis/postgis:16-3.4` image:

```bash
export POSTGRES_PASSWORD=password
docker compose up -d
```

Connection string: `postgresql://postgres:password@localhost:5433/roomshare?schema=public`

#### Production (Hosted PostgreSQL)

Use a PostgreSQL provider that supports PostGIS:

- **Supabase** (recommended): PostGIS enabled by default
- **Neon**: Enable PostGIS extension manually
- **AWS RDS**: Select PostgreSQL with PostGIS
- **Railway**: PostGIS available

**Connection string format:**
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

For Supabase, use the **Direct connection** string (not the pooled connection) for migrations. Use the pooled connection string for production runtime if connection pooling is needed.

#### Running Migrations

```bash
# Apply all pending migrations
npx prisma migrate deploy

# For development (creates migration files)
npx prisma migrate dev
```

The PostGIS extension is enabled via the Prisma schema:

```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [postgis]
}
```

---

## Cron Jobs

Roomshare uses three cron jobs configured in `vercel.json`. On Vercel, these run automatically. For other hosting providers, set up external cron triggers.

All cron endpoints are authenticated with `CRON_SECRET` via Bearer token. The secret must be at least 32 characters and must not contain placeholder values.

### 1. Cleanup Rate Limits

| Setting | Value |
|---------|-------|
| Path | `/api/cron/cleanup-rate-limits` |
| Schedule | `0 3 * * *` (daily at 3:00 AM UTC) |
| Purpose | Delete expired `RateLimitEntry` records from the database |

Prevents the rate limit table from growing unbounded. Only relevant when using database-backed rate limiting (no Redis configured).

### 2. Refresh Search Docs

| Setting | Value |
|---------|-------|
| Path | `/api/cron/refresh-search-docs` |
| Schedule | `*/5 * * * *` (every 5 minutes) |
| Purpose | Process dirty search document flags and update the `listing_search_docs` materialized table |

This is the most critical cron job. It keeps the denormalized search index up to date by processing listings marked as "dirty" (changed since last refresh). Processes up to 100 listings per run in oldest-first order.

### 3. Search Alerts

| Setting | Value |
|---------|-------|
| Path | `/api/cron/search-alerts` |
| Schedule | `0 9 * * *` (daily at 9:00 AM UTC) |
| Purpose | Process saved search alerts and notify users of new matching listings |

Sends email notifications to users who have saved searches with alerts enabled.

### External Cron Setup

If not using Vercel Cron, trigger these endpoints with an HTTP GET request including the authorization header:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/cron/cleanup-rate-limits
```

---

## Post-Deployment Checklist

### Health Check Verification

After deploying, verify the application is healthy:

```bash
# Liveness probe (should return 200 with status: "alive")
curl https://your-domain.com/api/health/live

# Readiness probe (should return 200 with status: "ready")
# Checks database connectivity and optional Redis/Supabase
curl https://your-domain.com/api/health/ready
```

### Migration Verification

Ensure database migrations are applied:

```bash
npx prisma migrate deploy
```

### Full Checklist

- [ ] `DATABASE_URL` points to production database with PostGIS
- [ ] `NEXTAUTH_SECRET` is a unique, generated secret (not a placeholder)
- [ ] `CRON_SECRET` is configured and at least 32 characters
- [ ] Google OAuth redirect URI includes production domain
- [ ] `ALLOWED_ORIGINS` and `ALLOWED_HOSTS` are set for production domain
- [ ] Sentry DSN is configured for error tracking
- [ ] `/api/health/live` returns `200`
- [ ] `/api/health/ready` returns `200` with `database: { status: "ok" }`
- [ ] Cron jobs are triggering on schedule (check Vercel Cron logs or external cron service)
- [ ] Email delivery works (test registration flow)
- [ ] Google OAuth sign-in works
- [ ] Search returns results (search docs are being refreshed)
- [ ] No startup warnings in logs (check `[ENV] Optional services not configured` messages)
