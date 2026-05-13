#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";
import {
  discoverLocalDatabaseUrl,
  fail,
  info,
  splitSqlStatements,
} from "./local-db.mjs";

const dbUrl = discoverLocalDatabaseUrl();
process.env.DATABASE_URL = dbUrl;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

const sqlUrl = new URL("./sql/rollback-local-rls-proof.sql", import.meta.url);
const statements = splitSqlStatements(readFileSync(sqlUrl, "utf8"));

try {
  for (const [index, statement] of statements.entries()) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      fail(
        "LOCAL_RLS_PROOF_ROLLBACK_FAILED",
        `Failed to roll back local RLS proof statement ${index + 1}/${statements.length}.`,
        [error.message]
      );
    }
  }

  info(`local RLS proof rolled back (${statements.length} SQL statements).`);
} finally {
  await prisma.$disconnect();
}
