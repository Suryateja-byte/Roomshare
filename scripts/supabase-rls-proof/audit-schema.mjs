#!/usr/bin/env node

import process from "node:process";
import {
  CONTACT_HOST_TABLES,
  discoverLocalDatabaseUrl,
  fail,
  info,
} from "./local-db.mjs";

const dbUrl = discoverLocalDatabaseUrl();
process.env.DATABASE_URL = dbUrl;

const { Prisma, PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

function groupByTable(rows) {
  return rows.reduce((groups, row) => {
    const tableName = row.table_name;
    if (!groups.has(tableName)) {
      groups.set(tableName, []);
    }
    groups.get(tableName).push(row);
    return groups;
  }, new Map());
}

function tableList(values) {
  return values.length > 0 ? values.join(", ") : "none";
}

try {
  const rlsRows = await prisma.$queryRaw`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname IN (${Prisma.join(CONTACT_HOST_TABLES)})
    ORDER BY c.relname
  `;

  const policyRows = await prisma.$queryRaw`
    SELECT
      tablename AS table_name,
      policyname AS policy_name,
      cmd,
      permissive,
      roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (${Prisma.join(CONTACT_HOST_TABLES)})
    ORDER BY tablename, policyname
  `;

  const publicationRows = await prisma.$queryRaw`
    SELECT
      pubname AS publication_name,
      tablename AS table_name
    FROM pg_publication_tables
    WHERE schemaname = 'public'
      AND pubname = 'supabase_realtime'
      AND tablename IN (${Prisma.join(CONTACT_HOST_TABLES)})
    ORDER BY tablename
  `;

  const rlsByTable = new Map(rlsRows.map((row) => [row.table_name, row]));
  const policiesByTable = groupByTable(policyRows);
  const publicationTables = new Set(
    publicationRows.map((row) => row.table_name)
  );

  const missingTables = CONTACT_HOST_TABLES.filter(
    (tableName) => !rlsByTable.has(tableName)
  );
  const rlsDisabled = CONTACT_HOST_TABLES.filter((tableName) => {
    const row = rlsByTable.get(tableName);
    return row && !row.rls_enabled;
  });
  const policiesMissing = CONTACT_HOST_TABLES.filter(
    (tableName) => !policiesByTable.has(tableName)
  );
  const publicationMissing = CONTACT_HOST_TABLES.filter(
    (tableName) => !publicationTables.has(tableName)
  );

  console.log("supabase-rls-proof audit summary:");
  console.log(`- tables checked: ${CONTACT_HOST_TABLES.join(", ")}`);
  console.log(`- missing tables: ${tableList(missingTables)}`);
  console.log(`- RLS disabled: ${tableList(rlsDisabled)}`);
  console.log(`- policies missing: ${tableList(policiesMissing)}`);
  console.log(`- supabase_realtime missing: ${tableList(publicationMissing)}`);

  if (policyRows.length > 0) {
    console.log("- policies found:");
    for (const row of policyRows) {
      const roles = Array.isArray(row.roles) ? row.roles.join(",") : row.roles;
      console.log(
        `  - ${row.table_name}: ${row.policy_name} (${row.cmd}, ${row.permissive}, roles=${roles})`
      );
    }
  } else {
    console.log("- policies found: none");
  }

  const blockers = [
    ...missingTables.map((tableName) => ({
      code: "SCHEMA_TABLE_MISSING",
      detail: `${tableName} does not exist in public schema`,
    })),
    ...rlsDisabled.map((tableName) => ({
      code: "RLS_DISABLED",
      detail: `${tableName} has relrowsecurity=false`,
    })),
    ...policiesMissing.map((tableName) => ({
      code: "RLS_POLICY_MISSING",
      detail: `${tableName} has no pg_policies rows`,
    })),
    ...publicationMissing.map((tableName) => ({
      code: "REALTIME_PUBLICATION_MISSING",
      detail: `${tableName} is absent from supabase_realtime`,
    })),
  ];

  if (blockers.length > 0) {
    fail(
      blockers[0].code,
      "Contact Host messaging schema audit found local blockers.",
      blockers.map((blocker) => `${blocker.code}: ${blocker.detail}`)
    );
  }

  info("Contact Host messaging schema audit passed.");
} finally {
  await prisma.$disconnect();
}
