# RoomShare Application - Capability Map

> Generated: 2025-12-22
> Purpose: E2E Test Planning for 100 User Journeys

---

## 1. APPLICATION OVERVIEW

| Aspect | Details |
|--------|---------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Database** | PostgreSQL + PostGIS (spatial indexing) |
| **Auth** | NextAuth.js v5 (JWT sessions) |
| **ORM** | Prisma 6 |
| **UI** | React 19, Tailwind CSS 4, Radix UI, Lucide Icons |
| **Maps** | Mapbox GL |
| **Email** | Resend |
| **AI** | Groq (llama-3.1-8b-instant) |
| **Rate Limiting** | PostgreSQL + Upstash Redis |
| **Error Tracking** | Sentry |
| **Storage** | Supabase |

---

## 2. ROUTES & PAGES (32 Pages)

### 2.1 Public Routes (No Auth Required)

| Route | File Path | Purpose | Key Features |
|-------|-----------|---------|--------------|
| `/` | `src/app/page.tsx` | Home page | Featured listings, CTA, hero section |
| `/search` | `src/app/search/page.tsx` | Search listings | Filters, map view, pagination, sorting |
| `/listings/[id]` | `src/app/listings/[id]/page.tsx` | Listing detail | Reviews, booking calendar, neighborhood AI |
| `/users/[id]` | `src/app/users/[id]/page.tsx` | Public profile | User listings, reviews |
| `/about` | `src/app/about/page.tsx` | About page | Static content |
| `/privacy` | `src/app/privacy/page.tsx` | Privacy policy | Static content |
| `/terms` | `src/app/terms/page.tsx` | Terms of service | Static content |
| `/offline` | `src/app/offline/page.tsx` | PWA offline | Service worker fallback |

### 2.2 Authentication Routes (Redirect if Logged In)

| Route | File Path | Purpose | Key Features |
|-------|-----------|---------|--------------|
| `/login` | `src/app/login/page.tsx` | Login | Email/password, Google OAuth, error handling |
| `/signup` | `src/app/signup/page.tsx` | Registration | Password strength meter, terms acceptance |
| `/verify` | `src/app/verify/page.tsx` | Email verification | Token validation |
| `/verify-expired` | `src/app/verify-expired/page.tsx` | Expired token | Resend option |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | Password reset request | Email input |
| `/reset-password` | `src/app/reset-password/page.tsx` | Password reset | Token + new password |

### 2.3 Protected Routes (Auth Required)

| Route | File Path | Purpose | Auth Level |
|-------|-----------|---------|------------|
| `/profile` | `src/app/profile/page.tsx` | User profile dashboard | Authenticated |
| `/profile/edit` | `src/app/profile/edit/page.tsx` | Edit profile | Authenticated |
| `/settings` | `src/app/settings/page.tsx` | User settings | Authenticated |
| `/listings/create` | `src/app/listings/create/page.tsx` | Create listing | Authenticated |
| `/listings/[id]/edit` | `src/app/listings/[id]/edit/page.tsx` | Edit listing | Owner only |
| `/messages` | `src/app/messages/page.tsx` | Messages inbox | Authenticated |
| `/messages/[id]` | `src/app/messages/[id]/page.tsx` | Chat conversation | Authenticated |
| `/notifications` | `src/app/notifications/page.tsx` | Notifications | Authenticated |
| `/bookings` | `src/app/bookings/page.tsx` | Booking management | Authenticated |
| `/saved` | `src/app/saved/page.tsx` | Saved listings | Authenticated |
| `/saved-searches` | `src/app/saved-searches/page.tsx` | Saved searches | Authenticated |
| `/recently-viewed` | `src/app/recently-viewed/page.tsx` | Browse history | Authenticated |

### 2.4 Admin Routes (Admin Only)

