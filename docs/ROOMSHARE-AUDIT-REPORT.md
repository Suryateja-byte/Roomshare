# Roomshare Marketplace Audit Report

**Generated**: 2026-01-01
**Scope**: Complete system audit for "Best UX Plan" implementation
**Repository**: `/mnt/d/Documents/roomshare`

---

## Executive Summary

The Roomshare codebase is a **Next.js 16 App Router** marketplace with solid foundational patterns (SERIALIZABLE transactions, database-backed rate limiting, proper auth). However, it currently operates on a **Listing-level inventory model** and lacks the bed/slot-level granularity, holds system, temporal availability rules, and anti-fraud infrastructure required for the target UX plan.

**Key Finding**: The current system treats each Listing as a single bookable unit with `totalSlots`/`availableSlots` counters. The target architecture requires a **SleepingSpot** model where each bed/slot is a discrete bookable entity with its own availability calendar.

---

## Part 1: Current System Map

### 1.1 Technology Stack

| Layer          | Technology            | Version          | Evidence                         |
| -------------- | --------------------- | ---------------- | -------------------------------- |
| **Framework**  | Next.js (App Router)  | 16.0.0-canary.52 | `package.json:24`                |
| **React**      | React 19              | 19.2.0           | `package.json:30`                |
| **ORM**        | Prisma                | 6.8.2            | `package.json:27`                |
| **Database**   | PostgreSQL + PostGIS  | -                | `prisma/schema.prisma:8-12`      |
| **Auth**       | NextAuth v5 (Auth.js) | 5.0.0-beta.25    | `package.json:23`, `src/auth.ts` |
| **Storage**    | Supabase              | 2.50.0           | `package.json:16`                |
| **Hosting**    | Vercel                | -                | `vercel.json`                    |
| **Maps**       | Mapbox GL + Radar     | 3.12.0 / 1.3.1   | `package.json:19-20`             |
| **Email**      | Resend                | 4.5.1            | `package.json:31`                |
| **Validation** | Zod                   | 3.25.23          | `package.json:37`                |

### 1.2 Database Schema Overview

**Location**: `prisma/schema.prisma`

```
┌─────────────────────────────────────────────────────────────────┐
│                      CURRENT DATA MODEL                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  User ─────┬──────> Listing ──────> Location (1:1)               │
│    │       │           │                                          │
│    │       │           ├──────> Booking (1:N)                     │
│    │       │           │           └── BookingStatus enum         │
│    │       │           │                                          │
│    │       │           ├──────> ListingImage (1:N)                │
│    │       │           │                                          │
│    │       │           └──────> SavedSearch (N:M via saves)       │
│    │       │                                                      │
│    │       └──────> Conversation ──────> Message (1:N)            │
│    │                                                              │
│    ├──────> VerificationRequest                                   │
│    ├──────> SavedSearch                                           │
│    └──────> RateLimitEntry                                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Core Enums

| Enum                 | Values                                                  | Location                       |
| -------------------- | ------------------------------------------------------- | ------------------------------ |
| `BookingStatus`      | PENDING, ACCEPTED, REJECTED, CANCELLED                  | `prisma/schema.prisma:137-142` |
| `ListingStatus`      | ACTIVE, PAUSED, RENTED                                  | `prisma/schema.prisma:144-148` |
| `RoomType`           | PRIVATE_ROOM, SHARED_ROOM, ENTIRE_PLACE                 | `prisma/schema.prisma:150-154` |
| `LeaseDuration`      | MONTH_TO_MONTH, THREE_MONTHS, SIX_MONTHS, TWELVE_MONTHS | `prisma/schema.prisma:156-161` |
| `VerificationStatus` | PENDING, APPROVED, REJECTED                             | `prisma/schema.prisma:163-167` |

### 1.4 Current Inventory Model

**File**: `prisma/schema.prisma:44-89`

```prisma
model Listing {
  id              String        @id @default(cuid())
  ownerId         String
  title           String
  totalSlots      Int           // ← Listing-level capacity
  availableSlots  Int           // ← Counter-based availability
  status          ListingStatus @default(ACTIVE)
  // ... other fields
}
```

**Critical Limitation**: The system uses **counter-based inventory** (`totalSlots`/`availableSlots`) rather than discrete bookable entities. This prevents:

- Individual bed pricing
- Per-spot amenities/photos
- Granular availability calendars
- Spot-specific holds

### 1.5 Booking Flow

**Files**:

- `src/app/actions/booking.ts` - Creation with SERIALIZABLE isolation
- `src/app/actions/manage-booking.ts` - Status transitions

```
┌──────────────────────────────────────────────────────────────┐
│                    CURRENT BOOKING FLOW                       │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  User Applies                                                  │
│       │                                                        │
│       ▼                                                        │
│  ┌─────────────────┐                                          │
│  │ createBooking() │ ◄── SERIALIZABLE transaction             │
│  │                 │ ◄── FOR UPDATE lock on Listing           │
│  │                 │ ◄── Idempotency key support              │
│  └────────┬────────┘                                          │
│           │                                                    │
│           ▼                                                    │
│  Booking.status = PENDING                                      │
│  (availableSlots NOT decremented)                             │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              HOST DECISION                               │  │
│  ├─────────────────────────────────────────────────────────┤  │
│  │  ACCEPT ──► availableSlots -= 1                         │  │
│  │  REJECT ──► No inventory change                         │  │
│  │  (by guest) CANCEL ──► availableSlots += 1 if ACCEPTED  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Evidence** (`src/app/actions/manage-booking.ts:45-85`):

