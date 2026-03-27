# RoomShare Feature Map (Comprehensive Codebase Audit)

Generated: 2026-03-27 | Source: Full codebase read by codebase-architect agent

---

## 1. Page Routes

### Public Pages (no auth required)
| Route | Page File | Client Component | Purpose |
|---|---|---|---|
| `/` | `src/app/page.tsx` | `HomeClient.tsx` | Landing page with featured listings, hero, CTA |
| `/about` | `src/app/about/page.tsx` | `AboutClient.tsx` | About page (static) |
| `/search` | `src/app/search/page.tsx` | (SearchLayoutView) | Listing search with map + filters |
| `/listings/[id]` | `src/app/listings/[id]/page.tsx` | `ListingPageClient.tsx` | Single listing detail with booking form |
| `/users/[id]` | `src/app/users/[id]/page.tsx` | `UserProfileClient.tsx` | Public user profile view |
| `/login` | `src/app/login/page.tsx` | `LoginClient.tsx` | Login (credentials + Google OAuth) |
| `/signup` | `src/app/signup/page.tsx` | `SignUpClient.tsx` | Registration |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | `ForgotPasswordClient.tsx` | Password reset request |
| `/reset-password` | `src/app/reset-password/page.tsx` | `ResetPasswordClient.tsx` | Password reset form (token-based) |
| `/verify` | `src/app/verify/page.tsx` | `VerificationForm.tsx` | Email verification |
| `/verify-expired` | `src/app/verify-expired/page.tsx` | `VerifyExpiredClient.tsx` | Expired verification link |
| `/privacy` | `src/app/privacy/page.tsx` | `PrivacyClient.tsx` | Privacy policy |
| `/terms` | `src/app/terms/page.tsx` | `TermsClient.tsx` | Terms of service |
| `/offline` | `src/app/offline/page.tsx` | `OfflineClient.tsx` | Offline fallback page |

### Protected Pages (auth required)
| Route | Page File | Client Component | Purpose |
|---|---|---|---|
| `/bookings` | `src/app/bookings/page.tsx` | `BookingsClient.tsx` | My bookings (sent + received) |
| `/messages` | `src/app/messages/page.tsx` | `MessagesPageClient.tsx` | Conversation list |
| `/messages/[id]` | `src/app/messages/[id]/page.tsx` | `ChatWindow.tsx` | Chat with typing indicators + polling |
| `/notifications` | `src/app/notifications/page.tsx` | `NotificationsClient.tsx` | Notification center |
| `/profile` | `src/app/profile/page.tsx` | `ProfileClient.tsx` | Own profile view |
| `/profile/edit` | `src/app/profile/edit/page.tsx` | `EditProfileClient.tsx` | Edit profile |
| `/settings` | `src/app/settings/page.tsx` | `SettingsClient.tsx` | Account settings, password, notifications, delete account |
| `/saved` | `src/app/saved/page.tsx` | `SavedListingsClient.tsx` | Saved/favorited listings |
| `/saved-searches` | `src/app/saved-searches/page.tsx` | `SavedSearchList.tsx` | Saved search alerts |
| `/recently-viewed` | `src/app/recently-viewed/page.tsx` | `RecentlyViewedClient.tsx` | Recently viewed listings |
| `/listings/create` | `src/app/listings/create/page.tsx` | `CreateListingForm.tsx` | Create new listing |
| `/listings/[id]/edit` | `src/app/listings/[id]/edit/page.tsx` | `EditListingForm.tsx` | Edit existing listing |

### Admin Pages (admin role required)
| Route | Page File | Client Component | Purpose |
|---|---|---|---|
| `/admin` | `src/app/admin/page.tsx` | - | Dashboard with aggregate stats |
| `/admin/users` | `src/app/admin/users/page.tsx` | `UserList.tsx` | User management (suspend, admin toggle) |
| `/admin/listings` | `src/app/admin/listings/page.tsx` | `ListingList.tsx` | Listing management (status, delete) |
| `/admin/reports` | `src/app/admin/reports/page.tsx` | `ReportList.tsx` | Report moderation (resolve, dismiss, remove listing) |
| `/admin/verifications` | `src/app/admin/verifications/page.tsx` | `VerificationList.tsx` | ID verification review (approve/reject) |
| `/admin/audit` | `src/app/admin/audit/page.tsx` | - | Admin audit log viewer |

### SEO / Meta Pages
| Route | File | Purpose |
|---|---|---|
| `/sitemap.xml` | `src/app/sitemap.ts` | Dynamic sitemap generation |
| `/robots.txt` | `src/app/robots.ts` | Robots directives |
| `/opengraph-image` | `src/app/opengraph-image.tsx` | Dynamic OG image generation |
| `/twitter-image` | `src/app/twitter-image.tsx` | Dynamic Twitter card image |

