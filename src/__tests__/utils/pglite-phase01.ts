/**
 * PGlite-based test fixture for Phase 01.
 *
 * Replaces the SQLite harness with a real Postgres-compatible engine so that:
 *   - Actual prisma/migrations/2026050*_phase01_*.sql files are applied (proving AC#1).
 *   - PG-specific types (TSTZRANGE, JSONB, TEXT[], SMALLINT, NUMERIC) and partial
 *     indexes are exercised by the same parser used in production.
 *   - plpgsql trigger functions (enforce_moderation_precedence, forbid_update_delete)
 *     fire with real ERRCODE='P0001' and HINT metadata (proving AC#3).
 *   - pg_advisory_xact_lock, hashtext, current_setting, SET LOCAL are real PG calls
 *     (proving AC#5 uniqueness invariant).
 *
 * Each test suite calls `createPGliteFixture()` in beforeAll and `fixture.close()`
 * in afterAll.  Within each test, `fixture.client` is a Prisma-shaped adapter that
 * can be passed as the `client` option to `withActor()` or `db.client.$transaction()`.
 *
 * NOTE: PGlite is single-connection per instance.  pg_advisory_xact_lock therefore
 * serializes within the engine — 10 Promise.all callers prove the uniqueness invariant
 * (exactly 1 created row) but cannot model true lock *contention* across concurrent
 * connections.  This is documented as a known harness limitation.
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { PGlite } from "@electric-sql/pglite";

import type { ActorContext } from "@/lib/db/with-actor";

// ---------------------------------------------------------------------------
// Migration paths
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "../../../prisma/migrations"
);

const MIGRATION_SQL_FILES = [
  path.join(
    MIGRATIONS_DIR,
    "20260501000000_phase01_canonical_identity_tables",
    "migration.sql"
  ),
  path.join(
    MIGRATIONS_DIR,
    "20260501010000_phase01_moderation_precedence_trigger",
    "migration.sql"
  ),
  path.join(
    MIGRATIONS_DIR,
    "20260501020000_phase01_add_listing_physical_unit_id",
    "migration.sql"
  ),
];

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type PGliteRow = Record<string, unknown>;

/** Convert a JS number/string to bigint — PGlite returns BIGINT as number. */
function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return BigInt(0);
}

/** Convert a JS value to a Postgres-compatible parameter. */
function toParam(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  return value;
}

/** Convert an { increment: bigint } Prisma shorthand to a raw delta value. */
function resolveIncrement(value: unknown): bigint {
  if (
    value !== null &&
    typeof value === "object" &&
    "increment" in (value as object)
  ) {
    return toBigInt((value as { increment: unknown }).increment);
  }
  return BigInt(0);
}

// ---------------------------------------------------------------------------
// Tagged-template SQL interpolation
// ---------------------------------------------------------------------------

/**
 * Convert a tagged-template call (strings[], ...values) into a parameterised
 * {text, params} pair suitable for pg.query(text, params).
 */
function interpolateTagged(
  strings: TemplateStringsArray,
  values: unknown[]
): { text: string; params: unknown[] } {
  let text = "";
  const params: unknown[] = [];
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      params.push(toParam(values[i]));
      text += `$${params.length}`;
    }
  }
  return { text, params };
}

// ---------------------------------------------------------------------------
// Prisma-shaped TransactionClient adapter over a PGlite transaction handle
// ---------------------------------------------------------------------------

type QueryHandle = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: PGliteRow[] }>;
};

/**
 * Build a Prisma-shaped client around a PGlite query handle (either the top-level
 * `pg` instance or an in-progress `tx` handle from `pg.transaction()`).
 */
