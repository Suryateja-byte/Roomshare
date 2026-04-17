-- Migration: add_report_kind_private_feedback
--
-- Extends Report for CFM-703 private feedback using additive-only changes.
--
-- Rollback:
--   1. Preferred rollback is the feature flag: ENABLE_PRIVATE_FEEDBACK=false.
--   2. Day-1 schema rollback is mechanically reversible:
--      DROP INDEX CONCURRENTLY IF EXISTS "Report_targetUserId_idx";
--      DROP INDEX CONCURRENTLY IF EXISTS "Report_kind_status_idx";
--      ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_targetUserId_fkey";
--      ALTER TABLE "Report" DROP COLUMN IF EXISTS "targetUserId",
--        DROP COLUMN IF EXISTS "kind";
--      DROP TYPE IF EXISTS "ReportKind";
--   3. Once PRIVATE_FEEDBACK rows exist, dropping the enum/column becomes
--      forbidden under CFM-1003 because it would destroy retained history.
--
-- Safety:
-- - Adds a constant-default kind so existing rows remain ABUSE_REPORT.
-- - Adds a nullable targetUserId FK without changing any existing cascade rule.
-- - No legacy report rows are rewritten or deleted.

DO $$
BEGIN
  CREATE TYPE "ReportKind" AS ENUM ('ABUSE_REPORT', 'PRIVATE_FEEDBACK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Report"
  ADD COLUMN "kind" "ReportKind" NOT NULL DEFAULT 'ABUSE_REPORT',
  ADD COLUMN "targetUserId" TEXT;

ALTER TABLE "Report"
  ADD CONSTRAINT "Report_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Report_kind_status_idx"
  ON "Report" ("kind", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Report_targetUserId_idx"
  ON "Report" ("targetUserId");
