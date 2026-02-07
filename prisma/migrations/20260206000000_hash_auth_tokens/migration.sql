-- Store auth tokens as SHA-256 hashes instead of plaintext.
-- Keeps existing active tokens usable by migrating current values.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "VerificationToken" ADD COLUMN "token_hash" TEXT;
UPDATE "VerificationToken"
SET "token_hash" = encode(digest(token, 'sha256'), 'hex')
WHERE "token_hash" IS NULL;
ALTER TABLE "VerificationToken" ALTER COLUMN "token_hash" SET NOT NULL;

DROP INDEX IF EXISTS "VerificationToken_token_key";
DROP INDEX IF EXISTS "VerificationToken_identifier_token_key";
ALTER TABLE "VerificationToken" DROP COLUMN token;

CREATE UNIQUE INDEX "VerificationToken_token_hash_key"
ON "VerificationToken"("token_hash");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_hash_key"
ON "VerificationToken"("identifier", "token_hash");
CREATE INDEX "VerificationToken_expires_idx"
ON "VerificationToken"("expires");

ALTER TABLE "PasswordResetToken" ADD COLUMN "token_hash" TEXT;
UPDATE "PasswordResetToken"
SET "token_hash" = encode(digest(token, 'sha256'), 'hex')
WHERE "token_hash" IS NULL;
ALTER TABLE "PasswordResetToken" ALTER COLUMN "token_hash" SET NOT NULL;

DROP INDEX IF EXISTS "PasswordResetToken_token_key";
DROP INDEX IF EXISTS "PasswordResetToken_email_token_key";
ALTER TABLE "PasswordResetToken" DROP COLUMN token;

CREATE UNIQUE INDEX "PasswordResetToken_token_hash_key"
ON "PasswordResetToken"("token_hash");
CREATE UNIQUE INDEX "PasswordResetToken_email_token_hash_key"
ON "PasswordResetToken"("email", "token_hash");
CREATE INDEX "PasswordResetToken_expires_idx"
ON "PasswordResetToken"("expires");