```typescript
if (status === "ACCEPTED") {
  await prisma.$transaction(async (tx) => {
    // FOR UPDATE lock
    await tx.listing.update({
      where: { id: booking.listingId },
      data: { availableSlots: { decrement: 1 } },
    });
  });
}
```

### 1.6 Authentication System

**File**: `src/auth.ts`

| Feature          | Implementation                 | Evidence            |
| ---------------- | ------------------------------ | ------------------- |
| Provider         | NextAuth v5 with PrismaAdapter | `src/auth.ts:6-8`   |
| Session Strategy | JWT (14-day expiry)            | `src/auth.ts:27-30` |
| OAuth            | Google                         | `src/auth.ts:14-17` |
| Credentials      | Email/Password with bcrypt     | `src/auth.ts:18-40` |
| Suspension Check | signIn callback                | `src/auth.ts:44-52` |

### 1.7 Rate Limiting

**File**: `src/lib/rate-limit.ts`

| Action         | Limit | Window   | Evidence           |
| -------------- | ----- | -------- | ------------------ |
| register       | 5     | 1 hour   | `rate-limit.ts:8`  |
| createListing  | 5     | 24 hours | `rate-limit.ts:11` |
| listings       | 10    | 24 hours | `rate-limit.ts:9`  |
| messages       | 60    | 1 hour   | `rate-limit.ts:12` |
| search         | 30    | 1 minute | `rate-limit.ts:10` |
| bookingRequest | 10    | 1 hour   | `rate-limit.ts:13` |

**Implementation**: Database-backed via `RateLimitEntry` table (Vercel-compatible, no Redis).

### 1.8 Cron Jobs

**Location**: `src/app/api/cron/`

| Cron                  | Purpose                            | Schedule    | Evidence                                |
| --------------------- | ---------------------------------- | ----------- | --------------------------------------- |
| `search-alerts`       | Process saved search notifications | Vercel cron | `api/cron/search-alerts/route.ts`       |
| `cleanup-rate-limits` | Expire old rate limit entries      | Vercel cron | `api/cron/cleanup-rate-limits/route.ts` |

### 1.9 Verification System

**File**: `src/app/actions/verification.ts`

| Feature            | Implementation                        |
| ------------------ | ------------------------------------- |
| Document Types     | passport, driver_license, national_id |
| Rejection Cooldown | 24 hours                              |
| Admin Workflow     | Manual approve/reject                 |
| Storage            | Supabase with signed URLs             |

---

## Part 2: GAP MATRIX

