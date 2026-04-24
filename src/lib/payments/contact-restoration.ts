import "server-only";

import type {
  ContactConsumptionSource,
  ContactRestorationReason,
  ContactRestorationState,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit/events";
import { features } from "@/lib/env";
import {
  resolvePublicListingVisibilityState,
  type PublicContactListingInput,
} from "@/lib/listings/public-contact-contract";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { recomputeEntitlementState } from "@/lib/payments/entitlement-state";
import {
  recordBanRestoreApplied,
  recordContactRestorationApplied,
  recordContactRestorationReplayIgnored,
  recordGhostSlaRestoreApplied,
  recordHostBounceRestoreApplied,
  recordMassDeactivationRestoreApplied,
} from "@/lib/payments/telemetry";

type ListingSnapshot = Pick<
  PublicContactListingInput,
  | "ownerId"
  | "status"
  | "statusReason"
  | "availableSlots"
  | "totalSlots"
  | "openSlots"
  | "moveInDate"
  | "availableUntil"
  | "minStayMonths"
  | "lastConfirmedAt"
> & {
  id: string;
  updatedAt: Date;
};

const RESTORABLE_SOURCES: ContactConsumptionSource[] = ["FREE", "PACK"];
const RESTORATION_WINDOW_MS = 48 * 60 * 60 * 1000;

const RESTORATION_STATE_BY_REASON: Record<
  ContactRestorationReason,
  ContactRestorationState
> = {
  HOST_BOUNCE: "RESTORED_HOST_BOUNCE",
  HOST_BAN: "RESTORED_HOST_BAN",
  HOST_MASS_DEACTIVATED: "RESTORED_HOST_MASS_DEACTIVATED",
  HOST_GHOST_SLA: "RESTORED_HOST_GHOST_SLA",
  SUPPORT: "RESTORED_SUPPORT",
};

function isReplayError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function buildRestorationState(reason: ContactRestorationReason) {
  return RESTORATION_STATE_BY_REASON[reason];
}

function toListingSnapshotMap(listings: ListingSnapshot[]) {
  return new Map(listings.map((listing) => [listing.id, listing]));
}

function isCurrentlyPublic(listing: ListingSnapshot): boolean {
  return resolvePublicListingVisibilityState(listing).isPubliclyVisible;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => !!value)));
}

async function loadCandidateConsumptions(input: {
  now: Date;
  requireConversation?: boolean;
  eligibleBeforeNow?: boolean;
  listingIds?: string[];
}) {
  return prisma.contactConsumption.findMany({
    where: {
      contactKind: "MESSAGE_START",
      source: { in: RESTORABLE_SOURCES },
      restorationState: "NONE",
      conversationId: input.requireConversation ? { not: null } : undefined,
      restorationEligibleUntil:
        input.eligibleBeforeNow === true
          ? { lte: input.now }
          : { gt: input.now },
      listingId: input.listingIds ? { in: input.listingIds } : undefined,
    },
    select: {
      id: true,
      userId: true,
      listingId: true,
      conversationId: true,
      source: true,
      consumedAt: true,
      restorationEligibleUntil: true,
    },
  });
}

async function loadListings(listingIds: string[]) {
  if (listingIds.length === 0) {
    return [];
  }

  return prisma.listing.findMany({
    where: { id: { in: listingIds } },
    select: {
      id: true,
      ownerId: true,
      status: true,
      statusReason: true,
      availableSlots: true,
      totalSlots: true,
      openSlots: true,
      moveInDate: true,
      availableUntil: true,
      minStayMonths: true,
      lastConfirmedAt: true,
      updatedAt: true,
    },
  });
}

