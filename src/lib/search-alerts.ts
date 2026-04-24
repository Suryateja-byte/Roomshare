import "server-only";

import { prisma } from "./prisma";
import { sendNotificationEmail } from "./email";
import { Prisma } from "@prisma/client";
import { parseSavedSearchFilters } from "@/lib/search/saved-search-parser";
import { buildSearchUrl, type SearchFilters } from "./search-utils";
import { validateSearchFilters } from "./search-params";
import { logger, sanitizeErrorMessage } from "./logger";
import { features } from "@/lib/env";
import { parseLocalDate } from "./utils";
import { getUsersWithUnlockedSearchAlerts } from "@/lib/payments/search-alert-paywall";
import { resolvePublicListingVisibilityState } from "@/lib/listings/public-contact-contract";
import { appendOutboxEvent } from "@/lib/outbox/append";
import type { TransactionClient } from "@/lib/db/with-actor";

/**
 * Validate alert filters from DB. Uses validateSearchFilters for common fields
 * (strips unknown/malicious values) + preserves `city` which alerts need for matching.
 */
function validateAlertFilters(raw: unknown): SearchFilters {
  // Validate common filter fields (strips unknown fields).
  // L-14 NOTE: The `as SearchFilters` cast is intentional — validateSearchFilters returns
  // FilterParams which is a structural subset of SearchFilters. The city field (specific
  // to SearchFilters) is manually preserved below. This avoids creating a separate validator.
  const validated = validateSearchFilters(raw) as SearchFilters;
  // Preserve city field for alert matching (not in FilterParams but used by alerts)
  if (raw && typeof raw === "object" && "city" in raw) {
    const city = (raw as Record<string, unknown>).city;
    if (typeof city === "string" && city.length >= 2 && city.length <= 100) {
      (validated as Record<string, unknown>).city = city.trim();
    }
  }
  return validated;
}

function parseFiltersForAlerts(raw: Prisma.JsonValue): SearchFilters | null {
  const parsed = parseSavedSearchFilters(raw);
  if (!parsed) {
    return null;
  }

  const city =
    raw && typeof raw === "object" && !Array.isArray(raw) && "city" in raw
      ? (raw as Record<string, unknown>).city
      : undefined;

  return validateAlertFilters({
    ...parsed,
    ...(typeof city === "string" ? { city } : {}),
  });
}

// Type for new listing data used in instant alerts
export interface NewListingForAlert {
  id: string;
  title: string;
  description: string;
  price: number;
  city: string;
  state: string;
  roomType: string | null;
  leaseDuration: string | null;
  amenities: string[];
  houseRules: string[];
  householdLanguages?: string[];
  genderPreference?: string | null;
  householdGender?: string | null;
  moveInDate?: Date | string | null;
}

interface ProcessResult {
  processed: number;
  alertsSent: number;
  errors: number;
  details: string[];
}

type SavedSearchForAlerts = {
  id: string;
  name: string;
  filters: Prisma.JsonValue;
  alertEnabled: boolean;
  alertFrequency: "INSTANT" | "DAILY" | "WEEKLY";
  lastAlertAt: Date | null;
  createdAt: Date;
  searchSpecHash?: string | null;
  embeddingVersionAtSave?: string | null;
  rankerProfileVersionAtSave?: string | null;
  unitIdentityEpochFloor?: number | null;
  active?: boolean;
  alertSubscriptions?: AlertSubscriptionForAlerts[];
  user: {
    id: string;
    name: string | null;
    email: string | null;
    notificationPreferences: Prisma.JsonValue | null;
  };
};

type AlertSubscriptionForAlerts = {
  id: string;
  savedSearchId: string;
  userId: string;
  channel: string;
  frequency: "INSTANT" | "DAILY" | "WEEKLY";
  active: boolean;
  lastDeliveredAt: Date | null;
};

// L2 fix: Use shared parseLocalDate from @/lib/utils
const parseDateOnly = parseLocalDate;
const SEARCH_ALERT_BATCH_SIZE = 100;
const ALERT_LISTING_SELECT = {
  id: true,
  ownerId: true,
  physicalUnitId: true,
  status: true,
  statusReason: true,
  availableSlots: true,
  totalSlots: true,
  openSlots: true,
  moveInDate: true,
  availableUntil: true,
  minStayMonths: true,
  lastConfirmedAt: true,
} satisfies Prisma.ListingSelect;