---

## 2. API Endpoints

### Auth (`/api/auth/`)
| Endpoint | Method | File | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | `src/app/api/auth/[...nextauth]/route.ts` | NextAuth.js v5 handler (JWT sessions, Google OAuth + Credentials) |
| `/api/auth/forgot-password` | POST | `src/app/api/auth/forgot-password/route.ts` | Send password reset email |
| `/api/auth/reset-password` | POST | `src/app/api/auth/reset-password/route.ts` | Process password reset with token |
| `/api/auth/verify-email` | GET | `src/app/api/auth/verify-email/route.ts` | Email verification via token |
| `/api/auth/resend-verification` | POST | `src/app/api/auth/resend-verification/route.ts` | Resend verification email |
| `/api/register` | POST | `src/app/api/register/route.ts` | User registration (bcrypt, Turnstile, CSRF) |
| `/api/verify` | GET | `src/app/api/verify/route.ts` | Legacy verification endpoint |

### Listings (`/api/listings/`)
| Endpoint | Method | File | Purpose |
|---|---|---|---|
| `/api/listings` | GET | `src/app/api/listings/route.ts` | Paginated listing search with filters |
| `/api/listings` | POST | `src/app/api/listings/route.ts` | Create listing (with geocoding, image validation, idempotency) |
| `/api/listings/[id]` | GET/PUT/DELETE | `src/app/api/listings/[id]/route.ts` | Single listing CRUD |
| `/api/listings/[id]/status` | PATCH | `src/app/api/listings/[id]/status/route.ts` | Toggle listing status (ACTIVE/PAUSED/RENTED) |
| `/api/listings/[id]/view` | POST | `src/app/api/listings/[id]/view/route.ts` | Track listing view |
| `/api/listings/[id]/viewer-state` | GET | `src/app/api/listings/[id]/viewer-state/route.ts` | Get viewer-specific state (saved, blocked, booking status) |
| `/api/listings/[id]/can-delete` | GET | `src/app/api/listings/[id]/can-delete/route.ts` | Check if listing can be deleted (active bookings check) |

### Search
| Endpoint | Method | File | Purpose |
|---|---|---|---|
| `/api/search/v2` | GET | `src/app/api/search/v2/route.ts` | Unified search (list + map data), keyset pagination, ranking |
| `/api/search/facets` | GET | `src/app/api/search/facets/route.ts` | Filter facet counts |
| `/api/search-count` | GET | `src/app/api/search-count/route.ts` | Area listing count for map badge |
| `/api/map-listings` | GET | `src/app/api/map-listings/route.ts` | Map pin data within bounds |

### Bookings
| Endpoint | Method | File | Purpose |
|---|---|---|---|
| `/api/bookings/[id]/audit` | GET | `src/app/api/bookings/[id]/audit/route.ts` | Booking audit trail for host |

### Messaging
| Endpoint | Method | File | Purpose |
|---|---|---|---|
| `/api/messages` | GET | `src/app/api/messages/route.ts` | Message polling endpoint |
| `/api/chat` | POST | `src/app/api/chat/route.ts` | AI neighborhood chat (Groq LLM) |

### Social
| Endpoint | Method | File | Purpose |
|---|---|---|---|
| `/api/favorites` | GET | `src/app/api/favorites/route.ts` | Get user's saved listing IDs |
| `/api/reviews` | POST/GET | `src/app/api/reviews/route.ts` | Review CRUD |
| `/api/reports` | POST | `src/app/api/reports/route.ts` | Report a listing |
| `/api/nearby` | GET | `src/app/api/nearby/route.ts` | Nearby places (Radar API) |

### Agent / AI
| Endpoint | Method | File | Purpose |
|---|---|---|---|
| `/api/agent` | POST | `src/app/api/agent/route.ts` | AI agent for neighborhood questions (Groq, origin-guarded) |

### Infrastructure
| Endpoint | Method | File | Purpose |
|---|---|---|---|
| `/api/health/live` | GET | `src/app/api/health/live/route.ts` | Liveness check |
| `/api/health/ready` | GET | `src/app/api/health/ready/route.ts` | Readiness check (DB connectivity) |
| `/api/upload` | POST | `src/app/api/upload/route.ts` | Image upload to Supabase Storage (sharp resize, magic bytes validation) |
| `/api/metrics` | GET | `src/app/api/metrics/route.ts` | Application metrics |
| `/api/metrics/ops` | POST | `src/app/api/metrics/ops/route.ts` | Operational metrics (HMAC-authenticated) |
| `/api/web-vitals` | POST | `src/app/api/web-vitals/route.ts` | Core Web Vitals reporting |
| `/api/test-helpers` | POST | `src/app/api/test-helpers/route.ts` | E2E test seed/cleanup (disabled in production) |

