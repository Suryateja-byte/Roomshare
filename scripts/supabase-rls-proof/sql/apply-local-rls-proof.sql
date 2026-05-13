-- Local-only Contact Host RLS proof for the disposable Supabase harness.
-- This is not a Prisma migration and must not be applied to hosted projects.

CREATE SCHEMA IF NOT EXISTS roomshare_rls_proof;

CREATE TABLE IF NOT EXISTS roomshare_rls_proof.publication_state (
  table_name text PRIMARY KEY,
  was_member boolean NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roomshare_rls_proof.rls_state (
  table_name text PRIMARY KEY,
  was_enabled boolean NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roomshare_rls_proof.publication_state (table_name, was_member)
SELECT
  table_name,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = table_name
  ) AS was_member
FROM (
  VALUES
    ('Message'),
    ('BlockedUser'),
    ('Conversation'),
    ('_ConversationParticipants'),
    ('ConversationDeletion'),
    ('TypingStatus')
) AS tracked_tables(table_name)
ON CONFLICT (table_name) DO NOTHING;

INSERT INTO roomshare_rls_proof.rls_state (table_name, was_enabled)
SELECT
  c.relname,
  c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname IN (
    'Conversation',
    '_ConversationParticipants',
    'Message',
    'ConversationDeletion',
    'TypingStatus'
  )
ON CONFLICT (table_name) DO NOTHING;

CREATE OR REPLACE FUNCTION roomshare_rls_proof.current_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT auth.uid()::text;
$$;

DROP FUNCTION IF EXISTS roomshare_rls_proof.is_conversation_participant(text, text) CASCADE;
DROP FUNCTION IF EXISTS roomshare_rls_proof.can_read_conversation(text, text) CASCADE;

CREATE OR REPLACE FUNCTION roomshare_rls_proof.is_current_user_conversation_participant(
  conversation_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(
    conversation_id IS NOT NULL
    AND roomshare_rls_proof.current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."_ConversationParticipants" cp
      WHERE cp."A" = conversation_id
        AND cp."B" = roomshare_rls_proof.current_user_id()
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION roomshare_rls_proof.can_current_user_read_conversation(
  conversation_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(
    conversation_id IS NOT NULL
    AND roomshare_rls_proof.current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."Conversation" c
      WHERE c."id" = conversation_id
        AND c."deletedAt" IS NULL
        AND roomshare_rls_proof.is_current_user_conversation_participant(c."id")
        AND NOT EXISTS (
          SELECT 1
          FROM public."ConversationDeletion" cd
          WHERE cd."conversationId" = c."id"
            AND cd."userId" = roomshare_rls_proof.current_user_id()
        )
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION roomshare_rls_proof.can_current_user_see_own_deletion(
  conversation_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(
    conversation_id IS NOT NULL
    AND roomshare_rls_proof.current_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."Conversation" c
      WHERE c."id" = conversation_id
        AND c."deletedAt" IS NULL
        AND roomshare_rls_proof.is_current_user_conversation_participant(c."id")
    ),
    false
  );
$$;

REVOKE ALL ON SCHEMA roomshare_rls_proof FROM PUBLIC;
REVOKE ALL ON SCHEMA roomshare_rls_proof FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA roomshare_rls_proof FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA roomshare_rls_proof FROM authenticated;
GRANT USAGE ON SCHEMA roomshare_rls_proof TO authenticated;
GRANT EXECUTE ON FUNCTION roomshare_rls_proof.current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION roomshare_rls_proof.is_current_user_conversation_participant(text) TO authenticated;
GRANT EXECUTE ON FUNCTION roomshare_rls_proof.can_current_user_read_conversation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION roomshare_rls_proof.can_current_user_see_own_deletion(text) TO authenticated;

ALTER TABLE public."Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_ConversationParticipants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ConversationDeletion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TypingStatus" ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "roomshare_rls_proof_conversation_select"
ON public."Conversation"
FOR SELECT
TO authenticated
USING (
  roomshare_rls_proof.can_current_user_read_conversation("id")
);

CREATE POLICY "roomshare_rls_proof_participants_select"
ON public."_ConversationParticipants"
FOR SELECT
TO authenticated
USING (
  roomshare_rls_proof.can_current_user_read_conversation("A")
);

CREATE POLICY "roomshare_rls_proof_message_select"
ON public."Message"
FOR SELECT
TO authenticated
USING (
  "deletedAt" IS NULL
  AND roomshare_rls_proof.can_current_user_read_conversation("conversationId")
);

CREATE POLICY "roomshare_rls_proof_message_insert"
ON public."Message"
FOR INSERT
TO authenticated
WITH CHECK (
  "senderId" = roomshare_rls_proof.current_user_id()
  AND roomshare_rls_proof.can_current_user_read_conversation("conversationId")
);

CREATE POLICY "roomshare_rls_proof_deletion_select"
ON public."ConversationDeletion"
FOR SELECT
TO authenticated
USING (
  "userId" = roomshare_rls_proof.current_user_id()
  AND roomshare_rls_proof.can_current_user_see_own_deletion("conversationId")
);

CREATE POLICY "roomshare_rls_proof_deletion_insert"
ON public."ConversationDeletion"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = roomshare_rls_proof.current_user_id()
  AND roomshare_rls_proof.can_current_user_read_conversation("conversationId")
);

CREATE POLICY "roomshare_rls_proof_deletion_delete"
ON public."ConversationDeletion"
FOR DELETE
TO authenticated
USING (
  "userId" = roomshare_rls_proof.current_user_id()
  AND roomshare_rls_proof.can_current_user_see_own_deletion("conversationId")
);

CREATE POLICY "roomshare_rls_proof_typing_select"
ON public."TypingStatus"
FOR SELECT
TO authenticated
USING (
  "userId" = roomshare_rls_proof.current_user_id()
  AND roomshare_rls_proof.can_current_user_read_conversation("conversationId")
);

CREATE POLICY "roomshare_rls_proof_typing_insert"
ON public."TypingStatus"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = roomshare_rls_proof.current_user_id()
  AND roomshare_rls_proof.can_current_user_read_conversation("conversationId")
);

CREATE POLICY "roomshare_rls_proof_typing_update"
ON public."TypingStatus"
FOR UPDATE
TO authenticated
USING (
  "userId" = roomshare_rls_proof.current_user_id()
  AND roomshare_rls_proof.can_current_user_read_conversation("conversationId")
)
WITH CHECK (
  "userId" = roomshare_rls_proof.current_user_id()
  AND roomshare_rls_proof.can_current_user_read_conversation("conversationId")
);

CREATE POLICY "roomshare_rls_proof_typing_delete"
ON public."TypingStatus"
FOR DELETE
TO authenticated
USING (
  "userId" = roomshare_rls_proof.current_user_id()
  AND roomshare_rls_proof.can_current_user_read_conversation("conversationId")
);

DO $$
DECLARE
  forbidden_table text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'supabase_realtime publication does not exist in local Supabase';
  END IF;

  FOREACH forbidden_table IN ARRAY ARRAY[
    'BlockedUser',
    'Conversation',
    '_ConversationParticipants',
    'ConversationDeletion',
    'TypingStatus'
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = forbidden_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', forbidden_table);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Message'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."Message"';
  END IF;
END $$;
