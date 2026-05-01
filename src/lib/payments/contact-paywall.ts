import "server-only";

import { randomUUID } from "crypto";
import type {
  ContactConsumptionSource,
  ContactKind,
  EntitlementGrant,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { features } from "@/lib/env";
import {
  DEFAULT_PAYWALL_OFFERS,
  FREE_MESSAGE_START_CONTACTS,
} from "@/lib/payments/catalog";
import { buildRestorationEligibleUntil } from "@/lib/payments/contact-restoration";
import {
  getFreshEntitlementState,
  recomputeEntitlementState,
  type EntitlementStateSnapshot,
} from "@/lib/payments/entitlement-state";
import {
  recordContactConsumptionCreated,
  recordPaywallBypassMissingUnitId,
} from "@/lib/payments/telemetry";
import { recordEmergencyOpenGrant } from "@/lib/payments/emergency-open";

type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

type ContactPaywallClient = Pick<
  typeof prisma,
  "physicalUnit" | "contactConsumption" | "entitlementGrant" | "entitlementState"
> &
  Pick<TransactionClient, "$executeRaw">;

export type PaywallMode =
  | "OPEN"
  | "METERED"
  | "PASS_ACTIVE"
  | "FROZEN"
  | "PAYWALL_REQUIRED"
  | "MIGRATION_BYPASS";

export interface PaywallSummary {
  enabled: boolean;
  mode: PaywallMode;
  freeContactsRemaining: number;
  packContactsRemaining: number;
  activePassExpiresAt: string | null;
  requiresPurchase: boolean;
  offers: typeof DEFAULT_PAYWALL_OFFERS;
}

export interface ContactPaywallEvaluation {
  summary: PaywallSummary;
  unitId: string | null;
  unitIdentityEpoch: number | null;
  unavailable?: boolean;
}

export type ContactConsumptionDecision =
  | {
      ok: true;
      summary: PaywallSummary;
      unitId: string | null;
      unitIdentityEpoch: number | null;
      source:
        | ContactConsumptionSource
        | "EXISTING_CONSUMPTION"
        | "ENFORCEMENT_DISABLED"
        | "EMERGENCY_OPEN"
        | "MIGRATION_BYPASS";
      consumptionId: string | null;
    }
  | {
      ok: false;
      summary: PaywallSummary;
      unitId: string | null;
      unitIdentityEpoch: number | null;
      code: "PAYWALL_REQUIRED" | "PAYWALL_UNAVAILABLE";
      message: string;
    };

function buildSummary(input?: Partial<PaywallSummary>): PaywallSummary {
  return {
    enabled: features.contactPaywall,
    mode: "OPEN",
    freeContactsRemaining: FREE_MESSAGE_START_CONTACTS,
    packContactsRemaining: 0,
    activePassExpiresAt: null,
    requiresPurchase: false,
    offers: DEFAULT_PAYWALL_OFFERS,
    ...input,
  };
}

function buildSummaryFromEntitlementState(
  state: Pick<
    EntitlementStateSnapshot,
    | "creditsFreeRemaining"
    | "creditsPaidRemaining"
    | "activePassWindowEnd"
    | "activePassWindowStart"
    | "freezeReason"
    | "fraudFlag"
  >
): PaywallSummary {
  if (state.freezeReason !== "NONE" || state.fraudFlag) {
    return buildSummary({
      mode: "FROZEN",
      freeContactsRemaining: state.creditsFreeRemaining,
      packContactsRemaining: state.creditsPaidRemaining,
      activePassExpiresAt: null,
      requiresPurchase: true,
    });
  }

  if (
    state.activePassWindowStart &&
    state.activePassWindowStart.getTime() <= Date.now() &&
    state.activePassWindowEnd &&
    state.activePassWindowEnd.getTime() > Date.now()
  ) {
    return buildSummary({
      mode: "PASS_ACTIVE",
      freeContactsRemaining: state.creditsFreeRemaining,
      packContactsRemaining: state.creditsPaidRemaining,
      activePassExpiresAt: state.activePassWindowEnd.toISOString(),
      requiresPurchase: false,
    });
  }

  const requiresPurchase =
    state.creditsFreeRemaining === 0 && state.creditsPaidRemaining === 0;

  return buildSummary({
    mode: requiresPurchase ? "PAYWALL_REQUIRED" : "METERED",
    freeContactsRemaining: state.creditsFreeRemaining,
    packContactsRemaining: state.creditsPaidRemaining,
    activePassExpiresAt: null,
    requiresPurchase,
  });
}

async function resolveUnitContext(
  client: ContactPaywallClient,
  physicalUnitId: string | null | undefined
): Promise<{ unitId: string | null; unitIdentityEpoch: number | null }> {
  if (!physicalUnitId) {
    return { unitId: null, unitIdentityEpoch: null };
  }

  const unit = await client.physicalUnit.findUnique({
    where: { id: physicalUnitId },
    select: { id: true, unitIdentityEpoch: true },
  });

  if (!unit) {
    return { unitId: physicalUnitId, unitIdentityEpoch: null };
  }

  return {
    unitId: unit.id,
    unitIdentityEpoch: unit.unitIdentityEpoch,
  };
}

async function getPackGrantUsage(
  client: ContactPaywallClient,
  grants: Array<Pick<EntitlementGrant, "id" | "creditCount" | "createdAt">>,
  contactKind: ContactKind
): Promise<Map<string, number>> {
  const usage = new Map<string, number>();

  if (grants.length === 0) {
    return usage;
  }

  const groupRows = await client.contactConsumption.groupBy({
    by: ["entitlementGrantId"],
    where: {
      entitlementGrantId: { in: grants.map((grant) => grant.id) },
      contactKind,
      source: "PACK",
      restorationState: "NONE",
    },
    _count: { _all: true },
  });

  for (const row of groupRows) {
    if (row.entitlementGrantId) {
      usage.set(row.entitlementGrantId, row._count._all);
    }
  }

  return usage;
}

export async function evaluateMessageStartPaywall(input: {
  userId?: string | null;
  physicalUnitId?: string | null;
}): Promise<ContactPaywallEvaluation> {
  return evaluateContactPaywallWithClient(prisma, {
    ...input,
    contactKind: "MESSAGE_START",
  });
}

export async function evaluateContactPaywall(input: {
  userId?: string | null;
  physicalUnitId?: string | null;
  contactKind: ContactKind;
}): Promise<ContactPaywallEvaluation> {
  return evaluateContactPaywallWithClient(prisma, input);
}

async function evaluateContactPaywallDirectWithClient(
  client: ContactPaywallClient,
  input: {
    userId?: string | null;
    physicalUnitId?: string | null;
    contactKind: ContactKind;
  }
): Promise<ContactPaywallEvaluation> {
  if (!features.contactPaywall) {
    return {
      summary: buildSummary({ enabled: false, mode: "OPEN" }),
      unitId: input.physicalUnitId ?? null,
      unitIdentityEpoch: null,
    };
  }

  const unitContext = await resolveUnitContext(client, input.physicalUnitId);

  if (!unitContext.unitId || unitContext.unitIdentityEpoch === null) {
    return {
      summary: buildSummary({
        mode: "MIGRATION_BYPASS",
        requiresPurchase: false,
      }),
      ...unitContext,
    };
  }

  if (!input.userId) {
    return {
      summary: buildSummary({
        mode: "METERED",
      }),
      ...unitContext,
    };
  }

  const [freeUsedCount, activePassGrant, packGrants] = await Promise.all([
    client.contactConsumption.count({
      where: {
        userId: input.userId,
        contactKind: input.contactKind,
        source: "FREE",
        restorationState: "NONE",
      },
    }),
    client.entitlementGrant.findFirst({
      where: {
        userId: input.userId,
        contactKind: input.contactKind,
        grantType: "PASS",
        status: "ACTIVE",
        activeUntil: { gt: new Date() },
      },
      orderBy: { activeUntil: "desc" },
      select: {
        id: true,
        activeUntil: true,
      },
    }),
    client.entitlementGrant.findMany({
      where: {
        userId: input.userId,
        contactKind: input.contactKind,
        grantType: "PACK",
        status: "ACTIVE",
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        creditCount: true,
        createdAt: true,
      },
    }),
  ]);

  const packUsage = await getPackGrantUsage(client, packGrants, input.contactKind);
  const packContactsRemaining = packGrants.reduce((total, grant) => {
    const creditCount = grant.creditCount ?? 0;
    const usedCount = packUsage.get(grant.id) ?? 0;
    return total + Math.max(creditCount - usedCount, 0);
  }, 0);
  const freeContactsRemaining = Math.max(
    0,
    FREE_MESSAGE_START_CONTACTS - freeUsedCount
  );

  if (activePassGrant?.activeUntil) {
    return {
      summary: buildSummary({
        mode: "PASS_ACTIVE",
        freeContactsRemaining,
        packContactsRemaining,
        activePassExpiresAt: activePassGrant.activeUntil.toISOString(),
      }),
      ...unitContext,
    };
  }

  const requiresPurchase =
    freeContactsRemaining === 0 && packContactsRemaining === 0;

  return {
    summary: buildSummary({
      mode: requiresPurchase ? "PAYWALL_REQUIRED" : "METERED",
      freeContactsRemaining,
      packContactsRemaining,
      requiresPurchase,
    }),
    ...unitContext,
  };
}

async function evaluateContactPaywallPreflightWithClient(
  client: ContactPaywallClient,
  input: {
    physicalUnitId?: string | null;
  }
): Promise<ContactPaywallEvaluation> {
  if (!features.contactPaywall) {
    return {
      summary: buildSummary({ enabled: false, mode: "OPEN" }),
      unitId: input.physicalUnitId ?? null,
      unitIdentityEpoch: null,
    };
  }

  const unitContext = await resolveUnitContext(client, input.physicalUnitId);
  if (!unitContext.unitId || unitContext.unitIdentityEpoch === null) {
    return {
      summary: buildSummary({
        mode: "MIGRATION_BYPASS",
        requiresPurchase: false,
      }),
      ...unitContext,
    };
  }

  return {
    summary: buildSummary({ mode: "METERED" }),
    ...unitContext,
  };
}

async function evaluateContactPaywallWithClient(
  client: ContactPaywallClient,
  input: {
    userId?: string | null;
    physicalUnitId?: string | null;
    contactKind: ContactKind;
  }
): Promise<ContactPaywallEvaluation> {
  const directEvaluation = await evaluateContactPaywallDirectWithClient(
    client,
    input
  );

  if (
    !features.contactPaywall ||
    !features.entitlementState ||
    !input.userId ||
    !directEvaluation.unitId ||
    directEvaluation.unitIdentityEpoch === null
  ) {
    return directEvaluation;
  }

  const stateResult = await getFreshEntitlementState(
    client,
    input.userId,
    input.contactKind
  );
  if (!stateResult.ok) {
    return {
      ...directEvaluation,
      unavailable: true,
    };
  }

  return {
    summary: buildSummaryFromEntitlementState(stateResult.state),
    unitId: directEvaluation.unitId,
    unitIdentityEpoch: directEvaluation.unitIdentityEpoch,
  };
}

async function createConsumption(
  client: TransactionClient,
  input: {
    userId: string;
    listingId: string;
    unitId: string;
    unitIdentityEpoch: number;
    contactKind: ContactKind;
    source: ContactConsumptionSource;
    clientIdempotencyKey: string;
    entitlementGrantId?: string | null;
  }
) {
  const consumption = await client.contactConsumption.create({
    data: {
      userId: input.userId,
      listingId: input.listingId,
      unitId: input.unitId,
      unitIdentityEpoch: input.unitIdentityEpoch,
      contactKind: input.contactKind,
      source: input.source,
      consumedCreditFrom:
        input.source === "PASS" ? "NONE_PASS_UNLIMITED" : input.source,
      clientIdempotencyKey: input.clientIdempotencyKey,
      restorationEligibleUntil: buildRestorationEligibleUntil(),
      entitlementGrantId: input.entitlementGrantId ?? null,
    },
    select: { id: true },
  });

  recordContactConsumptionCreated({
    userId: input.userId,
    unitId: input.unitId,
    unitIdentityEpoch: input.unitIdentityEpoch,
    source: input.source,
  });

  if (features.entitlementState) {
    await recomputeEntitlementState(client, input.userId, input.contactKind);
  }

  return consumption.id;
}

export async function attachConsumptionToConversation(
  tx: TransactionClient,
  input: { consumptionId: string | null; conversationId: string }
) {
  if (!input.consumptionId) {
    return;
  }

  await tx.contactConsumption.update({
    where: { id: input.consumptionId },
    data: { conversationId: input.conversationId },
  });
}

export async function consumeMessageStartEntitlement(
  tx: TransactionClient,
  input: {
    userId: string;
    listingId: string;
    physicalUnitId?: string | null;
    clientIdempotencyKey?: string | null;
  }
): Promise<ContactConsumptionDecision> {
  return consumeContactEntitlement(tx, {
    ...input,
    contactKind: "MESSAGE_START",
  });
}

export async function consumeContactEntitlement(
  tx: TransactionClient,
  input: {
    userId: string;
    listingId: string;
    physicalUnitId?: string | null;
    clientIdempotencyKey?: string | null;
    contactKind: ContactKind;
  }
): Promise<ContactConsumptionDecision> {
  if (!features.contactPaywall || !features.contactPaywallEnforcement) {
    const evaluation = await evaluateContactPaywallDirectWithClient(tx, input);
    return {
      ok: true,
      ...evaluation,
      source: "ENFORCEMENT_DISABLED",
      consumptionId: null,
    };
  }

  const preflight = await evaluateContactPaywallPreflightWithClient(tx, input);

  if (!preflight.unitId || preflight.unitIdentityEpoch === null) {
    recordPaywallBypassMissingUnitId({
      userId: input.userId,
      listingId: input.listingId,
      reason: input.physicalUnitId
        ? "missing_physical_unit_row"
        : "missing_physical_unit_id",
    });
    return {
      ok: true,
      ...preflight,
      source: "MIGRATION_BYPASS",
      consumptionId: null,
    };
  }

  if (features.emergencyOpenPaywall) {
    await recordEmergencyOpenGrant(tx, {
      userId: input.userId,
      listingId: input.listingId,
      unitId: preflight.unitId,
      unitIdentityEpoch: preflight.unitIdentityEpoch,
      contactKind: input.contactKind,
    });
    return {
      ok: true,
      ...preflight,
      source: "EMERGENCY_OPEN",
      consumptionId: null,
    };
  }

  const evaluation = await evaluateContactPaywallWithClient(tx, input);

  if (evaluation.unavailable) {
    return {
      ok: false,
      ...evaluation,
      code: "PAYWALL_UNAVAILABLE",
      message: "Contact is temporarily unavailable. Please try again shortly.",
    };
  }

  if (!evaluation.unitId || evaluation.unitIdentityEpoch === null) {
    recordPaywallBypassMissingUnitId({
      userId: input.userId,
      listingId: input.listingId,
      reason: input.physicalUnitId
        ? "missing_physical_unit_row"
        : "missing_physical_unit_id",
    });
    return {
      ok: true,
      ...evaluation,
      source: "MIGRATION_BYPASS",
      consumptionId: null,
    };
  }

  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${`paywall:${input.userId}:${input.contactKind}`}))
  `;

  const idempotencyKey = input.clientIdempotencyKey?.trim() || `legacy:${randomUUID()}`;
  const existingByIdempotency = await tx.contactConsumption.findUnique({
    where: {
      userId_clientIdempotencyKey: {
        userId: input.userId,
        clientIdempotencyKey: idempotencyKey,
      },
    },
    select: { id: true },
  });

  if (existingByIdempotency) {
    return {
      ok: true,
      ...evaluation,
      source: "EXISTING_CONSUMPTION",
      consumptionId: existingByIdempotency.id,
    };
  }

  const existingConsumption = await tx.contactConsumption.findUnique({
    where: {
      userId_unitId_unitIdentityEpoch_contactKind: {
        userId: input.userId,
        unitId: evaluation.unitId,
        unitIdentityEpoch: evaluation.unitIdentityEpoch,
        contactKind: input.contactKind,
      },
    },
    select: { id: true },
  });

  if (existingConsumption) {
    return {
      ok: true,
      ...evaluation,
      source: "EXISTING_CONSUMPTION",
      consumptionId: existingConsumption.id,
    };
  }

  const refreshed = await evaluateContactPaywallWithClient(tx, input);

  if (refreshed.unavailable) {
    return {
      ok: false,
      ...refreshed,
      code: "PAYWALL_UNAVAILABLE",
      message: "Contact is temporarily unavailable. Please try again shortly.",
    };
  }

  if (!refreshed.unitId || refreshed.unitIdentityEpoch === null) {
    return {
      ok: true,
      ...refreshed,
      source: "MIGRATION_BYPASS",
      consumptionId: null,
    };
  }

  const activePassGrant = await tx.entitlementGrant.findFirst({
    where: {
      userId: input.userId,
      contactKind: input.contactKind,
      grantType: "PASS",
      status: "ACTIVE",
      activeUntil: { gt: new Date() },
    },
    orderBy: { activeUntil: "desc" },
    select: { id: true },
  });

  if (activePassGrant) {
    const consumptionId = await createConsumption(tx, {
      userId: input.userId,
      listingId: input.listingId,
      unitId: refreshed.unitId,
      unitIdentityEpoch: refreshed.unitIdentityEpoch,
      contactKind: input.contactKind,
      source: "PASS",
      clientIdempotencyKey: idempotencyKey,
      entitlementGrantId: activePassGrant.id,
    });

    return {
      ok: true,
      ...refreshed,
      source: "PASS",
      consumptionId,
    };
  }

  const freeUsedCount = await tx.contactConsumption.count({
    where: {
      userId: input.userId,
      contactKind: input.contactKind,
      source: "FREE",
      restorationState: "NONE",
    },
  });

  if (freeUsedCount < FREE_MESSAGE_START_CONTACTS) {
    const consumptionId = await createConsumption(tx, {
      userId: input.userId,
      listingId: input.listingId,
      unitId: refreshed.unitId,
      unitIdentityEpoch: refreshed.unitIdentityEpoch,
      contactKind: input.contactKind,
      source: "FREE",
      clientIdempotencyKey: idempotencyKey,
    });

    return {
      ok: true,
      ...refreshed,
      source: "FREE",
      consumptionId,
    };
  }

  const packGrants = await tx.entitlementGrant.findMany({
    where: {
      userId: input.userId,
      contactKind: input.contactKind,
      grantType: "PACK",
      status: "ACTIVE",
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      creditCount: true,
      createdAt: true,
    },
  });
  const packUsage = await getPackGrantUsage(tx, packGrants, input.contactKind);
  const selectedGrant = packGrants.find((grant) => {
    const creditCount = grant.creditCount ?? 0;
    const usedCount = packUsage.get(grant.id) ?? 0;
    return creditCount > usedCount;
  });

  if (selectedGrant) {
    const consumptionId = await createConsumption(tx, {
      userId: input.userId,
      listingId: input.listingId,
      unitId: refreshed.unitId,
      unitIdentityEpoch: refreshed.unitIdentityEpoch,
      contactKind: input.contactKind,
      source: "PACK",
      clientIdempotencyKey: idempotencyKey,
      entitlementGrantId: selectedGrant.id,
    });

    return {
      ok: true,
      ...refreshed,
      source: "PACK",
      consumptionId,
    };
  }

  return {
    ok: false,
    ...refreshed,
    code: "PAYWALL_REQUIRED",
    message: "Unlock contact to message this host.",
  };
}
