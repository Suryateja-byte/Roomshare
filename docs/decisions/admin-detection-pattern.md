# Decision Record: Admin Detection Pattern

**Status**: ACCEPTED (records existing pre-CFM-902 pattern)
**Date**: 2026-04-18
**Context ticket**: CFM-902-F2 (follow-up from CFM-902 critic audit)

## Context

During the CFM-902 strict audit (commit `75d61a29`), the critic noted that this codebase has two patterns for detecting admin status:

1. **Session-based**: `session.user.isAdmin === true` — reads the boolean from the NextAuth JWT claims populated at login.
2. **DB-based**: `User.isAdmin` column read via `prisma.user.findUnique({ select: { isAdmin: true } })`.

The inconsistency is pre-existing, not introduced by CFM-902, but the critic correctly flagged that a repo-wide decision should be recorded.

## Decision

**Primary: session-based (`session.user.isAdmin`).**

Rationale:
- Zero DB round-trip on every request (latency + cost).
- Claim is populated at login; session revocation (logout, token expiry) naturally invalidates stale state.
- Matches CFM-902's gate requirements: the gate runs on every mutation attempt and must be cheap.

**Exceptions (DB-based is preferred) when:**
- The code path already does a `prisma.user.findUnique` for unrelated reasons — piggyback on the existing read rather than reading twice.
- The operation is admin-critical and the attack surface justifies the extra round-trip (e.g., revoking a user's admin bit must take effect immediately, not only after re-login). Call these out in a comment at the call site.
- The code path is in a cron / background job without a user session.

## Current State (as of `ae150a56`)

- Session-based: `src/app/actions/manage-booking.ts` (CFM-902), most server actions with a `session.user.*` read.
- DB-based: admin-only endpoints that already hit `User` row for other fields (e.g., `src/app/actions/admin.ts` in some spots).

No forced migration of existing call sites is planned. New code should prefer session-based unless one of the exceptions above applies.

## Compatibility with CFM Migration Flags

- `ENABLE_LEGACY_BOOKING_MUTATIONS=off` gate in `updateBookingStatus` uses session-based `session.user.isAdmin === true`. If session revocation matters operationally (e.g., revoking an admin mid-incident), this is known: the change takes effect on the admin's next login or session refresh. Given the flag is only set during coordinated drain completion, this is acceptable.

## Future Work

If a compliance/security audit requires synchronous admin revocation, convert affected gates to DB-based detection and add a short TTL cache (e.g., 30 seconds) to amortize the round-trip. Not prioritized currently.
