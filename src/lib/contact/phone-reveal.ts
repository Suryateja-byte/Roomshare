import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { prisma } from "@/lib/prisma";
import { features } from "@/lib/env";
import { evaluateListingContactable } from "@/lib/messaging/listing-contactable";
import { HOST_NOT_ACCEPTING_CONTACT_MESSAGE } from "@/lib/contact/contact-attempts";
import { consumeContactEntitlement } from "@/lib/payments/contact-paywall";

type PhoneRevealClient = Pick<
  typeof prisma,
  | "listing"
  | "physicalUnit"
  | "blockedUser"
  | "contactConsumption"
  | "entitlementGrant"
  | "entitlementState"
  | "$queryRaw"
  | "$executeRaw"
>;

type PhoneRevealOutcome = "REVEALED" | "DENIED" | "UNAVAILABLE" | "ERROR";

interface HostContactChannelRow {
  phoneE164Ciphertext: string | null;
  phoneE164Last4: string | null;
}

export const PHONE_REVEAL_UNAVAILABLE_MESSAGE =
  "Phone reveal is unavailable right now.";

function resolvePhoneRevealKey(explicitKey?: string | null): Buffer | null {
  const raw = explicitKey ?? process.env.PHONE_REVEAL_ENCRYPTION_KEY;
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const base64 = Buffer.from(trimmed, "base64");
  if (base64.length === 32) {
    return base64;
  }

  return createHash("sha256").update(trimmed).digest();
}

