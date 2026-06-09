import fs from "fs";
import path from "path";
import {
  VERIFICATION_BUCKET_ALLOWED_MIME_TYPES,
  VERIFICATION_BUCKET_MAX_BYTES,
  VERIFICATION_DOCUMENTS_BUCKET,
} from "@/lib/verification/storage-contract";

describe("verification storage bucket policy migration", () => {
  let migrationSql: string;

  beforeAll(() => {
    migrationSql = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260605010000_verification_storage_bucket_policy/migration.sql"
      ),
      "utf-8"
    );
  });

  it("no-ops when Supabase Storage tables are absent", () => {
    expect(migrationSql).toContain("to_regclass('storage.buckets')");
    expect(migrationSql).toContain("to_regclass('storage.objects')");
    expect(migrationSql).toContain("RAISE NOTICE");
    expect(migrationSql).toMatch(/Storage tables are not present/i);
  });

  it("schema-manages the private verification documents bucket", () => {
    expect(migrationSql).toContain("INSERT INTO storage.buckets");
    expect(migrationSql).toContain(`'${VERIFICATION_DOCUMENTS_BUCKET}'`);
    expect(migrationSql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(migrationSql).toMatch(/"public"\s*=\s*false/);
    expect(migrationSql).toContain(String(VERIFICATION_BUCKET_MAX_BYTES));

    for (const mimeType of VERIFICATION_BUCKET_ALLOWED_MIME_TYPES) {
      expect(migrationSql).toContain(`'${mimeType}'`);
    }
  });

  it("adds a restrictive denial policy for browser storage roles", () => {
    expect(migrationSql).toContain(
      'CREATE POLICY "roomshare_deny_client_verification_documents"'
    );
    expect(migrationSql).toContain("ON storage.objects");
    expect(migrationSql).toContain("AS RESTRICTIVE");
    expect(migrationSql).toContain("FOR ALL");
    expect(migrationSql).toContain("TO anon, authenticated");
    expect(migrationSql).toContain(
      `USING (bucket_id <> '${VERIFICATION_DOCUMENTS_BUCKET}')`
    );
    expect(migrationSql).toContain(
      `WITH CHECK (bucket_id <> '${VERIFICATION_DOCUMENTS_BUCKET}')`
    );
  });

  it("does not add permissive client access for private documents", () => {
    const permissiveBucketAccessPattern = new RegExp(
      [
        "CREATE\\s+POLICY",
        "[\\s\\S]*",
        "ON\\s+storage\\.objects",
        "[\\s\\S]*",
        "(AS\\s+PERMISSIVE|USING\\s*\\(\\s*true\\s*\\))",
        "[\\s\\S]*",
        VERIFICATION_DOCUMENTS_BUCKET,
      ].join(""),
      "i"
    );

    expect(migrationSql).not.toMatch(permissiveBucketAccessPattern);
    expect(migrationSql).not.toMatch(
      new RegExp(
        `bucket_id\\s*=\\s*'${VERIFICATION_DOCUMENTS_BUCKET}'`,
        "i"
      )
    );
  });

  it("documents rollback without making the bucket public or deleting objects", () => {
    expect(migrationSql).toContain(
      'DROP POLICY IF EXISTS "roomshare_deny_client_verification_documents"'
    );
    expect(migrationSql).toMatch(/Do not set storage\.buckets\.public = true/);
    expect(migrationSql).toMatch(/Do not drop the bucket/);
  });
});
