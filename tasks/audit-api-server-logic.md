# Backend Architecture Audit: API Routes & Server-Side Logic

**Auditor:** backend-auditor
**Date:** 2026-02-16
**Scope:** All API routes (`src/app/api/`), Server Actions (`src/app/actions/`), key lib files, auth config, middleware

---

## CRITICAL Findings

### C-01: Race Condition in Listing Deletion (Non-Atomic Check-and-Delete)
- **File:** `src/app/api/listings/[id]/route.ts` (DELETE handler, ~lines 23-60)
- **Also:** `src/app/actions/admin.ts` (`deleteListing` function)
- **Description:** The DELETE handler checks for active bookings in one query, then deletes the listing in a separate query. Between the check and the delete, a new booking could be created, violating the invariant that listings with active bookings cannot be deleted.
- **Impact:** Data integrity violation - orphaned bookings pointing to deleted listings.
- **Recommended Fix:** Wrap the active-booking check and the listing deletion inside a single `$transaction` with `FOR UPDATE` lock on the listing row, or use a raw SQL `DELETE ... WHERE NOT EXISTS (active bookings)` atomic query.

### C-02: View Count Inflation - No Auth or Rate Limiting on `incrementViewCount`
- **File:** `src/app/actions/listing-status.ts` (`incrementViewCount` function, ~lines 40-60)
- **Description:** This server action has **no authentication check** and **no rate limiting**. Any anonymous user (or bot) can call it repeatedly to inflate view counts for any listing.
- **Impact:** Fraudulent view counts, skewed analytics, potential abuse for gaming listing rankings.
- **Recommended Fix:** Add authentication check (require logged-in user) and rate limiting (per-user or per-IP). Consider deduplication by user+listing pair within a time window.

### C-03: Missing Middleware - No Next.js Middleware Active
- **File:** `src/middleware.ts` (deleted per git status `AD`)
- **Description:** The middleware file was added then deleted. The CSP middleware (`src/lib/csp-middleware.ts`) and CSP header builder (`src/lib/csp.ts`) exist as staged files but are **not wired into any active middleware**. This means:
  - No Content-Security-Policy headers are being served
  - No X-Frame-Options / HSTS / X-Content-Type-Options headers
  - No centralized auth checks at the edge
  - No request-level security headers
- **Impact:** Missing defense-in-depth security headers across all routes. XSS protection, clickjacking protection, and other security headers are not applied.
- **Recommended Fix:** Restore `src/middleware.ts` that imports and applies `applySecurityHeaders` from `src/lib/csp-middleware.ts`. Wire it into the Next.js middleware chain.

### C-04: Non-Transactional Verification Approval
- **File:** `src/app/actions/verification.ts` (`approveVerification` function)
- **Description:** `approveVerification` updates the verification request status AND the user's verification status in two separate Prisma calls (not wrapped in a `$transaction`). If the second update fails, the request is marked "APPROVED" but the user remains unverified.
- **Impact:** Inconsistent state - verification request shows approved but user not actually verified. No way to detect or recover automatically.
- **Recommended Fix:** Wrap both updates in a `prisma.$transaction()` call.

---

## HIGH Findings

### H-01: PATCH /api/listings Missing Suspension & Email Verification Checks
- **File:** `src/app/api/listings/[id]/route.ts` (PATCH handler, ~lines 65-200)
- **Description:** The POST handler for creating listings checks both `checkSuspension()` and `checkEmailVerified()`. The PATCH handler for updating listings checks **neither**. A suspended user or unverified-email user can still edit their listings.
- **Impact:** Suspended users can modify their listing content, bypassing suspension enforcement.
- **Recommended Fix:** Add suspension and email verification checks to the PATCH handler, matching the POST handler pattern.

### H-02: Messages POST Uses Raw Content Instead of Trimmed Content
- **File:** `src/app/api/messages/route.ts` (POST handler, ~line 196)
- **Description:** The handler parses and trims the content via Zod schema (producing `trimmedContent`), but the actual `prisma.message.create` call uses `content` (the raw, untrimmed value from the request body) instead of `trimmedContent`.
- **Impact:** Whitespace-only messages could be stored; messages may have leading/trailing whitespace that the UI doesn't expect.
- **Recommended Fix:** Change `content` to `trimmedContent` in the `prisma.message.create` call at line 196.