type AlertListing = Prisma.ListingGetPayload<{
  select: typeof ALERT_LISTING_SELECT;
}>;

function isSearchAlertsEnabled(notificationPreferences: unknown): boolean {
  if (!notificationPreferences || typeof notificationPreferences !== "object") {
    return true;
  }
  const prefs = notificationPreferences as { emailSearchAlerts?: unknown };
  return prefs.emailSearchAlerts !== false;
}

function isDeliverableAlertListing(listing: AlertListing | null | undefined) {
  return resolvePublicListingVisibilityState(listing).isPubliclyVisible;
}

async function findDeliverableAlertListings(
  where: Prisma.ListingWhereInput,
  expectedCount: number
) {
  if (expectedCount <= 0) {
    return [];
  }

  const listings = await prisma.listing.findMany({
    where,
    select: ALERT_LISTING_SELECT,
  });

  return listings.filter(isDeliverableAlertListing);
}

async function isInstantAlertListingStillDeliverable(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: ALERT_LISTING_SELECT,
  });

  return isDeliverableAlertListing(listing);
}

function getEmailSubscription(
  savedSearch: SavedSearchForAlerts
): AlertSubscriptionForAlerts | null {
  return (
    savedSearch.alertSubscriptions?.find(
      (subscription) => subscription.channel === "EMAIL"
    ) ?? null
  );
}

async function ensureEmailSubscriptionForSavedSearch(
  savedSearch: SavedSearchForAlerts
): Promise<AlertSubscriptionForAlerts | null> {
  const existing = getEmailSubscription(savedSearch);
  if (existing) {
    return existing.active ? existing : null;
  }

  const created = await prisma.alertSubscription.upsert({
    where: {
      savedSearchId_channel: {
        savedSearchId: savedSearch.id,
        channel: "EMAIL",
      },
    },
    create: {
      savedSearchId: savedSearch.id,
      userId: savedSearch.user.id,
      channel: "EMAIL",
      frequency: savedSearch.alertFrequency,
      active: savedSearch.alertEnabled,
    },
    update: {
      frequency: savedSearch.alertFrequency,
      active: savedSearch.alertEnabled,
    },
  });

  return created.active ? created : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

type DeliveryKind = "INSTANT" | "SCHEDULED";

async function enqueueAlertDelivery(input: {
  subscription: AlertSubscriptionForAlerts;
  savedSearch: SavedSearchForAlerts;
  deliveryKind: DeliveryKind;
  idempotencyKey: string;
  newListingsCount: number;
  filters: SearchFilters;
  targetListingId?: string | null;
  targetUnitId?: string | null;
  targetInventoryId?: string | null;
  targetUnitIdentityEpoch?: number | null;
  payload?: Record<string, unknown>;
}): Promise<{ queued: boolean; deliveryId: string | null }> {
  try {
    const delivery = await prisma.$transaction(async (tx) => {
      const created = await tx.alertDelivery.create({
        data: {
          subscriptionId: input.subscription.id,
          savedSearchId: input.savedSearch.id,
          userId: input.savedSearch.user.id,
          channel: "EMAIL",
          deliveryKind: input.deliveryKind,
          status: "PENDING",
          idempotencyKey: input.idempotencyKey,
          targetListingId: input.targetListingId ?? null,
          targetUnitId: input.targetUnitId ?? null,
          targetInventoryId: input.targetInventoryId ?? null,
          targetUnitIdentityEpoch: input.targetUnitIdentityEpoch ?? null,
          queryHash: input.savedSearch.searchSpecHash ?? null,
          embeddingVersion: input.savedSearch.embeddingVersionAtSave ?? null,
          rankerProfileVersion:
            input.savedSearch.rankerProfileVersionAtSave ?? null,
          newListingsCount: input.newListingsCount,
          payload: {
            searchName: input.savedSearch.name,
            searchUrl: buildSearchUrl(input.filters),
            unitIdentityEpochFloor:
              input.savedSearch.unitIdentityEpochFloor ?? null,
            ...input.payload,
          } as Prisma.InputJsonObject,
        },
        select: { id: true },
      });

      await appendOutboxEvent(tx, {
        aggregateType: "ALERT_DELIVERY",
        aggregateId: created.id,
        kind: "ALERT_DELIVER",
        payload: {
          deliveryId: created.id,
          savedSearchId: input.savedSearch.id,
          subscriptionId: input.subscription.id,
        },
        sourceVersion: BigInt(1),
        unitIdentityEpoch: input.targetUnitIdentityEpoch ?? 1,
        priority: 60,
      });

      return created;
    });

    return { queued: true, deliveryId: delivery.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { queued: false, deliveryId: null };
    }
    throw error;
  }
}

type AlertDeliveryOutcome =
  | { status: "delivered" }
  | { status: "dropped"; reason: string }
  | { status: "noop" }
  | { status: "retry"; error: string };

function getPayloadObject(payload: Prisma.JsonValue): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function getPayloadStringArray(
  payload: Record<string, unknown>,
  key: string
): string[] {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function dropAlertDelivery(
  client: typeof prisma,
  deliveryId: string,
  reason: string
): Promise<AlertDeliveryOutcome> {
  await client.alertDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "DROPPED",
      dropReason: reason,
      droppedAt: new Date(),
    },
  });
  return { status: "dropped", reason };
}