### Cron Jobs
| Endpoint | Schedule | File | Purpose |
|---|---|---|---|
| `/api/cron/sweep-expired-holds` | Every 1-2 min | `src/app/api/cron/sweep-expired-holds/route.ts` | Expire HELD bookings past TTL, restore slots, notify |
| `/api/cron/reconcile-slots` | Periodic | `src/app/api/cron/reconcile-slots/route.ts` | Verify availableSlots matches actual booking state |
| `/api/cron/cleanup-rate-limits` | Periodic | `src/app/api/cron/cleanup-rate-limits/route.ts` | Purge expired rate limit entries |
| `/api/cron/cleanup-idempotency-keys` | Periodic | `src/app/api/cron/cleanup-idempotency-keys/route.ts` | Purge expired idempotency keys |
| `/api/cron/cleanup-typing-status` | Periodic | `src/app/api/cron/cleanup-typing-status/route.ts` | Clear stale typing indicators |
| `/api/cron/search-alerts` | Periodic | `src/app/api/cron/search-alerts/route.ts` | Send saved search alert emails |
| `/api/cron/refresh-search-docs` | Periodic | `src/app/api/cron/refresh-search-docs/route.ts` | Rebuild dirty SearchDoc materialized rows |
| `/api/cron/embeddings-maintenance` | Periodic | `src/app/api/cron/embeddings-maintenance/route.ts` | Maintain pgvector embeddings |

---

## 3. Server Actions (`src/app/actions/`)

| File | Functions | Purpose |
|---|---|---|
| `booking.ts` | `createBooking`, `createHold` | Create booking (PENDING) or hold (HELD) with idempotency, serializable isolation, FOR UPDATE locks |
| `manage-booking.ts` | `updateBookingStatus`, `getMyBookings` | Accept/reject/cancel bookings with state machine validation |
| `chat.ts` | `startConversation`, `sendMessage`, `getConversations`, `getMessages`, `pollMessages`, `markConversationMessagesAsRead`, `deleteMessage`, `deleteConversation`, `setTypingStatus`, `getTypingStatus`, `getUnreadMessageCount`, `markAllMessagesAsRead` | Full messaging system with typing indicators, per-user deletion, IDOR protection |
| `admin.ts` | `requireAdmin`, `getUsers`, `toggleUserAdmin`, `suspendUser`, `getListingsForAdmin`, `updateListingStatus`, `deleteListing`, `getReports`, `resolveReport`, `resolveReportAndRemoveListing`, `getAdminStats` | Admin CRUD with audit logging |
| `create-listing.ts` | `createListing` (DEPRECATED) | Stub - redirects to POST /api/listings |
| `listing-status.ts` | `updateListingStatus`, `incrementViewCount`, `trackListingView`, `trackRecentlyViewed`, `getRecentlyViewed` | Listing status toggle, view tracking, recently viewed |
| `profile.ts` | `updateProfile`, `getProfile` | Profile CRUD |
| `saved-listings.ts` | `toggleSaveListing`, `isListingSaved`, `getSavedListings`, `removeSavedListing` | Favorite/save listings (atomic toggle) |
| `saved-search.ts` | `saveSearch`, `getMySavedSearches`, `deleteSavedSearch`, `toggleSearchAlert`, `updateSavedSearchName` | Saved search alerts management (max 10 per user) |
| `settings.ts` | `getNotificationPreferences`, `updateNotificationPreferences`, `changePassword`, `verifyPassword`, `hasPasswordSet`, `deleteAccount`, `getUserSettings` | Account settings, password change (with passwordChangedAt session invalidation), account deletion |
| `block.ts` | `blockUser`, `unblockUser`, `getBlockedUsers`, `isBlocked`, `getBlockStatus`, `checkBlockBeforeAction` | User blocking (bidirectional check on all interactions) |
| `notifications.ts` | `createNotification`, `getNotifications`, `getMoreNotifications`, `markNotificationAsRead`, `markAllNotificationsAsRead`, `deleteNotification`, `getUnreadNotificationCount`, `deleteAllNotifications` | Full notification lifecycle |
| `verification.ts` | `submitVerificationRequest`, `getMyVerificationStatus`, `getPendingVerifications`, `approveVerification`, `rejectVerification`, `cancelVerificationRequest` | ID verification flow with 24h cooldown |
| `review-response.ts` | `createReviewResponse`, `updateReviewResponse`, `deleteReviewResponse` | Host responses to reviews |
| `filter-suggestions.ts` | `getFilterSuggestions` | Filter impact analysis for zero-results guidance |
| `suspension.ts` | `checkSuspension`, `checkEmailVerified` | Suspension/email verification guards |

---

## 4. Database Models (Prisma Schema)

