#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import process from "node:process";
import { discoverLocalDatabaseUrl, fail, info } from "./local-db.mjs";

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

const runTag = `rls-proof:${new Date().toISOString().replace(/[:.]/g, "-")}`;
const users = {
  alice: randomUUID(),
  bob: randomUUID(),
  mallory: randomUUID(),
};
const ids = {
  listing: `${runTag}:listing`,
  visibleConversation: `${runTag}:conversation:visible`,
  hiddenForAliceConversation: `${runTag}:conversation:hidden-for-alice`,
  adminDeletedConversation: `${runTag}:conversation:admin-deleted`,
  outsiderConversation: `${runTag}:conversation:outsider`,
  visibleMessage: `${runTag}:message:visible`,
  softDeletedMessage: `${runTag}:message:soft-deleted`,
  hiddenMessage: `${runTag}:message:hidden-for-alice`,
  adminDeletedMessage: `${runTag}:message:admin-deleted`,
  outsiderMessage: `${runTag}:message:outsider`,
  allowedInsertMessage: `${runTag}:message:allowed-insert`,
  wrongSenderMessage: `${runTag}:message:wrong-sender`,
  outsiderInsertMessage: `${runTag}:message:outsider-insert`,
  adminDeletedInsertMessage: `${runTag}:message:admin-deleted-insert`,
  aliceDeletion: `${runTag}:deletion:alice-hidden`,
  aliceAdminDeletedDeletion: `${runTag}:deletion:alice-admin-deleted`,
  aliceDeletionInsert: `${runTag}:deletion:alice-visible-insert`,
  badDeletionInsert: `${runTag}:deletion:bad-user`,
  bobTyping: `${runTag}:typing:bob-visible`,
  aliceTypingInsert: `${runTag}:typing:alice-visible-insert`,
  badTypingInsert: `${runTag}:typing:bad-user`,
};
const allConversationIds = [
  ids.visibleConversation,
  ids.hiddenForAliceConversation,
  ids.adminDeletedConversation,
  ids.outsiderConversation,
];

let assertionCount = 0;

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlList(values) {
  return values.map(sqlString).join(", ");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  assertionCount += 1;
}