async function countCurrentlyDeliverableTargets(
  client: typeof prisma,
  listingIds: string[]
): Promise<number> {
  if (listingIds.length === 0) {
    return 0;
  }

  const listings = await client.listing.findMany({
    where: { id: { in: listingIds } },
    select: ALERT_LISTING_SELECT,
  });

  return listings.filter(isDeliverableAlertListing).length;
}

export async function deliverQueuedSearchAlert(
  client: TransactionClient,
  deliveryId: string
): Promise<AlertDeliveryOutcome> {
  const db = client as unknown as typeof prisma;
  if (features.disableAlerts) {
    return { status: "retry", error: "Search alerts disabled" };
  }

  const delivery = await db.alertDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      subscription: true,
      savedSearch: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              notificationPreferences: true,
            },
          },
        },
      },
    },
  });

  if (!delivery) {
    return { status: "dropped", reason: "TARGET_MISSING" };
  }

  if (delivery.status === "DELIVERED" || delivery.status === "DROPPED") {
    return { status: "noop" };
  }

  if (delivery.expiresAt.getTime() <= Date.now()) {
    return dropAlertDelivery(db, delivery.id, "EXPIRED");
  }

  if (
    !delivery.subscription.active ||
    !delivery.savedSearch.active ||
    !delivery.savedSearch.alertEnabled
  ) {
    return dropAlertDelivery(db, delivery.id, "SUBSCRIPTION_INACTIVE");
  }

  const user = delivery.savedSearch.user;
  if (!user.email || !isSearchAlertsEnabled(user.notificationPreferences)) {
    return dropAlertDelivery(db, delivery.id, "PREFERENCE_DISABLED");
  }

  const unlockedIds = await getUsersWithUnlockedSearchAlerts(
    [user.id],
    db as Parameters<typeof getUsersWithUnlockedSearchAlerts>[1]
  );
  if (!unlockedIds.has(user.id)) {
    return dropAlertDelivery(db, delivery.id, "PAYWALL_LOCKED");
  }

  const filters = parseFiltersForAlerts(delivery.savedSearch.filters);
  if (!filters) {
    return dropAlertDelivery(db, delivery.id, "TARGET_MISSING");
  }

  const payload = getPayloadObject(delivery.payload);
  let newListingsCount = delivery.newListingsCount;
  let notificationLink =
    typeof payload.listingUrl === "string"
      ? payload.listingUrl
      : buildSearchUrl(filters);

  if (delivery.targetListingId) {
    const listing = await db.listing.findUnique({
      where: { id: delivery.targetListingId },
      select: ALERT_LISTING_SELECT,
    });

    if (!listing) {
      return dropAlertDelivery(db, delivery.id, "TARGET_MISSING");
    }

    if (
      delivery.targetUnitId &&
      listing.physicalUnitId &&
      delivery.targetUnitId !== listing.physicalUnitId
    ) {
      return dropAlertDelivery(db, delivery.id, "STALE_EPOCH");
    }

    if (!isDeliverableAlertListing(listing)) {
      return dropAlertDelivery(db, delivery.id, "TARGET_NOT_PUBLIC");
    }

    newListingsCount = 1;
    notificationLink = `/listings/${delivery.targetListingId}`;
  } else {
    const targetListingIds = getPayloadStringArray(payload, "targetListingIds");
    const deliverableCount = await countCurrentlyDeliverableTargets(
      db,
      targetListingIds
    );
    if (targetListingIds.length > 0 && deliverableCount === 0) {
      return dropAlertDelivery(db, delivery.id, "TARGET_NOT_PUBLIC");
    }
    if (deliverableCount > 0) {
      newListingsCount = deliverableCount;
    }
  }

  const emailResult = await sendNotificationEmail("searchAlert", user.email, {
    userName: user.name || "User",
    searchName: delivery.savedSearch.name,
    listingTitle:
      newListingsCount === 1
        ? "a matching listing"
        : `${newListingsCount} matching listings`,
    listingId: delivery.targetListingId ?? delivery.savedSearch.id,
  });

  if (!emailResult.success) {
    await db.alertDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "PENDING",
        lastError: emailResult.error || "Email failed",
        attemptCount: { increment: 1 },
      },
    });
    return { status: "retry", error: emailResult.error || "Email failed" };
  }

  await db.notification.create({
    data: {
      userId: user.id,
      type: "SEARCH_ALERT",
      title:
        delivery.deliveryKind === "INSTANT"
          ? "New listing matches your search!"
          : "New listings match your search!",
      message:
        delivery.deliveryKind === "INSTANT" &&
        typeof payload.listingTitle === "string"
          ? `"${payload.listingTitle}" matches your saved search "${delivery.savedSearch.name}"`
          : `${newListingsCount} new listing${newListingsCount > 1 ? "s" : ""} match your saved search "${delivery.savedSearch.name}"`,
      link: notificationLink,
    },
  });

  await db.alertDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "DELIVERED",
      deliveredAt: new Date(),
      lastError: null,
    },
  });

  await db.savedSearch.update({
    where: { id: delivery.savedSearchId },
    data: { lastAlertAt: new Date() },
  });

  await db.alertSubscription.update({
    where: { id: delivery.subscriptionId },
    data: { lastDeliveredAt: new Date() },
  });

  return { status: "delivered" };
}

