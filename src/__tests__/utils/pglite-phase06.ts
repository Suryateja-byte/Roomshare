import fs from "fs";
import path from "path";

import {
  createPGlitePhase05Fixture,
  type Phase05Fixture,
} from "@/__tests__/utils/pglite-phase05";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../prisma/migrations");

const PAYMENT_FOUNDATION_MIGRATIONS = [
  path.join(
    MIGRATIONS_DIR,
    "20260502050000_contact_paywall_foundation",
    "migration.sql"
  ),
  path.join(
    MIGRATIONS_DIR,
    "20260502060000_payment_adjustments_integrity",
    "migration.sql"
  ),
  path.join(
    MIGRATIONS_DIR,
    "20260502070000_entitlement_state_and_contact_restoration",
    "migration.sql"
  ),
];

const PHASE06_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260506000000_phase06_monetization_hardening",
  "migration.sql"
);

const PAYMENTS_FIX_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260512000000_payments_entitlement_refund_queue_fix",
  "migration.sql"
);

export interface Phase06Fixture extends Phase05Fixture {}

export async function createPGlitePhase06Fixture(): Promise<Phase06Fixture> {
  const base = await createPGlitePhase05Fixture();
  const pgExec = (
    base.pg as unknown as { exec: (sql: string) => Promise<void> }
  ).exec.bind(base.pg);

  for (const migration of PAYMENT_FOUNDATION_MIGRATIONS) {
    await pgExec(fs.readFileSync(migration, "utf8"));
  }
  await pgExec(fs.readFileSync(PHASE06_MIGRATION, "utf8"));
  await pgExec(fs.readFileSync(PAYMENTS_FIX_MIGRATION, "utf8"));

  return base;
}