| #      | Target Feature                                   | Current State | Gap                                                                                                                 | Priority |
| ------ | ------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| **1**  | **SleepingSpot (bed-level inventory)**           | ❌ Missing    | Listing has `totalSlots`/`availableSlots` counters only. No discrete `SleepingSpot` entity exists.                  | 🔴 P0    |
| **2**  | **Apply does NOT change inventory**              | ✅ Exists     | `createBooking()` creates PENDING booking without decrementing `availableSlots`. Decrement only on ACCEPT.          | ✅ Done  |
| **3**  | **Host-granted expiring holds**                  | ❌ Missing    | No `Hold` model. No `expiresAt` field. No cron to expire holds. No atomic lock for hold→booking conversion.         | 🔴 P0    |
| **4**  | **Under Offer (dim + countdown + waitlist)**     | ❌ Missing    | `ListingStatus` only has ACTIVE/PAUSED/RENTED. No UNDER_OFFER state. No waitlist model. No countdown UI.            | 🟠 P1    |
| **5**  | **Temporal availability (date range + Mon–Fri)** | ❌ Missing    | No `availableFrom`/`availableTo` on Listing. No day-of-week rules. No recurring availability calendar.              | 🟠 P1    |
| **6**  | **Listing version snapshots**                    | ❌ Missing    | No `ListingSnapshot` or `ListingVersion` table. Edits overwrite in-place. No audit trail for pricing/terms changes. | 🟡 P2    |
| **7**  | **Asset verification (anti-scam)**               | 🟡 Partial    | `VerificationRequest` exists for USER identity only. No listing/asset verification. No photo reverse-image check.   | 🟠 P1    |
| **8**  | **Liveness checks + filled pending move-in**     | ❌ Missing    | No `lastActiveAt` tracking. No periodic ping. No "move-in confirmed" workflow.                                      | 🟡 P2    |
| **9**  | **Anti-abuse limits + risk ladder**              | 🟡 Partial    | Rate limits exist but flat. No escalating risk ladder. No behavioral scoring. No temporary bans.                    | 🟡 P2    |
| **10** | **Buyout + upgrade-to-private**                  | ❌ Missing    | No buyout offer model. No upgrade workflow. No pricing differential calculation.                                    | 🟡 P2    |

### Gap Legend

| Symbol | Meaning                                        |
| ------ | ---------------------------------------------- |
| ✅     | Feature exists and meets requirements          |
| 🟡     | Partial implementation - needs extension       |
| ❌     | Missing entirely - requires new implementation |

### Priority Legend

| Priority | Meaning                                        |
| -------- | ---------------------------------------------- |
| 🔴 P0    | Blocking - Must implement first (foundational) |
| 🟠 P1    | High - Core UX features                        |
| 🟡 P2    | Medium - Enhancement features                  |

---

## Part 3: Critical Path Implementation Order

Based on dependency analysis, here are the **5 highest-leverage changes** in sequence:

### Phase 1: Foundation (P0)

#### 1. SleepingSpot Model Migration

**Why First**: Every other feature (holds, waitlist, buyout) depends on discrete bookable entities.

**Schema Changes** (`prisma/schema.prisma`):

```prisma
model SleepingSpot {
  id              String   @id @default(cuid())
  listingId       String
  listing         Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  label           String?  // "Bed A", "Bottom Bunk", etc.
  pricePerMonth   Int?     // Override listing price
  amenities       String[] // Spot-specific amenities
  photos          String[] // Spot-specific photos
  createdAt       DateTime @default(now())

  holds           Hold[]
  bookings        Booking[]

  @@index([listingId])
}

// Update Booking to reference SleepingSpot
model Booking {
  // ... existing fields
  sleepingSpotId  String?
  sleepingSpot    SleepingSpot? @relation(fields: [sleepingSpotId], references: [id])
}
```

**Files to Modify**:

- `prisma/schema.prisma` - Add model
- `src/app/actions/create-listing.ts` - Auto-create spots on listing creation
- `src/app/actions/booking.ts` - Accept `sleepingSpotId` parameter
- `src/app/actions/manage-booking.ts` - Update spot availability on ACCEPT

**Data Migration**: Create `SleepingSpot` entries for existing listings based on `totalSlots`.

---

#### 2. Hold System Implementation

**Why Second**: Enables "Under Offer" state and waitlist mechanics.

**Schema Changes**:

```prisma
model Hold {
  id              String        @id @default(cuid())
  sleepingSpotId  String
  sleepingSpot    SleepingSpot  @relation(fields: [sleepingSpotId], references: [id])
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  grantedAt       DateTime      @default(now())
  expiresAt       DateTime      // Host sets duration (24h, 48h, 72h)
  status          HoldStatus    @default(ACTIVE)
  convertedToBookingId String?  @unique

  @@index([sleepingSpotId])
  @@index([expiresAt])
  @@index([userId])
}

enum HoldStatus {
  ACTIVE
  EXPIRED
  CONVERTED
  RELEASED
}
```

**New Files**:

- `src/app/actions/holds.ts` - Grant, release, convert to booking
- `src/app/api/cron/expire-holds/route.ts` - Expire stale holds