function buildClient(handle: QueryHandle): PrismaShapedClient {
  return {
    $executeRawUnsafe: async (sql: string): Promise<number> => {
      await handle.query(sql);
      return 0;
    },

    $executeRaw: async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<number> => {
      const { text, params } = interpolateTagged(strings, values);
      await handle.query(text, params);
      return 0;
    },

    $queryRaw: async <T>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T> => {
      const { text, params } = interpolateTagged(strings, values);
      const result = await handle.query(text, params);
      return result.rows as unknown as T;
    },

    physicalUnit: {
      upsert: async (args: {
        where: {
          canonicalAddressHash_canonicalUnit: {
            canonicalAddressHash: string;
            canonicalUnit: string;
          };
        };
        create: {
          canonicalAddressHash: string;
          canonicalUnit: string;
          canonicalizerVersion: string;
        };
        update: {
          canonicalizerVersion: string;
          sourceVersion: { increment: bigint };
          rowVersion: { increment: bigint };
        };
        select: {
          id: boolean;
          unitIdentityEpoch: boolean;
          sourceVersion: boolean;
        };
      }) => {
        const id = randomUUID();
        const { canonicalAddressHash, canonicalUnit } =
          args.where.canonicalAddressHash_canonicalUnit;
        const { canonicalizerVersion } = args.create;

        const result = await handle.query(
          `INSERT INTO physical_units
             (id, canonical_address_hash, canonical_unit, canonicalizer_version)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (canonical_address_hash, canonical_unit)
           DO UPDATE SET
             canonicalizer_version = EXCLUDED.canonicalizer_version,
             source_version = physical_units.source_version + $5,
             row_version = physical_units.row_version + $6,
             updated_at = NOW()
           RETURNING id, unit_identity_epoch, source_version`,
          [
            id,
            canonicalAddressHash,
            canonicalUnit,
            canonicalizerVersion,
            Number(resolveIncrement(args.update.sourceVersion)),
            Number(resolveIncrement(args.update.rowVersion)),
          ]
        );

        const row = result.rows[0];
        return {
          id: String(row.id),
          unitIdentityEpoch: Number(row.unit_identity_epoch),
          sourceVersion: toBigInt(row.source_version),
        };
      },

      findMany: async (args: {
        where: { id: { in: string[] } };
        select: {
          id: boolean;
          unitIdentityEpoch: boolean;
          supersedesUnitIds: boolean;
        };
      }) => {
        const ids = args.where.id.in;
        if (ids.length === 0) return [];

        const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
        const result = await handle.query(
          `SELECT id, unit_identity_epoch, supersedes_unit_ids
           FROM physical_units
           WHERE id IN (${placeholders})`,
          ids
        );

        return result.rows.map((row) => ({
          id: String(row.id),
          unitIdentityEpoch: Number(row.unit_identity_epoch),
          supersedesUnitIds: Array.isArray(row.supersedes_unit_ids)
            ? (row.supersedes_unit_ids as string[])
            : [],
        }));
      },

      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const setClauses: string[] = [];
        const params: unknown[] = [];

        const colMap: Record<string, string> = {
          unitIdentityEpoch: "unit_identity_epoch",
          sourceVersion: "source_version",
          rowVersion: "row_version",
          supersededByUnitId: "superseded_by_unit_id",
          supersedesUnitIds: "supersedes_unit_ids",
          publishStatus: "publish_status",
          lifecycleStatus: "lifecycle_status",
          privacyVersion: "privacy_version",
        };

        for (const [key, rawValue] of Object.entries(args.data)) {
          const col = colMap[key] ?? key;

          if (
            rawValue !== null &&
            typeof rawValue === "object" &&
            "increment" in (rawValue as object)
          ) {
            const delta = Number(resolveIncrement(rawValue));
            params.push(delta);
            setClauses.push(`${col} = ${col} + $${params.length}`);
          } else {
            params.push(toParam(rawValue));
            setClauses.push(`${col} = $${params.length}`);
          }
        }

        setClauses.push("updated_at = NOW()");
        params.push(args.where.id);

        await handle.query(
          `UPDATE physical_units
           SET ${setClauses.join(", ")}
           WHERE id = $${params.length}`,
          params
        );
      },
    },

    hostUnitClaim: {
      create: async (args: { data: Record<string, unknown> }) => {
        const id = String(args.data.id ?? randomUUID());
        await handle.query(
          `INSERT INTO host_unit_claims
             (id, unit_id, host_user_id, unit_identity_epoch_written_at,
              canonical_address_hash, canonicalizer_version)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            args.data.unitId ?? args.data.unit_id,
            args.data.hostUserId ?? args.data.host_user_id,
            args.data.unitIdentityEpochWrittenAt ??
              args.data.unit_identity_epoch_written_at ??
              1,
            args.data.canonicalAddressHash ?? args.data.canonical_address_hash ?? "",
            args.data.canonicalizerVersion ?? args.data.canonicalizer_version ?? "v1",
          ]
        );
        return { id };
      },

      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const setClauses: string[] = [];
        const params: unknown[] = [];

        const colMap: Record<string, string> = {
          publishStatus: "publish_status",
          lifecycleStatus: "lifecycle_status",
          privacyVersion: "privacy_version",
        };

        for (const [key, rawValue] of Object.entries(args.data)) {
          const col = colMap[key] ?? key;
          params.push(toParam(rawValue));
          setClauses.push(`${col} = $${params.length}`);
        }

        setClauses.push("updated_at = NOW()");
        params.push(args.where.id);

        await handle.query(
          `UPDATE host_unit_claims
           SET ${setClauses.join(", ")}
           WHERE id = $${params.length}`,
          params
        );
      },
    },

    listingInventory: {
      create: async (args: { data: Record<string, unknown> }) => {
        const id = String(args.data.id ?? randomUUID());
        const data = args.data;
        await handle.query(
          `INSERT INTO listing_inventories
             (id, unit_id, unit_identity_epoch_written_at, inventory_key,
              room_category, capacity_guests, total_beds, open_beds,
              available_from, availability_range, price,
              canonicalizer_version, canonical_address_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            id,
            data.unitId ?? data.unit_id,
            data.unitIdentityEpochWrittenAt ?? data.unit_identity_epoch_written_at ?? 1,
            data.inventoryKey ?? data.inventory_key ?? randomUUID(),
            data.roomCategory ?? data.room_category ?? "PRIVATE_ROOM",
            data.capacityGuests ?? data.capacity_guests ?? null,
            data.totalBeds ?? data.total_beds ?? null,
            data.openBeds ?? data.open_beds ?? null,
            data.availableFrom ?? data.available_from ?? "2026-05-01",
            data.availabilityRange ?? data.availability_range ??
              "[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)",
            data.price ?? 1000,
            data.canonicalizerVersion ?? data.canonicalizer_version ?? "v1",
            data.canonicalAddressHash ?? data.canonical_address_hash ?? "",
          ]
        );
        return { id };
      },

      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const setClauses: string[] = [];
        const params: unknown[] = [];

        const colMap: Record<string, string> = {
          publishStatus: "publish_status",
          lifecycleStatus: "lifecycle_status",
          privacyVersion: "privacy_version",
        };

        for (const [key, rawValue] of Object.entries(args.data)) {
          const col = colMap[key] ?? key;
          params.push(toParam(rawValue));
          setClauses.push(`${col} = $${params.length}`);
        }

        setClauses.push("updated_at = NOW()");
        params.push(args.where.id);

        await handle.query(
          `UPDATE listing_inventories
           SET ${setClauses.join(", ")}
           WHERE id = $${params.length}`,
          params
        );
      },
    },

    identityMutation: {
      create: async (args: {
        data: Record<string, unknown>;
        select: { id: boolean };
      }) => {
        const id = randomUUID();
        const data = args.data;
        await handle.query(
          `INSERT INTO identity_mutations
             (id, kind, from_unit_ids, to_unit_ids, reason_code,
              operator_id, resulting_epoch)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            data.kind,
            data.fromUnitIds ?? data.from_unit_ids,
            data.toUnitIds ?? data.to_unit_ids,
            data.reasonCode ?? data.reason_code,
            data.operatorId ?? data.operator_id ?? null,
            data.resultingEpoch ?? data.resulting_epoch ?? 1,
          ]
        );
        return { id };
      },
    },

    outboxEvent: {
      create: async (args: {
        data: Record<string, unknown>;
        select: { id: boolean };
      }) => {
        const id = randomUUID();
        const data = args.data;
        await handle.query(
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
            Number(toParam(data.sourceVersion ?? data.source_version ?? 1)),
            data.unitIdentityEpoch ?? data.unit_identity_epoch ?? 1,
            data.priority ?? 100,
          ]
        );
        return { id };
      },
    },

    auditEvent: {
      create: async (args: {
        data: Record<string, unknown>;
        select: { id: boolean };
      }) => {
        const id = randomUUID();
        const data = args.data;
        await handle.query(
          `INSERT INTO audit_events
             (id, kind, actor_role, actor_id, aggregate_type,
              aggregate_id, details, request_id, unit_identity_epoch)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
          [
            id,
            data.kind,
            data.actorRole ?? data.actor_role,
            data.actorId ?? data.actor_id ?? null,
            data.aggregateType ?? data.aggregate_type,
            data.aggregateId ?? data.aggregate_id,
            JSON.stringify(data.details ?? {}),
            data.requestId ?? data.request_id ?? null,
            data.unitIdentityEpoch ?? data.unit_identity_epoch ?? null,
          ]
        );
        return { id };
      },
    },

    // Replaced in createPGliteFixture via Object.assign.
    // This stub satisfies the PrismaShapedClient interface at build time.
    $transaction: async <T>(
      _fn: (tx: PrismaShapedClient) => Promise<T>
    ): Promise<T> => {
      throw new Error(
        "buildClient.$transaction is a stub — use the fixture.client.$transaction instead"
      );
    },
  } satisfies PrismaShapedClient;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The Prisma-shaped client exposed by the PGlite fixture.
 * Mirrors the subset of TransactionClient used by Phase 01 source code.
 */
