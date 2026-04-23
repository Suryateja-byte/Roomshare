import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

type ExecuteRawClient = Pick<typeof prisma, "$executeRaw">;

export const MESSAGE_START_CONTACT_KIND = "MESSAGE_START";
export const HOST_NOT_ACCEPTING_CONTACT_MESSAGE =
  "This host is not accepting contact right now.";

export type ContactAttemptOutcome =
  | "SUCCEEDED"
  | "EXISTING_CONVERSATION"
  | "RESURRECTED_CONVERSATION"
  | "PAYWALL_REQUIRED"
  | "PAYWALL_UNAVAILABLE"
  | "UNIT_EPOCH_STALE";

const PII_DETAIL_KEY_PATTERN =
  /^(email|phone|phoneNumber|address|streetAddress|postalAddress|message|content)$/i;

function sanitizeMetadata(
  metadata: Record<string, string | number | boolean | null> | undefined
) {
  if (!metadata) {
    return {};
  }

  for (const key of Object.keys(metadata)) {
    if (PII_DETAIL_KEY_PATTERN.test(key)) {
      throw new Error(`PII-like contact attempt metadata key is not allowed: ${key}`);
    }
  }

  return metadata;
}

export async function recordContactAttempt(
  client: ExecuteRawClient,
  input: {
    userId: string;
    listingId: string;
    unitId?: string | null;
    unitIdentityEpochObserved?: number | null;
    unitIdentityEpochResolved?: number | null;
    contactKind?: string;
    outcome: ContactAttemptOutcome;
    clientIdempotencyKey?: string | null;
    conversationId?: string | null;
    reasonCode?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  }
) {
  const metadataJson = JSON.stringify(sanitizeMetadata(input.metadata));

  await client.$executeRaw`
    INSERT INTO contact_attempts (
      id, user_id, listing_id, unit_id,
      unit_identity_epoch_observed, unit_identity_epoch_resolved,
      contact_kind, outcome, client_idempotency_key, conversation_id,
      reason_code, metadata, created_at
    ) VALUES (
      ${randomUUID()},
      ${input.userId},
      ${input.listingId},
      ${input.unitId ?? null},
      ${input.unitIdentityEpochObserved ?? null},
      ${input.unitIdentityEpochResolved ?? null},
      ${input.contactKind ?? MESSAGE_START_CONTACT_KIND},
      ${input.outcome},
      ${input.clientIdempotencyKey ?? null},
      ${input.conversationId ?? null},
      ${input.reasonCode ?? null},
      ${metadataJson}::jsonb,
      NOW()
    )
    ON CONFLICT (user_id, client_idempotency_key, contact_kind) DO UPDATE SET
      unit_id = EXCLUDED.unit_id,
      unit_identity_epoch_observed = EXCLUDED.unit_identity_epoch_observed,
      unit_identity_epoch_resolved = EXCLUDED.unit_identity_epoch_resolved,
      outcome = EXCLUDED.outcome,
      conversation_id = COALESCE(EXCLUDED.conversation_id, contact_attempts.conversation_id),
      reason_code = EXCLUDED.reason_code,
      metadata = EXCLUDED.metadata
  `;
}
