import fs from "fs";
import path from "path";

import {
  createPGlitePhase07Fixture,
  type Phase07Fixture,
} from "@/__tests__/utils/pglite-phase07";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../prisma/migrations");

const PHASE08_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260508000000_phase08_client_cache_coherence",
  "migration.sql"
);

export interface Phase08Fixture extends Phase07Fixture {}

export async function createPGlitePhase08Fixture(): Promise<Phase08Fixture> {
  const base = await createPGlitePhase07Fixture();
  const pgExec = (
    base.pg as unknown as { exec: (sql: string) => Promise<void> }
  ).exec.bind(base.pg);

  // The phase02 base fixture may already apply this migration (the outbox
  // retention tests need the fanout columns); applying it twice fails on its
  // non-idempotent ADD CONSTRAINT statements.
  const applied = await base.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'cache_invalidations'
         AND column_name = 'fanout_status'
     ) AS "exists"`
  );
  if (!applied[0]?.exists) {
    await pgExec(fs.readFileSync(PHASE08_MIGRATION, "utf8"));
  }

  return base;
}
