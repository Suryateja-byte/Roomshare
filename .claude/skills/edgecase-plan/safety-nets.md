# Safety Nets Implementation Guide

Generic controls that protect against entire categories of failures. Prefer these over bespoke mitigations.

## 1. Input Validation & Normalization

**Server-side validation (never trust client):**
```
- Validate all inputs at API boundary
- Use schema validation (JSON Schema, Zod, Pydantic)
- Normalize before processing (trim, lowercase, etc.)
- Reject early with clear error codes
```

**Key patterns:**
- Allowlist valid values, don't blocklist bad ones
- Set explicit max lengths/sizes
- Validate business rules, not just types
- Return validation errors atomically (all at once)

## 2. Idempotency

**When required:**
- Payment processing
- Order creation
- Any state mutation that could be retried
- Webhook handlers

**Implementation:**
```
- Accept idempotency key in request header
- Store key → result mapping with TTL
- On duplicate key: return stored result, don't re-execute
- Key should be client-generated UUID
```

**Edge cases:**
- Request in progress when duplicate arrives → return 409 or wait
- Key expired but client retries → treat as new (acceptable)
- Different payload with same key → return error

## 3. Timeouts & Retries

**Timeout hierarchy:**
```
Client timeout > Gateway timeout > Service timeout > DB timeout
```

**Retry pattern:**
```
- Exponential backoff: 100ms, 200ms, 400ms, 800ms...
- Add jitter: ± 10-20% randomization
- Max retries: 3-5 for most cases
- Circuit breaker after threshold failures
```

**What NOT to retry:**
- 4xx errors (client error, won't help)
- Non-idempotent operations without idempotency key
- When already past deadline

## 4. Circuit Breaker

**States:**
```
CLOSED → normal operation
OPEN → fail fast, don't call dependency
HALF-OPEN → allow limited traffic to test recovery
```

**Thresholds (tune for your SLOs):**
- Open after: 5 failures in 10 seconds
- Stay open for: 30 seconds
- Half-open allows: 1 request
- Close after: 3 consecutive successes

**Fallback behaviors:**
- Return cached data (stale but available)
- Return degraded response (fewer features)
- Return error with clear messaging
- Queue for later processing

## 5. Concurrency Control

**Optimistic locking:**
```sql
UPDATE table SET value = new, version = version + 1
WHERE id = X AND version = current_version
-- If 0 rows affected: concurrent modification, retry
```

**Pessimistic locking:**
```sql
SELECT * FROM table WHERE id = X FOR UPDATE
-- Hold lock for duration of transaction
-- Use timeouts to prevent deadlocks
```

**Distributed locks:**
- Redis SETNX with TTL
- Always set expiration (prevent stuck locks)
- Use fencing tokens for safety

**Database constraints:**
- Unique indexes prevent duplicates
- Foreign keys maintain referential integrity
- Check constraints enforce business rules

## 6. Error Handling

**Consistent error format:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [...],
    "request_id": "abc-123"
  }
}
```

**Error mapping rules:**
- Map internal errors to stable public codes
- Never expose stack traces to clients
- Include request ID for debugging
- Log full details server-side

**HTTP status codes:**
- 400: Client error, don't retry
- 401/403: Auth issue
- 404: Resource not found
- 409: Conflict (retry may help)
- 429: Rate limited (retry with backoff)
- 500: Server error (may retry)
- 503: Unavailable (retry with backoff)

## 7. Rate Limiting

**Algorithms:**
- Token bucket: smooth rate, allows bursts
- Sliding window: more accurate, more memory
- Fixed window: simple, edge case at boundaries

**Dimensions:**
- Per user/API key
- Per IP (for unauthenticated)
- Per endpoint (expensive operations)
- Global (protect infrastructure)

**Response:**
- Return 429 with Retry-After header
- Include limit/remaining/reset in headers
- Different limits for different tiers

## 8. Feature Flags & Kill Switches

**Flag types:**
- Release flags: gradual rollout (1% → 10% → 100%)
- Ops flags: kill switch for emergencies
- Experiment flags: A/B testing
- Permission flags: entitlements

**Best practices:**
- Default to safe/off for new features
- Evaluate flags once per request, cache result
- Log flag evaluations for debugging
- Clean up old flags regularly

**Kill switch pattern:**
```
if (killswitch.isEnabled("feature-x")) {
  return fallbackBehavior();
}
// Normal feature code
```

## 9. Rollback & Compensation

**Database rollback:**
- Keep schema backward compatible
- Deploy code that handles both old/new schema
- Separate deploy from migration

**Compensation patterns:**
```
Saga: A → B → C
If C fails: undo-B → undo-A
```

- Each step needs compensating action
- Compensations must be idempotent
- Store saga state for recovery

**Feature rollback:**
- Feature flag off immediately
- Code rollback if needed
- Data migration rollback (harder, plan ahead)

## 10. Monitoring & Alerting

**The four golden signals:**
1. Latency (p50, p95, p99)
2. Traffic (requests/sec)
3. Errors (error rate %)
4. Saturation (resource utilization)

**Alert on:**
- Error rate > threshold (e.g., 1%)
- Latency p99 > threshold (e.g., 2s)
- Availability < threshold (e.g., 99.9%)
- Queue depth growing

**Log strategy:**
- Structured logging (JSON)
- Include: request_id, user_id, operation, duration
- Log at boundaries (request start/end, external calls)
- Sample verbose logs in high-traffic paths

**Trace strategy:**
- Propagate trace ID across services
- Record spans for external calls
- Sample traces (don't trace everything)

---

## Quick Reference: Safety Net Selection

| Risk Category | Primary Safety Net |
|---------------|-------------------|
| Invalid input | Schema validation |
| Duplicate operations | Idempotency keys |
| Slow dependencies | Timeouts + circuit breaker |
| Race conditions | Optimistic locking / DB constraints |
| Traffic spikes | Rate limiting |
| Bad deploys | Feature flags + rollback |
| Silent failures | Alerting on error rate |
| Data inconsistency | Saga pattern + reconciliation |
