-- Stabilize verification token rotation under concurrent resend attempts and
-- email-delivery failures by reducing each identifier to one row with
-- active/pending slots.

-- Keep the newest token per identifier before adding the single-row invariant.
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY "identifier"
      ORDER BY "expires" DESC, "token_hash" DESC
    ) AS row_num
  FROM "VerificationToken"
)
DELETE FROM "VerificationToken" vt
USING ranked
WHERE vt.ctid = ranked.ctid
  AND ranked.row_num > 1;

ALTER TABLE "VerificationToken"
  ALTER COLUMN "token_hash" DROP NOT NULL,
  ALTER COLUMN "expires" DROP NOT NULL,
  ADD COLUMN "pending_token_hash" TEXT,
  ADD COLUMN "pending_expires" TIMESTAMP(3),
  ADD COLUMN "pending_prepared_at" TIMESTAMP(3);

DROP INDEX IF EXISTS "VerificationToken_identifier_token_hash_key";

CREATE UNIQUE INDEX "VerificationToken_identifier_key"
ON "VerificationToken"("identifier");

CREATE UNIQUE INDEX "VerificationToken_pending_token_hash_key"
ON "VerificationToken"("pending_token_hash");

CREATE INDEX "VerificationToken_pending_expires_idx"
ON "VerificationToken"("pending_expires");