### Core Models
| Model | Key Fields | Relationships | Purpose |
|---|---|---|---|
| `User` | id, email, password, isAdmin, isSuspended, isVerified, passwordChangedAt | listings, bookings, messages, conversations, notifications, reviews, savedListings, blockedUsers | User account |
| `Listing` | id, ownerId, title, price, totalSlots, availableSlots, status, bookingMode, holdTtlMinutes, version | owner, location, bookings, conversations, reviews, reports | Room listing |
| `Location` | id, listingId, address, city, state, zip, coords (PostGIS geometry) | listing | Geolocation data |
| `Booking` | id, listingId, tenantId, status, slotsRequested, version, heldUntil, heldAt | listing, tenant, bookingAuditLogs | Booking/hold record |
| `Conversation` | id, listingId, deletedAt | listing, participants, messages, typingStatuses, deletions | Chat conversation |
| `Message` | id, senderId, conversationId, content, read, deletedAt | sender, conversation | Chat message (soft-delete) |

### Supporting Models
| Model | Purpose |
|---|---|
| `Account` | OAuth account linking (Google) |
| `Session` | NextAuth sessions |
| `VerificationToken` | Email verification tokens (hashed) |
| `PasswordResetToken` | Password reset tokens (hashed) |
| `Review` | Listing/user reviews |
| `ReviewResponse` | Host responses to reviews |
| `Report` | Listing reports (OPEN/RESOLVED/DISMISSED) |
| `Notification` | In-app notifications (11 types) |
| `SavedListing` | User favorites |
| `SavedSearch` | Saved search filters with alert config |
| `RecentlyViewed` | User view history (max 20) |
| `VerificationRequest` | ID verification documents |
| `BlockedUser` | User blocking (bidirectional) |
| `TypingStatus` | Chat typing indicators |
| `ConversationDeletion` | Per-user conversation deletion |
| `BookingAuditLog` | Immutable booking state transition log |
| `AuditLog` | Admin action audit trail |
| `RateLimitEntry` | DB-backed rate limiting |
| `IdempotencyKey` | Idempotency for booking/hold creation |

### Enums
- `BookingStatus`: PENDING, ACCEPTED, REJECTED, CANCELLED, HELD, EXPIRED
- `ListingStatus`: ACTIVE, PAUSED, RENTED
- `ReportStatus`: OPEN, RESOLVED, DISMISSED
- `NotificationType`: 11 types (booking lifecycle, messages, reviews, etc.)
- `VerificationStatus`: PENDING, APPROVED, REJECTED
- `AlertFrequency`: INSTANT, DAILY, WEEKLY

---

## 5. Authentication & Authorization

### Auth Stack
- **Provider**: NextAuth.js v5 (Auth.js) with JWT strategy
- **Providers**: Google OAuth + Email/Password (Credentials)
- **Session**: JWT, 14-day max age, daily refresh
- **Files**: `src/auth.ts` (full config), `src/auth.config.ts` (edge-safe), `src/auth-edge.ts` (edge runtime)

### Auth Boundaries
| Route Pattern | Requirement | Enforcement |
|---|---|---|
| `/admin/*` | isAdmin === true (DB-verified) | `authorized` callback + `requireAdmin()` DB check |
| `/bookings`, `/messages`, `/settings`, `/profile`, `/notifications`, `/saved`, `/recently-viewed`, `/saved-searches` | Authenticated | `authorized` callback in auth config |
| `/listings/create`, `/listings/[id]/edit` | Authenticated | Page-level session check |
| `/login`, `/signup` | NOT authenticated (redirect if logged in) | `authorized` callback |
| All other routes | Public | No restriction |

### Security Features
- **Password hashing**: bcrypt with cost 12
- **Turnstile**: Cloudflare bot protection on login + registration
- **Rate limiting**: Per-email + per-IP on login, per-user on all mutations
- **Session invalidation**: passwordChangedAt tracking, 5-min periodic JWT check
- **OAuth security**: email_verified enforcement on Google, token cleanup after link
- **CSRF protection**: `validateCsrf()` on POST endpoints
- **Suspension check**: Middleware-level (`proxy.ts`) + server action level

---

## 6. Third-Party Integrations

