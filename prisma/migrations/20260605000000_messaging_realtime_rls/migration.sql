-- Messaging Supabase Realtime RLS/publication contract.
--
-- Rollback notes:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public."Message";
--   DROP POLICY IF EXISTS "roomshare_realtime_select_messages" ON public."Message";
--   DROP POLICY IF EXISTS "roomshare_realtime_private_channel_read" ON realtime.messages;
--   DROP POLICY IF EXISTS "roomshare_realtime_private_channel_write" ON realtime.messages;
--   DROP FUNCTION IF EXISTS public.roomshare_realtime_can_read_message(text, timestamp without time zone);
--   DROP FUNCTION IF EXISTS public.roomshare_realtime_topic_allowed(text);
--   DROP FUNCTION IF EXISTS public.roomshare_realtime_can_access_conversation(text);
--
-- Do not disable row level security on public."Message" during rollback unless
-- product/security explicitly accepts returning to unauthenticated direct table
-- visibility for browser-backed realtime.

CREATE OR REPLACE FUNCTION public.roomshare_realtime_can_access_conversation(
  target_conversation_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  claimed_user_id text := NULLIF(claims ->> 'roomshare_user_id', '');
  claimed_conversation_id text := NULLIF(claims ->> 'roomshare_conversation_id', '');
BEGIN
  IF claimed_user_id IS NULL
     OR claimed_conversation_id IS NULL
     OR target_conversation_id IS NULL
     OR claimed_conversation_id <> target_conversation_id THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public."Conversation" conversation
    JOIN public."_ConversationParticipants" participant
      ON participant."A" = conversation.id
    WHERE conversation.id = target_conversation_id
      AND conversation."deletedAt" IS NULL
      AND participant."B" = claimed_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM public."ConversationDeletion" deletion
        WHERE deletion."conversationId" = conversation.id
          AND deletion."userId" = claimed_user_id
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.roomshare_realtime_can_read_message(
  message_conversation_id text,
  message_deleted_at timestamp without time zone
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT message_deleted_at IS NULL
    AND public.roomshare_realtime_can_access_conversation(message_conversation_id);
$$;

CREATE OR REPLACE FUNCTION public.roomshare_realtime_topic_allowed(topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  claimed_conversation_id text := NULLIF(claims ->> 'roomshare_conversation_id', '');
BEGIN
  IF claimed_conversation_id IS NULL OR topic IS NULL THEN
    RETURN false;
  END IF;

  RETURN topic = ('chat:' || claimed_conversation_id)
    AND public.roomshare_realtime_can_access_conversation(claimed_conversation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.roomshare_realtime_can_access_conversation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.roomshare_realtime_can_read_message(text, timestamp without time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.roomshare_realtime_topic_allowed(text) FROM PUBLIC;

ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roomshare_realtime_select_messages" ON public."Message";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.roomshare_realtime_can_access_conversation(text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.roomshare_realtime_can_read_message(text, timestamp without time zone) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.roomshare_realtime_topic_allowed(text) TO authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public."Message" TO authenticated';
    EXECUTE $policy$
      CREATE POLICY "roomshare_realtime_select_messages"
      ON public."Message"
      FOR SELECT
      TO authenticated
      USING (
        public.roomshare_realtime_can_read_message("conversationId", "deletedAt")
      )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Message'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."Message"';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "roomshare_realtime_private_channel_read" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "roomshare_realtime_private_channel_write" ON realtime.messages';
    EXECUTE $policy$
      CREATE POLICY "roomshare_realtime_private_channel_read"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND public.roomshare_realtime_topic_allowed((SELECT realtime.topic()))
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "roomshare_realtime_private_channel_write"
      ON realtime.messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND public.roomshare_realtime_topic_allowed((SELECT realtime.topic()))
      )
    $policy$;
  END IF;
END $$;