async function applyContactRestoration(input: {
  contactConsumptionId: string;
  userId: string;
  reason: ContactRestorationReason;
  details: Record<string, string | number | boolean | null>;
}) {
  try {
    const applied = await prisma.$transaction(async (tx) => {
      const updated = await tx.contactConsumption.updateMany({
        where: {
          id: input.contactConsumptionId,
          restorationState: "NONE",
        },
        data: {
          restorationState: buildRestorationState(input.reason),
        },
      });

      if (updated.count === 0) {
        return false;
      }

      await tx.contactRestoration.create({
        data: {
          contactConsumptionId: input.contactConsumptionId,
          userId: input.userId,
          reason: input.reason,
          details: input.details,
        },
      });

      await recordAuditEvent(tx, {
        kind: "ENTITLEMENT_RESTORED",
        actor: { role: "system", id: null },
        aggregateType: "entitlement_grants",
        aggregateId: input.contactConsumptionId,
        details: {
          reason: input.reason,
          userId: input.userId,
        },
      });

      if (features.entitlementState) {
        await recomputeEntitlementState(tx, input.userId);
      }

      return true;
    });

    if (!applied) {
      recordContactRestorationReplayIgnored({
        userId: input.userId,
        contactConsumptionId: input.contactConsumptionId,
        reason: input.reason,
      });
      return { applied: false };
    }

    recordContactRestorationApplied({
      userId: input.userId,
      contactConsumptionId: input.contactConsumptionId,
      reason: input.reason,
    });

    if (input.reason === "HOST_BOUNCE") {
      recordHostBounceRestoreApplied({
        userId: input.userId,
        contactConsumptionId: input.contactConsumptionId,
      });
    } else if (input.reason === "HOST_BAN") {
      recordBanRestoreApplied({
        userId: input.userId,
        contactConsumptionId: input.contactConsumptionId,
      });
    } else if (input.reason === "HOST_GHOST_SLA") {
      recordGhostSlaRestoreApplied({
        userId: input.userId,
        contactConsumptionId: input.contactConsumptionId,
      });
    } else if (input.reason === "HOST_MASS_DEACTIVATED") {
      recordMassDeactivationRestoreApplied({
        userId: input.userId,
        contactConsumptionId: input.contactConsumptionId,
      });
    }

    return { applied: true };
  } catch (error) {
    if (isReplayError(error)) {
      recordContactRestorationReplayIgnored({
        userId: input.userId,
        contactConsumptionId: input.contactConsumptionId,
        reason: input.reason,
      });
      return { applied: false };
    }

    throw error;
  }
}

export function buildRestorationEligibleUntil(consumedAt: Date = new Date()) {
  return new Date(consumedAt.getTime() + RESTORATION_WINDOW_MS);
}

export async function restoreConsumptionsForHostBounce(input: {
  listingId: string;
  hostUserId?: string | null;
}) {
  const candidates = await loadCandidateConsumptions({
    now: new Date(),
    listingIds: [input.listingId],
  });

  let restored = 0;
  for (const candidate of candidates) {
    const result = await applyContactRestoration({
      contactConsumptionId: candidate.id,
      userId: candidate.userId,
      reason: "HOST_BOUNCE",
      details: {
        listingId: candidate.listingId,
        hostUserId: input.hostUserId ?? null,
      },
    });
    if (result.applied) {
      restored += 1;
    }
  }

  return { restored };
}

export async function restoreContactConsumptionBySupport(input: {
  contactConsumptionId: string;
  supportActorId: string;
  reasonCode?: string | null;
}) {
  const consumption = await prisma.contactConsumption.findUnique({
    where: { id: input.contactConsumptionId },
    select: {
      id: true,
      userId: true,
      listingId: true,
      source: true,
      restorationState: true,
    },
  });

  if (
    !consumption ||
    !RESTORABLE_SOURCES.includes(consumption.source) ||
    consumption.restorationState !== "NONE"
  ) {
    return { restored: 0 };
  }

  const result = await applyContactRestoration({
    contactConsumptionId: consumption.id,
    userId: consumption.userId,
    reason: "SUPPORT",
    details: {
      listingId: consumption.listingId,
      supportActorId: input.supportActorId,
      reasonCode: input.reasonCode ?? null,
    },
  });

  return { restored: result.applied ? 1 : 0 };
}

export async function restoreConsumptionsForHostBan(hostUserId: string) {
  const hostListings = await prisma.listing.findMany({
    where: { ownerId: hostUserId },
    select: { id: true },
  });

  const listingIds = hostListings.map((listing) => listing.id);
  if (listingIds.length === 0) {
    return { restored: 0 };
  }

  const candidates = await loadCandidateConsumptions({
    now: new Date(),
    listingIds,
  });

  let restored = 0;
  for (const candidate of candidates) {
    const result = await applyContactRestoration({
      contactConsumptionId: candidate.id,
      userId: candidate.userId,
      reason: "HOST_BAN",
      details: {
        hostUserId,
        listingId: candidate.listingId,
      },
    });
    if (result.applied) {
      restored += 1;
    }
  }

  return { restored };
}