function assertIdSet(label, rows, expectedIds) {
  const actual = rows.map((row) => row.id).sort();
  const expected = [...expectedIds].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: expected ${expected.length} rows, got ${actual.length}`
  );
}

function isDeniedError(error) {
  const message = [
    error?.message,
    error?.code,
    error?.meta?.message,
    error?.meta?.code,
  ]
    .filter(Boolean)
    .join(" ");

  return /permission denied|row-level security|violates row-level security/i.test(
    message
  );
}

async function expectDenied(label, operation) {
  try {
    await operation();
  } catch (error) {
    assert(isDeniedError(error), `${label}: unexpected error ${error.message}`);
    return;
  }

  throw new Error(`${label}: operation unexpectedly succeeded`);
}

async function verifyHelperSurface() {
  const helperRows = await prisma.$queryRawUnsafe(`
    SELECT
      p.proname AS name,
      p.pronargs::int AS arg_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'roomshare_rls_proof'
    ORDER BY p.proname
  `);
  const arbitraryUserHelpers = helperRows.filter(
    (row) =>
      Number(row.arg_count) > 1 ||
      row.name === "is_conversation_participant" ||
      row.name === "can_read_conversation"
  );

  assert(
    arbitraryUserHelpers.length === 0,
    "Helper surface exposes arbitrary-user helper functions"
  );
}

async function withAuthenticatedUser(userId, operation) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      `SELECT set_config('request.jwt.claim.sub', ${sqlString(userId)}, true)`
    );
    await tx.$queryRawUnsafe(
      `SELECT set_config('request.jwt.claims', ${sqlString(
        JSON.stringify({ sub: userId, role: "authenticated" })
      )}, true)`
    );
    await tx.$executeRawUnsafe("SET LOCAL ROLE authenticated");

    return operation(tx);
  });
}

async function cleanupTaggedData() {
  const cleanupStatements = [
    `
      WITH proof_conversations AS (
        SELECT "id" FROM public."Conversation" WHERE "id" LIKE 'rls-proof:%'
      ),
      proof_users AS (
        SELECT "id" FROM public."User" WHERE "email" LIKE 'rls-proof+%@example.invalid'
      )
      DELETE FROM public."TypingStatus"
      WHERE "id" LIKE 'rls-proof:%'
         OR "conversationId" IN (SELECT "id" FROM proof_conversations)
         OR "userId" IN (SELECT "id" FROM proof_users)
    `,
    `
      WITH proof_conversations AS (
        SELECT "id" FROM public."Conversation" WHERE "id" LIKE 'rls-proof:%'
      ),
      proof_users AS (
        SELECT "id" FROM public."User" WHERE "email" LIKE 'rls-proof+%@example.invalid'
      )
      DELETE FROM public."ConversationDeletion"
      WHERE "id" LIKE 'rls-proof:%'
         OR "conversationId" IN (SELECT "id" FROM proof_conversations)
         OR "userId" IN (SELECT "id" FROM proof_users)
    `,
    `
      WITH proof_conversations AS (
        SELECT "id" FROM public."Conversation" WHERE "id" LIKE 'rls-proof:%'
      ),
      proof_users AS (
        SELECT "id" FROM public."User" WHERE "email" LIKE 'rls-proof+%@example.invalid'
      )
      DELETE FROM public."Message"
      WHERE "id" LIKE 'rls-proof:%'
         OR "content" LIKE 'rls-proof:%'
         OR "conversationId" IN (SELECT "id" FROM proof_conversations)
         OR "senderId" IN (SELECT "id" FROM proof_users)
    `,
    `
      WITH proof_conversations AS (
        SELECT "id" FROM public."Conversation" WHERE "id" LIKE 'rls-proof:%'
      ),
      proof_users AS (
        SELECT "id" FROM public."User" WHERE "email" LIKE 'rls-proof+%@example.invalid'
      )
      DELETE FROM public."_ConversationParticipants"
      WHERE "A" IN (SELECT "id" FROM proof_conversations)
         OR "B" IN (SELECT "id" FROM proof_users)
    `,
    `DELETE FROM public."Conversation" WHERE "id" LIKE 'rls-proof:%'`,
    `
      DELETE FROM public."Listing"
      WHERE "id" LIKE 'rls-proof:%'
         OR "title" LIKE 'rls-proof:%'
    `,
    `
      DELETE FROM public."User"
      WHERE "email" LIKE 'rls-proof+%@example.invalid'
    `,
  ];

  for (const statement of cleanupStatements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function seedProofData() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      INSERT INTO public."User" (
        "id",
        "name",
        "email",
        "languages",
        "isVerified",
        "createdAt",
        "updatedAt"
      )
      VALUES
        (${sqlString(users.alice)}, 'RLS Proof Alice', ${sqlString(
          `rls-proof+alice-${runTag}@example.invalid`
        )}, ARRAY['English']::text[], true, now(), now()),
        (${sqlString(users.bob)}, 'RLS Proof Bob', ${sqlString(
          `rls-proof+bob-${runTag}@example.invalid`
        )}, ARRAY['English']::text[], true, now(), now()),
        (${sqlString(users.mallory)}, 'RLS Proof Mallory', ${sqlString(
          `rls-proof+mallory-${runTag}@example.invalid`
        )}, ARRAY['English']::text[], true, now(), now())
    `);

    await tx.$executeRawUnsafe(`
      INSERT INTO public."Listing" (
        "id",
        "ownerId",
        "title",
        "description",
        "price",
        "amenities",
        "houseRules",
        "totalSlots",
        "availableSlots",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${sqlString(ids.listing)},
        ${sqlString(users.alice)},
        ${sqlString(`${runTag}: listing`)},
        'Disposable local RLS proof listing',
        1250.00,
        ARRAY['wifi']::text[],
        ARRAY['local proof only']::text[],
        2,
        1,
        now(),
        now()
      )
    `);

    await tx.$executeRawUnsafe(`
      INSERT INTO public."Conversation" (
        "id",
        "listingId",
        "createdAt",
        "updatedAt",
        "deletedAt"
      )
      VALUES
        (${sqlString(ids.visibleConversation)}, ${sqlString(
          ids.listing
        )}, now(), now(), NULL),
        (${sqlString(ids.hiddenForAliceConversation)}, ${sqlString(
          ids.listing
        )}, now(), now(), NULL),
        (${sqlString(ids.adminDeletedConversation)}, ${sqlString(
          ids.listing
        )}, now(), now(), now()),
        (${sqlString(ids.outsiderConversation)}, ${sqlString(
          ids.listing
        )}, now(), now(), NULL)
    `);

    await tx.$executeRawUnsafe(`
      INSERT INTO public."_ConversationParticipants" ("A", "B")
      VALUES
        (${sqlString(ids.visibleConversation)}, ${sqlString(users.alice)}),
        (${sqlString(ids.visibleConversation)}, ${sqlString(users.bob)}),
        (${sqlString(ids.hiddenForAliceConversation)}, ${sqlString(
          users.alice
        )}),
        (${sqlString(ids.hiddenForAliceConversation)}, ${sqlString(users.bob)}),
        (${sqlString(ids.adminDeletedConversation)}, ${sqlString(users.alice)}),
        (${sqlString(ids.adminDeletedConversation)}, ${sqlString(users.bob)}),
        (${sqlString(ids.outsiderConversation)}, ${sqlString(users.bob)})
    `);

    await tx.$executeRawUnsafe(`
      INSERT INTO public."Message" (
        "id",
        "senderId",
        "conversationId",
        "content",
        "read",
        "createdAt",
        "deletedAt"
      )
      VALUES
        (${sqlString(ids.visibleMessage)}, ${sqlString(
          users.alice
        )}, ${sqlString(ids.visibleConversation)}, ${sqlString(
          `${runTag}: visible message`
        )}, false, now(), NULL),
        (${sqlString(ids.softDeletedMessage)}, ${sqlString(
          users.alice
        )}, ${sqlString(ids.visibleConversation)}, ${sqlString(
          `${runTag}: soft-deleted message`
        )}, false, now(), now()),
        (${sqlString(ids.hiddenMessage)}, ${sqlString(
          users.bob
        )}, ${sqlString(ids.hiddenForAliceConversation)}, ${sqlString(
          `${runTag}: hidden-for-alice message`
        )}, false, now(), NULL),
        (${sqlString(ids.adminDeletedMessage)}, ${sqlString(
          users.bob
        )}, ${sqlString(ids.adminDeletedConversation)}, ${sqlString(
          `${runTag}: admin-deleted message`
        )}, false, now(), NULL),
        (${sqlString(ids.outsiderMessage)}, ${sqlString(
          users.bob
        )}, ${sqlString(ids.outsiderConversation)}, ${sqlString(
          `${runTag}: outsider message`
        )}, false, now(), NULL)
    `);

    await tx.$executeRawUnsafe(`
      INSERT INTO public."ConversationDeletion" (
        "id",
        "conversationId",
        "userId",
        "deletedAt"
      )
      VALUES (
        ${sqlString(ids.aliceDeletion)},
        ${sqlString(ids.hiddenForAliceConversation)},
        ${sqlString(users.alice)},
        now()
      )
    `);

    await tx.$executeRawUnsafe(`
      INSERT INTO public."ConversationDeletion" (
        "id",
        "conversationId",
        "userId",
        "deletedAt"
      )
      VALUES (
        ${sqlString(ids.aliceAdminDeletedDeletion)},
        ${sqlString(ids.adminDeletedConversation)},
        ${sqlString(users.alice)},
        now()
      )
    `);

    await tx.$executeRawUnsafe(`
      INSERT INTO public."TypingStatus" (
        "id",
        "userId",
        "conversationId",
        "isTyping",
        "updatedAt"
      )
      VALUES (
        ${sqlString(ids.bobTyping)},
        ${sqlString(users.bob)},
        ${sqlString(ids.visibleConversation)},
        true,
        now()
      )
    `);
  });
}

