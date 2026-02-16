# API Reference

Complete reference for all Roomshare API endpoints. All routes are implemented as Next.js Route Handlers under `src/app/api/`.

**Base URL:** `https://your-domain.com` (or `http://localhost:3000` in development)

---

## Table of Contents

1. [Authentication & Registration](#1-authentication--registration)
2. [Listings Management](#2-listings-management)
3. [Search & Discovery](#3-search--discovery)
4. [Messaging](#4-messaging)
5. [Reviews](#5-reviews)
6. [Favorites](#6-favorites)
7. [Reports](#7-reports)
8. [File Upload](#8-file-upload)
9. [Nearby Places](#9-nearby-places)
10. [AI Chat](#10-ai-chat)
11. [Health & Monitoring](#11-health--monitoring)
12. [Cron Jobs](#12-cron-jobs)
13. [Common Patterns](#13-common-patterns)

---

## 1. Authentication & Registration

### POST /api/register

Create a new user account with email verification.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | 5 per hour per IP (`register`) |
| **Bot Protection** | Cloudflare Turnstile |

**Request Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword12",
  "turnstileToken": "<turnstile-token>"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | min 2 chars |
| `email` | string | valid email, normalized |
| `password` | string | min 12 chars |
| `turnstileToken` | string | Cloudflare Turnstile verification token |

**Success Response (201):**

```json
{
  "id": "clx...",
  "name": "John Doe",
  "email": "john@example.com",
  "emailVerified": null,
  "verificationEmailSent": true
}
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Invalid input"` | Validation failure |
| 400 | `"Registration failed..."` | Email already exists (generic to prevent enumeration) |
| 403 | `"Bot verification failed..."` | Turnstile check failed |
| 429 | Rate limited | Exceeds 5/hour |
| 500 | `"Internal Server Error"` | Server error |

**Notes:**
- Email is normalized (lowercased, trimmed) before storage.
- A timing-safe delay is applied on duplicate email to prevent enumeration attacks.
- Sends a welcome/verification email on success.
- Verification token expires in 24 hours.

**Example:**

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "mySecurePass12",
    "turnstileToken": "test-token"
  }'
```

---

### GET/POST /api/auth/[...nextauth]

NextAuth.js catch-all route. Handles OAuth flows, session management, CSRF tokens, and credential sign-in.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | None (handled by NextAuth) |

**Endpoints served:**

- `GET /api/auth/signin` - Sign-in page
- `POST /api/auth/signin/credentials` - Credential sign-in
- `GET /api/auth/signout` - Sign-out
- `GET /api/auth/session` - Get current session
- `GET /api/auth/csrf` - CSRF token
- `GET /api/auth/providers` - Available providers

---

### POST /api/auth/forgot-password

Request a password reset link. Always returns success to prevent email enumeration.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | 3 per hour per IP (`forgotPassword`) |
| **Bot Protection** | Cloudflare Turnstile |

**Request Body:**

```json
{
  "email": "user@example.com",
  "turnstileToken": "<turnstile-token>"
}
```

**Success Response (200):**

```json
{
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Email is required"` | Missing email |
| 403 | `"Bot verification failed..."` | Turnstile check failed |
| 429 | Rate limited | Exceeds 3/hour |
| 503 | `"Password reset is temporarily unavailable"` | Email service not configured (production) |

**Notes:**
- Token is stored as SHA-256 hash (never plain text).
- Token expires in 1 hour.
- In development, the reset URL is included in the response.

---

### GET /api/auth/reset-password

Verify that a password reset token is valid.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Shared with `resetPassword` type |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Reset token from email link |

**Success Response (200):**

```json
{ "valid": true }
```

**Error Response (400):**

```json
{ "valid": false, "error": "Invalid reset link" }
```

---

### POST /api/auth/reset-password

Reset the user's password using a valid token.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Yes (`resetPassword`) |

**Request Body:**

```json
{
  "token": "<reset-token>",
  "password": "newSecurePass12"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `token` | string | Required, from email link |
| `password` | string | min 12 chars |

**Success Response (200):**

```json
{ "message": "Password has been reset successfully" }
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | Validation error | Invalid input |
| 400 | `"Invalid or expired reset link"` | Token not found or bad format |
| 400 | `"Reset link has expired..."` | Token expired |
| 404 | `"User not found"` | User deleted |

---

### GET /api/auth/verify-email

Verify a user's email address. Redirects to the app with status query params.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Yes (`verifyEmail`) |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Verification token from email |

**Behavior:**
- Valid token: Redirects to `/?verified=true`
- Missing token: Redirects to `/?error=missing_token`
- Invalid/expired token: Redirects to `/verify-expired`
- Error: Redirects to `/?error=verification_failed`

---

### POST /api/auth/resend-verification

Resend the email verification link for the currently authenticated user.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated |
| **Rate Limit** | 3 per hour (`resendVerification`) |

**Request Body:** None (uses session email)

**Success Response (200):**

```json
{ "message": "Verification email sent successfully" }
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Email is already verified"` | Already verified |
| 401 | `"You must be logged in..."` | No session |
| 404 | `"User not found"` | User deleted |
| 503 | `"Email service temporarily unavailable"` | Email send failed |

---

### GET /api/verify

Development-only test endpoint for verifying test data. Blocked in production.

| Field | Value |
|-------|-------|
| **Auth** | Dev key (`x-dev-verify-key` header must match `NEXTAUTH_SECRET`) |
| **Rate Limit** | None |
| **Availability** | Development only (returns 404 in production) |

---

## 2. Listings Management

### GET /api/listings

Fetch all active listings with optional text search.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Yes (`listingsRead`) |
| **Caching** | `Cache-Control: private, no-store` |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | No | Text search query |

**Success Response (200):**

```json
[
  {
    "id": "clx...",
    "title": "Sunny Room in Downtown",
    "description": "...",
    "price": 1200,
    "images": ["https://..."],
    "amenities": ["Wifi", "AC"],
    "status": "ACTIVE"
  }
]
```

**Headers:** `x-request-id`, `Vary: Accept-Encoding`

---

### POST /api/listings

Create a new listing with location geocoding.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated (email verified, not suspended) |
| **Rate Limit** | Yes (`createListing`) |
| **Idempotency** | Supported via `X-Idempotency-Key` header |

**Request Body:**

```json
{
  "title": "Cozy Room Near Campus",
  "description": "A bright, furnished room...",
  "price": 850,
  "amenities": ["Wifi", "Furnished", "Washer"],
  "houseRules": ["Pets allowed"],
  "totalSlots": 1,
  "address": "123 Main St",
  "city": "Denver",
  "state": "CO",
  "zip": "80202",
  "images": ["https://<project>.supabase.co/storage/v1/object/public/images/listings/...jpg"],
  "roomType": "Private Room",
  "leaseDuration": "6 months",
  "genderPreference": "NO_PREFERENCE",
  "householdGender": "MIXED",
  "householdLanguages": ["en", "es"],
  "moveInDate": "2026-04-01"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `title` | string | 1-100 chars |
| `description` | string | 10-1000 chars |
| `price` | number | > 0, max 50000 |
| `amenities` | string or string[] | Comma-separated or array, max 20 items |
| `houseRules` | string or string[] | Optional, max 20 items |
| `totalSlots` | number | 1-20, integer |
| `address` | string | 1-200 chars |
| `city` | string | 1-100 chars |
| `state` | string | 1-50 chars |
| `zip` | string | US format: `12345` or `12345-6789` |
| `images` | string[] | 1-10 Supabase storage URLs |
| `roomType` | string? | `"Private Room"`, `"Shared Room"`, `"Entire Place"` |
| `leaseDuration` | string? | `"Month-to-month"`, `"3 months"`, `"6 months"`, `"12 months"`, `"Flexible"` |
| `genderPreference` | string? | `"MALE_ONLY"`, `"FEMALE_ONLY"`, `"NO_PREFERENCE"` |
| `householdGender` | string? | `"ALL_MALE"`, `"ALL_FEMALE"`, `"MIXED"` |
| `householdLanguages` | string[]? | ISO 639-1 codes, max 20 |
| `moveInDate` | string? | `YYYY-MM-DD`, today to 2 years ahead |

**Success Response (201):**

Returns the created listing object. If `X-Idempotency-Key` was provided and the result is cached, the header `X-Idempotency-Replayed: true` is set.

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Validation failed"` | Schema validation error (includes `fields` object) |
| 400 | Language compliance error | Discriminatory language detected |
| 400 | `"Maximum 10 active listings per user"` | Limit reached |
| 400 | `"Could not geocode address"` | Geocoding failed |
| 401 | `"Unauthorized"` | Not authenticated |
| 403 | `"Account suspended"` | User suspended |
| 403 | `"Please verify your email"` | Email not verified |

**Notes:**
- Creates listing + location + PostGIS geometry in a transaction.
- Triggers search index update synchronously and search alerts asynchronously.
- Max 10 active/paused listings per user.
- Language compliance check on title and description (discriminatory language patterns).

**Example:**

```bash
curl -X POST http://localhost:3000/api/listings \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -H "X-Idempotency-Key: unique-key-123" \
  -d '{
    "title": "Sunny Room in Cap Hill",
    "description": "A bright furnished room with mountain views...",
    "price": 950,
    "amenities": "Wifi,AC,Furnished",
    "totalSlots": 1,
    "address": "123 Main St",
    "city": "Denver",
    "state": "CO",
    "zip": "80202",
    "images": ["https://xxx.supabase.co/storage/v1/object/public/images/listings/photo.jpg"]
  }'
```

---

### PATCH /api/listings/[id]

Update an existing listing. Only the owner can update.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated (owner only) |
| **Rate Limit** | Yes (`updateListing`) |

**Path Parameters:**

| Param | Description |
|-------|-------------|
| `id` | Listing ID |

**Request Body:** Same fields as create (all required in the request body for full replacement).

**Success Response (200):** Returns the updated listing object.

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Invalid request payload"` | Validation error (includes `details`) |
| 400 | `"Invalid language codes"` | Bad household language codes |
| 400 | Language compliance error | Discriminatory language in description |
| 400 | `"Could not geocode new address"` | Geocoding failed for new address |
| 401 | `"Unauthorized"` | Not authenticated |
| 403 | `"Forbidden"` | Not the owner |
| 404 | `"Listing not found"` | Invalid ID |

**Notes:**
- Address change triggers re-geocoding before the database transaction.
- Available slots are adjusted proportionally when total slots change.
- Marks listing dirty for search index refresh.

---

### DELETE /api/listings/[id]

Delete a listing and its associated data. Only the owner can delete.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated (owner only) |
| **Rate Limit** | Yes (`deleteListing`) |

**Path Parameters:**

| Param | Description |
|-------|-------------|
| `id` | Listing ID |

**Success Response (200):**

```json
{
  "success": true,
  "notifiedTenants": 2
}
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Cannot delete listing with active bookings"` | Has active ACCEPTED bookings |
| 401 | `"Unauthorized"` | Not authenticated |
| 403 | `"Forbidden"` | Not the owner |
| 404 | `"Listing not found"` | Invalid ID |

**Notes:**
- Blocks deletion if active ACCEPTED bookings exist.
- Notifies tenants with PENDING bookings before deletion.
- Cleans up images from Supabase storage.
- Cascade deletes: location, bookings, conversations.
- Transaction: creates notifications + deletes location + deletes listing.

---

### GET /api/listings/[id]/can-delete

Check if a listing can be safely deleted. Returns booking and conversation counts.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated (owner only) |
| **Rate Limit** | None |

**Path Parameters:**

| Param | Description |
|-------|-------------|
| `id` | Listing ID |

**Success Response (200):**

```json
{
  "canDelete": true,
  "activeBookings": 0,
  "pendingBookings": 2,
  "activeConversations": 5
}
```

| Field | Description |
|-------|-------------|
| `canDelete` | `true` if no active ACCEPTED bookings |
| `activeBookings` | Count of ACCEPTED bookings with future end date |
| `pendingBookings` | Count of PENDING bookings (will be cancelled) |
| `activeConversations` | Count of conversations (will be deleted) |

---

### GET /api/listings/[id]/status

Public endpoint to check a listing's current status and last update time. Used for freshness checks.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | None |

**Success Response (200):**

```json
{
  "id": "clx...",
  "status": "ACTIVE",
  "updatedAt": "2026-02-15T10:30:00.000Z"
}
```

---

## 3. Search & Discovery

### GET /api/search/v2

Unified search endpoint returning both list results and map data. Feature-flagged via `ENABLE_SEARCH_V2` env var or `?v2=1` query param.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Redis-based (`map` type) |
| **Caching** | `public, s-maxage=60, max-age=30, stale-while-revalidate=120` |
| **Timeout** | Database timeout protection |

**Query Parameters (all optional):**

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Text search query (max 200 chars) |
| `minPrice` | number | Minimum price filter |
| `maxPrice` | number | Maximum price filter |
| `amenities` | string | Comma-separated: `Wifi,AC,Parking` |
| `houseRules` | string | Comma-separated: `Pets allowed,Smoking allowed` |
| `roomType` | string | `Private Room`, `Shared Room`, `Entire Place` (case-insensitive, aliases supported) |
| `leaseDuration` | string | `Month-to-month`, `3 months`, `6 months`, `12 months`, `Flexible` |
| `genderPreference` | string | `MALE_ONLY`, `FEMALE_ONLY`, `NO_PREFERENCE` |
| `householdGender` | string | `ALL_MALE`, `ALL_FEMALE`, `MIXED` |
| `languages` | string | Comma-separated ISO 639-1 codes |
| `moveInDate` | string | `YYYY-MM-DD` (today to 2 years ahead) |
| `minLat`, `maxLat`, `minLng`, `maxLng` | number | Geographic bounding box |
| `lat`, `lng` | number | Point coordinates (auto-derives ~10km radius bounds) |
| `sort` | string | `recommended`, `price_asc`, `price_desc`, `newest`, `rating` |
| `cursor` | string | Keyset pagination cursor |
| `limit` | number | Results per page (default 12, max 100) |
| `v2` | string | `"1"` or `"true"` to enable when feature flag is off |

**Success Response (200):**

```json
{
  "list": {
    "items": [...],
    "pagination": { "hasMore": true, "nextCursor": "clx..." }
  },
  "map": {
    "geojson": { "type": "FeatureCollection", "features": [...] },
    "pins": [...]
  },
  "meta": {
    "mode": "pins",
    "queryHash": "abc123",
    "generatedAt": "2026-02-15T10:30:00.000Z"
  }
}
```

| Meta Field | Description |
|------------|-------------|
| `mode` | `"geojson"` (>=50 results, clustering) or `"pins"` (<50, individual markers) |
| `map.geojson` | Always present. GeoJSON FeatureCollection. |
| `map.pins` | Only present in `pins` mode. Tiered pin data. |

**Unbounded Search Response (200):**

When a text query is provided without geographic bounds:

```json
{
  "unboundedSearch": true,
  "list": null,
  "map": null,
  "meta": { "mode": "pins", "queryHash": null, "generatedAt": "..." }
}
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | Validation error message | Invalid filter values |
| 404 | `"Search v2 endpoint not enabled"` | Feature flag off and no `v2` param |
| 503 | `"Search temporarily unavailable"` | Service error |

**Example:**

```bash
curl "http://localhost:3000/api/search/v2?q=downtown&minPrice=500&maxPrice=1500&amenities=Wifi,AC&roomType=Private+Room&lat=39.7392&lng=-104.9903&sort=price_asc&v2=1"
```

---

### GET /api/search/facets

Returns facet counts for filter options based on current filter state. Used for filter UI to show option counts.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Redis-based (`search-count` type) |
| **Caching** | Server-side: `unstable_cache` with 30s TTL. Response: `private, no-store` |

**Query Parameters:** Same filter params as `/api/search/v2` (except pagination).

**Success Response (200):**

```json
{
  "amenities": { "Wifi": 45, "Parking": 23, "AC": 18 },
  "houseRules": { "Pets allowed": 30, "Smoking allowed": 5 },
  "roomTypes": { "Private Room": 50, "Shared Room": 20, "Entire Place": 10 },
  "priceRanges": { "min": 500, "max": 3000, "median": 1200 },
  "priceHistogram": {
    "bucketWidth": 250,
    "buckets": [
      { "min": 500, "max": 750, "count": 12 },
      { "min": 750, "max": 1000, "count": 25 }
    ]
  }
}
```

**Notes:**
- Uses "sticky faceting": each facet excludes its own filter to show all options.
- Queries run in parallel for efficiency.
- Price histogram uses adaptive bucket sizing (50/250/500/1000 based on range).
- Requires bounds when a text query is present (prevents full-table scans).
- Oversized bounds are silently clamped to max 5 degree span.

---

### GET /api/search-count

Returns a count of listings matching filter parameters. Used by the filter drawer for "Show X listings" preview.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Redis-based (`search-count` type) |
| **Caching** | `private, no-store` (force-dynamic) |

**Query Parameters:** Same filter params as `/api/search/v2`.

**Success Response (200):**

```json
{ "count": 42 }
```

When count exceeds 100:

```json
{ "count": null }
```

**Special Responses:**

| Scenario | Response |
|----------|----------|
| Text query without bounds | `{ "count": null, "boundsRequired": true }` |
| No query, no bounds (browse mode) | `{ "count": null, "browseMode": true }` |

---

### GET /api/map-listings

Fetch listings for map display with geographic bounds filtering.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Redis-based (`map` type) |
| **Caching** | `public, s-maxage=60, max-age=30, stale-while-revalidate=120` |
| **Timeout** | Database timeout protection |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `minLat`, `maxLat`, `minLng`, `maxLng` | number | Conditional | Explicit bounding box |
| `lat`, `lng` | number | Conditional | Point (auto-derives ~10km radius) |

One of the above is required. Plus all standard filter params (same as search/v2).

**Success Response (200):**

```json
{
  "listings": [
    {
      "id": "clx...",
      "title": "...",
      "price": 1200,
      "lat": 39.7392,
      "lng": -104.9903,
      "images": ["..."],
      "roomType": "Private Room"
    }
  ]
}
```

**Error (400):** `"Bounds required: provide minLat/maxLat/minLng/maxLng or lat/lng"`

---

## 4. Messaging

### GET /api/messages

Fetch conversations or messages within a conversation. Supports cursor-based pagination.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated |
| **Rate Limit** | Yes (`messages`) |
| **Caching** | `private, no-store` |
| **Pagination** | Cursor-based |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `conversationId` | string | No | If provided, fetch messages for this conversation |
| `cursor` | string | No | Pagination cursor (alphanumeric + hyphens) |
| `limit` | number | No | Results per page (default 20, max 100) |

**Response without conversationId (conversation list):**

```json
{
  "conversations": [
    {
      "id": "conv_...",
      "participants": [{ "id": "...", "name": "Jane", "image": "..." }],
      "messages": [{ "content": "Latest message...", "createdAt": "..." }],
      "listing": { "id": "...", "title": "...", "images": ["..."] },
      "updatedAt": "..."
    }
  ],
  "pagination": { "hasMore": true, "nextCursor": "conv_...", "total": 15 }
}
```

**Response with conversationId (message list):**

```json
{
  "messages": [
    {
      "id": "msg_...",
      "content": "Hello!",
      "createdAt": "...",
      "sender": { "id": "...", "name": "Jane", "image": "..." }
    }
  ],
  "pagination": { "hasMore": false, "nextCursor": null, "total": 5 }
}
```

**Notes:**
- Messages are ordered by `createdAt desc`.
- Excludes admin-deleted and per-user-deleted conversations.
- User must be a participant in the conversation.

---

### POST /api/messages

Send a message in an existing conversation.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated (email verified, not suspended, not blocked) |
| **Rate Limit** | Yes (`sendMessage`) |

**Request Body:**

```json
{
  "conversationId": "conv_...",
  "content": "Hello, is the room still available?"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `conversationId` | string | Required, valid conversation ID |
| `content` | string | 1-2000 chars (trimmed) |

**Success Response (201):**

```json
{
  "id": "msg_...",
  "content": "Hello, is the room still available?",
  "createdAt": "2026-02-15T10:30:00.000Z",
  "sender": { "id": "...", "name": "Jane", "image": "..." }
}
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Missing required fields"` | Missing conversationId or content |
| 400 | `"Message cannot be empty"` | Empty after trim |
| 400 | `"Message must not exceed 2000 characters"` | Too long |
| 401 | `"Unauthorized"` | Not authenticated |
| 403 | `"Account suspended"` | User suspended |
| 403 | `"Please verify your email..."` | Email not verified |
| 403 | Block message | User is blocked by/has blocked other participant |

**Notes:**
- Sending a new message resurrects per-user-deleted conversations for all participants.
- Updates conversation `updatedAt` timestamp in parallel.

**Example:**

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{ "conversationId": "conv_abc123", "content": "Is the room still available?" }'
```

---

### GET /api/messages/unread

Get the count of unread messages for the authenticated user.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated |
| **Rate Limit** | Yes (`unreadCount`) |

**Success Response (200):**

```json
{ "count": 3 }
```

---

## 5. Reviews

### POST /api/reviews

Create a review for a listing or user. Requires a booking history for listing reviews.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated (not suspended) |
| **Rate Limit** | Yes (`createReview`) |

**Request Body:**

```json
{
  "listingId": "clx...",
  "rating": 4,
  "comment": "Great room, friendly host!"
}
```

Or for user reviews:

```json
{
  "targetUserId": "usr_...",
  "rating": 5,
  "comment": "Excellent roommate!"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `listingId` | string? | Max 100 chars. Required if no `targetUserId`. |
| `targetUserId` | string? | Max 100 chars. Required if no `listingId`. |
| `rating` | number | 1-5, integer |
| `comment` | string | 1-5000 chars |

**Success Response (201):** Returns review with author info.

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Must specify listingId or targetUserId"` | Neither provided |
| 403 | `"Account suspended"` | User suspended |
| 403 | `"You must have a booking to review this listing"` | No booking history |
| 409 | `"You have already reviewed this listing"` | Duplicate review |
| 409 | `"You have already reviewed this user"` | Duplicate user review |

**Notes:**
- Triggers in-app notification and email to listing owner (fire-and-forget).
- Marks listing dirty for search doc refresh (updates average rating).

---

### GET /api/reviews

Fetch reviews for a listing or user. Supports cursor-based pagination.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Yes, 60/min (`getReviews`) |
| **Pagination** | Cursor-based |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `listingId` | string | Conditional | Fetch reviews for listing |
| `userId` | string | Conditional | Fetch reviews for user |
| `cursor` | string | No | Pagination cursor |
| `limit` | number | No | Default 20, max 100 |

One of `listingId` or `userId` is required.

**Success Response (200):**

```json
{
  "reviews": [
    {
      "id": "rev_...",
      "rating": 5,
      "comment": "...",
      "createdAt": "...",
      "author": { "name": "Jane", "image": "..." }
    }
  ],
  "pagination": { "hasMore": false, "nextCursor": null, "total": 8 }
}
```

---

### PUT /api/reviews

Update an existing review. Only the author can update.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated (author only) |
| **Rate Limit** | Yes (`updateReview`) |

**Request Body:**

```json
{
  "reviewId": "rev_...",
  "rating": 5,
  "comment": "Updated comment"
}
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 403 | `"You can only edit your own reviews"` | Not the author |
| 404 | `"Review not found"` | Invalid ID |

---

### DELETE /api/reviews

Delete a review. Only the author can delete.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated (author only) |
| **Rate Limit** | Yes (`deleteReview`) |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `reviewId` | string | Yes | Review to delete |

**Success Response (200):**

```json
{ "success": true, "message": "Review deleted successfully" }
```

---

## 6. Favorites

### POST /api/favorites

Toggle a listing as saved/unsaved for the authenticated user.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated |
| **Rate Limit** | Yes (`toggleFavorite`) |
| **Caching** | `private, no-store` |

**Request Body:**

```json
{ "listingId": "clx..." }
```

| Field | Type | Rules |
|-------|------|-------|
| `listingId` | string | 1-100 chars |

**Success Response (200):**

```json
{ "saved": true }
```

Or if already saved (toggled off):

```json
{ "saved": false }
```

---

## 7. Reports

### POST /api/reports

Report a listing for policy violations.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated |
| **Rate Limit** | Yes (`createReport`) |

**Request Body:**

```json
{
  "listingId": "clx...",
  "reason": "Misleading photos",
  "details": "The photos show a different room than described."
}
```

| Field | Type | Rules |
|-------|------|-------|
| `listingId` | string | 1-100 chars |
| `reason` | string | 1-100 chars |
| `details` | string? | Max 2000 chars |

**Success Response (200):** Returns the created report object.

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 409 | `"You have already reported this listing..."` | Active report exists (OPEN or RESOLVED) |

**Notes:**
- Allows re-reporting only if previous report was DISMISSED.
- Report statuses: OPEN, RESOLVED, DISMISSED.

---

## 8. File Upload

### POST /api/upload

Upload an image file to Supabase storage. Validates file type using magic bytes.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated |
| **Rate Limit** | Yes (`upload`) |

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Image file (JPEG, PNG, WebP, GIF) |
| `type` | string | `"profile"` or `"listing"` |

**Constraints:**
- Max file size: 5MB
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Magic bytes validated (prevents MIME spoofing)

**Success Response (200):**

```json
{
  "url": "https://<project>.supabase.co/storage/v1/object/public/images/listings/<userId>/filename.jpg",
  "path": "listings/<userId>/filename.jpg"
}
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"No file provided"` | Missing file |
| 400 | `"File too large..."` | >5MB |
| 400 | `"Invalid file type..."` | Not an allowed image type |
| 400 | `"File content does not match declared type..."` | Magic bytes mismatch |
| 401 | `"Unauthorized"` | Not authenticated |
| 500 | `"Storage not configured"` | Supabase not configured |

---

### DELETE /api/upload

Delete an uploaded image from Supabase storage.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated (owner only) |
| **Rate Limit** | Yes (`uploadDelete`) |

**Request Body:**

```json
{ "path": "listings/<userId>/filename.jpg" }
```

| Field | Type | Rules |
|-------|------|-------|
| `path` | string | 1-500 chars, must start with `profiles/<userId>/` or `listings/<userId>/` |

**Success Response (200):**

```json
{ "success": true }
```

**Notes:**
- Strict prefix validation prevents path traversal attacks (`startsWith` not `includes`).
- Users can only delete their own files.

---

## 9. Nearby Places

### POST /api/nearby

Search for nearby places using the Radar API. Supports both text search (autocomplete) and category-based search.

| Field | Value |
|-------|-------|
| **Auth** | Authenticated |
| **Rate Limit** | Yes (`nearbySearch`) |
| **Caching** | `no-store, no-cache, must-revalidate` (compliance requirement) |
| **Resilience** | Circuit breaker + timeout on Radar API calls |

**Request Body:**

```json
{
  "listingLat": 39.7392,
  "listingLng": -104.9903,
  "query": "coffee",
  "radiusMeters": 1609,
  "limit": 20
}
```

| Field | Type | Rules |
|-------|------|-------|
| `listingLat` | number | -90 to 90 |
| `listingLng` | number | -180 to 180 |
| `query` | string? | Max 100 chars. Text search query. |
| `categories` | string[]? | Radar category codes (e.g., `["gym", "pharmacy"]`) |
| `radiusMeters` | number | Must be exactly `1609` (1mi), `3218` (2mi), or `8046` (5mi) |
| `limit` | number? | 1-50, default 20 |

**Search Modes:**

| Input | Mode | API Used |
|-------|------|----------|
| `query` only (text search) | Autocomplete | Radar Autocomplete |
| `query` matching keyword (e.g., "gym") | Category | Radar Places Search |
| `categories` provided | Category | Radar Places Search |
| Neither query nor categories | Default categories | Radar Places Search |

**Keyword-to-Category Mapping (partial):**

| Keyword | Categories |
|---------|------------|
| `gym`, `fitness` | `gym`, `fitness-recreation` |
| `grocery`, `supermarket` | `food-grocery`, `supermarket` |
| `restaurant` | `restaurant`, `food-beverage` |
| `coffee`, `cafe` | `coffee-shop`, `cafe` |
| `pharmacy` | `pharmacy` |
| `gas`, `gas station` | `gas-station` |

**Success Response (200):**

```json
{
  "places": [
    {
      "id": "place_...",
      "name": "Starbucks",
      "address": "123 Main St, Denver, CO",
      "category": "coffee-shop",
      "location": { "lat": 39.74, "lng": -104.99 },
      "distanceMiles": 0.3,
      "chain": "Starbucks"
    }
  ],
  "meta": { "cached": false, "count": 15 }
}
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 401 | `"Unauthorized"` | Not authenticated |
| 503 | `"Nearby search temporarily unavailable"` | Circuit breaker open |
| 503 | `"Nearby search is not configured"` | RADAR_SECRET_KEY missing |
| 504 | `"Nearby search timed out"` | Request timeout |

**Notes:**
- Category-specific filtering (blocklists/allowlists) removes irrelevant results (e.g., cannabis dispensaries from pharmacy results).
- Results are sorted by distance from listing.
- No POI data is stored (compliance requirement).

---

## 10. AI Chat

### POST /api/chat

Neighborhood chat endpoint powered by Groq (Llama 3.1). Streams AI responses about a listing's neighborhood.

| Field | Value |
|-------|-------|
| **Auth** | Public (origin/host enforced in production) |
| **Rate Limit** | Redis-based (burst + sustained), IP-based |
| **Max Body Size** | 100KB |
| **Runtime** | Node.js |
| **LLM Timeout** | Configurable via `DEFAULT_TIMEOUTS.LLM_STREAM` |

**Security Stack (in order):**
1. Origin/Host enforcement (exact match from env allowlist)
2. Content-Type: `application/json` enforcement
3. Rate limit check (Redis-backed)
4. Body size guard (reads full body, not Content-Length)
5. JSON parsing
6. Strict schema validation
7. Coordinate validation
8. User text extraction
9. Fair Housing gate (blocks discriminatory queries)
10. LLM call with streaming

**Request Body:**

```json
{
  "messages": [
    { "role": "user", "content": "What gyms are nearby?" }
  ],
  "latitude": 39.7392,
  "longitude": -104.9903
}
```

| Field | Type | Rules |
|-------|------|-------|
| `messages` | array | Max 50 messages. Roles: `user`, `assistant`. |
| `messages[].content` | string | Max 2000 chars for user messages |
| `latitude` | number | -90 to 90 |
| `longitude` | number | -180 to 180 |

**Success Response:** Streaming `UIMessageStreamResponse` (Server-Sent Events).

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Invalid JSON"` | Parse error |
| 400 | `"Invalid payload"` | Schema validation failed |
| 400 | `"Invalid coordinates"` | Out of range |
| 400 | `"No valid messages"` | Empty after conversion |
| 403 | `"Forbidden"` | Origin/host not allowed |
| 403 | `{ "error": "request_blocked", "message": "..." }` | Fair Housing policy violation |
| 413 | `"Request too large"` | Body > 100KB |
| 415 | `"Invalid content type"` | Not application/json |
| 429 | `"Too many requests"` | Rate limited (includes `Retry-After`) |
| 503 | `"Chat service temporarily unavailable"` | GROQ_API_KEY not configured |
| 504 | `"Chat response timed out..."` | LLM stream timeout |

**Notes:**
- Has a `nearbyPlaceSearch` tool that returns structured metadata for client-side rendering.
- Fair Housing compliance: blocks queries about demographic/protected-class information.
- Max 5 LLM steps per request.

---

### POST /api/agent

Forward questions to an n8n webhook for AI-powered answers about a listing.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | Yes (`agent`) |
| **Timeout** | 30 seconds |

**Request Body:**

```json
{
  "question": "What is the public transit like near this listing?",
  "lat": 39.7392,
  "lng": -104.9903
}
```

| Field | Type | Rules |
|-------|------|-------|
| `question` | string | 2-500 chars |
| `lat` | number | -90 to 90 |
| `lng` | number | -180 to 180 |

**Success Response (200):**

```json
{ "answer": "The listing is near several RTD bus stops..." }
```

**Fallback Response (200):** When the upstream service fails, returns a graceful fallback:

```json
{
  "answer": "I'm having trouble connecting to my knowledge service right now...",
  "fallback": true
}
```

**Error Responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 400 | `"Question is required"` | Missing question |
| 400 | `"Question is too short"` | < 2 chars |
| 400 | `"Question is too long..."` | > 500 chars |
| 400 | `"Invalid coordinates"` | Out of range |
| 503 | `"Service temporarily unavailable"` | N8N_WEBHOOK_URL not configured |

---

## 11. Health & Monitoring

### GET /api/health/live

Liveness probe. Returns 200 if the process is running. Use for load balancer health checks.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | None |
| **Caching** | `no-cache, no-store, must-revalidate` |

**Success Response (200):**

```json
{
  "status": "alive",
  "timestamp": "2026-02-15T10:30:00.000Z",
  "version": "87ad11e"
}
```

---

### GET /api/health/ready

Readiness probe. Checks database and Redis connectivity. Returns 503 during graceful shutdown.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Rate Limit** | None |
| **Caching** | `no-cache, no-store, must-revalidate` |
| **Runtime** | Node.js |

**Success Response (200):**

```json
{
  "status": "ready",
  "timestamp": "2026-02-15T10:30:00.000Z",
  "version": "87ad11e",
  "checks": {
    "database": { "status": "ok", "latency": 12 },
    "redis": { "status": "ok", "latency": 5 },
    "supabase": { "status": "ok" }
  }
}
```

**Unhealthy Response (503):**

```json
{
  "status": "unhealthy",
  "checks": {
    "database": { "status": "error", "error": "Connection refused" },
    "redis": { "status": "ok", "latency": 5 }
  }
}
```

**Draining Response (503):**

```json
{
  "status": "draining",
  "message": "Application is shutting down"
}
```

**Notes:**
- Database check is critical (fails readiness if down).
- Redis is optional (has DB fallback for rate limiting).
- Supabase is checked for configuration only.

---

### POST /api/metrics

Privacy-safe metrics logging endpoint. Computes HMAC of listing IDs so raw IDs are never stored.

| Field | Value |
|-------|-------|
| **Auth** | Origin/Host enforced in production |
| **Rate Limit** | Redis-based (separate prefix from chat) |
| **Max Body Size** | 10KB |
| **Runtime** | Node.js |

**Request Body:**

```json
{
  "listingId": "clx...",
  "sid": "session-id",
  "route": "nearby",
  "blocked": false,
  "type": "type",
  "types": ["gym", "restaurant"],
  "count": 15
}
```

| Field | Type | Rules |
|-------|------|-------|
| `listingId` | string | Max 64 chars |
| `sid` | string | Session ID, max 64 chars |
| `route` | string | `"nearby"` or `"llm"` |
| `blocked` | boolean | Whether the request was blocked |
| `type` | string? | `"type"` or `"text"` |
| `types` | string[]? | Max 8 items, each from allowlist of Google Place types |
| `count` | number? | 0-100 |

**Success Response (200):**

```json
{ "ok": true }
```

**Notes:**
- Uses HMAC-SHA256 to hash listing IDs -- raw IDs never stored.
- Strict allowlist of place types (excludes religion, education).
- If `LOG_HMAC_SECRET` is not set, accepts request but skips logging (fail closed).
- Blocked requests don't log `type`, `types`, or `count` fields.

---

### GET /api/metrics/ops

Prometheus-compatible system metrics. Returns process stats in Prometheus text format.

| Field | Value |
|-------|-------|
| **Auth** | Bearer token (`METRICS_SECRET` env var) |
| **Rate Limit** | None |
| **Runtime** | Node.js |
| **Caching** | `no-cache, no-store, must-revalidate` |

**Headers Required:**

```
Authorization: Bearer <METRICS_SECRET>
```

**Success Response (200):** `Content-Type: text/plain`

```
# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds 3600

# HELP nodejs_heap_size_used_bytes Used heap size in bytes
# TYPE nodejs_heap_size_used_bytes gauge
nodejs_heap_size_used_bytes 52428800

# HELP app_info Application information
# TYPE app_info gauge
app_info{version="87ad11e",node_version="v20.11.0"} 1
```

**Metrics Exposed:**
- `process_uptime_seconds`
- `nodejs_heap_size_used_bytes`
- `nodejs_heap_size_total_bytes`
- `nodejs_external_memory_bytes`
- `nodejs_rss_bytes`
- `nodejs_array_buffers_bytes`
- `app_info` (version, node_version labels)

**Error Response (401):** `"Unauthorized"` if `METRICS_SECRET` is not configured or token does not match.

---

## 12. Cron Jobs

All cron endpoints are secured with `CRON_SECRET` (Bearer token, min 32 chars, placeholder values rejected).

### GET /api/cron/cleanup-rate-limits

Delete expired rate limit entries from the database.

| Field | Value |
|-------|-------|
| **Auth** | Bearer token (`CRON_SECRET`) |
| **Schedule** | Periodic (recommended: every 15 minutes) |

**Success Response (200):**

```json
{
  "success": true,
  "deleted": 42,
  "timestamp": "2026-02-15T10:30:00.000Z"
}
```

---

### GET /api/cron/refresh-search-docs

Process dirty listings and update search index documents. Uses a dirty-flag sweeper pattern for incremental updates.

| Field | Value |
|-------|-------|
| **Auth** | Bearer token (`CRON_SECRET`) |
| **Schedule** | Every 5 minutes (recommended) |
| **Batch Size** | 100 (configurable via `SEARCH_DOC_BATCH_SIZE`) |

**Success Response (200):**

```json
{
  "success": true,
  "processed": 15,
  "orphans": 2,
  "errors": 0,
  "durationMs": 450,
  "timestamp": "2026-02-15T10:30:00.000Z"
}
```

| Field | Description |
|-------|-------------|
| `processed` | Number of search docs updated |
| `orphans` | Number of dirty flags for deleted listings (cleaned up) |
| `errors` | Number of individual upsert failures |

**Notes:**
- Processes oldest dirty flags first (fairness).
- Computes recommended score with time decay, freshness boost, and log-scaled views.
- Handles orphan dirty flags (deleted listings) by cleaning up search docs.

---

### GET /api/cron/search-alerts

Process saved search alerts. Matches new listings against user-saved search criteria and sends notifications.

| Field | Value |
|-------|-------|
| **Auth** | Bearer token (`CRON_SECRET`) |
| **Schedule** | Periodic (recommended: every 15-30 minutes) |
| **Also supports** | POST (same behavior) |

**Success Response (200):**

```json
{
  "success": true,
  "duration": "250ms"
}
```

---

## 13. Common Patterns

### Authentication

Most endpoints use NextAuth.js session-based authentication. The session is obtained via the `auth()` function from `@/auth`.

**Session cookie:** `next-auth.session-token` (or `__Secure-next-auth.session-token` in production)

**Auth levels:**

| Level | Description |
|-------|-------------|
| Public | No authentication required |
| Authenticated | Valid session required (returns 401 if missing) |
| Owner | Authenticated + must own the resource (returns 403 if not owner) |
| Email Verified | Authenticated + email must be verified (returns 403 if not) |
| Not Suspended | Authenticated + account must not be suspended (returns 403 if suspended) |

### Rate Limiting

Two rate limiting systems are used:

1. **Database-backed** (`withRateLimit`): Used by most endpoints. Rate limit entries stored in Prisma `RateLimitEntry` table. Expired entries cleaned up by cron.
2. **Redis-backed** (`withRateLimitRedis`): Used by search/map endpoints for higher throughput. Falls back to database if Redis is unavailable.

Rate limit responses return HTTP 429 with details in the response body.

### Cursor-Based Pagination

Endpoints supporting pagination accept:

| Param | Type | Default | Max | Description |
|-------|------|---------|-----|-------------|
| `cursor` | string | - | - | ID of last item (alphanumeric + hyphens only) |
| `limit` | number | 20 | 100 | Items per page |

Response format:

```json
{
  "items": [...],
  "pagination": {
    "hasMore": true,
    "nextCursor": "clx...",
    "total": 150
  }
}
```

Implementation: Fetches `limit + 1` items. If `limit + 1` items returned, sets `hasMore: true` and uses the last item's ID as `nextCursor`.

### Error Response Format

Standard error responses follow this shape:

```json
{
  "error": "Human-readable error message"
}
```

Some endpoints include additional fields:

```json
{
  "error": "Validation failed",
  "fields": { "title": "Title is required" },
  "details": { ... }
}
```

### Cache-Control Headers

| Pattern | Header | Use Case |
|---------|--------|----------|
| User-specific data | `private, no-store` | Messages, favorites, conversations |
| Public search data | `public, s-maxage=60, max-age=30, stale-while-revalidate=120` | Search results, map listings |
| Health checks | `no-cache, no-store, must-revalidate` | Liveness, readiness |
| Mutations | `no-store` | Creates, updates, deletes |
| Compliance | `no-store, no-cache, must-revalidate` | Nearby places (no POI caching) |

### Idempotency

The `POST /api/listings` endpoint supports idempotency via the `X-Idempotency-Key` header. When provided:
- First request: Executes the operation and caches the result.
- Subsequent requests with the same key + user + body hash: Returns cached result with `X-Idempotency-Replayed: true` header.
- Mismatched body: Returns a 409 conflict error.

### Request Context

Search endpoints use request context tracking:
- `x-request-id` header is set on all responses for debugging.
- Context is created from incoming request headers and propagated through the request lifecycle.
