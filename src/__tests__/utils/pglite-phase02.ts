/**
 * PGlite-based test fixture for Phase 02.
 *
 * EXTENDS the Phase 01 harness by:
 *   1. Calling createPGliteFixture() to apply Phase 01 migrations and build the base client.
 *   2. Applying Phase 02 migration SQL files on top.
 *   3. Exposing additional helpers for Phase 02 projection tables:
 *      - insertInventorySearchProjection
 *      - insertUnitPublicProjection
 *      - getInventorySearchProjections
 *      - getUnitPublicProjections
 *      - getCacheInvalidations
 *      - seedOutboxEvent (direct DB insert for speed/setup, bypasses the Zod validator)
 *   4. Overrides client.$transaction to return the real PGlite affectedRows count from
 *      $executeRaw (Phase 01 buildClient() hardcodes 0; Phase 02 projection logic relies
 *      on updatedCount > 0 to detect stale events).
 *
 * This file deliberately does NOT fork Phase 01 adapter code. All Phase 01
 * exports (insertUser, insertPhysicalUnit, insertListingInventory, getOutboxEvents, etc.)
 * remain available via the returned fixture — the Phase 02 fixture is a superset.
 *
 * PGlite limitations (inherited):
 *   - PostGIS extension is NOT available — exact_point / public_point columns fall back
 *     to TEXT NULL (migration DDL uses DO $ guards for this). Tests store WKT strings.
 *   - SKIP LOCKED semantics are emulated via PGlite's single-connection serialization.
 *   - Multi-connection lock contention deferred to Phase 10 Postgres testcontainer.
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import {
  createPGliteFixture,
  type PGliteFixture,
} from "@/__tests__/utils/pglite-phase01";

// ---------------------------------------------------------------------------
// Phase 02 migration files
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../prisma/migrations");

const PHASE02_MIGRATION_SQL_FILES = [
  path.join(
    MIGRATIONS_DIR,
    "20260502000000_phase02_projection_tables",
    "migration.sql"
  ),
  path.join(
    MIGRATIONS_DIR,
    "20260502010000_phase02_physical_units_geocode_columns",
    "migration.sql"
  ),
  path.join(
    MIGRATIONS_DIR,
    "20260502020000_phase02_listing_inventories_publish_status_check",
    "migration.sql"
  ),
  path.join(
    MIGRATIONS_DIR,
    "20260502030000_phase02_cache_invalidations_enqueued_idx",
    "migration.sql"
  ),
];

// ---------------------------------------------------------------------------
// Phase 02 fixture type
// ---------------------------------------------------------------------------

export interface Phase02Fixture extends PGliteFixture {
  /** Insert an inventory_search_projection row for test setup */
  insertInventorySearchProjection(opts: {
    id?: string;
    inventoryId?: string;
    unitId: string;
    unitIdentityEpoch?: number;
    roomCategory?: string;
    price?: number;
    availableFrom?: string;
    publishStatus?: string;
    sourceVersion?: bigint;
    projectionEpoch?: bigint;
  }): Promise<string>;

  /** Insert a unit_public_projection row for test setup */
  insertUnitPublicProjection(opts: {
    unitId: string;
    unitIdentityEpoch?: number;
    fromPrice?: number | null;
    roomCategories?: string[];
    matchingInventoryCount?: number;
    sourceVersion?: bigint;
    projectionEpoch?: bigint;
  }): Promise<void>;

  /** Get all inventory_search_projection rows ordered by created_at */
  getInventorySearchProjections(): Promise<
    {
      id: string;
      inventoryId: string;
      unitId: string;
      unitIdentityEpoch: number;
      publishStatus: string;
      sourceVersion: bigint;
      projectionEpoch: bigint;
    }[]
  >;

  /** Get all unit_public_projection rows */
  getUnitPublicProjections(): Promise<
    {
      unitId: string;
      unitIdentityEpoch: number;
      matchingInventoryCount: number;
      sourceVersion: bigint;
      projectionEpoch: bigint;
    }[]
  >;

  /** Get all cache_invalidations rows ordered by enqueued_at */
  getCacheInvalidations(): Promise<
    {
      id: string;
      unitId: string;
      reason: string;
      projectionEpoch: bigint;
      unitIdentityEpoch: number;
      consumedAt: Date | null;
    }[]
  >;

  /**
   * Directly insert an outbox_events row, bypassing the Zod validator.
   * Useful for seeding large numbers of events in tests (e.g. priority starvation test).
   */
  seedOutboxEvent(opts: {
    id?: string;
    aggregateType?: string;
    aggregateId?: string;
    kind: string;
    payload?: Record<string, unknown>;
    sourceVersion?: bigint;
    unitIdentityEpoch?: number;
    priority?: number;
    status?: string;
    nextAttemptAt?: Date;
  }): Promise<string>;
}

