-- Roll back the local-only Contact Host RLS proof from a disposable Supabase DB.
-- This removes proof policies, helper schema, Message publication membership
-- added by the proof, and run-tagged synthetic verifier data.

WITH proof_conversations AS (
  SELECT "id"
  FROM public."Conversation"
  WHERE "id" LIKE 'rls-proof:%'
),
proof_users AS (
  SELECT "id"
  FROM public."User"
  WHERE "email" LIKE 'rls-proof+%@example.invalid'
)
DELETE FROM public."TypingStatus"
WHERE "id" LIKE 'rls-proof:%'
   OR "conversationId" IN (SELECT "id" FROM proof_conversations)
   OR "userId" IN (SELECT "id" FROM proof_users);

WITH proof_conversations AS (
  SELECT "id"
  FROM public."Conversation"
  WHERE "id" LIKE 'rls-proof:%'
),
proof_users AS (
  SELECT "id"
  FROM public."User"
  WHERE "email" LIKE 'rls-proof+%@example.invalid'
)
DELETE FROM public."ConversationDeletion"
WHERE "id" LIKE 'rls-proof:%'
   OR "conversationId" IN (SELECT "id" FROM proof_conversations)
   OR "userId" IN (SELECT "id" FROM proof_users);

WITH proof_conversations AS (
  SELECT "id"
  FROM public."Conversation"
  WHERE "id" LIKE 'rls-proof:%'
),
proof_users AS (
  SELECT "id"
  FROM public."User"
  WHERE "email" LIKE 'rls-proof+%@example.invalid'
)
DELETE FROM public."Message"
WHERE "id" LIKE 'rls-proof:%'
   OR "content" LIKE 'rls-proof:%'
   OR "conversationId" IN (SELECT "id" FROM proof_conversations)
   OR "senderId" IN (SELECT "id" FROM proof_users);

WITH proof_conversations AS (
  SELECT "id"
  FROM public."Conversation"
  WHERE "id" LIKE 'rls-proof:%'
),
proof_users AS (
  SELECT "id"
  FROM public."User"
  WHERE "email" LIKE 'rls-proof+%@example.invalid'
)
DELETE FROM public."_ConversationParticipants"
WHERE "A" IN (SELECT "id" FROM proof_conversations)
   OR "B" IN (SELECT "id" FROM proof_users);

DELETE FROM public."Conversation"
WHERE "id" LIKE 'rls-proof:%';

DELETE FROM public."Listing"
WHERE "id" LIKE 'rls-proof:%'
   OR "title" LIKE 'rls-proof:%';

DELETE FROM public."User"
WHERE "email" LIKE 'rls-proof+%@example.invalid';

DELETE FROM auth.users
WHERE email LIKE 'rls-proof+%@example.invalid';

DROP POLICY IF EXISTS "roomshare_rls_proof_conversation_select" ON public."Conversation";
DROP POLICY IF EXISTS "roomshare_rls_proof_participants_select" ON public."_ConversationParticipants";
DROP POLICY IF EXISTS "roomshare_rls_proof_message_select" ON public."Message";
DROP POLICY IF EXISTS "roomshare_rls_proof_message_insert" ON public."Message";
DROP POLICY IF EXISTS "roomshare_rls_proof_deletion_select" ON public."ConversationDeletion";
DROP POLICY IF EXISTS "roomshare_rls_proof_deletion_insert" ON public."ConversationDeletion";
DROP POLICY IF EXISTS "roomshare_rls_proof_deletion_delete" ON public."ConversationDeletion";
DROP POLICY IF EXISTS "roomshare_rls_proof_typing_select" ON public."TypingStatus";
DROP POLICY IF EXISTS "roomshare_rls_proof_typing_insert" ON public."TypingStatus";
DROP POLICY IF EXISTS "roomshare_rls_proof_typing_update" ON public."TypingStatus";
DROP POLICY IF EXISTS "roomshare_rls_proof_typing_delete" ON public."TypingStatus";

DO $$
DECLARE
  rls_record record;
  proof_table text;
BEGIN
  IF to_regclass('roomshare_rls_proof.rls_state') IS NOT NULL THEN
    FOR rls_record IN
      SELECT table_name, was_enabled
      FROM roomshare_rls_proof.rls_state
    LOOP
      IF rls_record.was_enabled THEN
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rls_record.table_name);
      ELSE
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', rls_record.table_name);
      END IF;
    END LOOP;
  ELSE
    FOREACH proof_table IN ARRAY ARRAY[
      'Conversation',
      '_ConversationParticipants',
      'Message',
      'ConversationDeletion',
      'TypingStatus'
    ] LOOP
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', proof_table);
    END LOOP;
  END IF;
END $$;

DO $$
DECLARE
  should_drop_message boolean := true;
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
      AND tablename = 'Message'
  ) THEN
    IF to_regclass('roomshare_rls_proof.publication_state') IS NOT NULL THEN
      SELECT NOT was_member
      INTO should_drop_message
      FROM roomshare_rls_proof.publication_state
      WHERE table_name = 'Message';

      should_drop_message := COALESCE(should_drop_message, true);
    END IF;

    IF should_drop_message THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public."Message"';
    END IF;
  END IF;
END $$;

DROP SCHEMA IF EXISTS roomshare_rls_proof CASCADE;