| Service | Usage | Files | Required? |
|---|---|---|---|
| **Supabase** | Storage (image uploads), Realtime (chat channels, typing, presence) | `src/lib/supabase.ts`, `src/app/api/upload/route.ts` | Optional (graceful degrade) |
| **Mapbox/MapLibre GL** | Map rendering (maplibre-gl + react-map-gl) | `src/components/Map.tsx`, `src/components/DynamicMap.tsx` | Core feature |
| **Stadia Maps** | Basemap tiles | Configured via env `NEXT_PUBLIC_STADIA_API_KEY` | Optional |
| **Photon/Nominatim** | Geocoding (free, no API key) | `src/lib/geocoding.ts`, `src/lib/geocoding-cache.ts` | Always available |
| **Google Places** | Place details/autocomplete | `src/lib/places/` | Optional |
| **Radar API** | Nearby places search | `src/app/api/nearby/route.ts` | Optional |
| **Groq AI** | Neighborhood chat agent | `src/app/api/agent/route.ts`, `src/app/api/chat/route.ts` | Optional |
| **Google Gemini** | Embeddings for semantic search | `src/lib/embeddings/` | Optional |
| **Resend** | Transactional email (verification, notifications) | `src/lib/email.ts`, `src/lib/email-templates.ts` | Optional |
| **Upstash Redis** | Rate limiting (fast path) | `src/lib/rate-limit-redis.ts` | Optional (falls back to DB) |
| **Sentry** | Error tracking + performance monitoring | `sentry.*.config.ts`, `instrumentation.ts` | Optional |
| **Cloudflare Turnstile** | Bot protection | `src/lib/turnstile.ts` | Required in production |
| **PostGIS** | Spatial queries (geo-bounded search) | Via Prisma + raw SQL | Core feature |
| **pgvector** | Vector similarity search (embeddings) | `src/lib/embeddings/` | Optional |

---

## 7. Real-Time Features

| Feature | Mechanism | Files |
|---|---|---|
| **Chat messages** | Server action polling (`pollMessages`) at interval + Supabase Realtime broadcast | `src/app/actions/chat.ts`, `src/app/messages/[id]/ChatWindow.tsx` |
| **Typing indicators** | DB `TypingStatus` model + Supabase Realtime broadcast, 5-second staleness window | `src/app/actions/chat.ts`, `src/lib/supabase.ts` |
| **Presence tracking** | Supabase Realtime presence API | `src/lib/supabase.ts` |
| **Notification polling** | Server action polling from `NotificationCenter` component | `src/components/NotificationCenter.tsx` |
| **Hold countdown timer** | Client-side countdown from `heldUntil` timestamp, server-side sweeper cron | `src/components/bookings/`, `src/app/api/cron/sweep-expired-holds/route.ts` |

---

## 8. State Machines

### Booking State Machine (`src/lib/booking-state-machine.ts`)
```
PENDING  --> ACCEPTED | REJECTED | CANCELLED
ACCEPTED --> CANCELLED
REJECTED --> (terminal)
CANCELLED --> (terminal)
HELD     --> ACCEPTED | REJECTED | CANCELLED | EXPIRED
EXPIRED  --> (terminal)
```

**Key invariants**:
- Only host can ACCEPT/REJECT
- Only tenant can CANCEL
- EXPIRED is only set by sweeper cron (never manual)
- Optimistic locking via `version` field on Booking + Listing
- FOR UPDATE row locks on Listing for all slot-affecting transitions
- HELD bookings consume slots immediately; restored on REJECT/CANCEL/EXPIRE

### Listing Status Machine
```
ACTIVE --> PAUSED (requires no active/pending bookings)
ACTIVE --> RENTED
PAUSED --> ACTIVE
RENTED --> ACTIVE
```

### Verification Status Machine
```
not_started --> PENDING (submit request)
PENDING --> APPROVED | REJECTED (admin action)
REJECTED --> PENDING (resubmit after 24h cooldown)
APPROVED --> (terminal)
```

### Report Status Machine
```
OPEN --> RESOLVED | DISMISSED (admin action)
```

### Notification Types (state triggers)
```
BOOKING_REQUEST, BOOKING_ACCEPTED, BOOKING_REJECTED, BOOKING_CANCELLED,
BOOKING_HOLD_REQUEST, BOOKING_EXPIRED, BOOKING_HOLD_EXPIRED,
NEW_MESSAGE, NEW_REVIEW, LISTING_SAVED, SEARCH_ALERT
```

---

## 9. Components with Significant Business Logic