**Key Logic** (`src/app/actions/holds.ts`):

```typescript
export async function grantHold(
  sleepingSpotId: string,
  applicantUserId: string,
  durationHours: 24 | 48 | 72,
) {
  return prisma.$transaction(
    async (tx) => {
      // Lock the spot
      const spot = await tx.$queryRaw`
      SELECT * FROM "SleepingSpot" WHERE id = ${sleepingSpotId} FOR UPDATE
    `;

      // Check no active hold exists
      const existingHold = await tx.hold.findFirst({
        where: { sleepingSpotId, status: "ACTIVE" },
      });
      if (existingHold) throw new Error("Spot already has active hold");

      // Create hold
      return tx.hold.create({
        data: {
          sleepingSpotId,
          userId: applicantUserId,
          expiresAt: new Date(Date.now() + durationHours * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}
```

---

### Phase 2: Core UX (P1)

#### 3. Under Offer State + Waitlist

**Dependencies**: Requires SleepingSpot + Hold system.

**Schema Changes**:

```prisma
// Add to ListingStatus enum
enum ListingStatus {
  ACTIVE
  PAUSED
  RENTED
  UNDER_OFFER  // New
}

model WaitlistEntry {
  id              String        @id @default(cuid())
  sleepingSpotId  String
  sleepingSpot    SleepingSpot  @relation(fields: [sleepingSpotId], references: [id])
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  position        Int
  createdAt       DateTime      @default(now())

  @@unique([sleepingSpotId, userId])
  @@index([sleepingSpotId, position])
}
```

**UI Changes**:

- `src/components/ListingCard.tsx` - Dim opacity when UNDER_OFFER
- `src/app/listings/[id]/page.tsx` - Show countdown timer
- New component: `src/components/WaitlistButton.tsx`

---

#### 4. Temporal Availability Rules

**Schema Changes**:

```prisma
model Listing {
  // ... existing fields
  availableFrom     DateTime?
  availableTo       DateTime?
  availableDays     Int[]      // 0=Sun, 1=Mon, ..., 6=Sat
}
```

**Files to Modify**:

- `src/app/listings/create/CreateListingForm.tsx` - Add date picker + day selector
- `src/app/listings/[id]/edit/EditListingForm.tsx` - Same
- `src/lib/data.ts` - Filter by availability in `getListings()`
- `src/app/actions/booking.ts` - Validate booking dates against rules

---

#### 5. Asset Verification Layer

**Schema Changes**:

```prisma
model ListingVerification {
  id              String                    @id @default(cuid())
  listingId       String                    @unique
  listing         Listing                   @relation(fields: [listingId], references: [id])
  status          VerificationStatus        @default(PENDING)
  submittedAt     DateTime                  @default(now())
  reviewedAt      DateTime?
  reviewedBy      String?

  // Evidence
  addressProof    String?   // Utility bill URL
  photoTimestamp  DateTime? // EXIF-verified recent photo
  videoTourUrl    String?

  rejectionReason String?
}

enum ListingVerificationBadge {
  NONE
  ADDRESS_VERIFIED
  PHOTO_VERIFIED
  VIDEO_VERIFIED
  FULLY_VERIFIED
}
```

**New Files**:

- `src/app/actions/listing-verification.ts`
- `src/components/VerificationBadge.tsx`
- `src/app/admin/listings/verify/page.tsx`

---

## Part 4: Start Here Checklist

### Immediate Actions (This Sprint)

#### Step 1: Create SleepingSpot Migration

```bash
# In project root
npx prisma migrate dev --name add_sleeping_spot_model
```

**File**: `prisma/migrations/YYYYMMDD_add_sleeping_spot_model/migration.sql`

```sql
-- CreateTable
CREATE TABLE "SleepingSpot" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "label" TEXT,
    "pricePerMonth" INTEGER,
    "amenities" TEXT[],
    "photos" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SleepingSpot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SleepingSpot_listingId_idx" ON "SleepingSpot"("listingId");

-- AddForeignKey
ALTER TABLE "SleepingSpot" ADD CONSTRAINT "SleepingSpot_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Create spots for existing listings
INSERT INTO "SleepingSpot" ("id", "listingId", "label", "createdAt")
SELECT
  gen_random_uuid()::text,
  l."id",
  'Spot ' || generate_series,
  NOW()
FROM "Listing" l
CROSS JOIN generate_series(1, l."totalSlots");
```

