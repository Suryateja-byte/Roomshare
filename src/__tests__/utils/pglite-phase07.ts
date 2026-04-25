import fs from "fs";
import path from "path";

import {
  createPGlitePhase06Fixture,
  type Phase06Fixture,
} from "@/__tests__/utils/pglite-phase06";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../prisma/migrations");

const PHASE07_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260507000000_phase07_saved_search_alerts",
  "migration.sql"
);

const LEGACY_SAVED_SEARCH_FIXTURE_SQL = `
DO $$ BEGIN
  CREATE TYPE "AlertFrequency" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SavedSearch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" TEXT NULL,
  "filters" JSONB NOT NULL,
  "alertEnabled" BOOLEAN NOT NULL DEFAULT true,
  "alertFrequency" "AlertFrequency" NOT NULL DEFAULT 'DAILY',
  "lastAlertAt" TIMESTAMP(3) NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavedSearch_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SavedSearch_userId_idx"
  ON "SavedSearch" ("userId");

CREATE INDEX IF NOT EXISTS "SavedSearch_alertEnabled_lastAlertAt_idx"
  ON "SavedSearch" ("alertEnabled", "lastAlertAt");
`;

export interface Phase07Fixture extends Phase06Fixture {}

export async function createPGlitePhase07Fixture(): Promise<Phase07Fixture> {
  const base = await createPGlitePhase06Fixture();
  const pgExec = (
    base.pg as unknown as { exec: (sql: string) => Promise<void> }
  ).exec.bind(base.pg);

  await pgExec(LEGACY_SAVED_SEARCH_FIXTURE_SQL);
  await pgExec(fs.readFileSync(PHASE07_MIGRATION, "utf8"));

  return base;
}