export async function processSearchAlerts(): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    alertsSent: 0,
    errors: 0,
    details: [],
  };

  try {
    if (features.disableAlerts) {
      result.details.push("Search alerts disabled by kill switch");
      return result;
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const baseWhere = {
      active: true,
      alertEnabled: true,
      OR: [
        // Never alerted
        { lastAlertAt: null },
        // Daily alerts - last alert more than 24 hours ago
        {
          alertFrequency: "DAILY",
          lastAlertAt: { lt: oneDayAgo },
        },
        // Weekly alerts - last alert more than 7 days ago
        {
          alertFrequency: "WEEKLY",
          lastAlertAt: { lt: oneWeekAgo },
        },
      ],
    } satisfies Prisma.SavedSearchWhereInput;

    let processedCandidates = 0;
    let cursorId: string | null = null;
    const unlockedAlertUsers = new Map<string, boolean>();

    while (true) {
      const savedSearches: SavedSearchForAlerts[] =
        await prisma.savedSearch.findMany({
          where: baseWhere,
          include: {
            alertSubscriptions: {
              where: { channel: "EMAIL" },
              take: 1,
            },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                notificationPreferences: true,
              },
            },
          },
          orderBy: { id: "asc" },
          take: SEARCH_ALERT_BATCH_SIZE,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        });

      if (!savedSearches || savedSearches.length === 0) {
        break;
      }

      processedCandidates += savedSearches.length;
      cursorId = savedSearches[savedSearches.length - 1].id;

      const uncachedUserIds = Array.from(
        new Set(
          savedSearches
            .map((savedSearch) => savedSearch.user.id)
            .filter((userId) => !unlockedAlertUsers.has(userId))
        )
      );
      if (uncachedUserIds.length > 0) {
        const unlockedIds =
          await getUsersWithUnlockedSearchAlerts(uncachedUserIds);
        for (const userId of uncachedUserIds) {
          unlockedAlertUsers.set(userId, unlockedIds.has(userId));
        }
      }

      for (const savedSearch of savedSearches) {
        result.processed++;

        try {
          // Check user notification preferences
          if (
            !isSearchAlertsEnabled(savedSearch.user.notificationPreferences)
          ) {
            result.details.push(
              `Skipping ${savedSearch.id} - user disabled search alerts`
            );
            continue;
          }

          if (!savedSearch.user.email) {
            result.details.push(`Skipping ${savedSearch.id} - no user email`);
            continue;
          }

          if (!unlockedAlertUsers.get(savedSearch.user.id)) {
            result.details.push(`Skipping ${savedSearch.id} - alerts locked`);
            continue;
          }

          const subscription =
            await ensureEmailSubscriptionForSavedSearch(savedSearch);
          if (!subscription) {
            result.details.push(
              `Skipping ${savedSearch.id} - subscription inactive`
            );
            continue;
          }

          // S-02 FIX: Validate filters from DB instead of raw cast
          const filters = parseFiltersForAlerts(savedSearch.filters);
          if (!filters) {
            result.details.push(
              `Skipping ${savedSearch.id} - invalid saved search filters`
            );
            continue;
          }
          const sinceDate = savedSearch.lastAlertAt || savedSearch.createdAt;

          // Build query to find new matching listings
          const whereClause: Prisma.ListingWhereInput = {
            status: "ACTIVE",
            createdAt: { gt: sinceDate },
          };

          // Apply filters
          if (filters.minPrice !== undefined) {
            const existingPriceFilter = (whereClause.price ?? {}) as Record<
              string,
              unknown
            >;
            whereClause.price = {
              ...existingPriceFilter,
              gte: filters.minPrice,
            };
          }
          if (filters.maxPrice !== undefined) {
            const existingPriceFilter = (whereClause.price ?? {}) as Record<
              string,
              unknown
            >;
            whereClause.price = {
              ...existingPriceFilter,
              lte: filters.maxPrice,
            };
          }
          if (filters.roomType) {
            whereClause.roomType = filters.roomType;
          }
          if (filters.leaseDuration) {
            whereClause.leaseDuration = filters.leaseDuration;
          }
          if (filters.moveInDate) {
            const targetDate = parseDateOnly(filters.moveInDate);
            const existingAnd = Array.isArray(whereClause.AND)
              ? whereClause.AND
              : whereClause.AND
                ? [whereClause.AND]
                : [];
            whereClause.AND = [
              ...existingAnd,
              {
                OR: [{ moveInDate: null }, { moveInDate: { lte: targetDate } }],
              },
            ];
          }
          if (filters.amenities && filters.amenities.length > 0) {
            whereClause.amenities = { hasEvery: filters.amenities };
          }
          if (filters.houseRules && filters.houseRules.length > 0) {
            whereClause.houseRules = { hasEvery: filters.houseRules };
          }
          if (filters.languages && filters.languages.length > 0) {
            whereClause.householdLanguages = { hasSome: filters.languages };
          }
          if (filters.genderPreference) {
            whereClause.genderPreference = filters.genderPreference;
          }
          if (filters.householdGender) {
            whereClause.householdGender = filters.householdGender;
          }
          // TODO(M5): Replace ILIKE text matching with FTS (to_tsquery) when
          // search_tsv column is available on the Listing table. Currently uses
          // Prisma `contains` which generates ILIKE — acceptable for alert volumes
          // but not scalable for large datasets.
          // M-D2: Also search city+state via location to match instant alert behavior
          if (filters.query) {
            whereClause.OR = [
              { title: { contains: filters.query, mode: "insensitive" } },
              { description: { contains: filters.query, mode: "insensitive" } },
              {
                location: {
                  city: { contains: filters.query, mode: "insensitive" },
                },
              },
              {
                location: {
                  state: { contains: filters.query, mode: "insensitive" },
                },
              },
            ];
          }

          // City filter via location
          if (filters.city) {
            whereClause.location = {
              city: { contains: filters.city, mode: "insensitive" },
            };
          }

          // Count matching listings
          const candidateListingsCount = await prisma.listing.count({
            where: whereClause,
          });
          const deliverableListings = await findDeliverableAlertListings(
            whereClause,
            candidateListingsCount
          );
          const newListingsCount = deliverableListings.length;

          if (newListingsCount > 0) {
            const targetListingIds = deliverableListings
              .map((listing) => listing.id)
              .slice(0, 25);
            const delivery = await enqueueAlertDelivery({
              subscription,
              savedSearch,
              deliveryKind: "SCHEDULED",
              idempotencyKey: [
                "alert",
                subscription.id,
                "scheduled",
                savedSearch.alertFrequency,
                sinceDate.toISOString(),
              ].join(":"),
              newListingsCount,
              filters,
              payload: {
                targetListingIds,
              },
            });

            if (delivery.queued) {
              result.alertsSent++;
              result.details.push(
                `Queued alert for ${savedSearch.id}: ${newListingsCount} new listings`
              );
            } else {
              result.details.push(
                `Skipped duplicate alert for ${savedSearch.id}: ${newListingsCount} new listings`
              );
            }

            await prisma.savedSearch.update({
              where: { id: savedSearch.id },
              data: { lastAlertAt: now },
            });
          } else {
            // P0 FIX: Still update lastAlertAt even when no new listings
            // Prevents re-processing the same time window repeatedly
            await prisma.savedSearch.update({
              where: { id: savedSearch.id },
              data: { lastAlertAt: now },
            });
          }
        } catch (error) {
          result.errors++;
          result.details.push(
            `Error processing ${savedSearch.id}: ${sanitizeErrorMessage(error)}`
          );
        }
      }

      if (savedSearches.length < SEARCH_ALERT_BATCH_SIZE) {
        break;
      }
    }

    result.details.unshift(
      `Found ${processedCandidates} saved searches to process`
    );

    return result;
  } catch (error) {
    result.errors++;
    result.details.push(`Fatal error: ${sanitizeErrorMessage(error)}`);
    return result;
  }
}