| Component | File | Logic |
|---|---|---|
| `BookingForm` | `src/components/BookingForm.tsx` | Booking/hold creation, date validation, slot selection, idempotency key generation |
| `BookingCalendar` | `src/components/BookingCalendar.tsx` | Date range picker with availability overlay |
| `SlotSelector` | `src/components/SlotSelector.tsx` | Multi-slot booking selection |
| `ChatWindow` | `src/app/messages/[id]/ChatWindow.tsx` | Real-time chat with polling, typing indicators, read receipts |
| `SearchLayoutView` | `src/components/SearchLayoutView.tsx` | Split-pane search (map + list) with mobile bottom sheet |
| `Map` / `DynamicMap` | `src/components/Map.tsx`, `DynamicMap.tsx` | MapLibre GL map with clustering, pin rendering |
| `PersistentMapWrapper` | `src/components/PersistentMapWrapper.tsx` | Map state persistence across search navigation |
| `SearchForm` | `src/components/SearchForm.tsx` | Filter form with debounced auto-search |
| `FeaturedListings` | `src/components/FeaturedListings.tsx` / `FeaturedListingsClient.tsx` | Homepage featured listings |
| `NotificationCenter` | `src/components/NotificationCenter.tsx` | Notification bell with polling, badge count |
| `ListingStatusToggle` | `src/components/ListingStatusToggle.tsx` | Owner listing status management |
| `ImageUpload` | `src/components/ImageUpload.tsx` | Image upload with Supabase Storage |
| `BookingsClient` | `src/app/bookings/BookingsClient.tsx` | Sent/received booking management with status actions |
| `NeighborhoodChat` | `src/components/NeighborhoodChat.tsx` | AI-powered neighborhood Q&A |
| `ServiceWorkerRegistration` | `src/components/ServiceWorkerRegistration.tsx` | SW lifecycle management |
| `WebVitals` | `src/components/WebVitals.tsx` | Core Web Vitals reporting |
| `SaveSearchButton` | `src/components/SaveSearchButton.tsx` | Save current search as alert |
| `ZeroResultsSuggestions` | `src/components/ZeroResultsSuggestions.tsx` | Filter relaxation guidance on empty results |
| `LowResultsGuidance` | `src/components/LowResultsGuidance.tsx` | Filter impact count for few results |

---

## 10. Middleware

| Layer | File | Purpose |
|---|---|---|
| **Proxy** | `src/proxy.ts` | Request pipeline: suspension check + CSP headers + request ID |
| **Auth (edge)** | `src/auth-edge.ts` | Edge-compatible auth for middleware |
| **Auth config** | `src/auth.config.ts` | Route protection rules (protectedPaths, admin routes) |
| **CSP** | `src/lib/csp-middleware.ts`, `src/lib/csp.ts` | Content Security Policy with nonce injection |
| **Origin guard** | `src/lib/origin-guard.ts` | Origin/Host allowlist enforcement |
| **CSRF** | `src/lib/csrf.ts` | CSRF token validation on POST endpoints |
| **Rate limiting** | `src/lib/rate-limit.ts`, `src/lib/rate-limit-redis.ts`, `src/lib/with-rate-limit.ts`, `src/lib/with-rate-limit-redis.ts` | Per-user, per-IP, per-endpoint rate limiting (Redis primary, DB fallback) |
| **Cron auth** | `src/lib/cron-auth.ts` | CRON_SECRET validation for cron endpoints |
| **Request context** | `src/lib/request-context.ts` | AsyncLocalStorage for request ID propagation |
| **Timeout wrapper** | `src/lib/timeout-wrapper.ts` | Request timeout protection |
| **Circuit breaker** | `src/lib/circuit-breaker.ts` | Circuit breaker for external service calls |
| **API error handler** | `src/lib/api-error-handler.ts` | Centralized API error formatting |

---

## 11. Feature Flags (`src/lib/env.ts`)

| Flag | Env Var | Default | Purpose |
|---|---|---|---|
| `multiSlotBooking` | `ENABLE_MULTI_SLOT_BOOKING` | false | Multi-slot booking support |
| `wholeUnitMode` | `ENABLE_WHOLE_UNIT_MODE` | false | Whole-unit booking mode (requires multiSlot) |
| `softHoldsEnabled` | `ENABLE_SOFT_HOLDS=on` | off | Time-limited slot reservations |
| `softHoldsDraining` | `ENABLE_SOFT_HOLDS=drain` | off | Drain mode (sweeper runs, no new holds) |
| `bookingAudit` | `ENABLE_BOOKING_AUDIT` | false | Booking audit trail (requires softHolds) |
| `searchDoc` | `ENABLE_SEARCH_DOC` | false | SearchDoc materialized view for fast text search |
| `searchV2` | Always true | true | Unified search endpoint |
| `searchKeyset` | CURSOR_SECRET set | false | HMAC-verified keyset pagination |
| `semanticSearch` | `ENABLE_SEMANTIC_SEARCH` | false | pgvector semantic search |
| `imageEmbeddings` | `ENABLE_IMAGE_EMBEDDINGS` | false | Image embedding generation |
| `turnstile` | `TURNSTILE_ENABLED=true` | false | Cloudflare bot protection |
| `nearbyPlaces` | `NEXT_PUBLIC_NEARBY_ENABLED=true` + Radar keys | false | Nearby places feature |

---

## 12. Key Library Modules

