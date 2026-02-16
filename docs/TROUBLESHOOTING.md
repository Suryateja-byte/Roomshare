# Troubleshooting Guide

Solutions for common issues encountered during Roomshare development.

---

## Table of Contents

- [Development Setup Issues](#development-setup-issues)
- [Database Issues](#database-issues)
- [Authentication Issues](#authentication-issues)
- [Build Errors](#build-errors)
- [Test Failures](#test-failures)
- [Runtime Errors](#runtime-errors)
- [Map and Geocoding Issues](#map-and-geocoding-issues)
- [Performance Issues](#performance-issues)
- [Common Error Codes](#common-error-codes)

---

## Development Setup Issues

### Node.js version mismatch

**Symptoms**: Unexpected syntax errors, missing APIs, `pnpm install` failures.

**Solution**: The project requires Node.js 18+. Check your version:

```bash
node --version
```

If using nvm:

```bash
nvm install 20
nvm use 20
```

### pnpm install fails

**Symptoms**: Dependency resolution errors, lockfile conflicts.

**Solutions**:

1. Clear the pnpm cache and reinstall:
   ```bash
   pnpm store prune
   rm -rf node_modules
   pnpm install
   ```

2. If there are lockfile conflicts:
   ```bash
   rm pnpm-lock.yaml
   pnpm install
   ```

3. If native modules fail to build (e.g., `@napi-rs/canvas`):
   ```bash
   # On Ubuntu/Debian
   sudo apt-get install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev

   # On macOS
   brew install pkg-config cairo pango libpng jpeg giflib librsvg
   ```

### Prisma generate fails after install

**Symptoms**: `Error: @prisma/client did not initialize` or `prisma generate` errors.

**Solution**: The `postinstall` script runs `prisma generate` automatically. If it fails:

```bash
# Ensure DATABASE_URL is set (even a dummy value works for generate)
export DATABASE_URL="postgresql://test:test@localhost:5432/test"
npx prisma generate
```

### Port 3000 already in use

**Symptoms**: `Error: listen EADDRINUSE :::3000`

**Solution**:

```bash
# Find and kill the process
lsof -i :3000
kill -9 <PID>

# Or use a different port
PORT=3001 pnpm dev
```

### Next.js dev lockfile issues (WSL/NTFS)

**Symptoms**: Dev server fails to start with lockfile errors, especially on WSL.

**Solution**: The project includes a cleanup script:

```bash
pnpm run clean:next-locks
pnpm dev
```

---

## Database Issues

### Cannot connect to PostgreSQL

**Symptoms**: `Error: connect ECONNREFUSED 127.0.0.1:5433` or `ECONNREFUSED`

**Solutions**:

1. **If using Docker**, ensure the container is running:
   ```bash
   docker compose up -d
   docker compose ps   # Verify the db service is healthy
   ```

2. **Check the port**. The docker-compose maps to port **5433** (not the default 5432):
   ```
   DATABASE_URL=postgresql://postgres:password@localhost:5433/roomshare?schema=public
   ```

3. **If using local PostgreSQL**, verify the service is running:
   ```bash
   # Linux
   sudo systemctl status postgresql

   # macOS
   brew services list | grep postgresql
   ```

### PostGIS extension not available

**Symptoms**: `ERROR: extension "postgis" is not available` or `type "geometry" does not exist`

**Solutions**:

1. **Docker**: The docker-compose uses `postgis/postgis:16-3.4` which includes PostGIS. Make sure you are not using a plain `postgres` image.

2. **Local PostgreSQL**:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install postgresql-16-postgis-3

   # macOS
   brew install postgis

   # Then enable it
   psql -d roomshare -c "CREATE EXTENSION IF NOT EXISTS postgis;"
   ```

### Migration fails

**Symptoms**: `prisma migrate dev` fails with errors.

**Solutions**:

1. **Dirty database state** -- Reset and re-migrate:
   ```bash
   npx prisma migrate reset
   ```
   Warning: This drops all data.

2. **Migration conflict** -- If you pulled changes with a new migration:
   ```bash
   npx prisma migrate dev
   ```

3. **Shadow database permission error**:
   ```bash
   # Grant createdb permission to your user
   psql -c "ALTER USER postgres CREATEDB;"
   ```

4. **Existing data conflicts** -- Check the migration SQL for compatibility with existing rows. Review rollback notes in the PR that added the migration.

### Prisma Client out of sync

**Symptoms**: `The table 'X' does not exist in the current database` or missing model fields.

**Solution**:

```bash
npx prisma generate   # Regenerate the client
npx prisma migrate dev # Apply any pending migrations
```

### Connection pool exhaustion

**Symptoms**: `Timed out fetching a new connection from the connection pool` in production or under load.

**Solution**: Prisma uses a connection pool. In serverless environments (Vercel), connections can accumulate. The project uses a singleton pattern in `src/lib/prisma.ts`. If you see pool exhaustion:

1. Check for unclosed transactions.
2. Reduce concurrent database operations.
3. Consider using `pgbouncer` in production.

---

## Authentication Issues

### NextAuth configuration errors

**Symptoms**: `[auth] Configuration error`, sign-in redirects to error page.

**Solutions**:

1. Verify environment variables are set:
   ```
   NEXTAUTH_SECRET=<at-least-32-characters>
   NEXTAUTH_URL=http://localhost:3000
   AUTH_TRUST_HOST=true
   ```

2. Generate a proper secret:
   ```bash
   openssl rand -base64 32
   ```

3. If using Google OAuth, verify callback URL is configured in Google Cloud Console:
   ```
   http://localhost:3000/api/auth/callback/google
   ```

### Session not persisting

**Symptoms**: User gets logged out on page refresh or navigation.

**Solutions**:

1. Check that `NEXTAUTH_SECRET` is consistent across restarts (do not regenerate on every start).
2. Verify cookies are not being blocked by browser settings.
3. Check `AUTH_TRUST_HOST=true` is set in development.

### OAuth callback errors

**Symptoms**: `OAuthCallback`, `OAuthCreateAccount`, or `OAuthAccountNotLinked` errors on the login page.

The project maps these error codes to user-friendly messages in `src/lib/auth-errors.ts`:

| Error code | Meaning | User sees |
|---|---|---|
| `OAuthSignin` | Could not start sign-in | "Could not start the sign-in process." |
| `OAuthCallback` | Callback failed | "Could not complete sign-in." |
| `OAuthCreateAccount` | Account creation failed | "Could not create your account." |
| `OAuthAccountNotLinked` | Email exists with different provider | "Unable to link this Google account." |
| `CredentialsSignin` | Wrong email/password | "Invalid email or password." |
| `AccountSuspended` | User suspended by admin | "Your account has been suspended." |
| `EmailNotVerified` | Google email not verified | "Your Google account email is not verified." |
| `AccessDenied` | User cancelled OAuth | "Sign-in was cancelled." |

**Solutions**:

1. For `OAuthAccountNotLinked`: The user likely signed up with email/password first. They need to sign in with their password.
2. For `OAuthCallback`: Try again or check that Google Client ID/Secret are correct.
3. For `Configuration`: Check that all auth-related env vars are set.

### Turnstile bot protection blocking requests

**Symptoms**: API routes return 403 or form submissions silently fail.

**Solutions**:

1. In development, use the test keys from `.env.example`:
   ```
   TURNSTILE_ENABLED=true
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
   ```

2. Or disable Turnstile entirely:
   ```
   TURNSTILE_ENABLED=false
   ```

3. For Jest tests, `jest.env.js` sets `TURNSTILE_ENABLED=false` automatically.

---

## Build Errors

### TypeScript errors

**Symptoms**: `pnpm typecheck` or `pnpm build` fails with type errors.

**Solutions**:

1. Run typecheck to see all errors:
   ```bash
   pnpm typecheck
   ```

2. If errors are in generated Prisma types, regenerate:
   ```bash
   npx prisma generate
   ```

3. If errors reference `next-env.d.ts`, ensure it exists (created by Next.js on first run):
   ```bash
   pnpm dev  # Start and stop to generate
   ```

### ESLint errors

**Symptoms**: `pnpm lint` reports errors.

**Solutions**:

Several rules are set to `warn` (not `error`) for pre-existing issues:

- `@typescript-eslint/no-explicit-any` -- Use `unknown` instead
- `react/no-unescaped-entities` -- Escape `'` and `"` in JSX text
- `@next/next/no-html-link-for-pages` -- Use `<Link>` from `next/link`

To auto-fix what can be fixed:

```bash
npx eslint --fix src/
```

### Next.js build fails

**Symptoms**: `pnpm build` fails with various errors.

**Common causes**:

1. **Missing environment variables** -- Build-time variables (those prefixed with `NEXT_PUBLIC_`) must be available at build time.

2. **Server components importing client modules** -- Ensure `"use client"` is at the top of client components.

3. **Dynamic imports of server-only modules** -- Use `next/dynamic` for heavy components.

4. **Prisma binary target mismatch** -- The schema includes multiple binary targets. If building for a platform not listed, add it:
   ```prisma
   binaryTargets = ["native", "debian-openssl-3.0.x", "windows"]
   ```

---

## Test Failures

### Jest environment issues

**Symptoms**: `ReferenceError: document is not defined` or `ReferenceError: window is not defined`.

**Solution**: The test is running in Node environment but needs jsdom. Check that `jest.config.js` has:

```javascript
testEnvironment: 'jest-environment-jsdom',
```

Or add the docblock to the specific test file:

```javascript
/**
 * @jest-environment jsdom
 */
```

### Prisma mock not working

**Symptoms**: `PrismaClientConstructorValidationError` or actual database calls in tests.

**Solutions**:

1. Verify `jest.env.js` sets `DATABASE_URL` before imports:
   ```javascript
   process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
   ```

2. If a test needs a specific mock return value, override the global mock:
   ```typescript
   (prisma.listing.findUnique as jest.Mock).mockResolvedValue({ id: 'test' });
   ```

3. If adding a new Prisma model, add it to the mock in `jest.setup.js`.

### Playwright browsers not installed

**Symptoms**: `Error: browserType.launch: Executable doesn't exist`

**Solution**:

```bash
npx playwright install
npx playwright install-deps  # Install system dependencies (Linux)
```

### E2E tests fail with auth errors

**Symptoms**: Tests expecting authenticated state get redirected to login.

**Solutions**:

1. Verify E2E environment variables are set:
   ```
   E2E_TEST_EMAIL=test@example.com
   E2E_TEST_PASSWORD=TestPassword123!
   ```

2. Ensure the seed script has been run:
   ```bash
   pnpm seed:e2e
   ```

3. Check that `playwright/.auth/user.json` exists and is not stale. Delete it to force re-authentication:
   ```bash
   rm -rf playwright/.auth/
   pnpm test:e2e
   ```

### Flaky tests / timeout issues

**Symptoms**: Tests pass sometimes, fail other times.

**Common causes and solutions**:

1. **Stale DOM handles** (Playwright) -- React re-renders can detach elements between `waitFor` and action. Use `waitFor('visible')` + direct action instead of intermediate DOM operations:
   ```typescript
   // Bad: stale handle
   const el = await page.locator('.btn');
   await el.scrollIntoViewIfNeeded();
   await el.click();

   // Good: stable approach
   await page.locator('.btn').waitFor({ state: 'visible' });
   await page.locator('.btn').click({ force: true });
   ```

2. **Radix overlay intercepts clicks** -- Radix UI creates overlay elements that intercept clicks during transitions. Use the `force: true` option or wait for the overlay to disappear.

3. **Hydration timing** -- Avoid `waitForTimeout()`. Instead, wait for a visible element:
   ```typescript
   // Bad
   await page.waitForTimeout(3000);

   // Good
   await expect(page.getByRole('region')).toBeVisible();
   ```

4. **Animation timing** -- Wait for animations to complete before asserting state.

---

## Runtime Errors

### Error boundary behavior

The `ErrorBoundary` component (`src/components/error/ErrorBoundary.tsx`) catches React rendering errors:

- In **development**: Shows error details (message + stack trace) with a retry button.
- In **production**: Shows a generic "Something went wrong" message with retry and reload buttons.
- Reports errors to **Sentry** with component stack traces.

If you see the error boundary:

1. Check the browser console for the original error.
2. Check Sentry for the full error context.
3. The retry button resets the component state and re-renders.
4. The reload button does a full page reload.

### Circuit breaker trips

The project uses circuit breakers (`src/lib/circuit-breaker.ts`) to prevent cascading failures when external services are down. Pre-configured breakers:

| Service | Failure threshold | Reset timeout | Effect when open |
|---|---|---|---|
| `redis` | 3 failures | 10 seconds | Rate limiting falls back to database |
| `radar` | 5 failures | 30 seconds | Nearby places unavailable |
| `email` | 5 failures | 60 seconds | Emails queued/skipped |
| `nominatimGeocode` | 5 failures | 30 seconds | Geocoding unavailable |
| `postgis` | 3 failures | 15 seconds | Spatial queries fail |

**When a circuit is open**, requests fail immediately with `CircuitOpenError` (code: `CIRCUIT_OPEN`) instead of waiting for the service to time out.

**To diagnose**:

1. Check if the upstream service is actually down.
2. Look for `CircuitOpenError` in logs.
3. The circuit will auto-reset after the timeout period.
4. In extreme cases, the circuit can be manually reset (admin operation).

### Rate limit hits

The project implements rate limiting at two levels:

1. **Upstash Redis** (`src/lib/with-rate-limit-redis.ts`) -- Used when `UPSTASH_REDIS_REST_URL` is configured.
2. **Database-backed** (`src/lib/with-rate-limit.ts`) -- Fallback when Redis is not available.

Rate-limited endpoints return HTTP **429 Too Many Requests**.

**Common rate limits** (configured in `src/lib/rate-limit.ts`):

| Endpoint | Limit |
|---|---|
| Registration | 5 per hour |
| Login | 10 per 15 minutes |
| Forgot password | 3 per hour |

**If you hit rate limits in development**:

1. Wait for the window to expire.
2. Clear rate limit entries from the database:
   ```sql
   DELETE FROM "RateLimitEntry" WHERE "identifier" LIKE '127.0.0.1%';
   ```
3. Restart the dev server (in-memory rate limit state is cleared).

---

## Map and Geocoding Issues

### Map tiles not loading

**Symptoms**: Gray/blank map, tile loading errors in console.

**Solutions**:

1. The project uses **Stadia Maps** tiles. On localhost/127.0.0.1, no API key is needed. For other domains:
   ```
   NEXT_PUBLIC_STADIA_API_KEY=your-key
   ```

2. Check the browser console for CORS errors or 403 responses from the tile server.

3. If using a VPN, some tile servers may be blocked. Try disabling the VPN.

### Geocoding failures

**Symptoms**: Address search returns no results, listing creation fails at geocoding step.

The project uses **Photon + Nominatim** (free, no API key needed) for geocoding. The `nominatimGeocode` circuit breaker protects against repeated failures.

**Solutions**:

1. Check if the Nominatim/Photon service is reachable:
   ```bash
   curl "https://photon.komoot.io/api/?q=San+Francisco"
   ```

2. If the circuit breaker is open, wait for the reset timeout (30 seconds).

3. Check the geocoding cache (`src/lib/geocoding-cache.ts`) -- previously geocoded addresses are cached.

### Google Maps/Places API key errors

**Symptoms**: Maps show "For development purposes only" watermark, Places autocomplete fails.

**Solutions**:

1. Verify keys in `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-browser-key
   NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY=your-uikit-key
   GOOGLE_PLACES_API_KEY=your-server-key
   ```

2. Check that the keys are restricted appropriately in Google Cloud Console:
   - Browser keys: HTTP referrer restricted to `localhost:3000`
   - Server keys: IP restricted

3. Verify that the required APIs are enabled: Maps JavaScript API, Places API.

---

## Performance Issues

### Slow database queries

**Symptoms**: API responses > 500ms, search page loading slowly.

**Solutions**:

1. Check for missing indexes, especially on search/filter columns:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM "Listing" WHERE ...;
   ```

2. The `Location` table has a GiST index on the `coords` column (`location_idx`). Spatial queries should use this index.

3. Use `prisma.$queryRaw` for complex queries that benefit from raw SQL optimization.

4. Ensure listing counts are cached (600ms debounce, 30s client cache per the project rules).

### Large bundle size

**Symptoms**: Slow initial page load, large JavaScript bundles.

**Solutions**:

1. Analyze the bundle:
   ```bash
   ANALYZE=true pnpm build
   ```

2. Use dynamic imports for heavy components:
   ```typescript
   const HeavyComponent = dynamic(() => import('@/components/HeavyComponent'));
   ```

3. Check that map-related libraries (`maplibre-gl`, `react-map-gl`) are only loaded on pages that need them.

### Memory leaks in development

**Symptoms**: Dev server becomes slow over time, high memory usage.

**Solutions**:

1. Restart the dev server periodically.
2. Check for event listeners that are not cleaned up in `useEffect` return functions.
3. Check for growing `Set` or `Map` objects that are never cleared.
4. The Jest config sets `workerIdleMemoryLimit: '512MB'` to prevent test memory issues.

---

## Common Error Codes

### Data layer errors (`src/lib/errors/data-errors.ts`)

| Error class | Code | Retryable | Description |
|---|---|---|---|
| `QueryError` | `QUERY_ERROR` | Yes | Database query execution failed |
| `ConnectionError` | `CONNECTION_ERROR` | Yes | Database connection or timeout |
| `DataTransformError` | `TRANSFORM_ERROR` | No | Data validation or transformation failed |

These errors are detected by checking the error message for keywords like `connection`, `timeout`, `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `pool`, `socket`.

Usage:

```typescript
import { isDataError, wrapDatabaseError } from '@/lib/errors';

try {
  await prisma.listing.findMany();
} catch (error) {
  const dataError = wrapDatabaseError(error, 'findListings');
  dataError.log({ context: 'search' }); // Structured logging
  if (dataError.retryable) {
    // Retry the operation
  }
}
```

### Auth error codes (`src/lib/auth-errors.ts`)

| Code | Severity | Message |
|---|---|---|
| `CredentialsSignin` | error | "Invalid email or password." |
| `OAuthSignin` | error | "Could not start the sign-in process." |
| `OAuthCallback` | error | "Could not complete sign-in." |
| `OAuthCreateAccount` | error | "Could not create your account." |
| `OAuthAccountNotLinked` | warning | "Unable to link this Google account." |
| `EmailNotVerified` | warning | "Your Google account email is not verified." |
| `AccessDenied` | info | "Sign-in was cancelled." |
| `AccountSuspended` | error | "Your account has been suspended." |
| `SessionRequired` | info | "Please sign in to access this page." |
| `Configuration` | error | "There is a problem with the server configuration." |

### Circuit breaker errors (`src/lib/circuit-breaker.ts`)

| Error | Code | Description |
|---|---|---|
| `CircuitOpenError` | `CIRCUIT_OPEN` | Service is unhealthy; requests rejected immediately |

Check which circuit is open via `error.circuitName` (values: `redis`, `radar`, `email`, `nominatim-geocode`, `postgis`).

### HTTP status codes

| Status | Used for |
|---|---|
| `400` | Validation errors, malformed requests |
| `401` | Missing or invalid authentication |
| `403` | Insufficient permissions (non-admin accessing admin routes, suspended user) |
| `404` | Resource not found |
| `409` | Conflict (duplicate booking, existing report) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

### Booking state machine errors (`src/lib/booking-state-machine.ts`)

| Error | Description |
|---|---|
| `InvalidStateTransitionError` | Attempted an invalid booking status transition (e.g., CANCELLED -> PENDING) |

Valid transitions:

```
PENDING  -> ACCEPTED, REJECTED, CANCELLED
ACCEPTED -> CANCELLED
REJECTED -> (terminal)
CANCELLED -> (terminal)
```

---

## Getting More Help

If you cannot resolve an issue using this guide:

1. Search the project issues on GitHub.
2. Check `tasks/lessons.md` for previously encountered issues and their resolutions.
3. Ask a targeted question describing what you tried and the exact error message.
