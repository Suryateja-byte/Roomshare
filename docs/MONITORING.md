# Monitoring Guide

Observability stack for Roomshare: error tracking, health probes, metrics, performance monitoring, structured logging, and circuit breakers.

---

## Table of Contents

1. [Sentry Integration](#sentry-integration)
2. [Health Probes](#health-probes)
3. [Metrics](#metrics)
4. [Web Vitals](#web-vitals)
5. [Structured Logging](#structured-logging)
6. [Circuit Breaker](#circuit-breaker)
7. [Alerting](#alerting)

---

## Sentry Integration

Roomshare uses `@sentry/nextjs` for error tracking and performance monitoring across three runtimes: client (browser), server (Node.js), and edge (middleware).

### Configuration Files

| File | Runtime | DSN Variable |
|------|---------|-------------|
| `sentry.client.config.ts` | Browser | `NEXT_PUBLIC_SENTRY_DSN` |
| `sentry.server.config.ts` | Node.js | `SENTRY_DSN` |
| `sentry.edge.config.ts` | Edge (middleware) | `SENTRY_DSN` |

Sentry initializes conditionally -- if the DSN environment variable is not set, Sentry is not initialized and the application runs without error tracking.

### Initialization

Sentry is loaded via Next.js instrumentation (`instrumentation.ts`):

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    // Also registers graceful shutdown handlers
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
```

The client config (`sentry.client.config.ts`) is automatically loaded by the `@sentry/nextjs` build plugin.

### Performance Monitoring

| Setting | Development | Production |
|---------|-------------|------------|
| `tracesSampleRate` | 1.0 (100%) | 0.1 (10%) |
| `profilesSampleRate` (server only) | 0 | 0.1 (10%) |
| `replaysSessionSampleRate` (client only) | N/A | 0.1 (10%) |
| `replaysOnErrorSampleRate` (client only) | N/A | 1.0 (100%) |

### Environment and Release Tracking

- **Environment:** `VERCEL_ENV` or `NODE_ENV` (e.g., `production`, `preview`, `development`)
- **Release:** `VERCEL_GIT_COMMIT_SHA` (auto-populated by Vercel)

### Error Filtering

Non-actionable errors are filtered out via `beforeSend`:

**Client:**
- `AbortError` -- cancelled fetch requests (user navigation)
- `Failed to fetch` / `Load failed` -- network errors from extensions

**Server:**
- `FetchTimeoutError` -- external service timeouts (handled gracefully)
- `NEXT_REDIRECT` -- expected auth redirects

**Edge:**
- `NEXT_REDIRECT` -- expected middleware redirects

### Transaction Filtering

Health check endpoints (`/api/health/*`) are excluded from performance monitoring via `beforeSendTransaction` on the server to reduce noise.

### Integrations

| Integration | Runtime | Purpose |
|-------------|---------|---------|
| `replayIntegration` | Client | Session replay with `maskAllText: true` and `blockAllMedia: true` (privacy-safe) |
| `browserTracingIntegration` | Client | Automatic browser performance tracing |
| `prismaIntegration` | Server | Database query tracing and span creation |

### Privacy

- `sendDefaultPii: false` on client -- no cookies, IP addresses, or user data sent to Sentry
- Session replay masks all text and blocks all media

### Graceful Shutdown

On process termination (SIGTERM, SIGINT), the shutdown handler flushes pending Sentry events with a 2-second timeout before disconnecting Prisma and exiting. This is registered in `instrumentation.ts` and implemented in `src/lib/shutdown.ts`.

---

## Health Probes

Two health endpoints for load balancer and orchestrator integration.

### Liveness Probe

**Endpoint:** `GET /api/health/live`

Confirms the process is running. Always returns 200 if the application is alive.

**Response (200):**
```json
{
  "status": "alive",
  "timestamp": "2026-02-15T12:00:00.000Z",
  "version": "a1b2c3d"
}
```

**Headers:** `Cache-Control: no-cache, no-store, must-revalidate`

**Use case:** Load balancer health checks, Kubernetes liveness probes.

### Readiness Probe

**Endpoint:** `GET /api/health/ready`

Confirms the application can serve traffic. Checks critical dependencies.

**Checks performed:**

| Check | Required | Failure Impact |
|-------|----------|----------------|
| Database (`SELECT 1`) | Yes | Returns 503 |
| Redis (ping) | No | Logged but non-fatal (DB fallback exists) |
| Supabase | No | Config existence check only |

**Response (200 -- healthy):**
```json
{
  "status": "ready",
  "timestamp": "2026-02-15T12:00:00.000Z",
  "version": "a1b2c3d",
  "checks": {
    "database": { "status": "ok", "latency": 5 },
    "redis": { "status": "ok", "latency": 12 },
    "supabase": { "status": "ok" }
  }
}
```

**Response (503 -- unhealthy):**
```json
{
  "status": "unhealthy",
  "checks": {
    "database": { "status": "error", "error": "Connection refused" }
  }
}
```

**Response (503 -- draining):**
```json
{
  "status": "draining",
  "message": "Application is shutting down"
}
```

During graceful shutdown, the readiness probe returns 503 to stop accepting new traffic while in-flight requests complete.

**Headers:** `Cache-Control: no-cache, no-store, must-revalidate`

**Use case:** Load balancer readiness checks, Kubernetes readiness probes, deployment verification.

---

## Metrics

### Privacy-Safe Metrics (`POST /api/metrics`)

Receives client-side metrics for neighborhood intelligence feature usage. Implements a full security stack:

1. **Origin/Host enforcement** -- exact match against `ALLOWED_ORIGINS` / `ALLOWED_HOSTS`
2. **Content-Type enforcement** -- `application/json` required
3. **Rate limiting** -- Redis-backed (100/min burst, 500/hour sustained)
4. **Body size guard** -- 10 KB max (raw text length, not Content-Length)
5. **JSON parsing** -- from raw text
6. **Schema validation** -- strict type allowlist for place types
7. **HMAC computation** -- listing IDs are HMAC-hashed, never stored raw
8. **Safe logging** -- only hashed/anonymized data logged

**Privacy guarantees:**
- Raw `listingId` is never stored or logged; server computes HMAC using `LOG_HMAC_SECRET`
- Client never sees `LOG_HMAC_SECRET`
- No user text, intent, or category is logged
- Place types are validated against an allowlist (excludes sensitive categories like religion and education)
- Fails closed: if `LOG_HMAC_SECRET` is missing, accepts request but skips logging entirely

### Ops Metrics (`GET /api/metrics/ops`)

Prometheus-compatible metrics endpoint for infrastructure monitoring.

**Authentication:** Bearer token via `METRICS_SECRET` environment variable. Default-deny: requires both `METRICS_SECRET` to be configured AND the bearer token to match.

**Metrics exposed:**

| Metric | Type | Description |
|--------|------|-------------|
| `process_uptime_seconds` | gauge | Process uptime |
| `nodejs_heap_size_used_bytes` | gauge | Used heap size |
| `nodejs_heap_size_total_bytes` | gauge | Total heap size |
| `nodejs_external_memory_bytes` | gauge | External memory |
| `nodejs_rss_bytes` | gauge | Resident set size |
| `nodejs_array_buffers_bytes` | gauge | ArrayBuffer memory |
| `app_info` | gauge | Application version and Node.js version labels |

**Response format:** Prometheus text exposition format (`text/plain`)

**Headers:** `Cache-Control: no-cache, no-store, must-revalidate`

**Integration:** Scrape with Prometheus, Grafana Agent, or Datadog Agent.

### Neighborhood Analytics

Client-side analytics for the Neighborhood Intelligence feature (`src/lib/analytics/neighborhood.ts`). Events are privacy-safe and sent to `/api/metrics` with HMAC-protected listing IDs.

**Events tracked:**

| Event | Description |
|-------|-------------|
| `neighborhood_query` | User searches for nearby places |
| `neighborhood_radius_expanded` | Search radius auto-expanded |
| `neighborhood_place_clicked` | User clicked a place (list or map) |
| `neighborhood_map_interacted` | Map pan, zoom, or click |
| `neighborhood_pro_upgrade_clicked` | Pro upgrade CTA clicked |

Events include a per-page-load session ID for grouping. In production, events are sent via `navigator.sendBeacon` for reliability during page unload.

---

## Web Vitals

Client-side Core Web Vitals tracking via the `WebVitals` component (`src/components/WebVitals.tsx`), using Next.js `useReportWebVitals` hook.

### Metrics Tracked

| Metric | Good | Poor | Unit |
|--------|------|------|------|
| LCP (Largest Contentful Paint) | <= 2500 | > 4000 | ms |
| FID (First Input Delay) | <= 100 | > 300 | ms |
| INP (Interaction to Next Paint) | <= 200 | > 500 | ms |
| CLS (Cumulative Layout Shift) | <= 0.1 | > 0.25 | score |
| FCP (First Contentful Paint) | <= 1800 | > 3000 | ms |
| TTFB (Time to First Byte) | <= 800 | > 1800 | ms |

### Rating System

Each metric is rated as `good`, `needs-improvement`, or `poor` based on Google's Core Web Vitals thresholds.

### Behavior

- **Development:** Metrics are logged to the browser console with color-coded output (green/amber/red).
- **Production:** Metrics are sent to `/api/metrics` via `navigator.sendBeacon` (or `fetch` with `keepalive` as fallback). Each report includes:
  - Metric ID, name, value, rating, delta
  - Navigation type
  - Page pathname
  - Timestamp

---

## Structured Logging

Production-grade structured logging via `src/lib/logger.ts`.

### Output Format

| Environment | Format |
|-------------|--------|
| Production | JSON (one line per entry, compatible with log aggregation) |
| Development | Human-readable with timestamp, level, request ID, user ID |

### Log Entry Schema

```typescript
interface LogEntry {
  timestamp: string;     // ISO 8601
  level: LogLevel;       // debug | info | warn | error
  message: string;
  requestId?: string;    // From x-request-id or x-vercel-id header
  userId?: string;       // From request context
  service: string;       // "roomshare"
  environment: string;   // NODE_ENV
  version?: string;      // Git commit SHA (first 7 chars)
  route?: string;        // Request path
  method?: string;       // HTTP method
  durationMs?: number;
  [key: string]: unknown; // Additional metadata
}
```

### Log Levels

| Level | Production | Development |
|-------|-----------|-------------|
| `debug` | Suppressed | Shown |
| `info` | Shown | Shown |
| `warn` | Shown | Shown |
| `error` | Shown | Shown |

### PII Redaction

All log metadata is automatically redacted before output. Two layers of protection:

**Field-level redaction** -- keys matching these names are replaced with `[REDACTED]`:
`password`, `token`, `secret`, `apikey`, `api_key`, `authorization`, `cookie`, `sessiontoken`, `accesstoken`, `refreshtoken`, `bearer`, `credential`, `private_key`, `privatekey`, `ssn`, `creditcard`, `credit_card`, `cardnumber`, `cvv`, `cvc`

**Pattern-level redaction** -- regex patterns in string values:
- JWT tokens (`Bearer eyJ...`) -> `[REDACTED]`
- Email addresses -> `[REDACTED]`
- Phone numbers (international, US formats) -> `[REDACTED_PHONE]`
- Street addresses -> `[REDACTED_ADDRESS]`

Redaction is applied recursively up to 10 levels deep and works on both async and sync log methods.

### Usage

```typescript
import { logger } from '@/lib/logger';

// Async (preferred -- includes full request context from headers)
await logger.info('User logged in', { userId: '123' });
await logger.error('Failed to send email', { error: err.message });

// Sync (for catch blocks where async is awkward)
logger.sync.error('Sync error log', { error: err.message });

// Child logger with preset context
const routeLogger = logger.child({ route: '/api/users', method: 'POST' });
await routeLogger.info('Processing request');
```

---

## Circuit Breaker

The circuit breaker pattern (`src/lib/circuit-breaker.ts`) prevents cascading failures by failing fast when external services are unhealthy.

### States

```
CLOSED  --[failures >= threshold]-->  OPEN  --[resetTimeout elapsed]-->  HALF_OPEN
  ^                                                                          |
  |-----[successes >= successThreshold]--------------------------------------+
  |                                    OPEN  <--[any failure]----------------+
```

| State | Behavior |
|-------|----------|
| `CLOSED` | Normal operation -- requests pass through |
| `OPEN` | Service unhealthy -- requests fail immediately with `CircuitOpenError` |
| `HALF_OPEN` | Testing recovery -- limited requests pass through; any failure reopens |

### Pre-Configured Breakers

| Service | Failure Threshold | Reset Timeout | Success Threshold |
|---------|-------------------|---------------|-------------------|
| `redis` | 3 failures | 10 seconds | 2 successes |
| `radar` | 5 failures | 30 seconds | 2 successes |
| `email` | 5 failures | 60 seconds | 3 successes |
| `nominatimGeocode` | 5 failures | 30 seconds | 2 successes |
| `postgis` | 3 failures | 15 seconds | 2 successes |

### Usage

```typescript
import { circuitBreakers, isCircuitOpenError } from '@/lib/circuit-breaker';

try {
  const result = await circuitBreakers.redis.execute(() => redis.get('key'));
} catch (error) {
  if (isCircuitOpenError(error)) {
    // Circuit is open -- use fallback value
    return fallbackValue;
  }
  throw error;
}
```

### Integration with Rate Limiting

The Redis rate limiter (`src/lib/rate-limit-redis.ts`) wraps all Redis operations with:
1. **Circuit breaker** (`circuitBreakers.redis`) -- prevents repeated calls to unhealthy Redis
2. **Timeout wrapper** -- prevents indefinite hangs on slow Redis operations
3. **In-memory fallback** -- when Redis is unavailable, rate limiting continues with a local `Map`-based sliding window (non-persistent but prevents complete loss of protection)

### Statistics

Each circuit breaker tracks:
- Current state, failure count, success count
- Last failure/success timestamps
- Total requests and total failures

Access via `circuitBreakers.redis.getStats()`.

---

## Alerting

### Sentry Alerts

Configure alerts in Sentry for:

| Alert Type | Suggested Trigger | Priority |
|------------|-------------------|----------|
| Error spike | >10 events in 5 minutes | High |
| New issue | First occurrence of any new error | Medium |
| Unhandled exception | Any unhandled error | High |
| Performance regression | LCP p95 > 4000ms | Medium |
| Release health | Crash-free session rate < 99% | High |

### Health Probe Monitoring

Set up external monitoring to poll health endpoints:

| Endpoint | Interval | Alert On |
|----------|----------|----------|
| `/api/health/live` | 30 seconds | Non-200 response |
| `/api/health/ready` | 60 seconds | Non-200 response or `database.status: "error"` |

**Recommended tools:** UptimeRobot, Pingdom, Better Uptime, or Vercel's built-in monitoring.

### Circuit Breaker Monitoring

Monitor `[RateLimit]` log prefixes for:
- `RL_DB_ERR` -- database rate limit failures
- `RL_DEGRADED` -- degraded mode active (in-memory fallback)
- `Redis timeout` -- Redis connection issues
- `Circuit breaker open` -- persistent service failures

### Startup Warnings

On production startup, the application logs warnings for missing optional services (see `src/lib/env.ts`). Monitor for `[ENV] Optional services not configured` messages to ensure all expected services are properly configured.

### Cron Job Monitoring

Monitor cron job execution via Vercel Cron logs or by checking response payloads:

| Job | Success Indicator | Failure Indicator |
|-----|-------------------|-------------------|
| `cleanup-rate-limits` | `success: true` | Status 500 or `Cleanup failed` |
| `refresh-search-docs` | `success: true, errors: 0` | `errors > 0` or status 500 |
| `search-alerts` | `success: true` | Status 500 or `success: false` |