| Module | File(s) | Purpose |
|---|---|---|
| **Booking audit** | `src/lib/booking-audit.ts` | Immutable audit log for booking state transitions |
| **Admin audit** | `src/lib/audit.ts` | Admin action audit trail |
| **Idempotency** | `src/lib/idempotency.ts` | INSERT ON CONFLICT + FOR UPDATE idempotency for bookings |
| **Hold constants** | `src/lib/hold-constants.ts` | HOLD_TTL_MINUTES, MAX_HOLDS_PER_USER, SWEEPER_BATCH_SIZE |
| **Notifications** | `src/lib/notifications.ts` | `createInternalNotification()` — internal notification creator |
| **Email** | `src/lib/email.ts`, `src/lib/email-templates.ts` | Resend email with preference-based sending |
| **Search** | `src/lib/search/` (directory) | SearchDoc materialized views, v2 service, ranking, dirty tracking |
| **Geocoding** | `src/lib/geocoding.ts`, `src/lib/geocoding-cache.ts` | Photon/Nominatim geocoding with caching |
| **Filter schema** | `src/lib/filter-schema.ts` | Search filter validation and parsing |
| **Search params** | `src/lib/search-params.ts` | URL search param parsing and validation |
| **Data layer** | `src/lib/data.ts` | `getListingsPaginated`, `getMapListings`, `analyzeFilterImpact` |
| **Schemas** | `src/lib/schemas.ts` | Zod schemas for booking, listing, upload validation |
| **Logger** | `src/lib/logger.ts` | Structured logging with PII sanitization |
| **Token security** | `src/lib/token-security.ts` | Token generation with hash separation |
| **Profile completion** | `src/lib/profile-completion.ts` | Profile completeness calculation |
| **Listing availability** | `src/lib/listing-availability.ts` | Slot availability computation |
| **Languages** | `src/lib/languages.ts` | Language code validation |
| **Listing language guard** | `src/lib/listing-language-guard.ts` | Fair housing language compliance |
| **SQL safety** | `src/lib/sql-safety.ts` | SQL injection prevention utilities |
| **Embeddings** | `src/lib/embeddings/` | Gemini embedding generation + pgvector sync |
| **Search alerts** | `src/lib/search-alerts.ts` | Instant/daily/weekly saved search alert processing |

---

## 13. React Contexts

| Context | File | Purpose |
|---|---|---|
| `FilterStateContext` | `src/contexts/FilterStateContext.tsx` | Pending/committed filter state management |
| `MapBoundsContext` | `src/contexts/MapBoundsContext.tsx` | Map viewport bounds sharing |
| `ActivePanBoundsContext` | `src/contexts/ActivePanBoundsContext.tsx` | Active map pan detection |
| `ListingFocusContext` | `src/contexts/ListingFocusContext.tsx` | Highlighted listing on map hover |
| `SearchMapUIContext` | `src/contexts/SearchMapUIContext.tsx` | Search/map UI state (view toggle, mobile sheet) |
| `SearchV2DataContext` | `src/contexts/SearchV2DataContext.tsx` | Search v2 response data distribution |
| `MobileSearchContext` | `src/contexts/MobileSearchContext.tsx` | Mobile search UX state |
| `SearchTransitionContext` | `src/contexts/SearchTransitionContext.tsx` | Search loading transition state |
| `NavbarVisibilityContext` | `src/contexts/NavbarVisibilityContext.tsx` | Navbar show/hide on scroll |
| `ScrollContainerContext` | `src/contexts/ScrollContainerContext.tsx` | Scroll container reference sharing |

---

## 14. Custom Hooks

| Hook | File | Purpose |
|---|---|---|
| `useBatchedFilters` | `src/hooks/useBatchedFilters.ts` | Debounced filter commit batching |
| `useDebouncedFilterCount` | `src/hooks/useDebouncedFilterCount.ts` | Debounced filter result count |
| `useFacets` | `src/hooks/useFacets.ts` | Search facet data fetching |
| `useFilterImpactCount` | `src/hooks/useFilterImpactCount.ts` | Filter impact analysis for guidance |
| `useBlockStatus` | `src/hooks/useBlockStatus.ts` | User block status check |
| `useBodyScrollLock` | `src/hooks/useBodyScrollLock.ts` | Body scroll lock for modals/sheets |
| `useImageUpload` | `src/hooks/useImageUpload.ts` | Image upload with progress tracking |
| `useFormPersistence` | `src/hooks/useFormPersistence.ts` | Form state persistence |
| `useKeyboardShortcuts` | `src/hooks/useKeyboardShortcuts.ts` | Keyboard shortcut management |
| `useMapPreference` | `src/hooks/useMapPreference.ts` | Map view preference |
| `useMediaQuery` | `src/hooks/useMediaQuery.ts` | Responsive breakpoint detection |
| `useNavigationGuard` | `src/hooks/useNavigationGuard.ts` | Unsaved changes warning |
| `useNetworkStatus` | `src/hooks/useNetworkStatus.ts` | Online/offline detection |
| `useRateLimitHandler` | `src/hooks/useRateLimitHandler.ts` | Rate limit error handling |
| `useRateLimitStatus` | `src/hooks/useRateLimitStatus.ts` | Rate limit countdown display |
| `useRecentSearches` | `src/hooks/useRecentSearches.ts` | Recent search history |
| `useScrollHeader` | `src/hooks/useScrollHeader.ts` | Show/hide header on scroll |
| `useAbortableServerAction` | `src/hooks/useAbortableServerAction.ts` | Cancellable server action calls |
| `useNearbySearchRateLimit` | `src/hooks/useNearbySearchRateLimit.ts` | Nearby search rate limit tracking |
| `createTTLCache` | `src/hooks/createTTLCache.ts` | TTL-based client cache factory |