export interface PrismaShapedClient {
  $executeRawUnsafe: (sql: string) => Promise<number>;
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $queryRaw: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $transaction: <T>(
    fn: (tx: PrismaShapedClient) => Promise<T>,
    options?: Record<string, unknown>
  ) => Promise<T>;
  physicalUnit: {
    upsert: (args: {
      where: {
        canonicalAddressHash_canonicalUnit: {
          canonicalAddressHash: string;
          canonicalUnit: string;
        };
      };
      create: {
        canonicalAddressHash: string;
        canonicalUnit: string;
        canonicalizerVersion: string;
      };
      update: {
        canonicalizerVersion: string;
        sourceVersion: { increment: bigint };
        rowVersion: { increment: bigint };
      };
      select: {
        id: boolean;
        unitIdentityEpoch: boolean;
        sourceVersion: boolean;
      };
    }) => Promise<{ id: string; unitIdentityEpoch: number; sourceVersion: bigint }>;
    findMany: (args: {
      where: { id: { in: string[] } };
      select: { id: boolean; unitIdentityEpoch: boolean; supersedesUnitIds: boolean };
    }) => Promise<Array<{ id: string; unitIdentityEpoch: number; supersedesUnitIds: string[] }>>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<void>;
  };
  hostUnitClaim: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<void>;
  };
  listingInventory: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<void>;
  };
  identityMutation: {
    create: (args: {
      data: Record<string, unknown>;
      select: { id: boolean };
    }) => Promise<{ id: string }>;
  };
  outboxEvent: {
    create: (args: {
      data: Record<string, unknown>;
      select: { id: boolean };
    }) => Promise<{ id: string }>;
  };
  auditEvent: {
    create: (args: {
      data: Record<string, unknown>;
      select: { id: boolean };
    }) => Promise<{ id: string }>;
  };
}

