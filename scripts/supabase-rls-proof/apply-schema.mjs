#!/usr/bin/env node

import {
  commandOutput,
  discoverLocalDatabaseUrl,
  fail,
  info,
  redactSecrets,
  runCommand,
} from "./local-db.mjs";

const dbUrl = discoverLocalDatabaseUrl();

const scopedStatus = runCommand("git", [
  "status",
  "--short",
  "--",
  "prisma/schema.prisma",
  "prisma/migrations",
]);

if (scopedStatus.status === 0 && scopedStatus.stdout.trim()) {
  console.warn(
    "supabase-rls-proof: warning: local Prisma schema/migration changes are present; migrate deploy will use the current workspace state."
  );
  console.warn(redactSecrets(scopedStatus.stdout.trim()));
}

info("applying existing Prisma migrations to the local Supabase database.");

const migrate = runCommand("pnpm", [
  "prisma",
  "migrate",
  "deploy",
  "--schema",
  "prisma/schema.prisma",
], {
  env: {
    ...process.env,
    DATABASE_URL: dbUrl,
    DIRECT_URL: dbUrl,
  },
});

if (migrate.error?.code === "ENOENT") {
  fail("PNPM_MISSING", "pnpm is not on PATH.");
}

if (migrate.error) {
  fail("PRISMA_MIGRATE_DEPLOY_FAILED", "Unable to execute Prisma migrate.", [
    migrate.error.message,
  ]);
}

if (migrate.status !== 0) {
  fail("PRISMA_MIGRATE_DEPLOY_FAILED", "Prisma migrate deploy failed.", [
    commandOutput(migrate) || "No Prisma output.",
  ]);
}

const output = commandOutput(migrate);
if (output) {
  console.log(output);
}

info("Prisma migrations are applied to the local Supabase database.");
