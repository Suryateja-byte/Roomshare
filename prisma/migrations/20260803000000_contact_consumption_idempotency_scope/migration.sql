-- =============================================================================
-- Scope contact-consumption idempotency by contact kind (review P0-4)
--
-- SCHEMA DIFF:
--   DROP   UNIQUE INDEX contact_consumption_user_idempotency_idx
--                       (user_id, client_idempotency_key)
--   CREATE UNIQUE INDEX contact_consumption_user_kind_idempotency_idx
--                       (user_id, contact_kind, client_idempotency_key)
--   CREATE INDEX        contact_consumption_user_idempotency_lookup_idx
--                       (user_id, client_idempotency_key)   -- non-unique
--
-- PURPOSE:
--   client_idempotency_key is chosen by the client. The 2-column unique meant one key
--   matched a consumption for ANY unit and ANY contact kind, so consumeContactEntitlement
--   returned EXISTING_CONSUMPTION and granted contact for an unpaid listing — unlimited
--   free message-starts and host phone reveals from a single purchase.
--   The 3-column unique matches the scoping already used by the sibling ledger
--   contact_attempts (user_id, client_idempotency_key, contact_kind).
--   The non-unique index backs the cross-kind lookup that consumeContactEntitlement now
--   performs with findFirst to detect and reject mismatched key reuse.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS "contact_consumption_user_idempotency_lookup_idx";
--   DROP INDEX IF EXISTS "contact_consumption_user_kind_idempotency_idx";
--   CREATE UNIQUE INDEX IF NOT EXISTS "contact_consumption_user_idempotency_idx"
--     ON "contact_consumption" ("user_id", "client_idempotency_key");
--   NOTE: the rollback's unique index creation FAILS if any rows sharing
--   (user_id, client_idempotency_key) across different contact kinds were written while
--   the 3-column index was live. Deduplicate those rows before rolling back.
--
-- DATA SAFETY:
--   Index-only change; no row data is read or written. Widening a unique index is the
--   safe direction and can never fail on existing data — every tuple unique on two
--   columns is still unique on those two plus a third. Table is small pre-launch, so
--   plain in-transaction DDL is used; CONCURRENTLY is deliberately avoided so this file
--   stays executable inside the PGlite test fixtures (same rationale as
--   20260611000000_outbox_terminal_cleanup_index).
-- =============================================================================

DROP INDEX IF EXISTS "contact_consumption_user_idempotency_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "contact_consumption_user_kind_idempotency_idx"
  ON "contact_consumption" ("user_id", "contact_kind", "client_idempotency_key");

CREATE INDEX IF NOT EXISTS "contact_consumption_user_idempotency_lookup_idx"
  ON "contact_consumption" ("user_id", "client_idempotency_key");
