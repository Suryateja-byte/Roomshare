#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  discoverLocalDatabaseUrl,
  discoverLocalSupabaseApi,
  fail,
  info,
  redactSecrets,
} from "./local-db.mjs";

const SUBSCRIBE_TIMEOUT_MS = 10_000;
const DELIVERY_TIMEOUT_MS = 8_000;
const NON_DELIVERY_WINDOW_MS = 1_500;
const POLL_INTERVAL_MS = 50;

const dbUrl = discoverLocalDatabaseUrl();
process.env.DATABASE_URL = dbUrl;

const { apiUrl, anonKey } = discoverLocalSupabaseApi();

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const runTag = `rls-proof:${runId}:realtime`;
const ids = {
  listing: `${runTag}:listing`,
  conversationAllowed: `${runTag}:conversation:allowed`,
  conversationOther: `${runTag}:conversation:other`,
  messageAllowed: `${runTag}:message:allowed`,
  messageOther: `${runTag}:message:other`,
  deniedNonparticipant: `${runTag}:message:denied-nonparticipant`,
  deniedSpoofedHost: `${runTag}:message:denied-spoofed-host`,
};

const actorDefinitions = [
  { key: "host", label: "host" },
  { key: "tenantA", label: "tenant_a" },
  { key: "tenantB", label: "tenant_b" },
  { key: "nonparticipant", label: "nonparticipant" },
];

const actors = {};
const actorList = [];
const subscriptions = [];
let assertionCount = 0;
let deliveryAssertionCount = 0;
let nonDeliveryAssertionCount = 0;
let deniedWriteAssertionCount = 0;

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  assertionCount += 1;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label}: timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeVerifierDetail(value) {
  return redactSecrets(value ?? "").replace(
    /rls-proof\+[^@\s]+@example\.invalid/g,
    "[REDACTED_EMAIL]"
  );
}

function errorDetail(error) {
  return sanitizeVerifierDetail(error?.message ?? error);
}

function formatSupabaseError(error) {
  const message = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" | ");

  return sanitizeVerifierDetail(message);
}

function isDeniedError(error) {
  return /42501|permission denied|row-level security|violates row-level security/i.test(
    formatSupabaseError(error)
  );
}

function createProofClient() {
  return createClient(apiUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "roomshare-local-rls-proof-realtime",
      },
    },
  });
}

async function createActor({ key, label }) {
  const client = createProofClient();
  const email = `rls-proof+${label}-${runId}@example.invalid`;
  const password = `RlsProof!${randomUUID().replaceAll("-", "")}`;

  const signUp = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        roomshare_rls_proof: true,
        proof_run_id: runId,
        proof_role: label,
      },
    },
  });

  if (signUp.error) {
    throw new Error(
      `${label}: local Auth signUp failed: ${formatSupabaseError(signUp.error)}`
    );
  }

  const signIn = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (signIn.error) {
    throw new Error(
      `${label}: local Auth signInWithPassword failed: ${formatSupabaseError(
        signIn.error
      )}`
    );
  }

  const userId = signIn.data.user?.id;
  const session = signIn.data.session;

  if (!userId || !session?.access_token) {
    throw new Error(`${label}: local Auth did not return a usable session`);
  }

  const actor = {
    key,
    label,
    client,
    email,
    id: userId,
    session,
  };

  actors[key] = actor;
  actorList.push(actor);
  return actor;
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
    `
      DELETE FROM auth.users
      WHERE email LIKE 'rls-proof+%@example.invalid'
    `,
  ];

  for (const statement of cleanupStatements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      throw new Error(`tagged data cleanup failed: ${errorDetail(error)}`);
    }
  }
}

