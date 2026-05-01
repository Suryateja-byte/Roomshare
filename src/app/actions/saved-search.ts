"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { type SearchFilters } from "@/lib/search-utils";
import { buildCanonicalSavedSearchMetadata } from "@/lib/search/saved-search-canonical";
import { parseSavedSearchFilters } from "@/lib/search/saved-search-parser";
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import {
  evaluateSavedSearchAlertPaywall,
  resolveSavedSearchEffectiveAlertState,
} from "@/lib/payments/search-alert-paywall";
import { z } from "zod";
import { headers } from "next/headers";
import { checkServerComponentRateLimit } from "@/lib/with-rate-limit";
import { checkSuspension } from "./suspension";

type AlertFrequency = "INSTANT" | "DAILY" | "WEEKLY";

interface SaveSearchInput {
  name: string;
  filters: SearchFilters;
  alertEnabled?: boolean;
  alertFrequency?: AlertFrequency;
}

const savedSearchNameSchema = z.string().trim().min(1).max(100);
const SAVED_SEARCH_LIMIT_ERROR =
  "You can only save up to 10 searches. Please delete some to save new ones.";

/**
 * Write-path schema: strips unknown fields to prevent arbitrary JSON from persisting.
 * Used when saving NEW searches. Read path above keeps .passthrough() for backward compat.
 */
const savedSearchFiltersWriteSchema = z
  .object({
    query: z.string().optional(),
    locationLabel: z.string().optional(),
    vibeQuery: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    roomType: z.string().optional(),
    amenities: z.array(z.string()).optional(),
    houseRules: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    moveInDate: z.string().optional(),
    endDate: z.string().optional(),
    leaseDuration: z.string().optional(),
    genderPreference: z.string().optional(),
    householdGender: z.string().optional(),
    bookingMode: z.string().optional(),
    minSlots: z.number().optional(),
    nearMatches: z.boolean().optional(),
    sort: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    minLat: z.number().optional(),
    maxLat: z.number().optional(),
    minLng: z.number().optional(),
    maxLng: z.number().optional(),
    city: z.string().min(2).max(100).optional(),
  })
  .strip();

async function enforceSavedSearchMutationRateLimit(action: string) {
  const headersList = await headers();
  const rateLimit = await checkServerComponentRateLimit(
    headersList,
    "savedSearchMutations",
    `/actions/saved-search/${action}`
  );

  if (!rateLimit.allowed) {
    return { error: "Too many requests. Please wait before trying again." };
  }

  return null;
}

async function enforceSavedSearchMutationAccess(userId: string) {
  const suspension = await checkSuspension(userId);
  if (suspension.suspended) {
    return { error: suspension.error || "Account suspended" };
  }

  return null;
}