export async function runGhostSlaRestoration() {
  const now = new Date();
  const candidates = await loadCandidateConsumptions({
    now,
    requireConversation: true,
    eligibleBeforeNow: true,
  });

  if (candidates.length === 0) {
    return { restored: 0 };
  }

  const listings = await loadListings(uniqueStrings(candidates.map((candidate) => candidate.listingId)));
  const listingsById = toListingSnapshotMap(listings);
  const conversationIds = uniqueStrings(
    candidates.map((candidate) => candidate.conversationId)
  );
  const messages = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      deletedAt: null,
    },
    select: {
      conversationId: true,
      senderId: true,
      read: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const messagesByConversation = new Map<
    string,
    Array<{
      senderId: string;
      read: boolean;
      createdAt: Date;
    }>
  >();

  for (const message of messages) {
    const existing = messagesByConversation.get(message.conversationId) ?? [];
    existing.push({
      senderId: message.senderId,
      read: message.read,
      createdAt: message.createdAt,
    });
    messagesByConversation.set(message.conversationId, existing);
  }

  let restored = 0;

  for (const candidate of candidates) {
    const listing = listingsById.get(candidate.listingId);
    if (!listing || !candidate.conversationId) {
      continue;
    }

    const conversationMessages =
      messagesByConversation.get(candidate.conversationId) ?? [];
    const hostReplied = conversationMessages.some(
      (message) =>
        message.senderId === listing.ownerId &&
        message.createdAt.getTime() >= candidate.consumedAt.getTime()
    );
    const hostMarkedRead = conversationMessages.some(
      (message) =>
        message.senderId === candidate.userId &&
        message.read &&
        message.createdAt.getTime() >= candidate.consumedAt.getTime()
    );

    if (hostReplied || hostMarkedRead) {
      continue;
    }

    const result = await applyContactRestoration({
      contactConsumptionId: candidate.id,
      userId: candidate.userId,
      reason: "HOST_GHOST_SLA",
      details: {
        listingId: candidate.listingId,
        hostUserId: listing.ownerId ?? null,
      },
    });
    if (result.applied) {
      restored += 1;
    }
  }

  return { restored };
}

export async function runMassDeactivationRestoration() {
  const now = new Date();
  const candidates = await loadCandidateConsumptions({
    now,
    eligibleBeforeNow: false,
  });

  if (candidates.length === 0) {
    return { restored: 0 };
  }

  const contactedListings = await loadListings(
    uniqueStrings(candidates.map((candidate) => candidate.listingId))
  );
  const contactedListingsById = toListingSnapshotMap(contactedListings);
  const ownerIds = uniqueStrings(
    contactedListings.map((listing) => listing.ownerId ?? null)
  );
  const ownerListings = ownerIds.length
    ? await prisma.listing.findMany({
        where: { ownerId: { in: ownerIds } },
        select: {
          id: true,
          ownerId: true,
          status: true,
          statusReason: true,
          availableSlots: true,
          totalSlots: true,
          openSlots: true,
          moveInDate: true,
          availableUntil: true,
          minStayMonths: true,
          lastConfirmedAt: true,
          updatedAt: true,
        },
      })
    : [];

  const ownerListingMap = new Map<string, ListingSnapshot[]>();
  for (const listing of ownerListings) {
    const ownerId = listing.ownerId ?? "";
    const existing = ownerListingMap.get(ownerId) ?? [];
    existing.push(listing);
    ownerListingMap.set(ownerId, existing);
  }

  let restored = 0;

  for (const candidate of candidates) {
    const listing = contactedListingsById.get(candidate.listingId);
    if (!listing || !listing.ownerId || !candidate.restorationEligibleUntil) {
      continue;
    }

    const ownerCurrentListings = ownerListingMap.get(listing.ownerId) ?? [];
    if (
      ownerCurrentListings.length === 0 ||
      ownerCurrentListings.some((row) => isCurrentlyPublic(row))
    ) {
      continue;
    }

    const deactivatedWithinWindow =
      listing.updatedAt.getTime() >= candidate.consumedAt.getTime() &&
      listing.updatedAt.getTime() <= candidate.restorationEligibleUntil.getTime() &&
      !isCurrentlyPublic(listing);

    if (!deactivatedWithinWindow) {
      continue;
    }

    const result = await applyContactRestoration({
      contactConsumptionId: candidate.id,
      userId: candidate.userId,
      reason: "HOST_MASS_DEACTIVATED",
      details: {
        listingId: candidate.listingId,
        hostUserId: listing.ownerId,
      },
    });
    if (result.applied) {
      restored += 1;
    }
  }

  return { restored };
}

export async function runRestorationJob(kind: "ghost-sla" | "mass-deactivation") {
  try {
    if (!features.contactRestorationAutomation) {
      return { ok: true, skipped: true, reason: "feature_disabled" };
    }

    const detail =
      kind === "ghost-sla"
        ? await runGhostSlaRestoration()
        : await runMassDeactivationRestoration();

    return {
      ok: true,
      skipped: false,
      ...detail,
    };
  } catch (error) {
    logger.sync.error("Contact restoration job failed", {
      action: "runRestorationJob",
      kind,
      error: sanitizeErrorMessage(error),
    });
    throw error;
  }
}
