# Database Documentation

Roomshare uses **PostgreSQL 16** with the **PostGIS 3.4** extension, managed through **Prisma ORM v6**. The database runs via Docker Compose locally and is designed for deployment on Vercel serverless with connection pooling.

## Table of Contents

- [Overview](#overview)
- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Models Reference](#models-reference)
  - [Authentication and Users](#authentication-and-users)
  - [Listings and Location](#listings-and-location)
  - [Messaging](#messaging)
  - [Bookings and Reviews](#bookings-and-reviews)
  - [User Engagement](#user-engagement)
  - [Moderation and Admin](#moderation-and-admin)
  - [Infrastructure](#infrastructure)
- [Enums](#enums)
- [Spatial Data (PostGIS)](#spatial-data-postgis)
- [Denormalized Search Layer](#denormalized-search-layer)
- [Key Query Patterns](#key-query-patterns)
- [Idempotency System](#idempotency-system)
- [Audit Logging](#audit-logging)
- [Migration Guide](#migration-guide)
- [Local Setup](#local-setup)

---

## Overview

| Property | Value |
|----------|-------|
| Database | PostgreSQL 16 |
| Extensions | PostGIS 3.4, pgcrypto |
| ORM | Prisma v6 with `postgresqlExtensions` preview feature |
| Prisma Models | 24 (plus `spatial_ref_sys` from PostGIS and 2 raw SQL tables for search) |
| Connection Pooling | 5 connections max per serverless function instance |
| Pool Timeout | 10 seconds |
| Connect Timeout | 5 seconds |

The Prisma client is configured as a singleton (`src/lib/prisma.ts`) with global caching to survive Next.js hot reloads in development. In production, Prisma logs errors and warnings through a structured logger with correlation IDs and PII redaction.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Account : "has"
    User ||--o{ Session : "has"
    User ||--o{ Listing : "owns"
    User ||--o{ Message : "sends"
    User }o--o{ Conversation : "participates in"
    User ||--o{ ConversationDeletion : "deletes"
    User ||--o{ SavedListing : "saves"
    User ||--o{ Review : "writes (ReviewAuthor)"
    User ||--o{ Review : "receives (ReviewTarget)"
    User ||--o{ Booking : "books (tenant)"
    User ||--o{ Report : "reports (ReportsMade)"
    User ||--o{ Report : "reviews (ReportsReviewed)"
    User ||--o{ RecentlyViewed : "views"
    User ||--o{ Notification : "receives"
    User ||--o{ VerificationRequest : "requests"
    User ||--o{ SavedSearch : "creates"
    User ||--o{ BlockedUser : "blocks (BlocksMade)"
    User ||--o{ BlockedUser : "blocked by (BlocksReceived)"
    User ||--o{ AuditLog : "performs (AuditLogs)"
    User ||--o{ TypingStatus : "has"

    Listing ||--o| Location : "has"
    Listing ||--o{ Conversation : "has"
    Listing ||--o{ SavedListing : "saved by"
    Listing ||--o{ Review : "has"
    Listing ||--o{ Booking : "booked"
    Listing ||--o{ Report : "reported"
    Listing ||--o{ RecentlyViewed : "viewed"

    Conversation ||--o{ Message : "contains"
    Conversation ||--o{ TypingStatus : "has"
    Conversation ||--o{ ConversationDeletion : "deleted by"

    Review ||--o| ReviewResponse : "has"
```

---

## Models Reference

### Authentication and Users

#### User

Central identity model. All other models reference User directly or transitively.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `name` | `String?` | Display name |
| `email` | `String?` | Unique email address |
| `emailVerified` | `DateTime?` | When email was verified |
| `image` | `String?` | Profile photo URL |
| `password` | `String?` | Hashed password (null for OAuth users) |
| `bio` | `String?` | User biography |
| `countryOfOrigin` | `String?` | Country of origin |
| `languages` | `String[]` | Languages spoken |
| `isVerified` | `Boolean` | Identity verification status (default: `false`) |
| `isAdmin` | `Boolean` | Admin privileges (default: `false`) |
| `isSuspended` | `Boolean` | Account suspension flag (default: `false`) |
| `notificationPreferences` | `Json?` | User notification settings |
| `createdAt` | `DateTime` | Registration timestamp |

**Indexes:** Unique on `email`.

**Cascade behavior:** Deleting a User cascades to Account, Session, Listing, Message, Booking, SavedListing, Review (both authored and received), Report (authored), RecentlyViewed, Notification, VerificationRequest, SavedSearch, BlockedUser (both directions), TypingStatus, and ConversationDeletion.

---

#### Account

OAuth provider accounts linked to a User (NextAuth.js adapter pattern).

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `userId` | `String` | FK to User |
| `type` | `String` | Account type (e.g., "oauth") |
| `provider` | `String` | Provider name (e.g., "google") |
| `providerAccountId` | `String` | Provider's user ID |
| `refresh_token` | `String?` | OAuth refresh token |
| `access_token` | `String?` | OAuth access token |
| `expires_at` | `Int?` | Token expiration (Unix timestamp) |
| `token_type` | `String?` | Token type |
| `scope` | `String?` | OAuth scopes |
| `id_token` | `String?` | OIDC ID token |
| `session_state` | `String?` | Session state |

**Unique constraint:** `(provider, providerAccountId)` -- one account per provider per external user.

**On delete:** Cascade from User.

---

#### Session

Active user sessions for NextAuth.js.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `sessionToken` | `String` | Unique session token |
| `userId` | `String` | FK to User |
| `expires` | `DateTime` | Session expiration |

**Indexes:** Unique on `sessionToken`.

**On delete:** Cascade from User.

---

#### VerificationToken

Email verification tokens. Tokens are stored as SHA-256 hashes (not plaintext) for security.

| Field | Type | Description |
|-------|------|-------------|
| `identifier` | `String` | Email address or user identifier |
| `tokenHash` | `String` | SHA-256 hash of verification token (column: `token_hash`) |
| `expires` | `DateTime` | Token expiration |

**Unique constraints:** `tokenHash` (unique), `(identifier, tokenHash)` (composite unique).

**Indexes:** `expires` -- for cleanup of expired tokens.

**Note:** No primary key (composite identifier model). Raw tokens are never stored; only hashes via `pgcrypto` `digest()`.

---

#### PasswordResetToken

Password reset tokens, also stored as SHA-256 hashes.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `email` | `String` | User's email |
| `tokenHash` | `String` | SHA-256 hash of reset token (column: `token_hash`) |
| `expires` | `DateTime` | Token expiration |
| `createdAt` | `DateTime` | Token creation time |

**Unique constraints:** `tokenHash` (unique), `(email, tokenHash)` (composite unique).

**Indexes:** `expires` -- for cleanup of expired tokens.

---

### Listings and Location

#### Listing

Room/space available for rent. Core business entity.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `ownerId` | `String` | FK to User (listing owner) |
| `title` | `String` | Listing title |
| `description` | `String` | Full description |
| `price` | `Float` | Monthly price |
| `images` | `String[]` | Photo URLs (default: `[]`) |
| `amenities` | `String[]` | Available amenities |
| `houseRules` | `String[]` | House rules |
| `leaseDuration` | `String?` | Lease term |
| `roomType` | `String?` | Room type |
| `householdLanguages` | `String[]` | Languages spoken in household (column: `household_languages`, default: `[]`) |
| `primaryHomeLanguage` | `String?` | Primary household language (column: `primary_home_language`) |
| `genderPreference` | `String?` | Preferred tenant gender |
| `householdGender` | `String?` | Current household gender composition |
| `totalSlots` | `Int` | Total available spaces |
| `availableSlots` | `Int` | Currently available spaces |
| `moveInDate` | `DateTime?` | Earliest move-in date |
| `status` | `ListingStatus` | ACTIVE, PAUSED, or RENTED (default: `ACTIVE`) |
| `viewCount` | `Int` | View counter (default: `0`) |
| `createdAt` | `DateTime` | Creation timestamp |
| `updatedAt` | `DateTime` | Last update (auto-managed) |

**Relationships:** Has one Location, has many Conversations, SavedListings, Reviews, Bookings, Reports, RecentlyViewed.

**On delete:** Cascade from User. Cascades to Location, Conversation, SavedListing, Review, Booking, Report, RecentlyViewed.

---

#### Location

Geographic location for a Listing. Uses PostGIS for spatial queries.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `listingId` | `String` | FK to Listing (unique -- one location per listing) |
| `address` | `String` | Street address |
| `city` | `String` | City |
| `state` | `String` | State/province |
| `zip` | `String` | Postal code |
| `coords` | `Unsupported("geometry")?` | PostGIS geometry point |

**Unique constraint:** `listingId` -- enforces 1:1 relationship with Listing.

**Indexes:** GiST index on `coords` (`location_idx`) for spatial queries.

**On delete:** Cascade from Listing.

See [Spatial Data (PostGIS)](#spatial-data-postgis) for details on how spatial queries work.

---

### Messaging

#### Conversation

A messaging thread between participants about a specific listing.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `listingId` | `String` | FK to Listing |
| `createdAt` | `DateTime` | Creation timestamp |
| `updatedAt` | `DateTime` | Last activity (auto-managed) |
| `deletedAt` | `DateTime?` | Admin-level soft delete (hides from ALL participants) |

**Relationships:** Has many Messages, TypingStatuses, ConversationDeletions. Many-to-many with User via implicit `_ConversationParticipants` join table.

**On delete:** Cascade from Listing. Cascades to Message, TypingStatus, ConversationDeletion.

---

#### ConversationDeletion

Per-user soft-delete records for conversations. Each participant can independently hide a conversation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `conversationId` | `String` | FK to Conversation |
| `userId` | `String` | FK to User who deleted |
| `deletedAt` | `DateTime` | When the user deleted the conversation |

**Unique constraint:** `(conversationId, userId)` -- one deletion record per user per conversation.

**Indexes:** `userId` -- for filtering conversations a user has deleted.

**On delete:** Cascade from both Conversation and User.

---

#### Message

Individual message within a conversation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `senderId` | `String` | FK to User |
| `conversationId` | `String` | FK to Conversation |
| `content` | `String` | Message text |
| `read` | `Boolean` | Read receipt (default: `false`) |
| `createdAt` | `DateTime` | Sent timestamp |
| `deletedAt` | `DateTime?` | Soft delete timestamp |
| `deletedBy` | `String?` | User ID who deleted (for audit) |

**Indexes:** Composite `(conversationId, createdAt)` -- optimizes the most common query: fetching messages for a conversation in chronological order.

**On delete:** Cascade from both User and Conversation.

---

#### TypingStatus

Real-time typing indicators for conversations.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `userId` | `String` | FK to User |
| `conversationId` | `String` | FK to Conversation |
| `isTyping` | `Boolean` | Currently typing (default: `false`) |
| `updatedAt` | `DateTime` | Last status update (auto-managed) |

**Unique constraint:** `(userId, conversationId)` -- one status per user per conversation.

**Indexes:** `conversationId`, `updatedAt`.

**On delete:** Cascade from both User and Conversation.

---

### Bookings and Reviews

#### Booking

Reservation request from a tenant for a listing.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `listingId` | `String` | FK to Listing |
| `tenantId` | `String` | FK to User (tenant) |
| `startDate` | `DateTime` | Booking start date |
| `endDate` | `DateTime` | Booking end date |
| `status` | `BookingStatus` | PENDING, ACCEPTED, REJECTED, CANCELLED (default: `PENDING`) |
| `totalPrice` | `Float` | Server-calculated price (server is source of truth) |
| `rejectionReason` | `String?` | Reason for rejection by host |
| `version` | `Int` | Optimistic locking version (default: `1`) |
| `createdAt` | `DateTime` | Creation timestamp |
| `updatedAt` | `DateTime` | Last update (auto-managed) |

**Unique constraint:** `(tenantId, listingId, startDate, endDate)` -- prevents duplicate booking requests for the same tenant/listing/date range.

**Business rules:**
- The `version` field enables optimistic concurrency control. Status updates require the current version, preventing race conditions when two users attempt conflicting updates simultaneously.
- `totalPrice` is always calculated server-side; client-submitted prices are ignored.

**On delete:** Cascade from both Listing and User.

---

#### Review

User review for a listing or another user.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `authorId` | `String` | FK to User (review author) |
| `listingId` | `String?` | FK to Listing (optional) |
| `targetUserId` | `String?` | FK to User being reviewed (optional) |
| `rating` | `Int` | Rating value |
| `comment` | `String` | Review text |
| `createdAt` | `DateTime` | Creation timestamp |

**Unique constraint:** `(authorId, listingId)` -- one review per user per listing (duplicate prevention).

**Relationships:** Has optional ReviewResponse.

**On delete:** Cascade from User (both author and target) and Listing.

---

#### ReviewResponse

Owner's response to a review.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `reviewId` | `String` | FK to Review (unique -- one response per review) |
| `content` | `String` | Response text |
| `createdAt` | `DateTime` | Creation timestamp |
| `updatedAt` | `DateTime` | Last update (auto-managed) |

**Unique constraint:** `reviewId` -- enforces 1:1 relationship with Review.

**On delete:** Cascade from Review.

---

### User Engagement

#### SavedListing

User's saved/favorited listings.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `userId` | `String` | FK to User |
| `listingId` | `String` | FK to Listing |
| `createdAt` | `DateTime` | When saved |

**Unique constraint:** `(userId, listingId)` -- prevents duplicate saves.

**On delete:** Cascade from both User and Listing.

---

#### RecentlyViewed

Tracks which listings a user has recently viewed.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `userId` | `String` | FK to User |
| `listingId` | `String` | FK to Listing |
| `viewedAt` | `DateTime` | When viewed |

**Unique constraint:** `(userId, listingId)` -- upserts on repeated views.

**Indexes:** `(userId, viewedAt)` -- for fetching recent views in chronological order.

**On delete:** Cascade from both User and Listing.

---

#### Notification

In-app notifications for users.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `userId` | `String` | FK to User |
| `type` | `NotificationType` | Notification category |
| `title` | `String` | Notification title |
| `message` | `String` | Notification body |
| `link` | `String?` | Deep link URL |
| `read` | `Boolean` | Read status (default: `false`) |
| `createdAt` | `DateTime` | Creation timestamp |

**Indexes:** `(userId, read)` -- for fetching unread notifications per user.

**On delete:** Cascade from User.

---

#### SavedSearch

Saved search filters with optional alert notifications.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `userId` | `String` | FK to User |
| `name` | `String` | User-assigned name for the search |
| `query` | `String?` | Search query text |
| `filters` | `Json` | All filter parameters as JSON |
| `alertEnabled` | `Boolean` | Whether alerts are active (default: `true`) |
| `alertFrequency` | `AlertFrequency` | INSTANT, DAILY, or WEEKLY (default: `DAILY`) |
| `lastAlertAt` | `DateTime?` | When the last alert was sent |
| `createdAt` | `DateTime` | Creation timestamp |

**Indexes:** `userId`, `(alertEnabled, lastAlertAt)` -- for alert processing batch queries.

**On delete:** Cascade from User.

---

#### VerificationRequest

Identity verification submissions (passport, driver's license, etc.).

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `userId` | `String` | FK to User |
| `documentType` | `String` | Type: "passport", "driver_license", "national_id" |
| `documentUrl` | `String` | URL to uploaded document image |
| `selfieUrl` | `String?` | URL to selfie for identity matching |
| `status` | `VerificationStatus` | PENDING, APPROVED, REJECTED (default: `PENDING`) |
| `adminNotes` | `String?` | Admin notes on rejection |
| `createdAt` | `DateTime` | Submission timestamp |
| `updatedAt` | `DateTime` | Last update (auto-managed) |
| `reviewedAt` | `DateTime?` | When reviewed by admin |
| `reviewedBy` | `String?` | Admin user ID who reviewed |

**Indexes:** `userId`, `status` -- for admin queues and user lookups.

**On delete:** Cascade from User.

---

### Moderation and Admin

#### Report

Content reports submitted by users.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `listingId` | `String` | FK to Listing being reported |
| `reporterId` | `String` | FK to User who filed the report |
| `reason` | `String` | Report reason category |
| `details` | `String?` | Additional details |
| `status` | `ReportStatus` | OPEN, RESOLVED, DISMISSED (default: `OPEN`) |
| `adminNotes` | `String?` | Admin notes |
| `reviewedBy` | `String?` | FK to User (admin who reviewed) |
| `resolvedAt` | `DateTime?` | When resolved |
| `createdAt` | `DateTime` | Submission timestamp |

**Relationships:** Reporter (cascade on delete), Reviewer (no cascade -- preserves report history if admin is removed).

**On delete:** Cascade from Listing and reporter User.

---

#### BlockedUser

User blocking relationships for safety.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `blockerId` | `String` | FK to User who initiated the block |
| `blockedId` | `String` | FK to User who is blocked |
| `createdAt` | `DateTime` | When blocked |

**Unique constraint:** `(blockerId, blockedId)` -- prevents duplicate blocks.

**Indexes:** `blockerId`, `blockedId` -- for checking block status in both directions (messaging, search filtering).

**On delete:** Cascade from both User relations.

---

#### AuditLog

Immutable, append-only audit trail for all admin actions.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `adminId` | `String` | FK to User (admin who performed the action) |
| `action` | `String` | Action type (e.g., "USER_SUSPENDED", "LISTING_DELETED") |
| `targetType` | `String` | Entity type ("User", "Listing", "Report", "VerificationRequest") |
| `targetId` | `String` | ID of the affected entity |
| `details` | `Json?` | Additional context (old/new values, reason) |
| `ipAddress` | `String?` | Admin's IP address for security tracking |
| `createdAt` | `DateTime` | Action timestamp |

**Indexes:** `adminId`, `(targetType, targetId)`, `createdAt`, `action` -- supports filtering by admin, target, time range, and action type.

**On delete:** No cascade from User (audit logs are preserved even if admin account is removed). The relation uses no `onDelete` directive, so deletion of the admin User will fail if they have audit log entries -- this is by design for compliance.

See [Audit Logging](#audit-logging) for the application-level API.

---

### Infrastructure

#### RateLimitEntry

Database-backed rate limiting for Vercel serverless (where in-memory stores do not persist across invocations).

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `identifier` | `String` | IP address or `userId:endpoint` composite |
| `endpoint` | `String` | Rate-limited endpoint name |
| `count` | `Int` | Request count in current window (default: `1`) |
| `windowStart` | `DateTime` | Window start time |
| `expiresAt` | `DateTime` | When this entry can be cleaned up |

**Unique constraint:** `(identifier, endpoint)` -- one rate limit entry per identifier per endpoint.

**Indexes:** `expiresAt` -- for cleanup of expired entries.

**Business rules:** Uses sliding window algorithm. Expired entries are cleaned up opportunistically on each request. Falls back to an in-process memory cache during DB errors (degraded mode) with a hard limit of 10 requests per minute.

---

#### IdempotencyKey

Prevents duplicate submissions for critical operations (bookings, payments).

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` (CUID) | Primary key |
| `key` | `String` | Client-provided idempotency key |
| `userId` | `String` | User who made the request |
| `endpoint` | `String` | Operation name (e.g., "createBooking") |
| `status` | `String` | `'processing'` or `'completed'` |
| `requestHash` | `String` | SHA-256 hash of request body |
| `resultData` | `Json?` | Cached operation result |
| `createdAt` | `DateTime` | Key creation timestamp |
| `expiresAt` | `DateTime` | Auto-expiry (24 hours after creation) |

**Unique constraint:** `(userId, endpoint, key)` -- scoped uniqueness prevents cross-user conflicts.

**Indexes:** `expiresAt` (for cleanup), `(userId, endpoint)` (for lookups).

**Check constraint:** `status IN ('processing', 'completed')`.

See [Idempotency System](#idempotency-system) for the full flow.

---

## Enums

### BookingStatus

State machine for booking lifecycle:

| Value | Description |
|-------|-------------|
| `PENDING` | Initial state. Tenant has submitted a booking request. |
| `ACCEPTED` | Host has approved the booking. |
| `REJECTED` | Host has declined the booking (may include `rejectionReason`). |
| `CANCELLED` | Tenant has cancelled the booking (only tenants can cancel). |

### ListingStatus

Listing visibility control:

| Value | Description |
|-------|-------------|
| `ACTIVE` | Listing is live and searchable. |
| `PAUSED` | Listing is hidden from search but not deleted. Owner can reactivate. |
| `RENTED` | All slots are occupied. Listing is not searchable. |

### ReportStatus

Content report lifecycle:

| Value | Description |
|-------|-------------|
| `OPEN` | Report has been submitted and awaits admin review. |
| `RESOLVED` | Admin has taken action on the reported content. |
| `DISMISSED` | Admin has reviewed and dismissed the report. |

### VerificationStatus

Identity verification workflow:

| Value | Description |
|-------|-------------|
| `PENDING` | Verification documents submitted, awaiting admin review. |
| `APPROVED` | Admin has verified the user's identity. Sets `User.isVerified = true`. |
| `REJECTED` | Admin has rejected the submission (see `adminNotes` for reason). |

### NotificationType

In-app notification categories:

| Value | Description |
|-------|-------------|
| `BOOKING_REQUEST` | New booking request received (sent to host). |
| `BOOKING_ACCEPTED` | Booking was accepted (sent to tenant). |
| `BOOKING_REJECTED` | Booking was rejected (sent to tenant). |
| `BOOKING_CANCELLED` | Booking was cancelled (sent to other party). |
| `NEW_MESSAGE` | New message in a conversation. |
| `NEW_REVIEW` | New review received. |
| `LISTING_SAVED` | Someone saved your listing. |
| `SEARCH_ALERT` | Saved search has new matching results. |

### AlertFrequency

Saved search alert delivery schedule:

| Value | Description |
|-------|-------------|
| `INSTANT` | Send alert immediately when new matches are found. |
| `DAILY` | Batch alerts into a daily digest. |
| `WEEKLY` | Batch alerts into a weekly digest. |

---

## Spatial Data (PostGIS)

### Location Model

The `Location` model stores geographic coordinates using PostGIS's `geometry` type:

```sql
coords  Unsupported("geometry")?
```

A **GiST index** (`location_idx`) is created on the `coords` column for efficient spatial queries such as bounding box lookups.

### Denormalized Search Layer

For search performance, the `listing_search_docs` table stores coordinates as a **PostGIS `geography(Point, 4326)`** column (`location_geog`) with a separate GiST index. It also stores precomputed `lat`/`lng` float columns to avoid `ST_X()`/`ST_Y()` calls at query time.

### Spatial Query Patterns

**Bounding box filter (normal):**

```sql
d.location_geog && ST_MakeEnvelope($minLng, $minLat, $maxLng, $maxLat, 4326)::geography
```

**Antimeridian crossing (split into two ranges):**

```sql
d.location_geog && ST_MakeEnvelope($minLng, $minLat, 180, $maxLat, 4326)::geography
OR d.location_geog && ST_MakeEnvelope(-180, $minLat, $maxLng, $maxLat, 4326)::geography
```

The `&&` operator uses the GiST index for a fast bounding box overlap check. SRID 4326 (WGS 84) is used for all coordinates.

---

## Denormalized Search Layer

Search queries read from a denormalized **`listing_search_docs`** table instead of joining Listing + Location + Review. This table is managed outside Prisma via raw SQL migrations.

### Table Structure

The `listing_search_docs` table combines data from:
- **Listing** -- title, description, price, amenities, house rules, status, slots, images
- **Location** -- address, city, state, zip, lat/lng, PostGIS geography
- **Review aggregation** -- precomputed `avg_rating`, `review_count`
- **Computed columns** -- `recommended_score` (formula: `ratingScore + viewScore + reviewScore + freshnessBoost` where `ratingScore = avg_rating * 20`, `viewScore = log(1 + viewCount) * 10 * decayFactor` with 30-day half-life decay, `reviewScore = review_count * 5`, and `freshnessBoost` = up to 15 points for listings less than 7 days old), lowercase array columns for case-insensitive filtering

### Full-Text Search

A `search_tsv` tsvector column with weighted fields enables PostgreSQL full-text search:

| Weight | Fields | Priority |
|--------|--------|----------|
| A | `title` | Highest |
| B | `city`, `state` | Medium |
| C | `description` | Lowest |

A database trigger (`search_doc_tsv_trigger`) automatically maintains the tsvector on INSERT and UPDATE. Queries use `plainto_tsquery('english', $query)` with the `@@` match operator and `ts_rank_cd()` for relevance scoring.

**GIN index:** `search_doc_tsv_gin_idx` on `search_tsv` for fast full-text lookups.

### Indexes on listing_search_docs

| Index | Type | Columns | Purpose |
|-------|------|---------|---------|
| `search_doc_location_geog_idx` | GiST | `location_geog` | Spatial bounding box queries |
| `search_doc_status_idx` | B-tree (partial) | `status` WHERE `status = 'ACTIVE'` | Active listing filter |
| `search_doc_price_idx` | B-tree | `price` | Price range queries |
| `search_doc_created_at_idx` | B-tree | `listing_created_at DESC` | Sort by newest |
| `search_doc_recommended_score_idx` | B-tree | `recommended_score DESC` | Sort by recommended |
| `search_doc_rating_idx` | B-tree | `avg_rating DESC, review_count DESC` | Sort by rating |
| `search_doc_amenities_gin_idx` | GIN | `amenities_lower` | Amenity containment (`@>`) |
| `search_doc_house_rules_gin_idx` | GIN | `house_rules_lower` | House rule containment (`@>`) |
| `search_doc_languages_gin_idx` | GIN | `household_languages_lower` | Language overlap (`&&`) |
| `search_doc_tsv_gin_idx` | GIN | `search_tsv` | Full-text search |
| `search_doc_keyset_recommended` | B-tree | `recommended_score DESC, listing_created_at DESC, id` | Keyset pagination (recommended sort) |
| Keyset indexes (newest, price, rating) | B-tree | Various | Keyset pagination for each sort option |
| Partial indexes | B-tree | `lease_duration`, `room_type`, `move_in_date` | Filter queries (WHERE NOT NULL) |
| `search_doc_available_idx` | B-tree (partial) | `available_slots` WHERE `available_slots > 0 AND status = 'ACTIVE'` | Available listing filter |

### Dirty Flag Sweeper

The `listing_search_doc_dirty` table tracks which listings need their search doc refreshed:

```sql
CREATE TABLE listing_search_doc_dirty (
  listing_id TEXT PRIMARY KEY,
  marked_at  TIMESTAMPTZ DEFAULT NOW(),
  reason     TEXT  -- 'listing_update', 'review_added', 'location_change'
);
```

A background process periodically reads the oldest dirty records and regenerates the corresponding search docs from the source Listing, Location, and Review tables.

---

## Key Query Patterns

### Cursor-Based Pagination (Keyset)

The search API uses **keyset pagination** to prevent result drift (duplicates/missing items) when listings change during scrolling. The cursor encodes the sort column values and a tie-breaker ID.

**Cursor structure** (base64url-encoded JSON):

```json
{
  "v": 1,
  "s": "recommended",
  "k": ["85.3", "2025-12-01T00:00:00Z"],
  "id": "clxyz123"
}
```

- `v` -- Version number for future format changes
- `s` -- Sort option (validated against current query)
- `k` -- Key values matching the ORDER BY columns (stored as strings for float precision)
- `id` -- Tie-breaker listing ID (CUID)

**Keyset WHERE clause** (for `recommended` sort):

```sql
WHERE (
  (d.recommended_score < $1::float8)
  OR (d.recommended_score = $1::float8 AND d.listing_created_at < $2::timestamptz)
  OR (d.recommended_score = $1::float8 AND d.listing_created_at = $2::timestamptz AND d.id > $3)
)
```

This uses explicit OR-chains instead of PostgreSQL tuple comparison because tuple comparisons use ASC/ASC semantics and do not work for mixed DESC/ASC ordering.

### Composite Index Usage (Messages)

Messages are queried by conversation in chronological order:

```sql
SELECT * FROM "Message"
WHERE "conversationId" = $1
ORDER BY "createdAt" ASC
```

The composite index `(conversationId, createdAt)` covers both the filter and the sort, enabling an index-only scan.

### Hybrid Pagination (Count Optimization)

Instead of `COUNT(*)` (which requires a full table scan), the search system uses a hybrid approach:

1. Run `SELECT COUNT(*) FROM (SELECT id ... LIMIT 101) subq`
2. If count > 100, return `null` (unknown total) and rely on `hasNextPage` from the limit+1 pattern
3. If count <= 100, return the exact total for UI pagination

This prevents expensive count queries on large result sets.

### Statement Timeouts

All search queries execute within a 5-second `SET LOCAL statement_timeout` inside a transaction, preventing runaway queries from consuming connections.

---

## Idempotency System

The `IdempotencyKey` model and `withIdempotency()` wrapper (`src/lib/idempotency.ts`) prevent duplicate submissions for critical operations like booking creation.

### Flow

```
Client sends request with Idempotency-Key header
        |
        v
BEGIN SERIALIZABLE TRANSACTION
        |
        v
Step 1: INSERT ON CONFLICT DO NOTHING
        (atomic claim -- no race window)
        |
        v
Step 2: SELECT ... FOR UPDATE
        (lock the row for this transaction)
        |
        v
Step 3: Verify requestHash matches
        (prevents key reuse with different payload)
        |
        v
Step 4: If status = 'completed' --> return cached result
        |
        v
Step 5: Execute the operation within the same transaction
        |
        v
Step 6: UPDATE status = 'completed', cache resultData
        |
        v
COMMIT (or ROLLBACK on any failure, removing the key)
```

### Key Design Decisions

- **SERIALIZABLE isolation** -- prevents any race conditions between concurrent requests with the same key
- **INSERT ON CONFLICT DO NOTHING** -- atomic claim with no error on conflict
- **FOR UPDATE lock** -- blocks concurrent requests until the transaction completes
- **Request hash verification** -- SHA-256 of the deterministic-JSON-stringified request body prevents key reuse attacks
- **24-hour expiry** -- keys auto-expire for cleanup; a cron job deletes expired entries
- **Retry with backoff** -- serialization failures (SQLSTATE 40001 / Prisma P2034) are retried up to 3 total attempts with exponential backoff (100ms, 200ms)

### Error Responses

| Status | Meaning |
|--------|---------|
| 200 | Success (with `X-Idempotency-Replayed: true` header if cached) |
| 400 | Key reused with different request body |

---

## Audit Logging

The `AuditLog` model and `logAdminAction()` function (`src/lib/audit.ts`) provide an immutable audit trail for all admin actions.

### Tracked Actions

| Action | Target Type | Description |
|--------|-------------|-------------|
| `USER_SUSPENDED` | User | Admin suspended a user account |
| `USER_UNSUSPENDED` | User | Admin reactivated a suspended account |
| `USER_DELETED` | User | Admin deleted a user account |
| `USER_VERIFIED` | User | Admin verified a user's identity |
| `USER_UNVERIFIED` | User | Admin revoked verification status |
| `LISTING_DELETED` | Listing | Admin removed a listing |
| `LISTING_HIDDEN` | Listing | Admin hid a listing from search |
| `LISTING_RESTORED` | Listing | Admin restored a hidden listing |
| `REPORT_RESOLVED` | Report | Admin resolved a content report |
| `REPORT_DISMISSED` | Report | Admin dismissed a content report |
| `VERIFICATION_APPROVED` | VerificationRequest | Admin approved identity verification |
| `VERIFICATION_REJECTED` | VerificationRequest | Admin rejected identity verification |
| `ADMIN_GRANTED` | User | Admin privileges granted to a user |
| `ADMIN_REVOKED` | User | Admin privileges revoked from a user |

### Design Principles

- **Immutable** -- audit logs are never updated or deleted
- **Non-blocking** -- audit logging failures are caught and logged but do not break admin operations
- **Queryable** -- supports filtering by admin, action type, target, and date range with offset-based pagination
- **IP tracking** -- admin IP address is recorded for security forensics

### Query API

```typescript
// Log an action
await logAdminAction({
  adminId: "admin_123",
  action: "USER_SUSPENDED",
  targetType: "User",
  targetId: "user_456",
  details: { reason: "Terms violation" },
  ipAddress: "192.168.1.1",
});

// Query with filters
const { logs, pagination } = await getAuditLogs({
  action: "USER_SUSPENDED",
  startDate: new Date("2026-01-01"),
  page: 1,
  limit: 50,
});

// Get full history for a specific entity
const history = await getTargetAuditHistory("User", "user_456");
```

---

## Migration Guide

### Creating Migrations

```bash
# Generate a migration from schema changes
pnpm prisma migrate dev --name descriptive_name

# Apply migrations in development
pnpm prisma migrate dev

# Apply migrations in production (CI/CD)
pnpm prisma migrate deploy

# Reset database (development only -- destroys all data)
pnpm prisma migrate reset
```

### Migration Safety Rules (from CLAUDE.md)

Every migration must include:

1. **Rollback note** -- "reversible" vs "requires manual data restore"
2. **Data-safety note** -- locking risk, backfill plan, index creation strategy

### Production Migration Checklist

- [ ] Migration is additive (adds columns/tables) rather than destructive when possible
- [ ] New columns have sensible defaults or are nullable to avoid locking
- [ ] Large table changes use `ALTER TABLE ... ADD COLUMN` with default (non-locking in PostgreSQL 11+)
- [ ] Index creation uses `CREATE INDEX CONCURRENTLY` for large tables
- [ ] Backfills run in batches to avoid long transactions and lock contention
- [ ] Feature flags gate new read paths until backfill is complete
- [ ] Rollback SQL is documented in migration file comments

### Rollback Considerations

| Change Type | Rollback Difficulty |
|-------------|-------------------|
| Add column with default | Easy: `ALTER TABLE DROP COLUMN` |
| Add table | Easy: `DROP TABLE` |
| Add index | Easy: `DROP INDEX` |
| Drop column | Hard: requires backup restore |
| Rename column | Medium: add alias, update code, then drop old |
| Change column type | Hard: may require data migration |

### Data Safety Notes

- **Locking risk**: `ALTER TABLE ... ADD COLUMN NOT NULL` without default locks the table during rewrite. Always add nullable first, then backfill, then add constraint.
- **Backfill plan**: Process rows in batches (e.g., 1000 at a time) within separate transactions. Include progress logging.
- **Index creation**: Use `CREATE INDEX CONCURRENTLY` for tables with active reads/writes. Standard `CREATE INDEX` locks writes.
- **PostGIS operations**: GiST index creation on `geography` columns can be slow for large datasets. Use `CONCURRENTLY` and monitor.

---

## Local Setup

### Docker Compose

The database runs as a Docker container using the `postgis/postgis:16-3.4` image.

**`docker-compose.yml`:**

```yaml
version: '3.8'
services:
  db:
    image: postgis/postgis:16-3.4
    ports:
      - "127.0.0.1:5433:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}
      POSTGRES_DB: ${POSTGRES_DB:-roomshare}
    volumes:
      - db_data:/var/lib/postgresql/data
volumes:
  db_data:
```

### Getting Started

```bash
# 1. Set required environment variable
export POSTGRES_PASSWORD=your_secure_password

# 2. Start PostgreSQL with PostGIS
docker compose up -d

# 3. Set DATABASE_URL in .env
# DATABASE_URL="postgresql://postgres:your_secure_password@127.0.0.1:5433/roomshare?schema=public"

# 4. Apply all migrations
pnpm prisma migrate dev

# 5. Generate Prisma client
pnpm prisma generate

# 6. (Optional) Open Prisma Studio for visual data browsing
pnpm prisma studio
```

**Notes:**
- The database is bound to `127.0.0.1:5433` (localhost only, non-default port to avoid conflicts).
- `POSTGRES_PASSWORD` is required and will fail to start without it.
- Data persists in the `db_data` Docker volume across container restarts.
- The Prisma client singleton prevents connection pool exhaustion during Next.js hot reloads in development.

### Connection Pool Configuration

For Vercel serverless deployment, the Prisma client appends connection parameters automatically:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `connection_limit` | 5 | Max connections per function instance (low for serverless) |
| `pool_timeout` | 10 | Seconds to wait for a connection from the pool |
| `connect_timeout` | 5 | Seconds to establish a new connection |

These parameters are only added if not already present in the `DATABASE_URL`.

---

## Migration History

The project has 21 migrations from November 2025 through February 2026:

| Migration | Description |
|-----------|-------------|
| `20251122195016` | Add conversation model |
| `20251124024407` | Add move-in date field |
| `20251203000000` | Add slots constraint |
| `20251217000000` | Add household languages |
| `20251221000000` | Add booking rejection reason |
| `20251229000000` | Remove gender fields |
| `20260101000000` | Phase 0: Idempotency fix (status, requestHash, scoped uniqueness) |
| `20260110000000` | SearchDoc denormalized table |
| `20260111000000` | Keyset index (recommended sort) |
| `20260111000001` | Keyset index (newest sort) |
| `20260116000000` | SearchDoc full-text search (tsvector) |
| `20260120000000` | Keyset index (price sort) |
| `20260120000001` | Keyset index (rating sort) |
| `20260121000000` | SearchDoc lowercase indexes |
| `20260124000000` | Booking version (optimistic locking) |
| `20260131000000` | SearchDoc composite indexes |
| `20260205000000` | Per-user conversation deletion |
| `20260206000000` | Hash auth tokens (SHA-256) |
| `20260208000000` | SearchDoc gender columns |
