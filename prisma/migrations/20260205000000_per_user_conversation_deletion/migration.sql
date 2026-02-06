-- Per-user conversation soft-delete
-- Replaces global Conversation.deletedAt with per-user ConversationDeletion records.
-- This allows each participant to independently hide/show conversations.
--
-- Rollback plan:
--   Reversible. To roll back:
--   1. Re-set global deletedAt for conversations where ALL participants have deletion records
--   2. DROP TABLE "ConversationDeletion"
--   3. Remove reverse relations from User and Conversation models
--
-- Data safety:
--   - No locking risk: CREATE TABLE is non-blocking
--   - Backfill INSERT uses a join on the implicit M2M table (lightweight read)
--   - The UPDATE to clear global deletedAt only affects rows with non-null deletedAt
--   - No downtime required

-- CreateTable
CREATE TABLE "ConversationDeletion" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique constraint for upsert)
CREATE UNIQUE INDEX "ConversationDeletion_conversationId_userId_key" ON "ConversationDeletion"("conversationId", "userId");

-- CreateIndex (for filtering by user)
CREATE INDEX "ConversationDeletion_userId_idx" ON "ConversationDeletion"("userId");

-- AddForeignKey
ALTER TABLE "ConversationDeletion" ADD CONSTRAINT "ConversationDeletion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationDeletion" ADD CONSTRAINT "ConversationDeletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: For globally-deleted conversations, create per-user deletion records
-- for ALL participants so the conversation remains hidden for everyone.
-- The implicit M2M join table is "_ConversationParticipants" with columns "A" (Conversation.id) and "B" (User.id).
INSERT INTO "ConversationDeletion" ("id", "conversationId", "userId", "deletedAt")
SELECT
    gen_random_uuid()::text,
    cp."A",
    cp."B",
    c."deletedAt"
FROM "Conversation" c
JOIN "_ConversationParticipants" cp ON cp."A" = c."id"
WHERE c."deletedAt" IS NOT NULL
ON CONFLICT ("conversationId", "userId") DO NOTHING;

-- Clear global deletedAt since per-user records now handle visibility.
-- Conversation.deletedAt is repurposed as admin-level delete only.
UPDATE "Conversation" SET "deletedAt" = NULL WHERE "deletedAt" IS NOT NULL;