async function seedPublicRows() {
  try {
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
        (${sqlString(actors.host.id)}, 'Realtime Proof Host', ${sqlString(
          actors.host.email
        )}, ARRAY['English']::text[], true, now(), now()),
        (${sqlString(actors.tenantA.id)}, 'Realtime Proof Tenant A', ${sqlString(
          actors.tenantA.email
        )}, ARRAY['English']::text[], true, now(), now()),
        (${sqlString(actors.tenantB.id)}, 'Realtime Proof Tenant B', ${sqlString(
          actors.tenantB.email
        )}, ARRAY['English']::text[], true, now(), now()),
        (${sqlString(
          actors.nonparticipant.id
        )}, 'Realtime Proof Nonparticipant', ${sqlString(
          actors.nonparticipant.email
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
        ${sqlString(actors.host.id)},
        ${sqlString(`${runTag}: listing`)},
        'Disposable local Realtime proof listing',
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
        (${sqlString(ids.conversationAllowed)}, ${sqlString(
          ids.listing
        )}, now(), now(), NULL),
        (${sqlString(ids.conversationOther)}, ${sqlString(
          ids.listing
        )}, now(), now(), NULL)
    `);

    await tx.$executeRawUnsafe(`
      INSERT INTO public."_ConversationParticipants" ("A", "B")
      VALUES
        (${sqlString(ids.conversationAllowed)}, ${sqlString(actors.host.id)}),
        (${sqlString(ids.conversationAllowed)}, ${sqlString(actors.tenantA.id)}),
        (${sqlString(ids.conversationOther)}, ${sqlString(actors.host.id)}),
        (${sqlString(ids.conversationOther)}, ${sqlString(actors.tenantB.id)})
    `);
    });
  } catch (error) {
    throw new Error(`proof data seed failed: ${errorDetail(error)}`);
  }
}

async function createMessageSubscription({ actor, label, conversationId = null }) {
  await actor.client.realtime.setAuth(actor.session.access_token);

  let resolveSubscribed;
  let rejectSubscribed;
  let settled = false;
  const subscribed = new Promise((resolve, reject) => {
    resolveSubscribed = resolve;
    rejectSubscribed = reject;
  });
  const events = [];
  const channelName = `rls-proof-realtime-${label.replace(/[^a-z0-9]+/gi, "-")}-${randomUUID()}`;
  const options = {
    event: "INSERT",
    schema: "public",
    table: "Message",
  };

  if (conversationId) {
    options.filter = `conversationId=eq.${conversationId}`;
  }

  const subscription = {
    label,
    actorLabel: actor.label,
    events,
    error: null,
    channel: null,
    client: actor.client,
    waitSubscribed: () =>
      withTimeout(
        subscribed,
        SUBSCRIBE_TIMEOUT_MS,
        `${label}: wait for SUBSCRIBED`
      ),
  };

  const channel = actor.client
    .channel(channelName)
    .on("postgres_changes", options, (payload) => {
      events.push({
        id: payload.new?.id ?? null,
        conversationId: payload.new?.conversationId ?? null,
        senderId: payload.new?.senderId ?? null,
      });
    })
    .subscribe((status, error) => {
      if (status === "SUBSCRIBED" && !settled) {
        settled = true;
        resolveSubscribed(status);
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        const statusError = new Error(
          `${label}: realtime subscription ${status}${
            error ? `: ${formatSupabaseError(error)}` : ""
          }`
        );
        subscription.error = statusError;

        if (!settled) {
          settled = true;
          rejectSubscribed(statusError);
        }
      }
    });

  subscription.channel = channel;
  subscriptions.push(subscription);
  return subscription;
}

function assertNoChannelErrors() {
  for (const subscription of subscriptions) {
    if (subscription.error) {
      throw subscription.error;
    }
  }
}

function hasMessageEvent(subscription, messageId) {
  return subscription.events.some((event) => event.id === messageId);
}

async function waitForMessageEvent(subscription, messageId, label) {
  const deadline = Date.now() + DELIVERY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    assertNoChannelErrors();

    if (hasMessageEvent(subscription, messageId)) {
      deliveryAssertionCount += 1;
      assert(true, label);
      return;
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(`${label}: expected message event was not received`);
}

function assertNoMessageEvents(subscription, messageIds, label) {
  const receivedIds = subscription.events
    .filter((event) => messageIds.includes(event.id))
    .map((event) => event.id);

  assert(
    receivedIds.length === 0,
    `${label}: received unexpected message event(s): ${receivedIds.join(", ")}`
  );
  nonDeliveryAssertionCount += 1;
}

async function waitForNonDeliveryWindow() {
  await delay(NON_DELIVERY_WINDOW_MS);
  assertNoChannelErrors();
}

async function insertAllowedMessage(label, actor, row) {
  const { error } = await actor.client.from("Message").insert(row);

  if (error) {
    throw new Error(`${label}: insert failed: ${formatSupabaseError(error)}`);
  }

  assert(true, `${label}: insert succeeded`);
}

async function expectDeniedMessageInsert(label, actor, row) {
  const { error } = await actor.client.from("Message").insert(row);

  assert(error, `${label}: insert unexpectedly succeeded`);
  assert(isDeniedError(error), `${label}: unexpected insert error`);
  deniedWriteAssertionCount += 1;
}

async function assertNoDeniedRows() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT "id"
    FROM public."Message"
    WHERE "id" IN (
      ${sqlString(ids.deniedNonparticipant)},
      ${sqlString(ids.deniedSpoofedHost)}
    )
  `);

  assert(rows.length === 0, "denied message rows were unexpectedly persisted");
}

async function cleanupRealtimeResources() {
  const errors = [];

  const channelResults = await Promise.allSettled(
    subscriptions.map((subscription) =>
      subscription.client.removeChannel(subscription.channel)
    )
  );
  for (const [index, result] of channelResults.entries()) {
    if (result.status === "rejected") {
      errors.push(
        `remove channel ${subscriptions[index].label}: ${errorDetail(
          result.reason
        )}`
      );
    }
  }

  for (const actor of actorList) {
    try {
      await actor.client.auth.signOut();
    } catch (error) {
      errors.push(`${actor.label}: signOut failed: ${errorDetail(error)}`);
    }

    try {
      actor.client.realtime.disconnect();
    } catch (error) {
      errors.push(
        `${actor.label}: realtime disconnect failed: ${errorDetail(error)}`
      );
    }
  }

  return errors;
}

async function runRealtimeProof() {
  await cleanupTaggedData();

  for (const actorDefinition of actorDefinitions) {
    await createActor(actorDefinition);
  }

  await seedPublicRows();

  const hostAllowed = await createMessageSubscription({
    actor: actors.host,
    label: "host_allowed",
    conversationId: ids.conversationAllowed,
  });
  const tenantAAllowed = await createMessageSubscription({
    actor: actors.tenantA,
    label: "tenant_a_allowed",
    conversationId: ids.conversationAllowed,
  });
  const tenantBAllowedWrong = await createMessageSubscription({
    actor: actors.tenantB,
    label: "tenant_b_allowed_wrong",
    conversationId: ids.conversationAllowed,
  });
  const nonparticipantAllowed = await createMessageSubscription({
    actor: actors.nonparticipant,
    label: "nonparticipant_allowed",
    conversationId: ids.conversationAllowed,
  });
  const hostOther = await createMessageSubscription({
    actor: actors.host,
    label: "host_other",
    conversationId: ids.conversationOther,
  });
  const tenantBOther = await createMessageSubscription({
    actor: actors.tenantB,
    label: "tenant_b_other",
    conversationId: ids.conversationOther,
  });
  const tenantAOtherWrong = await createMessageSubscription({
    actor: actors.tenantA,
    label: "tenant_a_other_wrong",
    conversationId: ids.conversationOther,
  });
  const nonparticipantOther = await createMessageSubscription({
    actor: actors.nonparticipant,
    label: "nonparticipant_other",
    conversationId: ids.conversationOther,
  });
  const nonparticipantUnfiltered = await createMessageSubscription({
    actor: actors.nonparticipant,
    label: "nonparticipant_unfiltered",
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      await subscription.waitSubscribed();
      assert(true, `${subscription.label}: subscribed`);
    })
  );

  await insertAllowedMessage("tenant_a allowed conversation message", actors.tenantA, {
    id: ids.messageAllowed,
    senderId: actors.tenantA.id,
    conversationId: ids.conversationAllowed,
    content: `${runTag}: allowed tenant_a message`,
    read: false,
  });
  await Promise.all([
    waitForMessageEvent(
      hostAllowed,
      ids.messageAllowed,
      "host received allowed conversation message"
    ),
    waitForMessageEvent(
      tenantAAllowed,
      ids.messageAllowed,
      "tenant_a received own allowed conversation message"
    ),
  ]);
  await waitForNonDeliveryWindow();
  assertNoMessageEvents(
    tenantBAllowedWrong,
    [ids.messageAllowed],
    "tenant_b did not receive allowed conversation message"
  );
  assertNoMessageEvents(
    nonparticipantAllowed,
    [ids.messageAllowed],
    "nonparticipant filtered subscription did not receive allowed message"
  );
  assertNoMessageEvents(
    nonparticipantUnfiltered,
    [ids.messageAllowed],
    "nonparticipant unfiltered subscription did not receive allowed message"
  );

  await insertAllowedMessage("tenant_b other conversation message", actors.tenantB, {
    id: ids.messageOther,
    senderId: actors.tenantB.id,
    conversationId: ids.conversationOther,
    content: `${runTag}: other tenant_b message`,
    read: false,
  });
  await Promise.all([
    waitForMessageEvent(
      hostOther,
      ids.messageOther,
      "host received other conversation message"
    ),
    waitForMessageEvent(
      tenantBOther,
      ids.messageOther,
      "tenant_b received own other conversation message"
    ),
  ]);
  await waitForNonDeliveryWindow();
  assertNoMessageEvents(
    tenantAOtherWrong,
    [ids.messageOther],
    "tenant_a did not receive other conversation message"
  );
  assertNoMessageEvents(
    nonparticipantOther,
    [ids.messageOther],
    "nonparticipant filtered subscription did not receive other message"
  );
  assertNoMessageEvents(
    nonparticipantUnfiltered,
    [ids.messageOther],
    "nonparticipant unfiltered subscription did not receive other message"
  );

  await expectDeniedMessageInsert(
    "nonparticipant write into allowed conversation",
    actors.nonparticipant,
    {
      id: ids.deniedNonparticipant,
      senderId: actors.nonparticipant.id,
      conversationId: ids.conversationAllowed,
      content: `${runTag}: denied nonparticipant message`,
      read: false,
    }
  );
  await expectDeniedMessageInsert("tenant_a spoofing host senderId", actors.tenantA, {
    id: ids.deniedSpoofedHost,
    senderId: actors.host.id,
    conversationId: ids.conversationAllowed,
    content: `${runTag}: denied spoofed host message`,
    read: false,
  });
  await waitForNonDeliveryWindow();
  assertNoDeniedRows();

  for (const subscription of subscriptions) {
    assertNoMessageEvents(
      subscription,
      [ids.deniedNonparticipant, ids.deniedSpoofedHost],
      `${subscription.label} did not receive denied-write payloads`
    );
  }

  return {
    actorCount: actorList.length,
    subscriptionCount: subscriptions.length,
    insertedAllowedMessages: 2,
    deniedWrites: deniedWriteAssertionCount,
    deliveryAssertions: deliveryAssertionCount,
    nonDeliveryAssertions: nonDeliveryAssertionCount,
    assertions: assertionCount,
  };
}

let summary;
let caughtError = null;
const cleanupErrors = [];

try {
  summary = await runRealtimeProof();
} catch (error) {
  caughtError = error;
} finally {
  cleanupErrors.push(...(await cleanupRealtimeResources()));

  try {
    await cleanupTaggedData();
  } catch (error) {
    cleanupErrors.push(`tagged data cleanup failed: ${errorDetail(error)}`);
  }

  await prisma.$disconnect();
}

if (caughtError || cleanupErrors.length > 0) {
  fail(
    "LOCAL_REALTIME_PROOF_VERIFY_FAILED",
    "Local Supabase Realtime proof verification failed.",
    [
      caughtError ? errorDetail(caughtError) : null,
      ...cleanupErrors,
    ].filter(Boolean).map(sanitizeVerifierDetail)
  );
}

console.log("supabase-rls-proof realtime verify summary:");
console.log(`- local Auth actors: ${summary.actorCount} users (credentials redacted)`);
console.log(`- Message subscriptions: ${summary.subscriptionCount}`);
console.log(`- allowed Message inserts: ${summary.insertedAllowedMessages}`);
console.log(`- denied Message writes: ${summary.deniedWrites}`);
console.log(`- delivery assertions passed: ${summary.deliveryAssertions}`);
console.log(`- non-delivery assertions passed: ${summary.nonDeliveryAssertions}`);
console.log(`- total assertions passed: ${summary.assertions}`);
info("local Realtime proof verified.");
