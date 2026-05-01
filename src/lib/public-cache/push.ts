import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "crypto";
import webpush, { type PushSubscription } from "web-push";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { features } from "@/lib/env";
import { logger } from "@/lib/logger";
import { buildPublicCacheInvalidationEvent } from "@/lib/public-cache/events";

const MAX_FANOUT_ATTEMPTS = 5;
const FANOUT_CLAIM_LEASE_MS = 10 * 60 * 1000;

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256),
  }),
});

export type PublicCachePushSubscriptionInput = z.infer<
  typeof PushSubscriptionSchema
>;

interface PushSubscriptionRow {
  id: string;
  endpoint_hash: string;
  subscription_ciphertext: string;
}

interface CacheInvalidationFanoutRow {
  id: string;
  unit_id: string;
  projection_epoch: bigint | number | string;
  unit_identity_epoch: number;
  reason: string;
  enqueued_at: Date;
  fanout_attempt_count: number;
  fanout_claimed_at: Date;
}

export interface PublicCacheFanoutResult {
  processed: number;
  delivered: number;
  skipped: number;
  failed: number;
}

function getRawPublicCacheVapidPublicKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_PUBLIC_CACHE_VAPID_KEY ||
    process.env.PUBLIC_CACHE_VAPID_PUBLIC_KEY ||
    null
  );
}

function getPushEncryptionKey(): Buffer | null {
  const raw = process.env.PUBLIC_CACHE_PUSH_ENCRYPTION_KEY;
  if (!raw) {
    return null;
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) {
    return decoded;
  }

  const utf8 = Buffer.from(raw, "utf8");
  return utf8.length === 32 ? utf8 : null;
}

export function getPublicCacheVapidPublicKey(): string | null {
  if (!features.publicCacheCoherence || features.disablePublicCachePush) {
    return null;
  }

  const publicKey = getRawPublicCacheVapidPublicKey();
  if (
    !publicKey ||
    !process.env.PUBLIC_CACHE_VAPID_PRIVATE_KEY ||
    !process.env.PUBLIC_CACHE_VAPID_SUBJECT ||
    !getPushEncryptionKey()
  ) {
    return null;
  }

  return publicKey;
}

function getPushConfig():
  | {
      publicKey: string;
      privateKey: string;
      subject: string;
      encryptionKey: Buffer;
    }
  | null {
  const publicKey = getPublicCacheVapidPublicKey();
  const privateKey = process.env.PUBLIC_CACHE_VAPID_PRIVATE_KEY;
  const subject = process.env.PUBLIC_CACHE_VAPID_SUBJECT;
  const encryptionKey = getPushEncryptionKey();

  if (!publicKey || !privateKey || !subject || !encryptionKey) {
    return null;
  }

  return { publicKey, privateKey, subject, encryptionKey };
}

function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function encryptSubscription(
  subscription: PublicCachePushSubscriptionInput,
  key: Buffer
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(subscription), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

function decryptSubscription(
  value: string,
  key: Buffer
): PublicCachePushSubscriptionInput | null {
  const [version, ivText, tagText, ciphertextText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivText, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return PushSubscriptionSchema.parse(JSON.parse(plaintext));
  } catch {
    return null;
  }
}

export async function upsertPublicCachePushSubscription(input: {
  subscription: unknown;
  userId?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const config = getPushConfig();
  if (!config) {
    return { ok: false, reason: "push_not_configured" };
  }

  const subscription = PushSubscriptionSchema.safeParse(input.subscription);
  if (!subscription.success) {
    return { ok: false, reason: "invalid_subscription" };
  }

  const hash = endpointHash(subscription.data.endpoint);
  const ciphertext = encryptSubscription(subscription.data, config.encryptionKey);

  await prisma.$executeRaw`
    INSERT INTO public_cache_push_subscriptions (
      id, user_id, endpoint_hash, subscription_ciphertext,
      subscription_ciphertext_version, active, disabled_reason, last_seen_at,
      created_at, updated_at
    )
    VALUES (
      ${randomUUID()},
      ${input.userId ?? null},
      ${hash},
      ${ciphertext},
      'v1',
      true,
      NULL,
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (endpoint_hash) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      subscription_ciphertext = EXCLUDED.subscription_ciphertext,
      subscription_ciphertext_version = 'v1',
      active = true,
      disabled_reason = NULL,
      last_seen_at = NOW(),
      updated_at = NOW()
  `;

  return { ok: true };
}

export async function deactivatePublicCachePushSubscription(input: {
  endpoint?: unknown;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof input.endpoint !== "string" || input.endpoint.length === 0) {
    return { ok: false, reason: "invalid_subscription" };
  }

  await prisma.$executeRaw`
    UPDATE public_cache_push_subscriptions
    SET active = false,
        disabled_reason = 'client_unsubscribed',
        updated_at = NOW()
    WHERE endpoint_hash = ${endpointHash(input.endpoint)}
  `;

  return { ok: true };
}

function retryDelayMs(attemptCount: number): number {
  const baseMs = 30_000;
  const maxMs = 10 * 60 * 1000;
  return Math.min(baseMs * Math.pow(2, attemptCount), maxMs);
}

function isGonePushError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: unknown })?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

