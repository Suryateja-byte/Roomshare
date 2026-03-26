# Bugs Found During Playwright Test Audit Fixes

## BUG-001: Concurrent booking race condition causes 500 Internal Server Error

- **Found in**: `tests/e2e/stability/stability-phase2.spec.ts` TEST-201
- **Severity**: HIGH (safety-critical — booking invariant violation)
- **Symptoms**: When two users simultaneously submit booking requests for the same listing, one request returns a 500 Internal Server Error instead of a graceful "slot taken" or "booking conflict" response.
- **Expected behavior**: Both requests should complete without 500 errors. The losing request should receive a clear "slot no longer available" message with HTTP 409 Conflict or similar.
- **Reproduction**:
  1. Two authenticated users (USER1, USER2) navigate to the same listing
  2. Both select overlapping dates and click "Request to Book" at the same time
  3. One request succeeds, the other returns 500 instead of a conflict response
- **CI evidence**: Shard 4 of run #23572376788 — `error500B` assertion failed at line 484
- **Root cause (likely)**: The booking server action lacks proper optimistic locking or conflict handling. When two concurrent transactions compete for the same slot, the losing transaction hits an unhandled database constraint violation instead of catching it gracefully.
- **Test status**: ~~Marked as `test.fixme()`~~ **FIXED** — unskipped TEST-201.
- **Fix**: Wrapped `withIdempotency()` calls in `createBooking()` and `createHold()` with try/catch. When serialization retries are exhausted or non-retryable DB errors occur, the function now returns `{ success: false, code: "CONFLICT" }` instead of throwing an unhandled exception that propagates as a 500.
- **CLAUDE.md reference**: "two users competing cannot create impossible states" — the 500 error is technically not an impossible state (no double-booking occurred), but the error response violates the reliability invariant.