---

#### Step 2: Update Prisma Schema

**File**: `prisma/schema.prisma`

Add after `Listing` model (line ~90):

```prisma
model SleepingSpot {
  id            String    @id @default(cuid())
  listingId     String
  listing       Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)
  label         String?
  pricePerMonth Int?
  amenities     String[]
  photos        String[]
  createdAt     DateTime  @default(now())

  bookings      Booking[]
  holds         Hold[]

  @@index([listingId])
}
```

Update `Booking` model to add:

```prisma
model Booking {
  // ... existing fields
  sleepingSpotId  String?
  sleepingSpot    SleepingSpot? @relation(fields: [sleepingSpotId], references: [id])
}
```

---

#### Step 3: Update Create Listing Action

**File**: `src/app/actions/create-listing.ts`

Find the `prisma.listing.create()` call and wrap in transaction:

```typescript
const result = await prisma.$transaction(async (tx) => {
  const listing = await tx.listing.create({
    data: {
      // ... existing data
    },
  });

  // Auto-create SleepingSpots based on totalSlots
  const spots = Array.from({ length: data.totalSlots }, (_, i) => ({
    listingId: listing.id,
    label: `Spot ${i + 1}`,
  }));

  await tx.sleepingSpot.createMany({ data: spots });

  return listing;
});
```

---

#### Step 4: Create Hold System

**New File**: `src/app/actions/holds.ts`

```typescript
"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { Prisma } from "@prisma/client";

export async function grantHold(
  sleepingSpotId: string,
  applicantUserId: string,
  durationHours: 24 | 48 | 72,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const hold = await prisma.$transaction(
      async (tx) => {
        // Verify caller owns the listing
        const spot = await tx.sleepingSpot.findUnique({
          where: { id: sleepingSpotId },
          include: { listing: { select: { ownerId: true } } },
        });

        if (!spot) throw new Error("Spot not found");
        if (spot.listing.ownerId !== session.user.id) {
          throw new Error("Not authorized to grant holds on this listing");
        }

        // Check no active hold
        const existing = await tx.hold.findFirst({
          where: { sleepingSpotId, status: "ACTIVE" },
        });
        if (existing) throw new Error("Spot already has active hold");

        // Create hold
        return tx.hold.create({
          data: {
            sleepingSpotId,
            userId: applicantUserId,
            expiresAt: new Date(Date.now() + durationHours * 60 * 60 * 1000),
            status: "ACTIVE",
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { success: true, hold };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function convertHoldToBooking(holdId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const booking = await prisma.$transaction(
      async (tx) => {
        const hold = await tx.hold.findUnique({
          where: { id: holdId },
          include: { sleepingSpot: { include: { listing: true } } },
        });

        if (!hold) throw new Error("Hold not found");
        if (hold.userId !== session.user.id) throw new Error("Not your hold");
        if (hold.status !== "ACTIVE") throw new Error("Hold no longer active");
        if (new Date() > hold.expiresAt) throw new Error("Hold expired");

        // Create booking
        const newBooking = await tx.booking.create({
          data: {
            listingId: hold.sleepingSpot.listingId,
            sleepingSpotId: hold.sleepingSpotId,
            guestId: session.user.id,
            status: "ACCEPTED",
            startDate: new Date(), // Adjust as needed
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            pricePerMonth:
              hold.sleepingSpot.pricePerMonth ??
              hold.sleepingSpot.listing.price,
          },
        });

        // Mark hold as converted
        await tx.hold.update({
          where: { id: holdId },
          data: { status: "CONVERTED", convertedToBookingId: newBooking.id },
        });

        // Decrement available slots
        await tx.listing.update({
          where: { id: hold.sleepingSpot.listingId },
          data: { availableSlots: { decrement: 1 } },
        });

        return newBooking;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { success: true, booking };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
```

---

#### Step 5: Create Hold Expiration Cron

**New File**: `src/app/api/cron/expire-holds/route.ts`

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await prisma.hold.updateMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });

    return NextResponse.json({
      success: true,
      expiredCount: result.count,
    });
  } catch (error) {
    console.error("Hold expiration error:", error);
    return NextResponse.json(
      { error: "Failed to expire holds" },
      { status: 500 },
    );
  }
}
```

**Update**: `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/search-alerts", "schedule": "0 * * * *" },
    { "path": "/api/cron/cleanup-rate-limits", "schedule": "0 0 * * *" },
    { "path": "/api/cron/expire-holds", "schedule": "*/5 * * * *" }
  ]
}
```

---

#### Step 6: Add Tests

**New File**: `src/__tests__/actions/holds.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "@jest/globals";
import { prismaMock } from "../mocks/prisma";
import { grantHold, convertHoldToBooking } from "@/app/actions/holds";