| Route | File Path | Purpose |
|-------|-----------|---------|
| `/admin` | `src/app/admin/page.tsx` | Admin dashboard with stats |
| `/admin/verifications` | `src/app/admin/verifications/page.tsx` | ID verification queue |
| `/admin/users` | `src/app/admin/users/page.tsx` | User management |
| `/admin/listings` | `src/app/admin/listings/page.tsx` | Listing moderation |
| `/admin/reports` | `src/app/admin/reports/page.tsx` | Report management |
| `/admin/audit` | `src/app/admin/audit/page.tsx` | Audit log viewer |

---

## 3. API ROUTES (25 Endpoints)

### 3.1 Authentication APIs
| Route | Methods | File Path |
|-------|---------|-----------|
| `/api/auth/[...nextauth]` | GET, POST | `src/app/api/auth/[...nextauth]/route.ts` |
| `/api/auth/verify-email` | POST | `src/app/api/auth/verify-email/route.ts` |
| `/api/auth/resend-verification` | POST | `src/app/api/auth/resend-verification/route.ts` |
| `/api/register` | POST | `src/app/api/register/route.ts` |

### 3.2 Listing APIs
| Route | Methods | File Path |
|-------|---------|-----------|
| `/api/listings` | GET, POST | `src/app/api/listings/route.ts` |
| `/api/listings/[id]` | GET, PUT, DELETE | `src/app/api/listings/[id]/route.ts` |
| `/api/listings/[id]/status` | PATCH | `src/app/api/listings/[id]/status/route.ts` |
| `/api/listings/[id]/can-delete` | GET | `src/app/api/listings/[id]/can-delete/route.ts` |

### 3.3 Messaging APIs
| Route | Methods | File Path |
|-------|---------|-----------|
| `/api/messages` | GET, POST | `src/app/api/messages/route.ts` |
| `/api/messages/unread` | GET | `src/app/api/messages/unread/route.ts` |

### 3.4 User Interaction APIs
| Route | Methods | File Path |
|-------|---------|-----------|
| `/api/favorites` | POST | `src/app/api/favorites/route.ts` |
| `/api/reviews` | GET, POST, PUT, DELETE | `src/app/api/reviews/route.ts` |
| `/api/reports` | POST | `src/app/api/reports/route.ts` |
| `/api/verify` | POST | `src/app/api/verify/route.ts` |
| `/api/upload` | POST | `src/app/api/upload/route.ts` |
| `/api/chat` | POST | `src/app/api/chat/route.ts` |

### 3.5 System APIs
| Route | Methods | File Path |
|-------|---------|-----------|
| `/api/health/live` | GET | `src/app/api/health/live/route.ts` |
| `/api/health/ready` | GET | `src/app/api/health/ready/route.ts` |
| `/api/metrics` | POST | `src/app/api/metrics/route.ts` |
| `/api/metrics/ops` | POST | `src/app/api/metrics/ops/route.ts` |
| `/api/cron/cleanup-rate-limits` | GET | `src/app/api/cron/cleanup-rate-limits/route.ts` |
| `/api/cron/search-alerts` | GET | `src/app/api/cron/search-alerts/route.ts` |

---

## 4. SERVER ACTIONS (16 Action Files)

| Action File | Key Functions | Purpose |
|-------------|---------------|---------|
| `src/app/actions/create-listing.ts` | `createListing()` | Listing creation with geocoding |
| `src/app/actions/get-listings.ts` | `getListingsInBounds()`, `getMapListings()` | Spatial queries |
| `src/app/actions/listing-status.ts` | `updateListingStatus()`, `trackListingView()` | Status management |
| `src/app/actions/booking.ts` | `createBooking()` | Booking with SERIALIZABLE |
| `src/app/actions/manage-booking.ts` | `updateBookingStatus()` | Accept/reject/cancel |
| `src/app/actions/chat.ts` | `startConversation()`, `sendMessage()`, `pollMessages()` | Messaging |
| `src/app/actions/profile.ts` | `updateProfile()`, `getProfile()` | Profile CRUD |
| `src/app/actions/settings.ts` | `updateNotificationPreferences()`, `changePassword()`, `deleteAccount()` | Settings |
| `src/app/actions/verification.ts` | `submitVerificationRequest()`, `approveVerification()` | ID verification |
| `src/app/actions/notifications.ts` | `createNotification()`, `markNotificationAsRead()` | Notifications |
| `src/app/actions/block.ts` | `blockUser()`, `unblockUser()`, `checkBlockBeforeAction()` | User blocking |
| `src/app/actions/saved-listings.ts` | `toggleSavedListing()` | Favorites |
| `src/app/actions/saved-search.ts` | `createSavedSearch()`, `deleteSavedSearch()` | Saved searches |
| `src/app/actions/review-response.ts` | `createReviewResponse()` | Host review response |
| `src/app/actions/admin.ts` | `getUsers()`, `toggleUserAdmin()`, `suspendUser()` | Admin operations |