// ---------------------------------------------------------------------------
// Tagged-template interpolation helper (mirrors pglite-phase01.ts internally)
// ---------------------------------------------------------------------------

function toParam02(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  return value;
}

function interpolateTagged02(
  strings: TemplateStringsArray,
  values: unknown[]
): { text: string; params: unknown[] } {
  let text = "";
  const params: unknown[] = [];
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      params.push(toParam02(values[i]));
      text += `$${params.length}`;
    }
  }
  return { text, params };
}

// ---------------------------------------------------------------------------
// createPGlitePhase02Fixture
// ---------------------------------------------------------------------------

/**
 * Create a Phase 02 PGlite test fixture.
 *
 * Applies Phase 01 migrations first (via createPGliteFixture), then applies
 * the four Phase 02 migration SQL files on top.
 *
 * The returned fixture's `client.$transaction` is patched to return the real
 * PGlite affectedRows count from `$executeRaw` (Phase 01 hardcodes 0, which
 * breaks Phase 02 stale-event detection).
 */
export async function createPGlitePhase02Fixture(): Promise<Phase02Fixture> {
  // Build Phase 01 base fixture
  const base = await createPGliteFixture();
  const pg = base.pg;

  // Apply Phase 02 migrations using the same pattern as Phase 01:
  // pg.exec() handles multi-statement SQL files including DO $$ blocks.
  // The cast is safe — PGlite exposes exec() on the public API as of 0.4.x.
  const pgExec = (
    pg as unknown as { exec: (sql: string) => Promise<void> }
  ).exec.bind(pg);

  for (const sqlFile of PHASE02_MIGRATION_SQL_FILES) {
    const sql = fs.readFileSync(sqlFile, "utf8");
    try {
      await pgExec(sql);
    } catch (err) {
      // PostGIS-related failures are expected in PGlite — the DO $$ guards in
      // migration 20260502010000 should prevent them, but if they slip through,
      // try executing statement-by-statement with individual error handling.
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes("geography") ||
        msg.toLowerCase().includes("postgis")
      ) {
        await applyMigrationSqlStatementByStatement(pg, sql);
      } else {
        throw err;
      }
    }
  }

  // ── Patch client.$transaction to return real affectedRows ────────────────────
  //
  // Phase 01's buildClient() hardcodes $executeRaw → 0. Phase 02 projection code
  // checks `updatedCount > 0` to detect stale events. We fix this by providing
  // our own $transaction implementation that builds a transaction client where
  // $executeRaw returns PGlite's affectedRows.
  //
  // We also re-implement the Prisma model stubs used by Phase 02 code
  // (outboxEvent.create, outboxEvent.update) bound to the transaction pgTx handle.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type H = {
    query: (
      text: string,
      params?: unknown[]
    ) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  };

  function buildPhase02TxClient(h: H) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = {
      $executeRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<number> => {
        const { text, params } = interpolateTagged02(strings, values);
        const result = await h.query(text, params);
        return (result as { affectedRows?: number }).affectedRows ?? 0;
      },

      $executeRawUnsafe: async (
        sql: string,
        ...params: unknown[]
      ): Promise<number> => {
        const result = await h.query(sql, params.map(toParam02));
        return (result as { affectedRows?: number }).affectedRows ?? 0;
      },

      $queryRawUnsafe: async <T>(
        sql: string,
        ...params: unknown[]
      ): Promise<T> => {
        const result = await h.query(sql, params.map(toParam02));
        return result.rows as unknown as T;
      },

      $queryRaw: async <T>(
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<T> => {
        const { text, params } = interpolateTagged02(strings, values);
        const result = await h.query(text, params);
        return result.rows as unknown as T;
      },

      // outboxEvent model stub — used by appendOutboxEvent() and routeToDlq()
      outboxEvent: {
        create: async (args: {
          data: Record<string, unknown>;
          select?: unknown;
        }) => {
          const id = randomUUID();
          const data = args.data;
          await h.query(
            `INSERT INTO outbox_events
               (id, aggregate_type, aggregate_id, kind, payload,
                source_version, unit_identity_epoch, priority)
             VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
            [
              id,
              data.aggregateType ?? data.aggregate_type,
              data.aggregateId ?? data.aggregate_id,
              data.kind,
              JSON.stringify(data.payload ?? {}),
              Number(
                typeof data.sourceVersion === "bigint"
                  ? data.sourceVersion
                  : (data.source_version ?? 1)
              ),
              data.unitIdentityEpoch ?? data.unit_identity_epoch ?? 1,
              data.priority ?? 100,
            ]
          );
          return { id };
        },

        update: async (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const { where, data } = args;
          const sets: string[] = [];
          const params: unknown[] = [];
          for (const [key, val] of Object.entries(data)) {
            // camelCase → snake_case
            const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
            params.push(typeof val === "bigint" ? Number(val) : val);
            sets.push(`${col} = $${params.length}`);
          }
          params.push(where.id);
          await h.query(
            `UPDATE outbox_events SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`,
            params
          );
          return { id: where.id };
        },
      },

      // $transaction nested call — pass through to same txClient (PGlite is single-connection)
      $transaction: async <T>(
        fn: (tx: typeof client) => Promise<T>
      ): Promise<T> => fn(client),
    };

    return client;
  }

  // Build patched client by replacing $transaction on the base client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patchedClient: any = Object.assign({}, base.client, {
    $transaction: async <T>(
      fn: (tx: unknown) => Promise<T>,
      _options?: Record<string, unknown>
    ): Promise<T> => {
      return (
        pg as unknown as {
          transaction: (fn: (tx: H) => Promise<T>) => Promise<T>;
        }
      ).transaction(async (pgTx: H) => {
        const txClient = buildPhase02TxClient(pgTx);
        return fn(txClient);
      });
    },
  });

  // ── Additional helper functions ────────────────────────────────────────────

  const insertInventorySearchProjection: Phase02Fixture["insertInventorySearchProjection"] =
    async (opts) => {
      const id = opts.id ?? randomUUID();
      const inventoryId = opts.inventoryId ?? id;
      await pg.query(
        `INSERT INTO inventory_search_projection (
           id, inventory_id, unit_id, unit_identity_epoch_written_at,
           room_category, price, available_from, availability_range,
           publish_status, source_version, projection_epoch,
           created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
        [
          id,
          inventoryId,
          opts.unitId,
          opts.unitIdentityEpoch ?? 1,
          opts.roomCategory ?? "PRIVATE_ROOM",
          opts.price ?? 1000,
          opts.availableFrom ?? "2026-05-01",
          "[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)",
          opts.publishStatus ?? "PENDING_PROJECTION",
          Number(opts.sourceVersion ?? BigInt(1)),
          Number(opts.projectionEpoch ?? BigInt(1)),
        ]
      );
      return id;
    };

  const insertUnitPublicProjection: Phase02Fixture["insertUnitPublicProjection"] =
    async (opts) => {
      await pg.query(
        `INSERT INTO unit_public_projection (
           unit_id, unit_identity_epoch, from_price, room_categories,
           matching_inventory_count, coarse_availability_badges,
           source_version, projection_epoch,
           created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
         ON CONFLICT (unit_id, unit_identity_epoch) DO UPDATE
           SET from_price = EXCLUDED.from_price,
               matching_inventory_count = EXCLUDED.matching_inventory_count,
               source_version = EXCLUDED.source_version,
               updated_at = NOW()`,
        [
          opts.unitId,
          opts.unitIdentityEpoch ?? 1,
          opts.fromPrice ?? null,
          opts.roomCategories ?? [],
          opts.matchingInventoryCount ?? 0,
          [],
          Number(opts.sourceVersion ?? BigInt(1)),
          Number(opts.projectionEpoch ?? BigInt(1)),
        ]
      );
    };

  const getInventorySearchProjections: Phase02Fixture["getInventorySearchProjections"] =
    async () => {
      const result = await pg.query(
        `SELECT id, inventory_id, unit_id, unit_identity_epoch_written_at,
                publish_status, source_version, projection_epoch
         FROM inventory_search_projection ORDER BY created_at`
      );
      return (result.rows as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        inventoryId: String(row.inventory_id),
        unitId: String(row.unit_id),
        unitIdentityEpoch: Number(row.unit_identity_epoch_written_at),
        publishStatus: String(row.publish_status),
        sourceVersion: BigInt(Number(row.source_version)),
        projectionEpoch: BigInt(Number(row.projection_epoch)),
      }));
    };

  const getUnitPublicProjections: Phase02Fixture["getUnitPublicProjections"] =
    async () => {
      const result = await pg.query(
        `SELECT unit_id, unit_identity_epoch, matching_inventory_count,
                source_version, projection_epoch
         FROM unit_public_projection ORDER BY created_at`
      );
      return (result.rows as Record<string, unknown>[]).map((row) => ({
        unitId: String(row.unit_id),
        unitIdentityEpoch: Number(row.unit_identity_epoch),
        matchingInventoryCount: Number(row.matching_inventory_count),
        sourceVersion: BigInt(Number(row.source_version)),
        projectionEpoch: BigInt(Number(row.projection_epoch)),
      }));
    };

  const getCacheInvalidations: Phase02Fixture["getCacheInvalidations"] =
    async () => {
      const result = await pg.query(
        `SELECT id, unit_id, reason, projection_epoch, unit_identity_epoch, consumed_at
         FROM cache_invalidations ORDER BY enqueued_at`
      );
      return (result.rows as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        unitId: String(row.unit_id),
        reason: String(row.reason),
        projectionEpoch: BigInt(Number(row.projection_epoch)),
        unitIdentityEpoch: Number(row.unit_identity_epoch),
        consumedAt: row.consumed_at ? new Date(String(row.consumed_at)) : null,
      }));
    };

  const seedOutboxEvent: Phase02Fixture["seedOutboxEvent"] = async (opts) => {
    const id = opts.id ?? randomUUID();
    await pg.query(
      `INSERT INTO outbox_events (
         id, aggregate_type, aggregate_id, kind, payload,
         source_version, unit_identity_epoch, priority, status,
         next_attempt_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
      [
        id,
        opts.aggregateType ?? "PHYSICAL_UNIT",
        opts.aggregateId ?? randomUUID(),
        opts.kind,
        JSON.stringify(opts.payload ?? {}),
        Number(opts.sourceVersion ?? BigInt(1)),
        opts.unitIdentityEpoch ?? 1,
        opts.priority ?? 100,
        opts.status ?? "PENDING",
        opts.nextAttemptAt ?? new Date(),
      ]
    );
    return id;
  };

  return {
    ...base,
    // Override client with patched version that returns real affectedRows
    client: patchedClient,
    insertInventorySearchProjection,
    insertUnitPublicProjection,
    getInventorySearchProjections,
    getUnitPublicProjections,
    getCacheInvalidations,
    seedOutboxEvent,
  };
}

// ---------------------------------------------------------------------------
// Migration SQL executor (fallback: statement-by-statement)
// ---------------------------------------------------------------------------

/**
 * Apply a multi-statement migration SQL string to a PGlite instance, one
 * statement at a time. Used as fallback when pg.exec() fails on a PostGIS
 * statement. Skips PostGIS-specific errors gracefully.
 */
async function applyMigrationSqlStatementByStatement(
  pg: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  sql: string
): Promise<void> {
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith("--")) continue;
    try {
      await pg.query(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Skip PostGIS/geography errors — PGlite doesn't have PostGIS
      if (
        msg.includes("geography") ||
        msg.includes("postgis") ||
        msg.includes("PostGIS")
      ) {
        continue;
      }
      // VALIDATE CONSTRAINT may behave differently on PGlite
      if (msg.includes("VALIDATE CONSTRAINT") || msg.includes("validate")) {
        continue;
      }
      throw err;
    }
  }
}

/**
 * Split SQL into individual statements. Respects $$ quote blocks.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;
  let i = 0;

  while (i < sql.length) {
    // Check for $$ delimiter (start or end of dollar-quoted block)
    if (sql[i] === "$" && sql[i + 1] === "$") {
      inDollarQuote = !inDollarQuote;
      current += "$$";
      i += 2;
      continue;
    }

    if (!inDollarQuote && sql[i] === ";") {
      statements.push(current);
      current = "";
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  if (current.trim()) {
    statements.push(current);
  }

  return statements;
}
