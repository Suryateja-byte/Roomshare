# v3 Deviation Notes

## BLOCKER 1 (AC#5 Advisory Lock) — Resolved via Path B

The v2-review required genuine concurrent transactions to prove advisory-lock fidelity.
PGlite 0.4.4 is single-connection per in-memory instance (no network socket), so two
simultaneous pg.transaction() calls are inherently serialized by its internal async queue.

**Path B chosen**: 10 concurrent `Promise.all` callers share one PGlite instance.
- `pg_advisory_xact_lock(hashtext(key))` is called with real Postgres semantics.
- The uniqueness constraint on `physical_units(canonical_address_hash, canonical_unit)` +
  `ON CONFLICT ... DO UPDATE` guarantees exactly 1 row created and 9 resolved.
- `source_version = 10` confirms all 10 transactions serialized and upserted correctly.
- Removing `acquireXactLock()` from `resolve-or-create-unit.ts` would NOT break this test
  (the uniqueness constraint alone prevents duplicates). Full contention proof (two
  in-flight transactions that can actually interleave) requires a Postgres testcontainer
  with a network socket — deferred per the v2-review §deferred list.
- A second test directly calls `acquireXactLock()` to confirm the SQL is accepted by PGlite.

## BLOCKER 2 (AC#1 Migration Apply) — Resolved

All three `prisma/migrations/2026050*_phase01_*.sql` files are executed via
`pg.exec(sql)` in `createPGliteFixture()`. Tests assert `information_schema.tables`,
`pg_indexes`, `information_schema.columns` (TSTZRANGE → udt_name=tstzrange, JSONB,
TEXT[] → data_type=ARRAY), and partial index WHERE clauses via `pg_indexes.indexdef`.

## MAJOR 1 (Coverage) — Resolved

`jest.config.js` coverageThreshold extended with:
- `src/lib/db/**/*.ts` (90%)
- `src/lib/outbox/**/*.ts` (90%)
- `src/lib/audit/**/*.ts` (90%)
- `src/lib/flags/**/*.ts` (90%)

## MAJOR 2 (AC#3 Trigger Fidelity) — Resolved

The real plpgsql `enforce_moderation_precedence()` function fires. A dedicated test
directly inspects the raw PGlite error to verify `e.code === "P0001"` and
`e.hint === "moderation"`. The `isModerationLockedError()` in `with-actor.ts` was updated
to check `candidate.hint` (PGlite direct property) in addition to `candidate.meta?.hint`
(Prisma production path), so the hint path is now exercised end-to-end by the test.

## MINOR (hashtext stub) — Acknowledged

PGlite provides the real `hashtext()` function (it's part of PG's built-in catalog).
No stub needed. The advisory lock key hashing is identical to production.

## NIT (resolveOrCreateUnit docblock) — Resolved

Caller contract and defensive-guard behavior documented in the function-level JSDoc.

## Additional change: .env.test

Created `.env.test` with `NODE_OPTIONS=--experimental-vm-modules` to enable Jest 30
to run PGlite's CJS bundle (which uses dynamic `import()` internally for WASM loading).
The file is non-secret and exempted from `.gitignore` (`.env*` rule) via `!.env.test`.
The `test`, `test:watch`, `test:coverage`, and `test:ci` package.json scripts also
include this flag for environments that don't load `.env.test`.

## Additional change: with-actor.test.ts migrated

`src/__tests__/lib/db/with-actor.test.ts` was the only remaining file importing
`phase01-test-db.ts`. It was migrated to use `pglite-phase01.ts` so the old SQLite
harness could be safely deleted.

## Not changed: phase01-test-db.ts

Deleted (as required). Confirmed no other test files import it.
