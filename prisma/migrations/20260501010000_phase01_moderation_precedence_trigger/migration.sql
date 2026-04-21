-- Phase 01: moderation precedence and append-only trigger guards
--
-- Rollback:
--   DROP TRIGGER IF EXISTS "trg_modprec_physical_units" ON "physical_units";
--   DROP TRIGGER IF EXISTS "trg_modprec_host_unit_claims" ON "host_unit_claims";
--   DROP TRIGGER IF EXISTS "trg_modprec_listing_inventories" ON "listing_inventories";
--   DROP TRIGGER IF EXISTS "trg_identity_mutations_append_only" ON "identity_mutations";
--   DROP TRIGGER IF EXISTS "trg_audit_events_append_only" ON "audit_events";
--   DROP FUNCTION IF EXISTS "enforce_moderation_precedence"();
--   DROP FUNCTION IF EXISTS "forbid_update_delete"();
--
-- PG compatibility:
-- - Uses only plpgsql, current_setting(), and IS DISTINCT FROM.
-- - Tested against PG 14/15/16 semantics.

CREATE OR REPLACE FUNCTION "enforce_moderation_precedence"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  actor_role TEXT := current_setting('app.actor_role', true);
BEGIN
  IF actor_role IS NULL OR actor_role = '' THEN
    actor_role := 'system';
  END IF;

  IF actor_role = 'host'
    AND (
      NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
      OR NEW.publish_status IS DISTINCT FROM OLD.publish_status
      OR NEW.privacy_version IS DISTINCT FROM OLD.privacy_version
    ) THEN
    RAISE EXCEPTION
      USING MESSAGE = 'MODERATION_LOCKED: host may not modify moderation columns',
            ERRCODE = 'P0001',
            HINT = 'moderation';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "enforce_moderation_precedence"()
  SET search_path = public, pg_catalog;

CREATE TRIGGER "trg_modprec_physical_units"
  BEFORE UPDATE ON "physical_units"
  FOR EACH ROW
  EXECUTE FUNCTION "enforce_moderation_precedence"();

CREATE TRIGGER "trg_modprec_host_unit_claims"
  BEFORE UPDATE ON "host_unit_claims"
  FOR EACH ROW
  EXECUTE FUNCTION "enforce_moderation_precedence"();

CREATE TRIGGER "trg_modprec_listing_inventories"
  BEFORE UPDATE ON "listing_inventories"
  FOR EACH ROW
  EXECUTE FUNCTION "enforce_moderation_precedence"();

CREATE OR REPLACE FUNCTION "forbid_update_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    USING MESSAGE = format('%s is append-only', TG_TABLE_NAME),
          ERRCODE = 'P0001';
END;
$$;

ALTER FUNCTION "forbid_update_delete"()
  SET search_path = public, pg_catalog;

CREATE TRIGGER "trg_identity_mutations_append_only"
  BEFORE UPDATE OR DELETE ON "identity_mutations"
  FOR EACH ROW
  EXECUTE FUNCTION "forbid_update_delete"();

CREATE TRIGGER "trg_audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW
  EXECUTE FUNCTION "forbid_update_delete"();