### H-03: Listing Status Update Accepts Any String as Status Enum
- **File:** `src/app/actions/listing-status.ts` (`updateListingStatus` function)
- **Description:** The function accepts `status: ListingStatus` as a parameter but does **no runtime validation** that the status is a valid enum value. TypeScript types are erased at runtime, so a malicious client could pass any string.
- **Impact:** Invalid listing statuses could be written to the database if Prisma doesn't enforce the enum at the DB level.
- **Recommended Fix:** Add Zod validation or a runtime allowlist check for valid `ListingStatus` values before the database update.

### H-04: Reviews POST Missing Email Verification Check
- **File:** `src/app/api/reviews/route.ts` (POST handler)
- **Description:** Creating a review does NOT check `checkEmailVerified()`, unlike booking creation and listing creation which both require verified email.
- **Impact:** Unverified-email users can leave reviews, potentially enabling spam/fake review attacks from throwaway accounts.
- **Recommended Fix:** Add email verification check to the review POST handler.

### H-05: `getFilterSuggestions` Server Action Has No Auth or Rate Limiting
- **File:** `src/app/actions/filter-suggestions.ts`
- **Description:** This server action delegates directly to `analyzeFilterImpact()` with **no authentication**, **no rate limiting**, and **no input validation**. The `FilterParams` type is passed through unchecked.
- **Impact:** Unauthenticated users can trigger potentially expensive DB queries. Input isn't validated server-side.
- **Recommended Fix:** Add authentication check and rate limiting. Validate `FilterParams` with Zod before passing to the DB layer.

### H-06: `getListingsInBounds` Server Action Has No Auth or Rate Limiting
- **File:** `src/app/actions/get-listings.ts`
- **Description:** This server action executes raw PostGIS queries with **no authentication** and **no rate limiting**. The bounds are passed directly to `$queryRaw` (which uses parameterized queries, so no SQL injection risk), but the lack of rate limiting means it can be called at high frequency.
- **Impact:** Scraping/enumeration vector. Bots can systematically scan all listings by sweeping bounds.
- **Recommended Fix:** Add rate limiting at minimum. Consider requiring authentication for fine-grained bounds queries.

### H-07: `updateNotificationPreferences` Accepts Unvalidated Input
- **File:** `src/app/actions/settings.ts` (`updateNotificationPreferences`, ~line 48-70)
- **Description:** The function accepts a `NotificationPreferences` object and stores it directly as JSON with `as any` cast. No Zod validation. A malicious client could inject arbitrary JSON fields into the user's notification preferences column.
- **Impact:** Arbitrary data injection into the user record's JSON column.
- **Recommended Fix:** Validate with a strict Zod schema that only allows the known boolean fields before storing.

### H-08: `changePassword` Has No Rate Limiting
- **File:** `src/app/actions/settings.ts` (`changePassword`, ~lines 73-115)
- **Description:** The password change function compares `bcrypt.compare()` on each call with **no rate limiting**. An attacker with a valid session could brute-force the current password.
- **Impact:** Password brute-force via automated server action calls.
- **Recommended Fix:** Add rate limiting (e.g., 5 attempts per hour per user).

### H-09: `deleteAccount` Has No Rate Limiting
- **File:** `src/app/actions/settings.ts` (`deleteAccount`, ~lines 173-212)
- **Description:** Account deletion with password verification has **no rate limiting**. Similar brute-force risk as `changePassword`.
- **Recommended Fix:** Add rate limiting.

### H-10: `verifyPassword` Has No Rate Limiting
- **File:** `src/app/actions/settings.ts` (`verifyPassword`, ~lines 121-154)
- **Description:** Password verification endpoint with no rate limiting. Same brute-force risk.
- **Recommended Fix:** Add rate limiting (combined with changePassword/deleteAccount limit).