---

## 5. AUTHENTICATION SYSTEM

### 5.1 Auth Provider
- **Provider**: NextAuth.js v5 (Auth.js)
- **Session Strategy**: JWT (30-day max age, 24-hour refresh)
- **Storage**: HttpOnly cookies

### 5.2 Login Methods
| Method | Details |
|--------|---------|
| Email/Password | bcrypt hashing (10 rounds), min 6 chars |
| Google OAuth | Email must be verified from Google |

### 5.3 User Roles & States
| Field | Type | Purpose |
|-------|------|---------|
| `isAdmin` | Boolean | Admin dashboard access |
| `isVerified` | Boolean | ID verification (verified badge) |
| `isSuspended` | Boolean | Account suspended (blocks login) |
| `emailVerified` | DateTime? | Email verification timestamp |

### 5.4 Token Types
| Token | Expiry | Purpose |
|-------|--------|---------|
| Verification Token | 24 hours | Email verification |
| Password Reset Token | 1 hour | Password reset |
| Idempotency Key | 24 hours | Prevent duplicate submissions |

---

## 6. LISTING SYSTEM

### 6.1 Listing Fields
```
- title, description, price, images[]
- amenities[], houseRules[]
- leaseDuration, roomType, genderPreference, householdGender
- householdLanguages[], primaryHomeLanguage
- totalSlots, availableSlots, moveInDate
- status (ACTIVE | PAUSED | RENTED)
- viewCount, createdAt, updatedAt
- location (address, city, state, zip, coords)
```

### 6.2 Listing Statuses
| Status | Description |
|--------|-------------|
| `ACTIVE` | Visible in search |
| `PAUSED` | Hidden from search |
| `RENTED` | Filled/completed |

### 6.3 Image Upload
- **Storage**: Supabase
- **Max Images**: 10 per listing
- **Endpoint**: `/api/upload`

---

## 7. SEARCH & FILTERS

### 7.1 Filter Parameters
| Filter | Type | Validation |
|--------|------|------------|
| `query` | String | 2-200 chars |
| `minPrice`, `maxPrice` | Number | 0 - 1,000,000,000 |
| `moveInDate` | Date | Today to 2 years future |
| `leaseDuration` | Enum | month-to-month, 3m, 6m, 12m, flexible |
| `roomType` | Enum | private_room, shared_room, entire_place |
| `amenities` | Array | wifi, ac, parking, washer, dryer, kitchen, gym, pool |
| `houseRules` | Array | pets_allowed, smoking_allowed, couples_allowed, guests_allowed |
| `languages` | Array | ISO 639-1 codes (max 20) |
| `genderPreference` | Enum | male_only, female_only, no_preference |
| `householdGender` | Enum | all_male, all_female, mixed |
| `bounds` | Object | minLat, maxLat, minLng, maxLng |

### 7.2 Sorting Options
| Option | Value |
|--------|-------|
| Recommended | (default) |
| Price: Low to High | `price_asc` |
| Price: High to Low | `price_desc` |
| Newest First | `newest` |
| Top Rated | `rating` |

### 7.3 Pagination
- **Default**: 12 items/page
- **Max Page Size**: 100
- **Max Safe Page**: 100

---

## 8. BOOKING SYSTEM

### 8.1 Booking Statuses
| Status | Description |
|--------|-------------|
| `PENDING` | Awaiting host response |
| `ACCEPTED` | Host approved (decrements slots) |
| `REJECTED` | Host declined (optional reason) |
| `CANCELLED` | Tenant cancelled |

