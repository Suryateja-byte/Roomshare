-- Schema-managed private Supabase Storage posture for verification documents.
--
-- This migration intentionally no-ops on local/non-Supabase Postgres databases
-- where the storage schema is absent. If production DATABASE_URL is not the
-- Supabase project database that owns Storage, apply this SQL against the
-- Supabase direct database connection during release.
--
-- Rollback notes:
--   DROP POLICY IF EXISTS "roomshare_deny_client_verification_documents" ON storage.objects;
--
-- Do not set storage.buckets.public = true for verification-documents during
-- rollback. Do not drop the bucket unless all private verification objects and
-- database references have been intentionally migrated or purged.

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL
     OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Skipping verification document storage policy migration because Supabase Storage tables are not present';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (
    id,
    name,
    "public",
    file_size_limit,
    allowed_mime_types
  )
  VALUES (
    'verification-documents',
    'verification-documents',
    false,
    20971520,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf'
    ]::text[]
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    "public" = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "roomshare_deny_client_verification_documents" ON storage.objects';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE $policy$
      CREATE POLICY "roomshare_deny_client_verification_documents"
      ON storage.objects
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (bucket_id <> 'verification-documents')
      WITH CHECK (bucket_id <> 'verification-documents')
    $policy$;
  ELSE
    RAISE NOTICE 'Skipping verification document storage policy because Supabase anon/authenticated roles are not present';
  END IF;
END $$;
