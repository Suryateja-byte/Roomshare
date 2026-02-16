-- Production Readiness: Indexes, CHECK constraints, and updatedAt fields
--
-- Rollback note: All indexes can be dropped with DROP INDEX. CHECK constraints
-- can be dropped with ALTER TABLE ... DROP CONSTRAINT. updatedAt columns can be
-- dropped with ALTER TABLE ... DROP COLUMN. Fully reversible.
--
-- Data-safety note: CREATE INDEX (non-concurrent) acquires a SHARE lock on the
-- table, blocking writes for the duration. For large tables, consider running
-- indexes individually during low-traffic windows. CHECK constraints are added
-- with NOT VALID first (no table scan), then validated separately. New columns
-- default to CURRENT_TIMESTAMP so no backfill needed.

-- =============================================================================
-- P0 INDEXES (Critical — prevent full table scans on common queries)
-- =============================================================================

-- Listing.ownerId: "My Listings" page, owner lookup
CREATE INDEX "Listing_ownerId_idx" ON "Listing"("ownerId");

-- Booking(listingId, status): Host dashboard, booking management
CREATE INDEX "Booking_listingId_status_idx" ON "Booking"("listingId", "status");

-- Booking.tenantId: Tenant's bookings page
CREATE INDEX "Booking_tenantId_idx" ON "Booking"("tenantId");

-- Review.listingId: Listing detail page reviews
CREATE INDEX "Review_listingId_idx" ON "Review"("listingId");

-- =============================================================================
-- P1 INDEXES
-- =============================================================================

-- Listing.status: Filter by active/paused/rented
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- Review.targetUserId: User profile reviews
CREATE INDEX "Review_targetUserId_idx" ON "Review"("targetUserId");

-- Report.status: Admin dashboard filtering
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- Report.listingId: Reports per listing
CREATE INDEX "Report_listingId_idx" ON "Report"("listingId");

-- Conversation.listingId: Conversations per listing
CREATE INDEX "Conversation_listingId_idx" ON "Conversation"("listingId");

-- =============================================================================
-- P2 INDEXES
-- =============================================================================

-- Account.userId: Auth lookups
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- Session.userId: Session lookups
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- Notification(userId, createdAt): Notification feed sorted by time
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- Listing.createdAt: Sort by newest listings
CREATE INDEX "Listing_createdAt_idx" ON "Listing"("createdAt");

-- Booking composite: Availability queries (overlap checks)
CREATE INDEX "Booking_listingId_status_startDate_endDate_idx" ON "Booking"("listingId", "status", "startDate", "endDate");

-- =============================================================================
-- updatedAt COLUMNS (P1)
-- =============================================================================

-- User.updatedAt
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Report.updatedAt
ALTER TABLE "Report" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Notification.updatedAt
ALTER TABLE "Notification" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- =============================================================================
-- CHECK CONSTRAINTS (data integrity at DB level)
-- =============================================================================

-- Review.rating must be between 1 and 5
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5) NOT VALID;
ALTER TABLE "Review" VALIDATE CONSTRAINT "Review_rating_check";

-- Listing.price must be non-negative
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_price_check" CHECK ("price" >= 0) NOT VALID;
ALTER TABLE "Listing" VALIDATE CONSTRAINT "Listing_price_check";

-- Listing.totalSlots must be positive
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_totalSlots_check" CHECK ("totalSlots" > 0) NOT VALID;
ALTER TABLE "Listing" VALIDATE CONSTRAINT "Listing_totalSlots_check";

-- =============================================================================
-- Report.reviewer onDelete: SetNull (handled by Prisma schema change)
-- No SQL needed — Prisma manages FK constraints on migrate.
-- =============================================================================