export function encryptPhoneForReveal(
  phoneE164: string,
  keyValue?: string | null
): string {
  const key = resolvePhoneRevealKey(keyValue);
  if (!key) {
    throw new Error("PHONE_REVEAL_ENCRYPTION_KEY is required");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(phoneE164, "utf8"),
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

export function decryptPhoneForReveal(ciphertextValue: string): string | null {
  const key = resolvePhoneRevealKey();
  if (!key) {
    return null;
  }

  const [version, ivText, tagText, ciphertextText] = ciphertextValue.split(":");
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
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

async function recordPhoneRevealAudit(
  client: Pick<typeof prisma, "$executeRaw">,
  input: {
    userId: string;
    listingId: string;
    unitId?: string | null;
    unitIdentityEpoch?: number | null;
    hostUserId?: string | null;
    outcome: PhoneRevealOutcome;
    reasonCode?: string | null;
    clientIdempotencyKey?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  }
) {
  const metadataJson = JSON.stringify(input.metadata ?? {});

  await client.$executeRaw`
    INSERT INTO phone_reveal_audits (
      id, user_id, listing_id, unit_id, unit_identity_epoch, host_user_id,
      outcome, reason_code, client_idempotency_key, metadata, created_at
    ) VALUES (
      ${randomUUID()},
      ${input.userId},
      ${input.listingId},
      ${input.unitId ?? null},
      ${input.unitIdentityEpoch ?? null},
      ${input.hostUserId ?? null},
      ${input.outcome},
      ${input.reasonCode ?? null},
      ${input.clientIdempotencyKey ?? null},
      ${metadataJson}::jsonb,
      NOW()
    )
    ON CONFLICT (user_id, listing_id, client_idempotency_key) DO UPDATE SET
      unit_id = EXCLUDED.unit_id,
      unit_identity_epoch = EXCLUDED.unit_identity_epoch,
      host_user_id = EXCLUDED.host_user_id,
      outcome = EXCLUDED.outcome,
      reason_code = EXCLUDED.reason_code,
      metadata = EXCLUDED.metadata
  `;
}

async function loadRevealablePhone(
  client: PhoneRevealClient,
  hostUserId: string
) {
  const rows = await client.$queryRaw<HostContactChannelRow[]>`
    SELECT
      phone_e164_ciphertext AS "phoneE164Ciphertext",
      phone_e164_last4 AS "phoneE164Last4"
    FROM host_contact_channels
    WHERE host_user_id = ${hostUserId}
      AND phone_reveal_enabled = true
      AND verified_at IS NOT NULL
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function revealHostPhoneForListing(
  input: {
    viewerUserId: string;
    listingId: string;
    clientIdempotencyKey?: string | null;
    unitIdentityEpochObserved?: number | null;
  },
  client: PhoneRevealClient = prisma
) {
  if (features.disablePhoneReveal) {
    return {
      ok: false as const,
      status: 503,
      code: "PHONE_REVEAL_DISABLED",
      error: PHONE_REVEAL_UNAVAILABLE_MESSAGE,
    };
  }

  const listing = await client.listing.findUnique({
    where: { id: input.listingId },
    select: {
      ownerId: true,
      status: true,
      statusReason: true,
      needsMigrationReview: true,
      availabilitySource: true,
      availableSlots: true,
      totalSlots: true,
      openSlots: true,
      moveInDate: true,
      availableUntil: true,
      minStayMonths: true,
      lastConfirmedAt: true,
      physicalUnitId: true,
      owner: {
        select: {
          isSuspended: true,
        },
      },
    },
  });

  const contactable = evaluateListingContactable(listing);
  if (!contactable.ok) {
    return {
      ok: false as const,
      status: contactable.code === "MODERATION_LOCKED" ? 423 : 404,
      code: contactable.code,
      error:
        contactable.code === "MODERATION_LOCKED"
          ? contactable.message
          : PHONE_REVEAL_UNAVAILABLE_MESSAGE,
    };
  }

  const revealListing = contactable.listing;
  if (revealListing.ownerId === input.viewerUserId) {
    return {
      ok: false as const,
      status: 403,
      code: "OWNER_VIEW",
      error: PHONE_REVEAL_UNAVAILABLE_MESSAGE,
    };
  }

  let unitIdentityEpoch: number | null = null;
  if (input.unitIdentityEpochObserved && revealListing.physicalUnitId) {
    const unit = await client.physicalUnit.findUnique({
      where: { id: revealListing.physicalUnitId },
      select: { unitIdentityEpoch: true },
    });
    if (!unit || unit.unitIdentityEpoch !== input.unitIdentityEpochObserved) {
      await recordPhoneRevealAudit(client, {
        userId: input.viewerUserId,
        listingId: input.listingId,
        unitId: revealListing.physicalUnitId,
        unitIdentityEpoch: unit?.unitIdentityEpoch ?? null,
        hostUserId: revealListing.ownerId,
        outcome: "DENIED",
        reasonCode: "UNIT_EPOCH_STALE",
        clientIdempotencyKey: input.clientIdempotencyKey,
      });
      return {
        ok: false as const,
        status: 409,
        code: "UNIT_EPOCH_STALE",
        error: "Please refresh this listing before revealing the phone number.",
      };
    }
    unitIdentityEpoch = unit.unitIdentityEpoch;
  }

  if (revealListing.owner?.isSuspended) {
    await recordPhoneRevealAudit(client, {
      userId: input.viewerUserId,
      listingId: input.listingId,
      unitId: revealListing.physicalUnitId,
      unitIdentityEpoch,
      hostUserId: revealListing.ownerId,
      outcome: "DENIED",
      reasonCode: "HOST_NOT_ACCEPTING_CONTACT",
      clientIdempotencyKey: input.clientIdempotencyKey,
    });
    return {
      ok: false as const,
      status: 423,
      code: "HOST_NOT_ACCEPTING_CONTACT",
      error: HOST_NOT_ACCEPTING_CONTACT_MESSAGE,
    };
  }

  const block = await client.blockedUser.findFirst({
    where: {
      OR: [
        {
          blockerId: input.viewerUserId,
          blockedId: revealListing.ownerId,
        },
        {
          blockerId: revealListing.ownerId,
          blockedId: input.viewerUserId,
        },
      ],
    },
    select: { id: true },
  });

  if (block) {
    await recordPhoneRevealAudit(client, {
      userId: input.viewerUserId,
      listingId: input.listingId,
      unitId: revealListing.physicalUnitId,
      unitIdentityEpoch,
      hostUserId: revealListing.ownerId,
      outcome: "DENIED",
      reasonCode: "HOST_NOT_ACCEPTING_CONTACT",
      clientIdempotencyKey: input.clientIdempotencyKey,
    });
    return {
      ok: false as const,
      status: 423,
      code: "HOST_NOT_ACCEPTING_CONTACT",
      error: HOST_NOT_ACCEPTING_CONTACT_MESSAGE,
    };
  }

  const consumption = await consumeContactEntitlement(client as never, {
    userId: input.viewerUserId,
    listingId: input.listingId,
    physicalUnitId: revealListing.physicalUnitId,
    clientIdempotencyKey: input.clientIdempotencyKey,
    contactKind: "REVEAL_PHONE",
  });

  if (!consumption.ok) {
    await recordPhoneRevealAudit(client, {
      userId: input.viewerUserId,
      listingId: input.listingId,
      unitId: consumption.unitId,
      unitIdentityEpoch: consumption.unitIdentityEpoch,
      hostUserId: revealListing.ownerId,
      outcome: "DENIED",
      reasonCode: consumption.code,
      clientIdempotencyKey: input.clientIdempotencyKey,
    });
    return {
      ok: false as const,
      status: consumption.code === "PAYWALL_REQUIRED" ? 402 : 503,
      code: consumption.code,
      error: consumption.message,
    };
  }

  const channel = await loadRevealablePhone(client, revealListing.ownerId);
  if (!channel?.phoneE164Ciphertext) {
    await recordPhoneRevealAudit(client, {
      userId: input.viewerUserId,
      listingId: input.listingId,
      unitId: revealListing.physicalUnitId,
      unitIdentityEpoch,
      hostUserId: revealListing.ownerId,
      outcome: "UNAVAILABLE",
      reasonCode: "NO_REVEALABLE_PHONE",
      clientIdempotencyKey: input.clientIdempotencyKey,
    });
    return {
      ok: false as const,
      status: 404,
      code: "NO_REVEALABLE_PHONE",
      error: PHONE_REVEAL_UNAVAILABLE_MESSAGE,
    };
  }

  const phoneNumber = decryptPhoneForReveal(channel.phoneE164Ciphertext);
  if (!phoneNumber) {
    await recordPhoneRevealAudit(client, {
      userId: input.viewerUserId,
      listingId: input.listingId,
      unitId: revealListing.physicalUnitId,
      unitIdentityEpoch,
      hostUserId: revealListing.ownerId,
      outcome: "ERROR",
      reasonCode: "PHONE_REVEAL_DEPENDENCY_UNAVAILABLE",
      clientIdempotencyKey: input.clientIdempotencyKey,
    });
    return {
      ok: false as const,
      status: 503,
      code: "PHONE_REVEAL_DEPENDENCY_UNAVAILABLE",
      error: PHONE_REVEAL_UNAVAILABLE_MESSAGE,
    };
  }

  await recordPhoneRevealAudit(client, {
    userId: input.viewerUserId,
    listingId: input.listingId,
    unitId: revealListing.physicalUnitId,
    unitIdentityEpoch,
    hostUserId: revealListing.ownerId,
    outcome: "REVEALED",
    clientIdempotencyKey: input.clientIdempotencyKey,
    metadata: {
      phoneLast4Present: !!channel.phoneE164Last4,
    },
  });

  return {
    ok: true as const,
    phoneNumber,
    phoneLast4: channel.phoneE164Last4,
  };
}