async function acquireSavedSearchLimitLock(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  userId: string
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('saved-search-limit'), hashtext(${userId}))`;
}

export async function saveSearch(input: SaveSearchInput) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const accessDenied = await enforceSavedSearchMutationAccess(session.user.id);
  if (accessDenied) return accessDenied;

  const rateLimited = await enforceSavedSearchMutationRateLimit("save");
  if (rateLimited) return rateLimited;

  try {
    const nameValidation = savedSearchNameSchema.safeParse(input.name);
    if (!nameValidation.success) {
      return { error: "Invalid search name" };
    }

    // Canonicalize filters before storing so saved-search reopen flows always
    // round-trip through the same normalized search schema as live URLs.
    const canonical = buildCanonicalSavedSearchMetadata(input.filters);
    const normalizedFilters = canonical.filters;
    const strippedFilters =
      savedSearchFiltersWriteSchema.parse(normalizedFilters);
    const alertEnabled = input.alertEnabled ?? true;
    const alertFrequency = input.alertFrequency ?? "DAILY";

    const saveResult = await prisma.$transaction(async (tx) => {
      await acquireSavedSearchLimitLock(tx, session.user.id);

      const existingCount = await tx.savedSearch.count({
        where: { userId: session.user.id },
      });

      if (existingCount >= 10) {
        return { kind: "limit" as const };
      }

      const savedSearch = await tx.savedSearch.create({
        data: {
          userId: session.user.id,
          name: nameValidation.data,
          query: normalizedFilters.query,
          filters: strippedFilters as Prisma.InputJsonValue,
          searchSpecJson:
            canonical.searchSpecJson as unknown as Prisma.InputJsonValue,
          searchSpecHash: canonical.searchSpecHash,
          embeddingVersionAtSave: canonical.embeddingVersionAtSave,
          rankerProfileVersionAtSave: canonical.rankerProfileVersionAtSave,
          unitIdentityEpochFloor: canonical.unitIdentityEpochFloor,
          active: true,
          alertEnabled,
          alertFrequency,
          alertSubscriptions: {
            create: {
              user: { connect: { id: session.user.id } },
              channel: "EMAIL",
              frequency: alertFrequency,
              active: alertEnabled,
            },
          },
        },
        select: {
          id: true,
          alertEnabled: true,
        },
      });

      return { kind: "created" as const, savedSearch };
    });

    if (saveResult.kind === "limit") {
      return { error: SAVED_SEARCH_LIMIT_ERROR };
    }

    const { savedSearch } = saveResult;
    const paywallSummary = await evaluateSavedSearchAlertPaywall({
      userId: session.user.id,
    });

    revalidatePath("/saved-searches");

    return {
      success: true,
      searchId: savedSearch.id,
      effectiveAlertState: resolveSavedSearchEffectiveAlertState({
        alertEnabled: savedSearch.alertEnabled,
        paywallSummary,
      }),
    };
  } catch (error: unknown) {
    logger.sync.error("Failed to save search", {
      action: "saveSearch",
      searchNameLength: input.name?.length ?? 0,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to save search" };
  }
}

export async function getMySavedSearches() {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  try {
    const searches = await prisma.savedSearch.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    const paywallSummary = await evaluateSavedSearchAlertPaywall({
      userId: session.user.id,
    });

    // Validate filters JSON on read to prevent malformed data from reaching the client
    return searches.map((search) => ({
      ...search,
      filters:
        (parseSavedSearchFilters(search.filters) ?? {}) as Prisma.JsonValue,
      effectiveAlertState: resolveSavedSearchEffectiveAlertState({
        alertEnabled: search.alertEnabled,
        paywallSummary,
      }),
    }));
  } catch (error: unknown) {
    logger.sync.error("Failed to fetch saved searches", {
      action: "getMySavedSearches",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

export async function deleteSavedSearch(searchId: string) {
  // L-11 FIX: Validate searchId format to prevent excessive DB work from garbage input
  if (!searchId || typeof searchId !== "string" || searchId.length > 100) {
    return { error: "Invalid search ID" };
  }
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const accessDenied = await enforceSavedSearchMutationAccess(session.user.id);
  if (accessDenied) return accessDenied;

  const rateLimited = await enforceSavedSearchMutationRateLimit("delete");
  if (rateLimited) return rateLimited;

  try {
    await prisma.savedSearch.delete({
      where: {
        id: searchId,
        userId: session.user.id,
      },
    });

    revalidatePath("/saved-searches");

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to delete saved search", {
      action: "deleteSavedSearch",
      searchId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to delete saved search" };
  }
}

export async function toggleSearchAlert(searchId: string, enabled: boolean) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const accessDenied = await enforceSavedSearchMutationAccess(session.user.id);
  if (accessDenied) return accessDenied;

  const rateLimited = await enforceSavedSearchMutationRateLimit("toggle-alert");
  if (rateLimited) return rateLimited;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const savedSearch = await tx.savedSearch.update({
        where: {
          id: searchId,
          userId: session.user.id,
        },
        data: { alertEnabled: enabled },
        select: { id: true, alertEnabled: true, alertFrequency: true },
      });

      await tx.alertSubscription.upsert({
        where: {
          savedSearchId_channel: {
            savedSearchId: savedSearch.id,
            channel: "EMAIL",
          },
        },
        create: {
          savedSearchId: savedSearch.id,
          userId: session.user.id,
          channel: "EMAIL",
          frequency: savedSearch.alertFrequency,
          active: enabled,
        },
        update: {
          active: enabled,
          frequency: savedSearch.alertFrequency,
        },
      });

      return savedSearch;
    });
    const paywallSummary = await evaluateSavedSearchAlertPaywall({
      userId: session.user.id,
    });

    revalidatePath("/saved-searches");

    return {
      success: true,
      effectiveAlertState: resolveSavedSearchEffectiveAlertState({
        alertEnabled: updated.alertEnabled,
        paywallSummary,
      }),
    };
  } catch (error: unknown) {
    logger.sync.error("Failed to toggle search alert", {
      action: "toggleSearchAlert",
      searchId,
      alertEnabled: enabled,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to update alert setting" };
  }
}

export async function updateSavedSearchName(searchId: string, name: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const accessDenied = await enforceSavedSearchMutationAccess(session.user.id);
  if (accessDenied) return accessDenied;

  const rateLimited = await enforceSavedSearchMutationRateLimit("rename");
  if (rateLimited) return rateLimited;

  try {
    const nameValidation = savedSearchNameSchema.safeParse(name);
    if (!nameValidation.success) {
      return { error: "Invalid search name" };
    }

    await prisma.savedSearch.update({
      where: {
        id: searchId,
        userId: session.user.id,
      },
      data: { name: nameValidation.data },
    });

    revalidatePath("/saved-searches");

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to update saved search name", {
      action: "updateSavedSearchName",
      searchId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to update search name" };
  }
}