async function verifySelectPolicies() {
  const aliceConversations = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "id" AS id
      FROM public."Conversation"
      WHERE "id" IN (${sqlList(allConversationIds)})
      ORDER BY "id"
    `)
  );
  assertIdSet("Alice conversation visibility", aliceConversations, [
    ids.visibleConversation,
  ]);

  const malloryConversations = await withAuthenticatedUser(users.mallory, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "id" AS id
      FROM public."Conversation"
      WHERE "id" IN (${sqlList(allConversationIds)})
      ORDER BY "id"
    `)
  );
  assertIdSet("Mallory conversation visibility", malloryConversations, []);

  const aliceParticipants = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "A" AS conversation_id, "B" AS user_id
      FROM public."_ConversationParticipants"
      WHERE "A" IN (${sqlList(allConversationIds)})
      ORDER BY "A", "B"
    `)
  );
  assert(
    aliceParticipants.length === 2,
    `Alice participant rows: expected 2, got ${aliceParticipants.length}`
  );
  assert(
    aliceParticipants.every(
      (row) => row.conversation_id === ids.visibleConversation
    ),
    "Alice participant rows included a deleted or non-participant conversation"
  );

  const bobParticipants = await withAuthenticatedUser(users.bob, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "A" AS conversation_id, "B" AS user_id
      FROM public."_ConversationParticipants"
      WHERE "A" IN (${sqlList(allConversationIds)})
      ORDER BY "A", "B"
    `)
  );
  assert(
    bobParticipants.length === 5,
    `Bob participant rows: expected 5, got ${bobParticipants.length}`
  );
  assert(
    bobParticipants.every(
      (row) => row.conversation_id !== ids.adminDeletedConversation
    ),
    "Bob participant rows included an admin-deleted conversation"
  );

  const malloryParticipants = await withAuthenticatedUser(users.mallory, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "A" AS conversation_id, "B" AS user_id
      FROM public."_ConversationParticipants"
      WHERE "A" IN (${sqlList(allConversationIds)})
      ORDER BY "A", "B"
    `)
  );
  assert(
    malloryParticipants.length === 0,
    `Mallory participant rows: expected 0, got ${malloryParticipants.length}`
  );

  const aliceMessages = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "id" AS id
      FROM public."Message"
      WHERE "id" IN (${sqlList([
        ids.visibleMessage,
        ids.softDeletedMessage,
        ids.hiddenMessage,
        ids.adminDeletedMessage,
        ids.outsiderMessage,
      ])})
      ORDER BY "id"
    `)
  );
  assertIdSet("Alice message visibility", aliceMessages, [ids.visibleMessage]);

  const aliceDeletions = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "id" AS id
      FROM public."ConversationDeletion"
      WHERE "id" IN (${sqlList([
        ids.aliceDeletion,
        ids.aliceAdminDeletedDeletion,
      ])})
      ORDER BY "id"
    `)
  );
  assertIdSet("Alice deletion visibility", aliceDeletions, [ids.aliceDeletion]);

  const bobDeletions = await withAuthenticatedUser(users.bob, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "id" AS id
      FROM public."ConversationDeletion"
      WHERE "id" = ${sqlString(ids.aliceDeletion)}
    `)
  );
  assertIdSet("Bob deletion visibility", bobDeletions, []);

  const aliceTypingBeforeInsert = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "id" AS id
      FROM public."TypingStatus"
      WHERE "id" = ${sqlString(ids.bobTyping)}
    `)
  );
  assertIdSet("Alice typing visibility before own insert", aliceTypingBeforeInsert, []);
}

async function verifyMessagePolicies() {
  await withAuthenticatedUser(users.alice, (tx) =>
    tx.$executeRawUnsafe(`
      INSERT INTO public."Message" (
        "id",
        "senderId",
        "conversationId",
        "content",
        "read",
        "createdAt"
      )
      VALUES (
        ${sqlString(ids.allowedInsertMessage)},
        ${sqlString(users.alice)},
        ${sqlString(ids.visibleConversation)},
        ${sqlString(`${runTag}: allowed insert`)},
        false,
        now()
      )
    `)
  );
  assertionCount += 1;

  await expectDenied("Message insert with mismatched sender", () =>
    withAuthenticatedUser(users.alice, (tx) =>
      tx.$executeRawUnsafe(`
        INSERT INTO public."Message" (
          "id",
          "senderId",
          "conversationId",
          "content",
          "read",
          "createdAt"
        )
        VALUES (
          ${sqlString(ids.wrongSenderMessage)},
          ${sqlString(users.bob)},
          ${sqlString(ids.visibleConversation)},
          ${sqlString(`${runTag}: wrong sender`)},
          false,
          now()
        )
      `)
    )
  );

  await expectDenied("Message insert by non-participant", () =>
    withAuthenticatedUser(users.mallory, (tx) =>
      tx.$executeRawUnsafe(`
        INSERT INTO public."Message" (
          "id",
          "senderId",
          "conversationId",
          "content",
          "read",
          "createdAt"
        )
        VALUES (
          ${sqlString(ids.outsiderInsertMessage)},
          ${sqlString(users.mallory)},
          ${sqlString(ids.visibleConversation)},
          ${sqlString(`${runTag}: outsider insert`)},
          false,
          now()
        )
      `)
    )
  );

  await expectDenied("Message insert into admin-deleted conversation", () =>
    withAuthenticatedUser(users.alice, (tx) =>
      tx.$executeRawUnsafe(`
        INSERT INTO public."Message" (
          "id",
          "senderId",
          "conversationId",
          "content",
          "read",
          "createdAt"
        )
        VALUES (
          ${sqlString(ids.adminDeletedInsertMessage)},
          ${sqlString(users.alice)},
          ${sqlString(ids.adminDeletedConversation)},
          ${sqlString(`${runTag}: admin deleted insert`)},
          false,
          now()
        )
      `)
    )
  );

  const updateRows = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      UPDATE public."Message"
      SET "content" = ${sqlString(`${runTag}: update should not persist`)}
      WHERE "id" = ${sqlString(ids.visibleMessage)}
      RETURNING "id" AS id
    `)
  );
  assertIdSet("Message update without policy", updateRows, []);

  const deleteRows = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      DELETE FROM public."Message"
      WHERE "id" = ${sqlString(ids.visibleMessage)}
      RETURNING "id" AS id
    `)
  );
  assertIdSet("Message delete without policy", deleteRows, []);
}

async function verifyDeletionPolicies() {
  await withAuthenticatedUser(users.alice, (tx) =>
    tx.$executeRawUnsafe(`
      INSERT INTO public."ConversationDeletion" (
        "id",
        "conversationId",
        "userId",
        "deletedAt"
      )
      VALUES (
        ${sqlString(ids.aliceDeletionInsert)},
        ${sqlString(ids.visibleConversation)},
        ${sqlString(users.alice)},
        now()
      )
    `)
  );
  assertionCount += 1;

  await expectDenied("ConversationDeletion insert for another user", () =>
    withAuthenticatedUser(users.alice, (tx) =>
      tx.$executeRawUnsafe(`
        INSERT INTO public."ConversationDeletion" (
          "id",
          "conversationId",
          "userId",
          "deletedAt"
        )
        VALUES (
          ${sqlString(ids.badDeletionInsert)},
          ${sqlString(ids.visibleConversation)},
          ${sqlString(users.bob)},
          now()
        )
      `)
    )
  );

  const bobDeleteRows = await withAuthenticatedUser(users.bob, (tx) =>
    tx.$queryRawUnsafe(`
      DELETE FROM public."ConversationDeletion"
      WHERE "id" = ${sqlString(ids.aliceDeletion)}
      RETURNING "id" AS id
    `)
  );
  assertIdSet("ConversationDeletion delete by another user", bobDeleteRows, []);

  const aliceAdminDeletedRows = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      DELETE FROM public."ConversationDeletion"
      WHERE "id" = ${sqlString(ids.aliceAdminDeletedDeletion)}
      RETURNING "id" AS id
    `)
  );
  assertIdSet(
    "ConversationDeletion delete from admin-deleted conversation",
    aliceAdminDeletedRows,
    []
  );

  const aliceDeleteRows = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      DELETE FROM public."ConversationDeletion"
      WHERE "id" = ${sqlString(ids.aliceDeletionInsert)}
      RETURNING "id" AS id
    `)
  );
  assertIdSet("ConversationDeletion delete by owner", aliceDeleteRows, [
    ids.aliceDeletionInsert,
  ]);
}

async function verifyTypingPolicies() {
  await withAuthenticatedUser(users.alice, (tx) =>
    tx.$executeRawUnsafe(`
      INSERT INTO public."TypingStatus" (
        "id",
        "userId",
        "conversationId",
        "isTyping",
        "updatedAt"
      )
      VALUES (
        ${sqlString(ids.aliceTypingInsert)},
        ${sqlString(users.alice)},
        ${sqlString(ids.visibleConversation)},
        true,
        now()
      )
    `)
  );
  assertionCount += 1;

  await expectDenied("TypingStatus insert for another user", () =>
    withAuthenticatedUser(users.alice, (tx) =>
      tx.$executeRawUnsafe(`
        INSERT INTO public."TypingStatus" (
          "id",
          "userId",
          "conversationId",
          "isTyping",
          "updatedAt"
        )
        VALUES (
          ${sqlString(ids.badTypingInsert)},
          ${sqlString(users.bob)},
          ${sqlString(ids.visibleConversation)},
          true,
          now()
        )
      `)
    )
  );

  const aliceTypingRows = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      SELECT "id" AS id
      FROM public."TypingStatus"
      WHERE "id" IN (${sqlList([ids.bobTyping, ids.aliceTypingInsert])})
      ORDER BY "id"
    `)
  );
  assertIdSet("Alice typing visibility after own insert", aliceTypingRows, [
    ids.aliceTypingInsert,
  ]);

  const updateOwnRows = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      UPDATE public."TypingStatus"
      SET "isTyping" = false,
          "updatedAt" = now()
      WHERE "id" = ${sqlString(ids.aliceTypingInsert)}
      RETURNING "id" AS id
    `)
  );
  assertIdSet("TypingStatus owner update", updateOwnRows, [
    ids.aliceTypingInsert,
  ]);

  const updateOtherRows = await withAuthenticatedUser(users.alice, (tx) =>
    tx.$queryRawUnsafe(`
      UPDATE public."TypingStatus"
      SET "isTyping" = false,
          "updatedAt" = now()
      WHERE "id" = ${sqlString(ids.bobTyping)}
      RETURNING "id" AS id
    `)
  );
  assertIdSet("TypingStatus update by another user", updateOtherRows, []);
}

try {
  await cleanupTaggedData();
  await verifyHelperSurface();
  await seedProofData();
  await verifySelectPolicies();
  await verifyMessagePolicies();
  await verifyTypingPolicies();
  await verifyDeletionPolicies();

  console.log("supabase-rls-proof verify summary:");
  console.log("- synthetic users: 3 UUID users");
  console.log("- seeded conversations: 4 run-tagged rows");
  console.log("- realtime table under test: Message");
  console.log(`- direct SQL RLS assertions passed: ${assertionCount}`);
  info("local RLS proof verified.");
} catch (error) {
  fail("LOCAL_RLS_PROOF_VERIFY_FAILED", "Local RLS proof verification failed.", [
    error.message,
  ]);
} finally {
  await prisma.$disconnect();
}
