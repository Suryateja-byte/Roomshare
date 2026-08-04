/**
 * @jest-environment node
 *
 * P1-6: the daily-lane lease, exercised against real Postgres semantics.
 *
 * The gate is one statement:
 *
 *   INSERT INTO cron_runs (task, last_run_at) VALUES ($1, $2)
 *   ON CONFLICT (task) DO UPDATE SET last_run_at = $3
 *   WHERE cron_runs.last_run_at < $4
 *
 * Whether that actually behaves as a lease — insert-once, then update only when
 * the row is old enough, with the affected-row count as the answer — is a
 * property of Postgres, not of our code, so mocking `$executeRaw` cannot prove
 * it. PGlite runs a real Postgres in-process, so this runs in CI (no Docker,
 * no REAL_DB_URL) against the actual migration SQL shipped in this PR.
 */

import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION_SQL = path.resolve(
  __dirname,
  "../../../prisma/migrations/20260803010000_cron_run_last_run_marker/migration.sql"
);

const TASK = "daily-maintenance";
const MIN_INTERVAL_HOURS = 20;

/**
 * Mirrors claimDailyLane in the daily-maintenance route.
 *
 * Deliberately a copy rather than an import: the route builds this as a Prisma
 * tagged template bound to the real client, which cannot be pointed at PGlite.
 * The pairing that keeps the two honest is the route's own unit test, which
 * asserts the bound parameters and that the statement contains ON CONFLICT.
 */
async function claim(db: PGlite, now: Date): Promise<boolean> {
  const threshold = new Date(
    now.getTime() - MIN_INTERVAL_HOURS * 60 * 60 * 1000
  );

  const result = await db.query(
    `INSERT INTO cron_runs (task, last_run_at)
     VALUES ($1, $2)
     ON CONFLICT (task) DO UPDATE SET last_run_at = $3
     WHERE cron_runs.last_run_at < $4`,
    [TASK, now, now, threshold]
  );

  return result.affectedRows === 1;
}

async function storedLastRunAt(db: PGlite): Promise<Date | null> {
  const result = await db.query<{ last_run_at: Date }>(
    `SELECT last_run_at FROM cron_runs WHERE task = $1`,
    [TASK]
  );
  return result.rows[0]?.last_run_at ?? null;
}

describe("cron_runs daily-lane lease (P1-6)", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    // last_run_at is TIMESTAMP(3) — without time zone, per the schema-wide
    // Prisma DateTime convention — so a raw driver reading it back renders it
    // in the session zone. Pin UTC to match production (Vercel runs UTC) and
    // keep the readback assertions below meaningful. The lease comparison
    // itself is zone-independent: both operands shift together.
    await db.exec("SET TIME ZONE 'UTC'");
    // Apply the real migration, so a broken CREATE TABLE fails here.
    await db.exec(fs.readFileSync(MIGRATION_SQL, "utf-8"));
  });

  afterEach(async () => {
    await db.close();
  });

  it("claims on the very first invocation after deploy", async () => {
    expect(await claim(db, new Date("2026-04-17T09:31:00.000Z"))).toBe(true);
    expect((await storedLastRunAt(db))?.toISOString()).toBe(
      "2026-04-17T09:31:00.000Z"
    );
  });

  it("claims regardless of where in the hour Vercel dispatches", async () => {
    // The old gate only fired between 09:02 and 09:04.
    expect(await claim(db, new Date("2026-04-17T09:59:00.000Z"))).toBe(true);
  });

  it("refuses a second claim minutes later (duplicate delivery)", async () => {
    expect(await claim(db, new Date("2026-04-17T09:31:00.000Z"))).toBe(true);
    expect(await claim(db, new Date("2026-04-17T09:33:00.000Z"))).toBe(false);

    // The refused claim must not move the marker forward.
    expect((await storedLastRunAt(db))?.toISOString()).toBe(
      "2026-04-17T09:31:00.000Z"
    );
  });

  it("claims again the next day at the earliest realistic dispatch gap", async () => {
    // Worst case: 09:59 one day, 09:00 the next — ~23h, comfortably over 20h.
    expect(await claim(db, new Date("2026-04-17T09:59:00.000Z"))).toBe(true);
    expect(await claim(db, new Date("2026-04-18T09:00:00.000Z"))).toBe(true);
    expect((await storedLastRunAt(db))?.toISOString()).toBe(
      "2026-04-18T09:00:00.000Z"
    );
  });

  it("still refuses just under the interval", async () => {
    expect(await claim(db, new Date("2026-04-17T09:00:00.000Z"))).toBe(true);
    // 19h59m later.
    expect(await claim(db, new Date("2026-04-18T04:59:00.000Z"))).toBe(false);
    // 20h01m later.
    expect(await claim(db, new Date("2026-04-18T05:01:00.000Z"))).toBe(true);
  });

  it("makes up a missed day rather than skipping it forever", async () => {
    expect(await claim(db, new Date("2026-04-17T09:31:00.000Z"))).toBe(true);
    // Suppose the next two days' invocations never arrive; the day after
    // still claims, instead of the lane being lost permanently.
    expect(await claim(db, new Date("2026-04-20T09:05:00.000Z"))).toBe(true);
  });
});