/**
 * Check if a listing matches the saved search filters
 */
function matchesFilters(
  listing: NewListingForAlert,
  filters: SearchFilters
): boolean {
  // Price filter
  if (filters.minPrice !== undefined && listing.price < filters.minPrice) {
    return false;
  }
  if (filters.maxPrice !== undefined && listing.price > filters.maxPrice) {
    return false;
  }

  // Location filter (city)
  if (
    filters.city &&
    !listing.city.toLowerCase().includes(filters.city.toLowerCase())
  ) {
    return false;
  }

  // Room type filter
  if (filters.roomType && listing.roomType !== filters.roomType) {
    return false;
  }

  // Lease duration filter
  if (
    filters.leaseDuration &&
    listing.leaseDuration !== filters.leaseDuration
  ) {
    return false;
  }

  // Move-in date filter (listing available by target date)
  if (filters.moveInDate) {
    const targetDate = parseDateOnly(filters.moveInDate);
    const listingDate = listing.moveInDate
      ? new Date(listing.moveInDate)
      : null;
    if (listingDate && listingDate > targetDate) {
      return false;
    }
  }

  // Amenities filter (all required amenities must be present - exact match)
  if (filters.amenities && filters.amenities.length > 0) {
    const listingAmenitiesLower = listing.amenities.map((a) => a.toLowerCase());
    const hasAllAmenities = filters.amenities.every((amenity) =>
      listingAmenitiesLower.includes(amenity.toLowerCase())
    );
    if (!hasAllAmenities) return false;
  }

  // House rules filter (all required rules must be present - exact match)
  if (filters.houseRules && filters.houseRules.length > 0) {
    const listingRulesLower = listing.houseRules.map((r) => r.toLowerCase());
    const hasAllRules = filters.houseRules.every((rule) =>
      listingRulesLower.includes(rule.toLowerCase())
    );
    if (!hasAllRules) return false;
  }

  // Languages filter (OR logic)
  if (filters.languages && filters.languages.length > 0) {
    const listingLanguages = listing.householdLanguages || [];
    const matchesLanguage = filters.languages.some((lang) =>
      listingLanguages.some(
        (listingLang) => listingLang.toLowerCase() === lang.toLowerCase()
      )
    );
    if (!matchesLanguage) return false;
  }

  // Gender preference filter
  if (filters.genderPreference) {
    if (
      !listing.genderPreference ||
      listing.genderPreference.toLowerCase() !==
        filters.genderPreference.toLowerCase()
    ) {
      return false;
    }
  }

  // Household gender filter
  if (filters.householdGender) {
    if (
      !listing.householdGender ||
      listing.householdGender.toLowerCase() !==
        filters.householdGender.toLowerCase()
    ) {
      return false;
    }
  }

  // Query filter (search in title, description, city, and state)
  if (filters.query) {
    const query = filters.query.toLowerCase();
    const matchesTitle = listing.title.toLowerCase().includes(query);
    const matchesDescription = listing.description
      .toLowerCase()
      .includes(query);
    const matchesCity = listing.city.toLowerCase().includes(query);
    const matchesState = listing.state.toLowerCase().includes(query);
    if (!matchesTitle && !matchesDescription && !matchesCity && !matchesState)
      return false;
  }

  return true;
}

