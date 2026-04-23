import fs from "fs";
import path from "path";

import {
  createPGlitePhase04Fixture,
  type Phase04Fixture,
} from "@/__tests__/utils/pglite-phase04";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../prisma/migrations");

const PHASE05_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260505000000_phase05_privacy_contact_host_ghost",
  "migration.sql"
);

export interface Phase05Fixture extends Phase04Fixture {}

export async function createPGlitePhase05Fixture(): Promise<Phase05Fixture> {
  const base = await createPGlitePhase04Fixture();
  const pgExec = (
    base.pg as unknown as { exec: (sql: string) => Promise<void> }
  ).exec.bind(base.pg);

  await pgExec(fs.readFileSync(PHASE05_MIGRATION, "utf8"));

  return base;
}
