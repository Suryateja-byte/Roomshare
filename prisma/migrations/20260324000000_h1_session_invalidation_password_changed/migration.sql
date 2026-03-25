-- H-1: Session invalidation on password change
-- Adds passwordChangedAt column to User model for detecting stale sessions.
-- NULL = "never changed after feature deployed" = all existing sessions remain valid.
-- Data safety: Nullable column, no default. Instant metadata-only ALTER, zero table rewrite.
-- Rollback: ALTER TABLE "User" DROP COLUMN "passwordChangedAt";

ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
