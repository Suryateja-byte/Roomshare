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

  await pgExec(fs.readFileSync(PHASE08_MIGRATION, "utf8"));

  return base;
}