### 8.2 Booking Validation
- Minimum 30-day duration
- No self-booking
- Block check between participants
- Capacity check (availableSlots)
- Duplicate detection (unique constraint)

### 8.3 Race Condition Prevention
- SERIALIZABLE transaction isolation
- FOR UPDATE row locking
- Idempotency keys
- Retry logic (3x with exponential backoff)

---

## 9. MESSAGING SYSTEM

### 9.1 Real-Time Mechanism
- **Method**: Polling (5-second intervals)
- **Typing Indicators**: 5-second validity window

### 9.2 Message Features
- Soft delete (deletedAt timestamp)
- Auto mark-as-read on open
- Unread count in navbar badge
- Block enforcement

### 9.3 Conversation Model
- Linked to listing
- Multiple participants
- Typing status tracking

---

## 10. REVIEW SYSTEM

### 10.1 Review Types
| Type | Target |
|------|--------|
| Listing Review | Specific listing |
| User Review | Other user |

### 10.2 Review Features
- Rating: 1-5 stars
- One review per user per listing (unique constraint)
- Booking history requirement
- Host response capability

---

## 11. NOTIFICATION SYSTEM

### 11.1 Notification Types
```
BOOKING_REQUEST, BOOKING_ACCEPTED, BOOKING_REJECTED, BOOKING_CANCELLED
NEW_MESSAGE, NEW_REVIEW, LISTING_SAVED, SEARCH_ALERT
```

### 11.2 Delivery Channels
- In-app notifications
- Email notifications (preference-based)

---

## 12. BLOCKING & REPORTING

### 12.1 User Blocking
- Bidirectional check
- Prevents messaging
- Prevents booking
- Visible in settings

### 12.2 Listing Reports
| Status | Description |
|--------|-------------|
| `OPEN` | Under review |
| `RESOLVED` | Admin took action |
| `DISMISSED` | No action needed |

---

## 13. ADMIN SYSTEM

### 13.1 Admin Capabilities
| Feature | Actions |
|---------|---------|
| User Management | Toggle admin, suspend/unsuspend |
| Listing Moderation | Status update, delete |
| Verification Review | Approve/reject with notes |
| Report Management | Resolve/dismiss, remove listing |
| Audit Log | View all admin actions |

### 13.2 Audit Log Actions
```
USER_SUSPENDED, USER_UNSUSPENDED
ADMIN_GRANTED, ADMIN_REVOKED
LISTING_HIDDEN, LISTING_RESTORED, LISTING_DELETED
VERIFICATION_APPROVED, VERIFICATION_REJECTED
REPORT_RESOLVED, REPORT_DISMISSED
```

---

## 14. RATE LIMITING

### 14.1 Database-Backed Limits
| Endpoint | Limit | Window |
|----------|-------|--------|
| register | 5 | 1 hour |
| forgotPassword | 3 | 1 hour |
| upload | 20 | 1 hour |
| messages | 60 | 1 hour |
| createListing | 5 | 1 day |
| sendMessage | 100 | 1 hour |
| createReview | 10 | 1 day |
| search | 30 | 1 minute |

### 14.2 Redis-Backed Limits (Upstash)
| Endpoint | Burst | Sustained |
|----------|-------|-----------|
| Chat | 5/min | 30/hour |
| Metrics | 100/min | 500/hour |

---

## 15. FORM VALIDATION

### 15.1 Validation Library
- **Primary**: Zod
- **Location**: `src/lib/schemas.ts`

### 15.2 Key Schemas
| Schema | Fields |
|--------|--------|
| `createListingSchema` | title, description, price, address, amenities |
| `createBookingSchema` | listingId, startDate, endDate, 30-day minimum |
| `updateProfileSchema` | name, bio, languages, image URL |
| `languageCodeSchema` | ISO 639-1 validation |

### 15.3 Form Persistence
- Draft saving: localStorage (24h expiry)
- Idempotency: sessionStorage
- Recent searches: localStorage

---

## 16. ERROR HANDLING

