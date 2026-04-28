-- Reporting and abuse controls hardening.
--
-- Rollback notes:
--   DROP INDEX IF EXISTS "Report_active_reporter_listing_kind_unique_idx";
--   ALTER PUBLICATION supabase_realtime ADD TABLE public."BlockedUser";
--
-- The publication rollback should only be run if product/security explicitly
-- accepts exposing BlockedUser row changes through Supabase Realtime again.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "reporterId", "listingId", kind
      FROM "Report"
      WHERE status IN ('OPEN'::"ReportStatus", 'RESOLVED'::"ReportStatus")
      GROUP BY "reporterId", "listingId", kind
      HAVING COUNT(*) > 1
    ) duplicate_active_reports
  ) THEN
    RAISE EXCEPTION
      'Cannot create Report_active_reporter_listing_kind_unique_idx: duplicate active reports exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Report_active_reporter_listing_kind_unique_idx"
  ON "Report" ("reporterId", "listingId", "kind")
  WHERE status IN ('OPEN'::"ReportStatus", 'RESOLVED'::"ReportStatus");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'BlockedUser'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public."BlockedUser"';
  END IF;
END $$;
