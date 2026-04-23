import "server-only";

import { prisma } from "@/lib/prisma";
import { features } from "@/lib/env";
import { PRODUCT_CATALOG, type PaywallOffer } from "@/lib/payments/catalog";

type SearchAlertPaywallClient = Pick<typeof prisma, "entitlementGrant">;

export type SearchAlertPaywallMode = "PASS_ACTIVE" | "PAYWALL_REQUIRED";
export type SavedSearchEffectiveAlertState =
  | "DISABLED"
  | "ACTIVE"
  | "LOCKED";

export interface SearchAlertPaywallSummary {
  enabled: boolean;
  mode: SearchAlertPaywallMode;
  activePassExpiresAt: string | null;
  requiresPurchase: boolean;
  offers: PaywallOffer[];
}

export const SEARCH_ALERT_PAYWALL_OFFERS: PaywallOffer[] = [
  PRODUCT_CATALOG.MOVERS_PASS_30D,
];

function buildSummary(
  input?: Partial<SearchAlertPaywallSummary>
): SearchAlertPaywallSummary {
  return {
    enabled: features.searchAlertPaywall,
    mode: "PASS_ACTIVE",
    activePassExpiresAt: null,
    requiresPurchase: false,
    offers: SEARCH_ALERT_PAYWALL_OFFERS,
    ...input,
  };
}

async function evaluateSavedSearchAlertPaywallWithClient(
  client: SearchAlertPaywallClient,
  input: {
    userId?: string | null;
  }
): Promise<SearchAlertPaywallSummary> {
  if (!features.searchAlertPaywall) {
    return buildSummary({ enabled: false });
  }

  if (!input.userId) {
    return buildSummary({
      mode: "PAYWALL_REQUIRED",
      requiresPurchase: true,
    });
  }

  const activePassGrant = await client.entitlementGrant.findFirst({
    where: {
      userId: input.userId,
      productCode: "MOVERS_PASS_30D",
      contactKind: "MESSAGE_START",
      grantType: "PASS",
      status: "ACTIVE",
      activeUntil: { gt: new Date() },
    },
    orderBy: { activeUntil: "desc" },
    select: { activeUntil: true },
  });

  if (activePassGrant?.activeUntil) {
    return buildSummary({
      mode: "PASS_ACTIVE",
      activePassExpiresAt: activePassGrant.activeUntil.toISOString(),
    });
  }

  return buildSummary({
    mode: "PAYWALL_REQUIRED",
    requiresPurchase: true,
  });
}

export async function evaluateSavedSearchAlertPaywall(input: {
  userId?: string | null;
}): Promise<SearchAlertPaywallSummary> {
  return evaluateSavedSearchAlertPaywallWithClient(prisma, input);
}

export async function getUsersWithUnlockedSearchAlerts(
  userIds: string[],
  client: SearchAlertPaywallClient = prisma
): Promise<Set<string>> {
  const uniqueUserIds = Array.from(
    new Set(
      userIds
        .map((userId) => userId.trim())
        .filter((userId) => userId.length > 0)
    )
  );

  if (uniqueUserIds.length === 0) {
    return new Set();
  }

  if (!features.searchAlertPaywall) {
    return new Set(uniqueUserIds);
  }

  const activePasses = await client.entitlementGrant.findMany({
    where: {
      userId: { in: uniqueUserIds },
      productCode: "MOVERS_PASS_30D",
      contactKind: "MESSAGE_START",
      grantType: "PASS",
      status: "ACTIVE",
      activeUntil: { gt: new Date() },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  return new Set(activePasses.map((grant) => grant.userId));
}

export function resolveSavedSearchEffectiveAlertState(input: {
  alertEnabled: boolean;
  paywallSummary: Pick<SearchAlertPaywallSummary, "enabled" | "requiresPurchase">;
}): SavedSearchEffectiveAlertState {
  if (!input.alertEnabled) {
    return "DISABLED";
  }

  if (!input.paywallSummary.enabled || !input.paywallSummary.requiresPurchase) {
    return "ACTIVE";
  }

  return "LOCKED";
}
