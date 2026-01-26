# Edge Case Taxonomy

Use this checklist to systematically brainstorm failure modes. For each category, consider: "What could go wrong here?"

## 1. Inputs & Data Validation

**Type mismatches:**
- Wrong data types (string where int expected)
- Null/undefined/None values
- Empty strings vs null distinction
- Unexpected enum values, unknown status codes

**Boundary conditions:**
- Min/max values (0, -1, MAX_INT, empty arrays)
- Very large payloads (1MB+ JSON, huge file uploads)
- Unicode edge cases (emoji, RTL, zero-width chars)
- Special characters in strings (quotes, backslashes, newlines)

**Schema issues:**
- Missing required fields
- Extra unexpected fields
- Nested object depth limits
- Array length limits
- Schema version mismatches

**Data quality:**
- Partial/incomplete data
- Legacy data formats
- Encoding issues (UTF-8 vs Latin-1)
- Timezone confusion
- Date parsing edge cases (Feb 29, DST transitions)

## 2. Network & External Dependencies

**Availability:**
- Complete outage of dependency
- Partial degradation (some endpoints work)
- DNS resolution failures
- Connection refused vs timeout

**Latency:**
- Slow responses (2s, 10s, 30s)
- Response slower than timeout
- Cascading timeouts
- Retry amplification

**Response issues:**
- Malformed responses (invalid JSON)
- Unexpected HTTP status codes
- Rate limit responses (429)
- Truncated responses
- Character encoding in responses

**Webhooks & callbacks:**
- Duplicate delivery
- Out-of-order delivery
- Delayed delivery (hours/days late)
- Webhook endpoint down during delivery
- Signature/auth validation failures

## 3. Concurrency & Timing

**Race conditions:**
- Read-modify-write conflicts
- Double-click/double-submit
- Parallel requests for same resource
- Stale read problems (read your writes)

**Ordering:**
- Out-of-order event processing
- Events arriving before entity exists
- Replay of old events
- Clock skew between services

**Idempotency gaps:**
- Non-idempotent operations retried
- Idempotency key collision
- Idempotency window expiration
- Partial completion before retry

**Resource contention:**
- Database lock contention
- Deadlocks
- Connection pool exhaustion
- Thread pool starvation

## 4. Security & Abuse

**Authentication:**
- Expired tokens
- Revoked credentials
- Token refresh race conditions
- Session fixation

**Authorization:**
- IDOR (accessing other users' resources)
- Privilege escalation
- Missing permission checks on new endpoints
- Cached permissions after revocation

**Input attacks:**
- SQL injection
- XSS (stored, reflected)
- SSRF
- Path traversal
- Command injection
- NoSQL injection

**Abuse patterns:**
- Credential stuffing
- Enumeration attacks (user exists?)
- Brute force
- Scraping at scale
- Fake account creation
- Referral/promo abuse

**Data exposure:**
- PII in logs/errors
- Sensitive data in URLs
- Information leakage in error messages
- Debug endpoints in production

## 5. Performance & Scale

**Query patterns:**
- N+1 queries
- Full table scans
- Missing indexes hit at scale
- Unbounded result sets

**Pagination:**
- Cursor vs offset issues at scale
- Items added/deleted during pagination
- Very deep pagination (page 10000)

**Caching:**
- Cache stampede (thundering herd)
- Stale cache serving wrong data
- Cache invalidation failures
- Negative caching (caching 404s)

**Resource limits:**
- Memory exhaustion
- Disk space
- File descriptor limits
- Connection limits

**Traffic patterns:**
- Sudden spikes (viral event)
- Hot partitions/keys
- Large fan-out operations
- Batch job impact on live traffic

## 6. UX / Device / Runtime

**Client state:**
- Tab switching mid-flow
- Browser back button
- Page refresh during operation
- Multiple tabs with same session

**Network conditions:**
- Offline/airplane mode
- Intermittent connectivity
- Very slow connections (2G)
- Request succeeds but response lost

**Device variation:**
- Slow devices (low-end Android)
- Small screens
- Large screens (4K)
- Touch vs mouse input

**Accessibility:**
- Screen reader compatibility
- Keyboard-only navigation
- High contrast mode
- Reduced motion preference

**Internationalization:**
- RTL languages
- Long translations breaking layouts
- Date/number formatting
- Currency display

## 7. Operations & Releases

**Configuration:**
- Missing env vars
- Wrong env vars (prod pointed at staging)
- Config reload failures
- Feature flag evaluation errors

**Deployment:**
- Partial deploy (some instances updated)
- Rollback scenarios
- Database migration failures
- Breaking API changes

**Dependencies:**
- Library version conflicts
- Transitive dependency issues
- OS/runtime version mismatches

**Queues & jobs:**
- Job queue backlogs
- Dead letter queue growth
- Job timeout mid-processing
- Duplicate job execution

**Observability gaps:**
- Silent failures (no alerts)
- Missing metrics for new code paths
- Log volume explosion
- Trace sampling misses issues

## 8. Data Lifecycle

**Migrations:**
- Migration failure mid-way
- Data format changes
- Backfill job failures
- Rollback after partial migration

**Retention & deletion:**
- Cascading deletes
- Soft delete vs hard delete confusion
- GDPR deletion requirements
- Orphaned records

**Consistency:**
- Cross-service data sync
- Eventually consistent reads causing issues
- Reconciliation failures
- Audit trail gaps

**Recovery:**
- Point-in-time recovery scenarios
- Partial failure compensation
- Data corruption detection
- Backup restoration testing

---

## Quick Reference: High-Impact Patterns

These patterns cause the most production incidents:

1. **Retry storms** - Retries without backoff overwhelm recovering services
2. **Missing timeout** - Single slow dependency blocks everything
3. **N+1 queries** - Works in dev, explodes in prod
4. **Cache invalidation** - Stale data served after updates
5. **Missing idempotency** - Duplicate charges, double posts
6. **Unbounded queries** - No LIMIT clause, full table scan
7. **Silent failures** - Operation fails but no alert fires
8. **Config in code** - Can't disable broken feature without deploy