---

## MEDIUM Findings

### M-01: Missing JSON Parse Error Handling on Several Routes
- **Files:**
  - `src/app/api/favorites/route.ts` (POST handler)
  - `src/app/api/reports/route.ts` (POST handler)
  - `src/app/api/reviews/route.ts` (POST handler)
- **Description:** These routes call `request.json()` without a try/catch. If the client sends malformed JSON, this throws an unhandled error that results in a 500 response instead of a clean 400.
- **Impact:** Poor error experience; potential information leakage in error responses.
- **Recommended Fix:** Wrap `request.json()` in try/catch and return `{ error: 'Invalid JSON' }` with status 400.

### M-02: Missing Rate Limiting on Status/Can-Delete Endpoints
- **Files:**
  - `src/app/api/listings/[id]/status/route.ts` (GET handler)
  - `src/app/api/listings/[id]/can-delete/route.ts` (GET handler)
- **Description:** These endpoints have no rate limiting. The status endpoint is public (no auth required).
- **Impact:** Could be used for enumeration (checking which listing IDs exist) or for DoS.
- **Recommended Fix:** Add rate limiting to both endpoints.

### M-03: `/api/verify` Route Leaks Error Details in Production
- **File:** `src/app/api/verify/route.ts` (line ~38)
- **Description:** Returns `{ error: String(error) }` which could expose internal error messages, stack traces, or database error details.
- **Impact:** Information disclosure.
- **Recommended Fix:** Return a generic error message in production; log the detailed error server-side.

### M-04: Duplicated `normalizeStringList` Utility Function
- **Files:**
  - `src/app/api/listings/route.ts`
  - `src/app/api/listings/[id]/route.ts`
- **Description:** The same `normalizeStringList` function is duplicated in both files.
- **Impact:** Maintenance burden; risk of divergence.
- **Recommended Fix:** Extract to a shared utility module (e.g., `src/lib/utils.ts`).

### M-05: Inconsistent Error Logging (console.error vs Structured Logger)
- **Files:** Multiple locations across the codebase:
  - `src/lib/idempotency.ts` (line 239: `console.error`)
  - `src/lib/rate-limit.ts` (lines 149, 156: `console.error`, `console.warn`)
  - `src/lib/rate-limit-redis.ts` (multiple: `console.error`, `console.warn`)
  - `src/app/actions/create-listing.ts` (line 42: `console.warn`)
- **Description:** Many error/warning logs still use raw `console.error`/`console.warn` instead of the structured `logger`. The project has a well-implemented structured logger with PII redaction and request context, but it's not used consistently.
- **Impact:** Inconsistent log format makes log aggregation/alerting harder. Missing request context correlation. Potential PII leakage through unredacted console output.
- **Recommended Fix:** Replace all `console.error`/`console.warn` with `logger.sync.error`/`logger.sync.warn`.

### M-06: Server Actions Missing Rate Limiting (Chat, Saved Listings, Notifications)
- **Files:**
  - `src/app/actions/chat.ts` (`sendMessage`, `startConversation`, `pollMessages`)
  - `src/app/actions/saved-listings.ts` (`toggleSaveListing`)
  - `src/app/actions/notifications.ts` (all actions)
  - `src/app/actions/review-response.ts` (all actions)
  - `src/app/actions/saved-search.ts` (all except `saveSearch` which has a count limit)
- **Description:** Most server actions lack rate limiting. While API routes generally have rate limiting, server actions are directly callable from the client and bypass API route middleware.
- **Impact:** Abuse vector - automated scripts can call server actions at high frequency.
- **Recommended Fix:** Add rate limiting to server actions, especially write operations. Consider a shared `withServerActionRateLimit` wrapper.

### M-07: `pollMessages` Calls `getTypingStatus` Redundantly
- **File:** `src/app/actions/chat.ts` (`pollMessages`, ~line 595)
- **Description:** `pollMessages` calls `getTypingStatus(conversationId)` which internally re-verifies the user is a participant in the conversation - the same check `pollMessages` already performed. This means two redundant DB queries per poll.
- **Impact:** Unnecessary DB load on a frequently-called function.
- **Recommended Fix:** Extract the typing status query logic without the auth/participant check, and call it directly from `pollMessages` after the initial check.

