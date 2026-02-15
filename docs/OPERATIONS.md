# Roomshare Operations Guide

Operational runbook for monitoring, incident response, and maintenance.

---

## Service Overview

| Layer | Technology | Notes |
|-------|-----------|-------|
| App | Next.js 15 on Vercel | SSR + API routes, Node.js runtime |
| Database | PostgreSQL + PostGIS (Prisma ORM) | Hosted externally (e.g., Supabase, Neon) |
| Cache/Rate Limiting | Upstash Redis (optional) | Falls back to DB-backed rate limiting |
| Error Tracking | Sentry (optional) | Client, server, and edge configs |
| Bot Protection | Cloudflare Turnstile | Required in production |

---

## Health Checks

### Liveness: `GET /api/health/live`

Returns `200` if the process is running. No dependency checks.

```json
{ "status": "alive", "timestamp": "...", "version": "abc1234" }
```

### Readiness: `GET /api/health/ready`

Returns `200` when all critical dependencies are healthy, `503` otherwise.

```json
{
  "status": "ready | unhealthy | draining",
  "timestamp": "...",
  "version": "abc1234",
  "checks": {
    "database": { "status": "ok", "latency": 12 },
    "redis": { "status": "ok", "latency": 5 },
    "supabase": { "status": "ok" }
  }
}
```

| Dependency | Critical? | Check | Timeout |
|-----------|-----------|-------|---------|
| Database (Prisma) | Yes | `SELECT 1` | Default |
| Redis (Upstash) | No | HTTP ping | 2000ms |
| Supabase | No | Config existence | N/A |

During graceful shutdown, readiness returns `503` with `"status": "draining"`.

---

## Metrics: `GET /api/metrics/ops`

Prometheus-format metrics endpoint. **Requires** `Authorization: Bearer <METRICS_SECRET>` header. Returns `401` if `METRICS_SECRET` is unset or token is wrong.

**Exported metrics:**

| Metric | Type |
|--------|------|
| `process_uptime_seconds` | gauge |
| `nodejs_heap_size_used_bytes` | gauge |
| `nodejs_heap_size_total_bytes` | gauge |
| `nodejs_external_memory_bytes` | gauge |
| `nodejs_rss_bytes` | gauge |
| `nodejs_array_buffers_bytes` | gauge |
| `app_info{version, node_version}` | gauge |

---

## Graceful Shutdown

Signals: `SIGTERM`, `SIGINT`, `SIGUSR2` (nodemon). Hard timeout: **8 seconds** (Vercel gives ~10s).

| Step | Action | Timeout |
|------|--------|---------|
| 1 | Set draining mode (health returns 503) | Immediate |
| 2 | Flush Sentry events | 2s (2.5s race) |
| 3 | Disconnect Prisma | 3s race |
| 4 | Force exit if still running | 8s total |

Duplicate registration prevented via `Symbol.for('roomshare.shutdown.registered')`.

---

## Error Tracking (Sentry)

Sentry initializes only when `SENTRY_DSN` is set.

| Setting | Production | Dev/Test |
|---------|-----------|----------|
| Trace sample rate | 10% | 100% |
| Profile sample rate | 10% | 0% |

**Filtered (dropped):**
- `FetchTimeoutError` (known non-actionable)
- Errors containing `NEXT_REDIRECT` (expected auth redirects)
- Transactions matching `/api/health` (noise reduction)

---

## Circuit Breakers

All external service calls are wrapped in circuit breakers. States: CLOSED (normal) -> OPEN (failing fast) -> HALF_OPEN (testing recovery).

| Breaker | Failure Threshold | Reset Timeout | Success to Close |
|---------|------------------:|--------------:|-----------------:|
| `redis` | 3 | 10s | 2 |
| `radar` | 5 | 30s | 2 |
| `email` | 5 | 60s | 3 |
| `nominatimGeocode` | 5 | 30s | 2 |
| `postgis` | 3 | 15s | 2 |

When open, calls throw `CircuitOpenError` (code: `CIRCUIT_OPEN`). Stats available via `getStats()` on each breaker.

---

## SLO Targets

| Metric | Target |
|--------|--------|
| Availability | 99.5% |
| API response time (p95) | < 500ms |
| LCP (p95) | < 3s |

---

## Alerting Checklist

Monitor these signals:

- [ ] `/api/health/ready` returns non-200 for > 30s
- [ ] Error rate > 1% (Sentry alert)
- [ ] API p95 latency > 500ms
- [ ] Database connection failures
- [ ] Circuit breaker OPEN events (especially `postgis`, `redis`)
- [ ] Memory usage > 80% of allocation
- [ ] Turnstile verification failures spike

---

## Incident Response

### 1. Detect
Health check alerts, Sentry error spikes, user reports, Vercel status.

### 2. Triage
Check `/api/health/ready` response for which dependency is down. Check circuit breaker states. Check Sentry for error patterns.

### 3. Communicate
Update status page. Notify affected users if > 5 min impact.

### 4. Fix
Apply fix or roll back (see runbooks below).

### 5. Postmortem
Document: timeline, root cause, impact, prevention measures.

---

## Runbooks

### Health check failing (`/api/health/ready` returns 503)

1. Check response body `checks` object to identify failing dependency
2. If `database.status: "error"` -> Check DB host status, connection limits, run `SELECT 1` manually
3. If `status: "draining"` -> Instance is shutting down; this is expected during deploys
4. If Redis check fails -> Non-critical; verify Upstash dashboard, app falls back to DB rate limiting

### High error rate (Sentry spike)

1. Check Sentry issues dashboard for new/regressing errors
2. Filter out known noise (`FetchTimeoutError`, `NEXT_REDIRECT`)
3. Check if errors correlate with a recent deployment
4. If deployment-related -> Roll back via Vercel (see below)

### Database connection issues

1. Check DB host provider dashboard (Supabase/Neon)
2. Check connection pool exhaustion: look for connection count in DB metrics
3. Check for long-running queries or locks: `SELECT * FROM pg_stat_activity WHERE state = 'active'`
4. If PostGIS extension issues -> Check `postgis` circuit breaker status

### Circuit breaker open

1. Identify which breaker is open from logs or metrics
2. Check the upstream service status:
   - `redis` -> Upstash dashboard
   - `radar` -> Radar.io status page
   - `email` -> Resend dashboard
   - `nominatimGeocode` -> nominatim.openstreetmap.org status
   - `postgis` -> Database PostGIS extension health
3. Breaker auto-recovers after reset timeout (10-60s depending on service)
4. If upstream is confirmed down, the breaker is working as designed

### Vercel rollback

1. Go to Vercel dashboard -> Deployments
2. Find last known good deployment
3. Click "..." -> "Promote to Production"
4. Verify `/api/health/ready` returns 200 after promotion

---

## Environment Variables (Ops-Relevant)

| Variable | Required | Purpose |
|----------|----------|---------|
| `METRICS_SECRET` | For metrics | Bearer token for `/api/metrics/ops` |
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `SENTRY_AUTH_TOKEN` | No | Sentry release/sourcemap uploads |
| `UPSTASH_REDIS_REST_URL` | No | Redis for rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | No | Redis auth token |
| `TURNSTILE_SECRET_KEY` | Prod | Cloudflare Turnstile server key |
| `TURNSTILE_ENABLED` | Prod | Must be `"true"` in production |
| `CRON_SECRET` | Prod | Auth for cron job endpoints (min 32 chars) |
| `LOG_HMAC_SECRET` | No | HMAC key for privacy-safe metrics |
| `VERCEL_GIT_COMMIT_SHA` | Auto | Set by Vercel; used for version labeling |
