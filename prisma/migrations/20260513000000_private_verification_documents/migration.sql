-- Private verification document storage and pending-request invariant.
--
-- Rollback:
--   DROP INDEX IF EXISTS "VerificationRequest_one_pending_per_user_idx";
--   DROP TABLE IF EXISTS "VerificationUpload";
--   ALTER TABLE "VerificationRequest" DROP COLUMN IF EXISTS "documentPath";
--   ALTER TABLE "VerificationRequest" DROP COLUMN IF EXISTS "selfiePath";
--   ALTER TABLE "VerificationRequest" DROP COLUMN IF EXISTS "documentMimeType";
--   ALTER TABLE "VerificationRequest" DROP COLUMN IF EXISTS "selfieMimeType";
--   ALTER TABLE "VerificationRequest" DROP COLUMN IF EXISTS "documentsExpireAt";
--   ALTER TABLE "VerificationRequest" DROP COLUMN IF EXISTS "documentsDeletedAt";
--   ALTER TABLE "VerificationRequest" ALTER COLUMN "documentUrl" SET NOT NULL;
--
-- Data safety:
--   This migration is additive except making legacy public URL columns nullable.
--   The DO block intentionally aborts if duplicate pending requests exist so the
--   partial unique index can be applied only after manual cleanup.

ALTER TABLE "VerificationRequest"
  ALTER COLUMN "documentUrl" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "documentPath" TEXT,
  ADD COLUMN IF NOT EXISTS "selfiePath" TEXT,
  ADD COLUMN IF NOT EXISTS "documentMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "selfieMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "documentsExpireAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "documentsDeletedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "VerificationUpload" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT,
  "kind" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "VerificationUpload_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "VerificationRequest"
    WHERE "status" = 'PENDING'
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create VerificationRequest_one_pending_per_user_idx: duplicate pending verification requests exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "VerificationRequest_one_pending_per_user_idx"
  ON "VerificationRequest" ("userId")
  WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS "VerificationUpload_storagePath_key"
  ON "VerificationUpload" ("storagePath");

CREATE INDEX IF NOT EXISTS "VerificationRequest_documentsExpireAt_idx"
  ON "VerificationRequest" ("documentsExpireAt");

CREATE INDEX IF NOT EXISTS "VerificationUpload_userId_kind_consumedAt_expiresAt_idx"
  ON "VerificationUpload" ("userId", "kind", "consumedAt", "expiresAt");

CREATE INDEX IF NOT EXISTS "VerificationUpload_requestId_idx"
  ON "VerificationUpload" ("requestId");

CREATE INDEX IF NOT EXISTS "VerificationUpload_expiresAt_idx"
  ON "VerificationUpload" ("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VerificationUpload_userId_fkey'
  ) THEN
    ALTER TABLE "VerificationUpload"
      ADD CONSTRAINT "VerificationUpload_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VerificationUpload_requestId_fkey'
  ) THEN
    ALTER TABLE "VerificationUpload"
      ADD CONSTRAINT "VerificationUpload_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "VerificationRequest"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