### M-08: `createListing` Server Action Error Message Leaks Internal Details
- **File:** `src/app/actions/create-listing.ts` (line ~220)
- **Description:** Returns `Server Error: ${errorMessage}` which includes the raw error message from any caught exception.
- **Impact:** Could expose database error details, internal paths, or other sensitive information.
- **Recommended Fix:** Return a generic error message; log details server-side.

### M-09: Chat Server Action `sendMessage` - Email PII in Notification
- **File:** `src/app/actions/chat.ts` (lines 176-183)
- **Description:** The `sendNotificationEmailWithPreference` call passes `messagePreview: safeContent` which is the full message content. While this goes to an email service (not logs), the message content could contain PII shared between users.
- **Impact:** PII in email content is expected for the feature, but `safeContent` is truncated to 50 chars in the in-app notification but sent in full to email. Consider consistency.
- **Recommended Fix:** Truncate `messagePreview` for email as well, or document this as intentional behavior.

### M-10: DB Rate Limiter Race Condition
- **File:** `src/lib/rate-limit.ts` (`checkRateLimit`, ~lines 86-120)
- **Description:** The rate limiter does `findUnique` → check count → `update` increment as separate operations. Two concurrent requests could both read count=4 (limit=5), both pass the check, and both increment to 5, allowing limit+1 requests through.
- **Impact:** Rate limit can be bypassed by 1 request under concurrent load.
- **Recommended Fix:** Use an atomic `UPDATE ... SET count = count + 1 WHERE count < limit RETURNING count` or use `$transaction` with Serializable isolation.

---

## LOW Findings

### L-01: `savedSearchNameSchema` Doesn't Sanitize HTML/Script Content
- **File:** `src/app/actions/saved-search.ts` (line 21)
- **Description:** The name schema only validates length (1-100) and trims whitespace. It doesn't prevent HTML or script content in search names.
- **Impact:** Low risk since names are rendered by React (auto-escaped), but defense-in-depth suggests sanitization.
- **Recommended Fix:** Consider adding a regex pattern to reject HTML tags, or rely on React's auto-escaping (document the assumption).

### L-02: `getUserSettings` Returns Password Hash Presence Check Unnecessarily
- **File:** `src/app/actions/settings.ts` (`getUserSettings`, ~lines 214-240)
- **Description:** The function selects `password: true` from the database, then maps it to `hasPassword: !!user.password`. While the hash itself isn't returned to the client, the query fetches the full hash unnecessarily.
- **Impact:** Minor - the hash stays server-side, but querying it is unnecessary.
- **Recommended Fix:** Use a raw query or Prisma's `select` to check `password IS NOT NULL` without fetching the actual hash value.

### L-03: `toggleSaveListing` Non-Atomic Check-and-Insert
- **File:** `src/app/actions/saved-listings.ts` (`toggleSaveListing`, ~lines 9-60)
- **Description:** Uses `findUnique` then `delete` or `create` as separate operations. Under concurrent clicks, could create duplicates (though the unique constraint on `userId_listingId` would prevent this at DB level).
- **Impact:** Very low - DB constraint prevents actual duplicates. Could cause transient errors on concurrent double-clicks.
- **Recommended Fix:** Use `upsert` or wrap in transaction for cleaner handling.

### L-04: `createReviewResponse` Non-Atomic Duplicate Check
- **File:** `src/app/actions/review-response.ts` (`createReviewResponse`, ~lines 58-65)
- **Description:** Checks for existing response then creates one. Race condition between check and create could allow duplicate responses (though `reviewId` unique constraint likely prevents this).
- **Impact:** Very low if DB has unique constraint on `reviewId`.
- **Recommended Fix:** Use `upsert` or handle unique constraint error gracefully.

