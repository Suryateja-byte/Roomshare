# Production Review - Recovered Findings
**Date**: March 17, 2026
**Verdict**: NO-GO

## Summary
| Severity | Count |
|----------|-------|
| CRITICAL | 6 |
| HIGH | 11 |
| MEDIUM | 19 |
| LOW | 11 |

---

## CRITICAL Issues (Must Fix Before Production)

### C1: Zero RLS Policies
- All 24+ tables have no Row Level Security
- All authorization is app-layer only via Prisma

### C2: No middleware.ts
- No centralized route protection
- Auth relies on per-handler `auth()` calls
- **Combined with C1**: Single point of auth failure

### C3: .env committed to git with secrets
- 12+ secrets exposed: `SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, etc.
- **Action**: Rotate ALL keys immediately, remove from git

### C4: Admin TOCTOU races
- `toggleUserAdmin()` and `suspendUser()` have race conditions
- File: `src/app/actions/admin.ts:113-218`

### C5: Favorites toggle non-atomic
- File: `src/app/api/favorites/route.ts:92-125`
- POST handler: `findUnique` then `delete`/`create` as separate ops

### C6: Admin listing deletion ignores HELD bookings
- File: `src/app/actions/admin.ts:388-397`
- Only cancels PENDING, HELD cascade-deletes

---

## HIGH Issues

### H1: PENDING bookings no timeout
- Unlike HELD (sweeper cron), PENDING persists forever

### H2: getMyBookings() unbounded
- File: `src/app/actions/manage-booking.ts:560-617`
- No pagination

### H3: listConversationMessages() unbounded
- File: `src/lib/messages.ts:50-88`

### H4: N+1 notification creation (4 locations)
- `src/app/api/listings/[id]/route.ts:124-134, 140-151`
- `src/app/actions/admin.ts:400-410, 648-658`

### H5: Missing indexes
- `Booking.heldUntil` - 8+ query sites
- `Message.senderId` - unread counts

### H6: Verification rejection lacks transaction
- File: `src/app/actions/verification.ts:316-323`

### H7: No listing status state machine
- ListingStatus allows ANY→ANY transitions

### H8: Test helpers no auth
- `/api/test-helpers` only env var guard

### H9: next-auth beta with caret range
- `next-auth@^5.0.0-beta.30` auto-upgrades

### H10: Auth flash on hydration
- Navbar passes null user during hydration

### H11: Listing status TOCTOU
- `updateListingStatus()` missing transaction

---

## Cross-Domain Issues

### CROSS-1 [CRITICAL]: Zero RLS + No middleware = No Defense-in-Depth
### CROSS-2 [HIGH]: Test helpers no auth + DB write access
### CROSS-3 [HIGH]: Auth state propagation gaps
### CROSS-4 [MEDIUM]: Listing status TOCTOU + optimistic UI
### CROSS-5 [MEDIUM]: Audit log cascade delete
### CROSS-6 [MEDIUM]: $queryRawUnsafe fragile pattern
### CROSS-7 [LOW]: next-auth beta + no session revocation

---

## Blockers for Production

1. ✅ Add RLS policies OR middleware.ts (at least one)
2. ✅ Pin `next-auth` exact version
3. ✅ Add bearer token auth to test-helpers
4. ✅ Remove .env from git, rotate all secrets

---

*Recovered from ~/.claude/teams/roomshare-prod-review/inboxes/*