/**
 * Trigger INSTANT alerts when a new listing is created
 * This function runs asynchronously in the background (non-blocking)
 * to improve scalability and user experience
 */
export async function triggerInstantAlerts(
  newListing: NewListingForAlert
): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;

  try {
    if (features.disableAlerts) {
      logger.sync.info("Instant alerts skipped - alerts disabled", {
        action: "triggerInstantAlerts",
      });
      return { sent, errors };
    }

    // M3 fix: Paginate instant subscriptions to prevent unbounded fetches
    const MAX_INSTANT_SUBSCRIPTIONS = 500;
    const instantSearches = await prisma.savedSearch.findMany({
      where: {
        active: true,
        alertEnabled: true,
        alertFrequency: "INSTANT",
      },
      include: {
        alertSubscriptions: {
          where: { channel: "EMAIL" },
          take: 1,
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            notificationPreferences: true,
          },
        },
      },
      take: MAX_INSTANT_SUBSCRIPTIONS,
      orderBy: { createdAt: "asc" },
    });

    logger.sync.info("Instant alerts subscriptions loaded", {
      action: "triggerInstantAlerts",
      subscriptions: instantSearches.length,
    });
    const unlockedIds = await getUsersWithUnlockedSearchAlerts(
      instantSearches.map((savedSearch) => savedSearch.user.id)
    );

    for (const savedSearch of instantSearches) {
      try {
        // Check user notification preferences
        if (!isSearchAlertsEnabled(savedSearch.user.notificationPreferences)) {
          continue;
        }

        if (!savedSearch.user.email) {
          continue;
        }

        if (!unlockedIds.has(savedSearch.user.id)) {
          continue;
        }

        const subscription =
          await ensureEmailSubscriptionForSavedSearch(savedSearch);
        if (!subscription) {
          continue;
        }

        // S-02 FIX: Validate filters from DB instead of raw cast
        const filters = parseFiltersForAlerts(savedSearch.filters);
        if (!filters) {
          continue;
        }

        // Check if the new listing matches this saved search
        if (!matchesFilters(newListing, filters)) {
          continue;
        }

        if (!(await isInstantAlertListingStillDeliverable(newListing.id))) {
          logger.sync.info("Instant alert target dropped before delivery", {
            action: "triggerInstantAlerts",
            savedSearchId: savedSearch.id,
            listingId: newListing.id,
          });
          continue;
        }

        logger.sync.debug("Instant alert matched listing to saved search", {
          action: "triggerInstantAlerts",
          savedSearchId: savedSearch.id,
          listingId: newListing.id,
        });

        const delivery = await enqueueAlertDelivery({
          subscription,
          savedSearch,
          deliveryKind: "INSTANT",
          idempotencyKey: [
            "alert",
            subscription.id,
            "instant",
            newListing.id,
          ].join(":"),
          newListingsCount: 1,
          filters,
          targetListingId: newListing.id,
          payload: {
            listingTitle: newListing.title,
            listingCity: newListing.city,
            listingPrice: newListing.price,
            listingUrl: `/listings/${newListing.id}`,
          },
        });

        if (!delivery.queued) {
          logger.sync.debug("Instant alert duplicate skipped", {
            action: "triggerInstantAlerts",
            savedSearchId: savedSearch.id,
            listingId: newListing.id,
          });
          continue;
        }

        await prisma.savedSearch.update({
          where: { id: savedSearch.id },
          data: { lastAlertAt: new Date() },
        });

        sent++;
        logger.sync.info("Instant alert queued", {
          action: "triggerInstantAlerts",
          savedSearchId: savedSearch.id,
          listingId: newListing.id,
        });
      } catch (error) {
        logger.sync.error("Instant alert processing failed for saved search", {
          action: "triggerInstantAlerts",
          savedSearchId: savedSearch.id,
          error: sanitizeErrorMessage(error),
        });
        errors++;
      }
    }
  } catch (error) {
    logger.sync.error("Instant alerts fatal error", {
      action: "triggerInstantAlerts",
      error: sanitizeErrorMessage(error),
    });
    errors++;
  }

  logger.sync.info("Instant alerts processing complete", {
    action: "triggerInstantAlerts",
    sent,
    errors,
  });
  return { sent, errors };
}