### L-05: Cron Jobs Use `console.log` Instead of Structured Logger
- **Files:**
  - `src/app/api/cron/cleanup-rate-limits/route.ts`
  - `src/app/api/cron/refresh-search-docs/route.ts`
  - `src/app/api/cron/search-alerts/route.ts`
- **Description:** Cron job handlers use `console.log` for status messages instead of the structured logger.
- **Impact:** Missing request context and structured format in cron logs.
- **Recommended Fix:** Use `logger.sync.info` for cron job logging.

### L-06: `deleteMessage` - No Suspension Check
- **File:** `src/app/actions/chat.ts` (`deleteMessage`, ~lines 371-413)
- **Description:** Message deletion doesn't check if the user is suspended. While this is a less critical action (user deleting their own messages), other write actions check suspension.
- **Impact:** Very low - suspended users can still delete their own messages.
- **Recommended Fix:** Consider adding suspension check for consistency, or document this as intentional (allowing suspended users to clean up their messages).

### L-07: NextAuth JWT Token Refresh Only on Specific Triggers
- **File:** `src/auth.ts` (JWT callback, ~lines 85-117)
- **Description:** The JWT callback only refreshes user data from DB on `signIn`, `update`, or when an `account` is present. During normal browsing, a user's `isSuspended` or `isAdmin` status changes won't be reflected until their next sign-in or explicit token update.
- **Impact:** Admin actions (suspend/unsuspend, grant/revoke admin) have a delay before taking effect in the user's session (up to session maxAge of 14 days).
- **Recommended Fix:** Consider adding periodic DB checks (e.g., once per hour) in the JWT callback, or use `updateAge` more aggressively for security-sensitive fields.

---

## Positive Patterns Observed (Strengths)

1. **Idempotency implementation** (`src/lib/idempotency.ts`) is robust - SERIALIZABLE transactions, atomic claim via INSERT ON CONFLICT, request hash verification, serialization failure retry with backoff.

2. **Booking state machine** (`src/lib/booking-state-machine.ts`) is well-designed with clear valid transitions, custom error class, and terminal state detection.

3. **Booking creation** (`src/app/actions/booking.ts`) uses FOR UPDATE locks, price validation against DB, Serializable isolation, and separated side effects.

4. **Rate limiting** has dual-layer design (DB-backed + Redis-backed) with in-memory fallback, circuit breaker, and timeout protection.

5. **Structured logger** (`src/lib/logger.ts`) has comprehensive PII redaction (email, phone, address patterns), request context correlation, and sync/async variants.

6. **Auth configuration** (`src/auth.ts`) has Turnstile CAPTCHA, email normalization, Google email verification enforcement, suspension checks on sign-in, OAuth token cleanup, and dangerous email linking safely gated.

7. **CSP implementation** (staged) is well-designed with nonce-based script-src, strict-dynamic, and comprehensive directive set.

8. **IDOR protection** is present in chat (`sendMessage` verifies participant status) and notifications (user ownership checks).

9. **Token security** uses SHA-256 hashing for verification/reset tokens, preventing token enumeration.

10. **Anti-enumeration** in auth routes (timing-safe responses for existing users in registration, generic error messages in forgot-password).

---

## Summary by Severity

| Severity | Count | Key Areas |
|----------|-------|-----------|
| CRITICAL | 4 | Race conditions, missing middleware, non-transactional writes, view count abuse |
| HIGH | 10 | Missing auth/validation checks, missing rate limiting on sensitive actions, input validation gaps |
| MEDIUM | 10 | JSON parse errors, inconsistent logging, redundant queries, info leakage |
| LOW | 7 | Minor inconsistencies, non-atomic but DB-constrained operations |
| **Total** | **31** | |

---

## Top 5 Priority Actions

1. **Restore middleware** (C-03) - Missing security headers is a broad-impact gap
2. **Fix listing deletion race condition** (C-01) - Data integrity risk in core business logic
3. **Add auth + rate limit to `incrementViewCount`** (C-02) - Active abuse vector
4. **Make verification approval transactional** (C-04) - Data consistency risk
5. **Add rate limiting to server actions** (M-06, H-05, H-06, H-08-H-10) - Systematic gap in server action layer
