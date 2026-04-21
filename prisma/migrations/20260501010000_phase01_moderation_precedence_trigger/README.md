# phase01_moderation_precedence_trigger

## Summary

Installs:

- the moderation-precedence trigger on the three canonical Phase 01 tables
- append-only trigger guards on `identity_mutations` and `audit_events`

The trigger reads `app.actor_role` from transaction-local GUC state.

## Rollback

1. Drop the five triggers.
2. Drop `enforce_moderation_precedence()`.
3. Drop `forbid_update_delete()`.

The rollback SQL is embedded in `migration.sql` comments.

## Data-safety

- This migration changes trigger behavior only.
- No rows are rewritten.
- Existing public read-path tables are untouched.

## Lock footprint

- Trigger creation takes short-lived DDL locks on the new Phase 01 tables only.
- No long-running data scan or backfill occurs.