---

## 15. Potential Issues / Observations During Mapping

1. **Deprecated server action**: `createListing` in `src/app/actions/create-listing.ts` is deprecated but export kept for type compat. Listing creation is via `POST /api/listings`.

2. **Dual rate limiting paths**: DB-backed (`src/lib/rate-limit.ts`) and Redis-backed (`src/lib/rate-limit-redis.ts`) coexist. Redis is primary for high-volume paths (search), DB is fallback.

3. **Booking concurrency**: Serializable isolation + FOR UPDATE + optimistic locking (version field) + idempotency keys. Very thorough but complex — many error paths.

4. **Hold-cycling attack surface**: Per-listing rate limit (`createHoldPerListing`) mitigates hold-cycle attacks on 1-slot listings.

5. **Search architecture complexity**: 7+ contexts for search/map state coordination. SearchDoc materialized view is critical for production perf.

6. **Message polling vs real-time**: Dual mechanism — server action polling as primary, Supabase Realtime as enhancement. Both paths must be consistent.

7. **Admin audit gaps**: Admin listing status change logs but does not cross-reference with affected bookings (unlike `deleteListing` which does).

8. **Conversation deletion complexity**: Three layers — admin-level `deletedAt`, per-user `ConversationDeletion` records, and message-level `deletedAt`/`deletedBy`. Resurrection on new message.

---

## 16. Verified Bugs (from edge-case audit, cross-checked by codebase-architect)

### P0 — Must fix before production

| ID | Bug | File:Line | Description |
|---|---|---|---|
| EC-1 | Conversation creation race condition | `src/app/actions/chat.ts:77-103` | `findFirst` then `create` is NOT in a `$transaction`. Two concurrent calls for the same listing+user pair can both pass the `findFirst` (returns null) and both execute `create`, producing duplicate Conversation rows. No `@@unique` constraint on `[listingId, participants]` in the schema. Rate limiting reduces probability but does not eliminate. |
| EC-3 | Booking ACCEPT on non-ACTIVE listing | `src/app/actions/manage-booking.ts:171,255` | Neither the HELD->ACCEPTED nor PENDING->ACCEPTED path checks `listing.status`. The FOR UPDATE SELECT queries only fetch `ownerId` (HELD path) or `availableSlots, totalSlots, id, ownerId, bookingMode` (PENDING path). A host can ACCEPT a booking on a PAUSED or RENTED listing. |

### P1 — Should fix before production

| ID | Bug | File:Line | Description |
|---|---|---|---|
| EC-4 | PENDING bookings never expire | No cron/expiry logic | HELD bookings have sweeper cron for expiry. PENDING bookings sit indefinitely until host acts. No auto-cancel after N days. |
| EC-6 | Listing deletion CASCADE-deletes bookings | `src/app/api/listings/[id]/route.ts` | `tx.listing.delete()` cascade-deletes bookings rather than setting them to CANCELLED. Notifications ARE sent but booking records are destroyed. (Note: admin `deleteListing` in `actions/admin.ts:440-492` correctly cancels PENDING bookings first, but the API route handler for owner deletion may not.) |
| EC-8 | getNotifications limit unbounded | `src/app/actions/notifications.ts:56` | `limit` parameter defaults to 20 but caller can pass any value. `take: limit + 1` could fetch unbounded rows. |
| EC-9 | Listing PATCH images can be empty array | `src/app/api/listings/[id]/route.ts` | Images schema is `z.array(...).max(10).optional()` with no `.min(1)`. Sending `images: []` removes all photos. |

### Disputed Finding (RESOLVED)

| ID | Claim | Actual | Verdict |
|---|---|---|---|
| EC-2 | `sendMessage` missing `checkSuspension()` | `src/app/actions/chat.ts:133-136` — `checkSuspension()` IS called | INCORRECT — already fixed. Not a bug. |
