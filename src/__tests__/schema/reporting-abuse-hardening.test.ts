import fs from "fs";
import path from "path";

describe("reporting and abuse hardening migration", () => {
  let migrationSql: string;

  beforeAll(() => {
    migrationSql = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260514000000_reporting_abuse_controls_hardening/migration.sql"
      ),
      "utf-8"
    );
  });

  it("adds a partial unique index for active reports only", () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Report_active_reporter_listing_kind_unique_idx"'
    );
    expect(migrationSql).toContain(
      'ON "Report" ("reporterId", "listingId", "kind")'
    );
    expect(migrationSql).toContain(
      "WHERE status IN ('OPEN'::\"ReportStatus\", 'RESOLVED'::\"ReportStatus\")"
    );
  });

  it("fails migration when duplicate active reports already exist", () => {
    expect(migrationSql).toContain("duplicate_active_reports");
    expect(migrationSql).toContain("HAVING COUNT(*) > 1");
    expect(migrationSql).toContain("RAISE EXCEPTION");
  });

  it("removes BlockedUser from Supabase Realtime publication when present", () => {
    expect(migrationSql).toContain("pg_publication_tables");
    expect(migrationSql).toContain("tablename = 'BlockedUser'");
    expect(migrationSql).toContain(
      'ALTER PUBLICATION supabase_realtime DROP TABLE public."BlockedUser"'
    );
  });

  it("documents rollback commands without automatically re-exposing BlockedUser", () => {
    expect(migrationSql).toContain(
      'DROP INDEX IF EXISTS "Report_active_reporter_listing_kind_unique_idx"'
    );
    expect(migrationSql).toContain(
      'ALTER PUBLICATION supabase_realtime ADD TABLE public."BlockedUser"'
    );
    expect(migrationSql).toMatch(
      /should only be run if product\/security explicitly\s+-- accepts/
    );
  });
});