### 16.1 Error Boundaries
- Global: `src/app/error.tsx`
- Per-route: 19+ route-specific error.tsx files
- Sentry integration for error tracking

### 16.2 Error Types
| Class | Purpose |
|-------|---------|
| `DataError` | Base error class |
| `QueryError` | Database failures (retryable) |
| `ConnectionError` | Connection issues (retryable) |
| `DataTransformError` | Validation failures |

### 16.3 Toast Notifications
- **Library**: Sonner
- Methods: `toast.success()`, `toast.error()`

---

## 17. LOADING STATES

### 17.1 Skeleton Components
| Component | Location |
|-----------|----------|
| `Skeleton` | `src/components/skeletons/Skeleton.tsx` |
| `ListingCardSkeleton` | `src/components/skeletons/ListingCardSkeleton.tsx` |
| `PageSkeleton` | `src/components/skeletons/PageSkeleton.tsx` |

### 17.2 Loading Files
- 28 loading.tsx files across routes
- Suspense boundaries for async components

---

## 18. EXTERNAL INTEGRATIONS

| Service | Purpose | Auth Key |
|---------|---------|----------|
| Mapbox | Geocoding, maps | MAPBOX_ACCESS_TOKEN |
| Supabase | Storage, realtime | SUPABASE_SERVICE_ROLE_KEY |
| Resend | Email delivery | RESEND_API_KEY |
| Groq | AI chat | GROQ_API_KEY |
| Upstash Redis | Rate limiting | UPSTASH_REDIS_REST_URL |
| Google Places | Neighborhood data | GOOGLE_MAPS_UIKIT_KEY |
| Sentry | Error tracking | SENTRY_DSN |

---

## 19. DATABASE MODELS

### 19.1 Core Models
```
User, Account, Session, VerificationToken, PasswordResetToken
Listing, Location, SavedListing, RecentlyViewed
Conversation, Message, TypingStatus
Booking, Review, ReviewResponse
Notification, Report
BlockedUser, AuditLog
SavedSearch, RateLimitEntry, IdempotencyKey
```

### 19.2 Enums
```
BookingStatus: PENDING | ACCEPTED | REJECTED | CANCELLED
ListingStatus: ACTIVE | PAUSED | RENTED
ReportStatus: OPEN | RESOLVED | DISMISSED
VerificationStatus: PENDING | APPROVED | REJECTED
NotificationType: (8 types)
AlertFrequency: INSTANT | DAILY | WEEKLY
```

---

## 20. TEST INFRASTRUCTURE

### 20.1 Current Testing
- **Unit Tests**: Jest + Testing Library
- **E2E Tests**: None (to be created)
- **Coverage**: Available via `npm run test:coverage`

### 20.2 Test Scripts
```bash
npm run test           # Run all Jest tests
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
npm run test:unit      # Unit tests only
npm run test:components # Component tests
npm run test:api       # API/action tests
```

---

## 21. KEY ASSUMPTIONS FOR E2E TESTING

| Aspect | Assumption | Notes |
|--------|------------|-------|
| Payment | NOT IMPLEMENTED | No payment/checkout flow exists |
| Subscription | NOT IMPLEMENTED | Pro features via env flag only |
| OAuth Testing | LIMITED | Google OAuth requires real credentials |
| File Upload | SUPABASE | Requires valid Supabase config |
| Email | RESEND | Requires valid Resend API key |
| AI Chat | GROQ | Requires valid Groq API key |
| Maps | MAPBOX | Requires valid Mapbox token |

---

## 22. CRITICAL FILES FOR E2E

| Category | Files |
|----------|-------|
| Auth | `src/auth.ts`, `src/middleware.ts` |
| Schemas | `src/lib/schemas.ts`, `src/lib/filter-schema.ts` |
| Actions | `src/app/actions/*.ts` (16 files) |
| Components | `src/components/*.tsx` (40+ files) |
| API Routes | `src/app/api/**/*.ts` (25 endpoints) |
| Pages | `src/app/**/page.tsx` (32 pages) |

---

*End of Capability Map*