describe("Hold System", () => {
  describe("grantHold", () => {
    it("should create hold with correct expiration", async () => {
      // ... test implementation
    });

    it("should reject if spot already has active hold", async () => {
      // ... test implementation
    });

    it("should reject if caller does not own listing", async () => {
      // ... test implementation
    });
  });

  describe("convertHoldToBooking", () => {
    it("should create booking and mark hold as converted", async () => {
      // ... test implementation
    });

    it("should reject expired holds", async () => {
      // ... test implementation
    });
  });
});
```

---

## Part 5: File Reference Quick Index

### Core Actions (Server Actions)

| File                                | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `src/app/actions/booking.ts`        | Booking creation with SERIALIZABLE tx     |
| `src/app/actions/manage-booking.ts` | Status transitions (ACCEPT/REJECT/CANCEL) |
| `src/app/actions/create-listing.ts` | Listing creation                          |
| `src/app/actions/listing-status.ts` | Pause/unpause/mark rented                 |
| `src/app/actions/chat.ts`           | Messaging/conversations                   |
| `src/app/actions/verification.ts`   | User identity verification                |
| `src/app/actions/settings.ts`       | User profile settings                     |

### Data Layer

| File                    | Purpose                         |
| ----------------------- | ------------------------------- |
| `src/lib/data.ts`       | Core data fetching with filters |
| `src/lib/prisma.ts`     | Prisma client singleton         |
| `src/lib/rate-limit.ts` | Database-backed rate limiting   |

### Authentication

| File                | Purpose                   |
| ------------------- | ------------------------- |
| `src/auth.ts`       | NextAuth v5 configuration |
| `src/middleware.ts` | Route protection          |

### API Routes

| File                                            | Purpose                  |
| ----------------------------------------------- | ------------------------ |
| `src/app/api/cron/search-alerts/route.ts`       | Search notification cron |
| `src/app/api/cron/cleanup-rate-limits/route.ts` | Rate limit cleanup cron  |
| `src/app/api/listings/route.ts`                 | Listings REST API        |
| `src/app/api/listings/[id]/route.ts`            | Single listing API       |

### Components (Key UI)

| File                             | Purpose              |
| -------------------------------- | -------------------- |
| `src/components/ListingCard.tsx` | Listing display card |
| `src/components/SearchForm.tsx`  | Search filters       |
| `src/components/Map.tsx`         | Mapbox integration   |
| `src/components/BookingForm.tsx` | Booking request form |

---

## Appendix A: Recommended Sprint Plan

### Sprint 1 (Foundation)

- [ ] SleepingSpot migration + backfill
- [ ] Update create-listing to auto-generate spots
- [ ] Update booking flow to accept spotId
- [ ] Unit tests for new models

### Sprint 2 (Holds)

- [ ] Hold model migration
- [ ] grantHold / releaseHold / convertHoldToBooking actions
- [ ] Expire holds cron
- [ ] Host UI for granting holds

### Sprint 3 (Under Offer UX)

- [ ] UNDER_OFFER status + Waitlist model
- [ ] Countdown timer component
- [ ] Dimmed listing card styling
- [ ] Waitlist join/leave actions

### Sprint 4 (Temporal + Verification)

- [ ] availableFrom/To/Days fields
- [ ] Date/day filter in search
- [ ] ListingVerification model
- [ ] Admin verification queue

---

## Appendix B: Risk Assessment

| Risk                                 | Likelihood | Impact | Mitigation                                    |
| ------------------------------------ | ---------- | ------ | --------------------------------------------- |
| SleepingSpot migration corrupts data | Low        | High   | Run on staging first, backup before migration |
| Hold expiration race conditions      | Medium     | Medium | SERIALIZABLE isolation + FOR UPDATE locks     |
| Waitlist ordering disputes           | Medium     | Low    | Clear position tracking + timestamps          |
| Performance with per-spot queries    | Medium     | Medium | Composite indexes, eager loading              |

---

**Report Generated By**: Claude Code Audit System
**Next Review Date**: After Sprint 2 completion