export interface PGliteFixture {
  pg: PGlite;
  /** Prisma-shaped client — pass as `client` option to `withActor()`. */
  client: PrismaShapedClient;
  /** Insert a row into the "User" stub table. */
  insertUser: (id: string) => Promise<void>;
  /** Insert a row into physical_units and return the id. */
  insertPhysicalUnit: (opts: {
    id?: string;
    canonicalAddressHash: string;
    canonicalUnit?: string;
    unitIdentityEpoch?: number;
    supersedesUnitIds?: string[];
  }) => Promise<string>;
  /** Insert a row into host_unit_claims and return the id. */
  insertHostUnitClaim: (opts: {
    id?: string;
    unitId: string;
    hostUserId: string;
    canonicalAddressHash?: string;
  }) => Promise<string>;
  /** Insert a row into listing_inventories and return the id. */
  insertListingInventory: (opts: {
    id?: string;
    unitId: string;
    canonicalAddressHash: string;
    roomCategory?: string;
    capacityGuests?: number | null;
    totalBeds?: number | null;
    openBeds?: number | null;
    genderPreference?: string | null;
    householdGender?: string | null;
    availabilityRange?: string;
  }) => Promise<string>;
  /** Insert a row into identity_mutations and return the id. */
  insertIdentityMutation: (opts: {
    id?: string;
    fromUnitIds: string[];
    toUnitIds: string[];
    kind?: string;
    reasonCode?: string;
    resultingEpoch?: number;
  }) => Promise<string>;
  /** Insert a row into audit_events and return the id. */
  insertAuditEvent: (opts: {
    id?: string;
    kind?: string;
    actorRole?: string;
    aggregateType?: string;
    aggregateId?: string;
  }) => Promise<string>;
  /** Run a raw SQL query directly on pg (outside a transaction). */
  query: <T extends PGliteRow = PGliteRow>(
    text: string,
    params?: unknown[]
  ) => Promise<T[]>;
  /** Return all physical_units rows with camelCase keys. */
  getPhysicalUnits: () => Promise<
    Array<{
      id: string;
      unitIdentityEpoch: number;
      canonicalAddressHash: string;
      canonicalUnit: string;
      sourceVersion: bigint;
      rowVersion: bigint;
      supersedesUnitIds: string[];
      supersededByUnitId: string | null;
    }>
  >;
  getIdentityMutations: () => Promise<
    Array<{
      id: string;
      kind: string;
      fromUnitIds: string[];
      toUnitIds: string[];
      resultingEpoch: number;
      operatorId: string | null;
    }>
  >;
  getOutboxEvents: () => Promise<
    Array<{
      id: string;
      aggregateType: string;
      aggregateId: string;
      kind: string;
      payload: Record<string, unknown>;
      sourceVersion: bigint;
      unitIdentityEpoch: number;
      priority: number;
      status: string;
    }>
  >;
  getAuditEvents: () => Promise<
    Array<{
      id: string;
      kind: string;
      actorRole: string;
      actorId: string | null;
      aggregateType: string;
      aggregateId: string;
    }>
  >;
  /** Tear down — close the PGlite instance. */
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh PGlite instance, apply all Phase 01 migrations, and return
 * a PGliteFixture.  Call this in `beforeAll` and call `fixture.close()` in
 * `afterAll`.
 */
export async function createPGliteFixture(): Promise<PGliteFixture> {
  const pg = new PGlite();

  // Create stub tables needed by FK constraints in the migrations.
  await pg.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT)`);
  await pg.query(`CREATE TABLE IF NOT EXISTS "Listing" (id TEXT PRIMARY KEY, title TEXT)`);

  // Apply each Phase 01 migration in order.
  for (const filePath of MIGRATION_SQL_FILES) {
    const sql = fs.readFileSync(filePath, "utf-8");
    // PGlite's exec() runs multi-statement SQL.
    await (pg as unknown as { exec: (sql: string) => Promise<void> }).exec(sql);
  }

  // Build the top-level Prisma-shaped client.
  const baseClient = buildClient(pg as unknown as QueryHandle);

  // Attach $transaction so withActor() can call client.$transaction(fn, options).
  const client = Object.assign(baseClient, {
    $transaction: async <T>(
      fn: (tx: PrismaShapedClient) => Promise<T>,
      _options?: Record<string, unknown>
    ): Promise<T> => {
      return (
        pg as unknown as {
          transaction: (fn: (tx: QueryHandle) => Promise<T>) => Promise<T>;
        }
      ).transaction(async (pgTx: QueryHandle) => {
        const txClient = buildClient(pgTx);
        return fn(txClient);
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Helper methods
  // ---------------------------------------------------------------------------

  const insertUser = async (id: string): Promise<void> => {
    await pg.query(
      `INSERT INTO "User" (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [id, `${id}@test.example`]
    );
  };

  const insertPhysicalUnit = async (opts: {
    id?: string;
    canonicalAddressHash: string;
    canonicalUnit?: string;
    unitIdentityEpoch?: number;
    supersedesUnitIds?: string[];
  }): Promise<string> => {
    const id = opts.id ?? randomUUID();
    await pg.query(
      `INSERT INTO physical_units
         (id, canonical_address_hash, canonical_unit, canonicalizer_version,
          unit_identity_epoch, supersedes_unit_ids)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        id,
        opts.canonicalAddressHash,
        opts.canonicalUnit ?? "_none_",
        "v1",
        opts.unitIdentityEpoch ?? 1,
        opts.supersedesUnitIds ?? [],
      ]
    );
    return id;
  };

  const insertHostUnitClaim = async (opts: {
    id?: string;
    unitId: string;
    hostUserId: string;
    canonicalAddressHash?: string;
  }): Promise<string> => {
    const id = opts.id ?? randomUUID();
    await pg.query(
      `INSERT INTO host_unit_claims
         (id, unit_id, host_user_id, unit_identity_epoch_written_at,
          canonical_address_hash, canonicalizer_version)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        id,
        opts.unitId,
        opts.hostUserId,
        1,
        opts.canonicalAddressHash ?? "hash",
        "v1",
      ]
    );
    return id;
  };

  const insertListingInventory = async (opts: {
    id?: string;
    unitId: string;
    canonicalAddressHash: string;
    roomCategory?: string;
    capacityGuests?: number | null;
    totalBeds?: number | null;
    openBeds?: number | null;
    genderPreference?: string | null;
    householdGender?: string | null;
    availabilityRange?: string;
  }): Promise<string> => {
    const id = opts.id ?? randomUUID();
    await pg.query(
      `INSERT INTO listing_inventories
         (id, unit_id, unit_identity_epoch_written_at, inventory_key,
          room_category, capacity_guests, total_beds, open_beds,
          gender_preference, household_gender,
          available_from, availability_range, price,
          canonicalizer_version, canonical_address_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        opts.unitId,
        1,
        randomUUID(),
        opts.roomCategory ?? "PRIVATE_ROOM",
        opts.capacityGuests ?? null,
        opts.totalBeds ?? null,
        opts.openBeds ?? null,
        opts.genderPreference ?? null,
        opts.householdGender ?? null,
        "2026-05-01",
        opts.availabilityRange ?? "[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)",
        1000,
        "v1",
        opts.canonicalAddressHash,
      ]
    );
    return id;
  };

  const insertIdentityMutation = async (opts: {
    id?: string;
    fromUnitIds: string[];
    toUnitIds: string[];
    kind?: string;
    reasonCode?: string;
    resultingEpoch?: number;
  }): Promise<string> => {
    const id = opts.id ?? randomUUID();
    await pg.query(
      `INSERT INTO identity_mutations
         (id, kind, from_unit_ids, to_unit_ids, reason_code, resulting_epoch)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        id,
        opts.kind ?? "MERGE",
        opts.fromUnitIds,
        opts.toUnitIds,
        opts.reasonCode ?? "operator_duplicate",
        opts.resultingEpoch ?? 1,
      ]
    );
    return id;
  };

  const insertAuditEvent = async (opts: {
    id?: string;
    kind?: string;
    actorRole?: string;
    aggregateType?: string;
    aggregateId?: string;
  }): Promise<string> => {
    const id = opts.id ?? randomUUID();
    await pg.query(
      `INSERT INTO audit_events
         (id, kind, actor_role, aggregate_type, aggregate_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        id,
        opts.kind ?? "CANONICAL_UNIT_CREATED",
        opts.actorRole ?? "host",
        opts.aggregateType ?? "physical_units",
        opts.aggregateId ?? randomUUID(),
      ]
    );
    return id;
  };

  const query = async <T extends PGliteRow = PGliteRow>(
    text: string,
    params?: unknown[]
  ): Promise<T[]> => {
    const result = await pg.query(text, params);
    return result.rows as T[];
  };

  const getPhysicalUnits = async () => {
    const rows = await query(
      `SELECT id, unit_identity_epoch, canonical_address_hash, canonical_unit,
              source_version, row_version, supersedes_unit_ids, superseded_by_unit_id
       FROM physical_units ORDER BY created_at`
    );
    return rows.map((row) => ({
      id: String(row.id),
      unitIdentityEpoch: Number(row.unit_identity_epoch),
      canonicalAddressHash: String(row.canonical_address_hash),
      canonicalUnit: String(row.canonical_unit),
      sourceVersion: toBigInt(row.source_version),
      rowVersion: toBigInt(row.row_version),
      supersedesUnitIds: Array.isArray(row.supersedes_unit_ids)
        ? (row.supersedes_unit_ids as string[])
        : [],
      supersededByUnitId: row.superseded_by_unit_id
        ? String(row.superseded_by_unit_id)
        : null,
    }));
  };

  const getIdentityMutations = async () => {
    const rows = await query(
      `SELECT id, kind, from_unit_ids, to_unit_ids, resulting_epoch, operator_id
       FROM identity_mutations ORDER BY created_at`
    );
    return rows.map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      fromUnitIds: Array.isArray(row.from_unit_ids)
        ? (row.from_unit_ids as string[])
        : [],
      toUnitIds: Array.isArray(row.to_unit_ids)
        ? (row.to_unit_ids as string[])
        : [],
      resultingEpoch: Number(row.resulting_epoch),
      operatorId: row.operator_id ? String(row.operator_id) : null,
    }));
  };

  const getOutboxEvents = async () => {
    const rows = await query(
      `SELECT id, aggregate_type, aggregate_id, kind, payload,
              source_version, unit_identity_epoch, priority, status
       FROM outbox_events ORDER BY created_at`
    );
    return rows.map((row) => ({
      id: String(row.id),
      aggregateType: String(row.aggregate_type),
      aggregateId: String(row.aggregate_id),
      kind: String(row.kind),
      payload:
        typeof row.payload === "object" && row.payload !== null
          ? (row.payload as Record<string, unknown>)
          : {},
      sourceVersion: toBigInt(row.source_version),
      unitIdentityEpoch: Number(row.unit_identity_epoch),
      priority: Number(row.priority),
      status: String(row.status),
    }));
  };

  const getAuditEvents = async () => {
    const rows = await query(
      `SELECT id, kind, actor_role, actor_id, aggregate_type, aggregate_id
       FROM audit_events ORDER BY created_at`
    );
    return rows.map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      actorRole: String(row.actor_role),
      actorId: row.actor_id ? String(row.actor_id) : null,
      aggregateType: String(row.aggregate_type),
      aggregateId: String(row.aggregate_id),
    }));
  };

  const close = async (): Promise<void> => {
    await pg.close();
  };

  return {
    pg,
    client,
    insertUser,
    insertPhysicalUnit,
    insertHostUnitClaim,
    insertListingInventory,
    insertIdentityMutation,
    insertAuditEvent,
    query,
    getPhysicalUnits,
    getIdentityMutations,
    getOutboxEvents,
    getAuditEvents,
    close,
  };
}

// ---------------------------------------------------------------------------
// Actor helpers
// ---------------------------------------------------------------------------

export function hostActor(): ActorContext {
  return { role: "host", id: "host-1" };
}

export function moderatorActor(): ActorContext {
  return { role: "moderator", id: "moderator-1" };
}

export function systemActor(): ActorContext {
  return { role: "system", id: null };
}