function safePushError(error: unknown): string {
  const statusCode = (error as { statusCode?: unknown })?.statusCode;
  if (typeof statusCode === "number") {
    return `web_push_status_${statusCode}`;
  }
  return error instanceof Error ? error.name : "web_push_error";
}

async function markClaimedRowsSkipped(
  rows: CacheInvalidationFanoutRow[],
  reason: string
): Promise<number> {
  let skipped = 0;
  for (const row of rows) {
    const updated = await prisma.$executeRaw`
      UPDATE cache_invalidations
      SET fanout_status = 'SKIPPED',
          fanout_completed_at = NOW(),
          fanout_last_error = ${reason}
      WHERE id = ${row.id}
        AND fanout_status = 'PENDING'
        AND fanout_last_attempt_at = ${row.fanout_claimed_at}
    `;
    if (updated > 0) skipped += 1;
  }
  return skipped;
}

export async function drainPublicCacheFanoutOnce(
  limit = 20
): Promise<PublicCacheFanoutResult> {
  if (!features.publicCacheCoherence || features.disablePublicCachePush) {
    return { processed: 0, delivered: 0, skipped: 0, failed: 0 };
  }

  const claimLimit = Math.min(Math.max(limit, 1), 100);
  const rows = await prisma.$queryRaw<CacheInvalidationFanoutRow[]>`
    WITH due AS (
      SELECT id
      FROM cache_invalidations
      WHERE fanout_status = 'PENDING'
        AND fanout_next_attempt_at <= NOW()
      ORDER BY fanout_next_attempt_at ASC, enqueued_at ASC
      LIMIT ${claimLimit}
      FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
      UPDATE cache_invalidations ci
      SET fanout_last_attempt_at = NOW(),
          fanout_next_attempt_at = NOW() + (${FANOUT_CLAIM_LEASE_MS} * INTERVAL '1 millisecond')
      FROM due
      WHERE ci.id = due.id
      RETURNING
        ci.id,
        ci.unit_id,
        ci.projection_epoch,
        ci.unit_identity_epoch,
        ci.reason,
        ci.enqueued_at,
        ci.fanout_attempt_count,
        ci.fanout_last_attempt_at AS fanout_claimed_at
    )
    SELECT id, unit_id, projection_epoch, unit_identity_epoch, reason,
           enqueued_at, fanout_attempt_count, fanout_claimed_at
    FROM claimed
  `;

  if (rows.length === 0) {
    return { processed: 0, delivered: 0, skipped: 0, failed: 0 };
  }

  const config = getPushConfig();
  if (!config) {
    const skipped = await markClaimedRowsSkipped(rows, "push_not_configured");
    return { processed: rows.length, delivered: 0, skipped, failed: 0 };
  }

  webpush.setVapidDetails(
    config.subject,
    config.publicKey,
    config.privateKey
  );

  const subscriptions = await prisma.$queryRaw<PushSubscriptionRow[]>`
    SELECT id, endpoint_hash, subscription_ciphertext
    FROM public_cache_push_subscriptions
    WHERE active = true
    ORDER BY last_seen_at DESC
    LIMIT 500
  `;

  if (subscriptions.length === 0) {
    const skipped = await markClaimedRowsSkipped(rows, "no_active_subscriptions");
    return { processed: rows.length, delivered: 0, skipped, failed: 0 };
  }

  let delivered = 0;
  let failed = 0;

  for (const row of rows) {
    const event = buildPublicCacheInvalidationEvent(row);
    const payload = JSON.stringify(event);
    let transientFailures = 0;
    let lastTransientError = "transient_push_failure";

    for (const subscriptionRow of subscriptions) {
      const subscription = decryptSubscription(
        subscriptionRow.subscription_ciphertext,
        config.encryptionKey
      );
      if (!subscription) {
        await prisma.$executeRaw`
          UPDATE public_cache_push_subscriptions
          SET active = false,
              disabled_reason = 'decrypt_failed',
              last_failed_at = NOW(),
              updated_at = NOW()
          WHERE id = ${subscriptionRow.id}
        `;
        continue;
      }

      try {
        await webpush.sendNotification(
          subscription as PushSubscription,
          payload,
          { TTL: 60 }
        );
        await prisma.$executeRaw`
          UPDATE public_cache_push_subscriptions
          SET last_delivered_at = NOW(),
              updated_at = NOW()
          WHERE id = ${subscriptionRow.id}
        `;
      } catch (error) {
        if (isGonePushError(error)) {
          await prisma.$executeRaw`
            UPDATE public_cache_push_subscriptions
            SET active = false,
                disabled_reason = 'endpoint_gone',
                last_failed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${subscriptionRow.id}
          `;
        } else {
          transientFailures += 1;
          lastTransientError = safePushError(error);
          await prisma.$executeRaw`
            UPDATE public_cache_push_subscriptions
            SET last_failed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${subscriptionRow.id}
          `;
        }
      }
    }

    if (transientFailures === 0) {
      const updatedCount = await prisma.$executeRaw`
        UPDATE cache_invalidations
        SET fanout_status = 'DELIVERED',
            fanout_completed_at = NOW(),
            fanout_last_attempt_at = NOW(),
            fanout_last_error = NULL
        WHERE id = ${row.id}
          AND fanout_status = 'PENDING'
          AND fanout_last_attempt_at = ${row.fanout_claimed_at}
      `;
      if (updatedCount > 0) delivered += 1;
      continue;
    }

    const nextAttemptCount = Number(row.fanout_attempt_count) + 1;
    if (nextAttemptCount >= MAX_FANOUT_ATTEMPTS) {
      const updatedCount = await prisma.$executeRaw`
        UPDATE cache_invalidations
        SET fanout_status = 'FAILED',
            fanout_last_attempt_at = NOW(),
            fanout_attempt_count = ${nextAttemptCount},
            fanout_completed_at = NOW(),
            fanout_last_error = ${`max_attempts_exhausted:${lastTransientError}`}
        WHERE id = ${row.id}
          AND fanout_status = 'PENDING'
          AND fanout_last_attempt_at = ${row.fanout_claimed_at}
      `;
      if (updatedCount > 0) failed += 1;
    } else {
      const updatedCount = await prisma.$executeRaw`
        UPDATE cache_invalidations
        SET fanout_attempt_count = ${nextAttemptCount},
            fanout_last_attempt_at = NOW(),
            fanout_next_attempt_at = NOW() + (${retryDelayMs(nextAttemptCount)} * INTERVAL '1 millisecond'),
            fanout_last_error = ${lastTransientError}
        WHERE id = ${row.id}
          AND fanout_status = 'PENDING'
          AND fanout_last_attempt_at = ${row.fanout_claimed_at}
      `;
      if (updatedCount > 0) failed += 1;
    }
  }

  if (failed > 0) {
    logger.sync.warn("public_cache_push_fanout_partial_failure", {
      processed: rows.length,
      failed,
    });
  }

  return { processed: rows.length, delivered, skipped: 0, failed };
}
