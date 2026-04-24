export interface IdentityDrillUnit {
  id: string;
  epoch: number;
  supersededByUnitId?: string | null;
  supersedesUnitIds?: string[];
}

export interface IdentityDrillContactConsumption {
  userId: string;
  unitId: string;
  contactKind: "MESSAGE_START" | "REVEAL_PHONE";
  unitIdentityEpoch: number;
}

export interface IdentityDrillEntitlement {
  userId: string;
  creditsRemaining: number;
  activePass: boolean;
}

export interface IdentityDrillState {
  units: IdentityDrillUnit[];
  contactConsumptions: IdentityDrillContactConsumption[];
  entitlements: IdentityDrillEntitlement[];
  savedUnitIds: string[];
  reviewUnitIds: string[];
  searchOrder: string[];
}

export interface IdentityDrillReport {
  kind: "MERGE" | "SPLIT";
  resultingEpoch: number;
  anomalies: string[];
  entitlementCreditsBefore: number;
  entitlementCreditsAfter: number;
}

function cloneState(state: IdentityDrillState): IdentityDrillState {
  return JSON.parse(JSON.stringify(state)) as IdentityDrillState;
}

function totalCredits(state: IdentityDrillState): number {
  return state.entitlements.reduce(
    (sum, entitlement) => sum + entitlement.creditsRemaining,
    0
  );
}

function nextEpoch(state: IdentityDrillState): number {
  return Math.max(...state.units.map((unit) => unit.epoch), 0) + 1;
}

function contactKey(contact: IdentityDrillContactConsumption): string {
  return [
    contact.userId,
    contact.unitId,
    contact.contactKind,
    String(contact.unitIdentityEpoch),
  ].join(":");
}

function validateState(state: IdentityDrillState): string[] {
  const anomalies: string[] = [];
  const units = new Set(state.units.map((unit) => unit.id));
  const contactKeys = new Set<string>();

  for (const contact of state.contactConsumptions) {
    if (!units.has(contact.unitId)) {
      anomalies.push(`contact references missing unit ${contact.unitId}`);
    }
    const key = contactKey(contact);
    if (contactKeys.has(key)) {
      anomalies.push(`duplicate contact consumption ${key}`);
    }
    contactKeys.add(key);
  }

  for (const unitId of state.savedUnitIds) {
    if (!units.has(unitId)) anomalies.push(`saved item references ${unitId}`);
  }

  for (const unitId of state.reviewUnitIds) {
    if (!units.has(unitId)) anomalies.push(`review references ${unitId}`);
  }

  for (const unitId of state.searchOrder) {
    if (!units.has(unitId)) anomalies.push(`search order references ${unitId}`);
  }

  return anomalies;
}

function dedupeContacts(
  contacts: IdentityDrillContactConsumption[]
): IdentityDrillContactConsumption[] {
  const seen = new Set<string>();
  const deduped: IdentityDrillContactConsumption[] = [];
  for (const contact of contacts) {
    const key = contactKey(contact);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(contact);
  }
  return deduped;
}

export function runSyntheticIdentityMergeDrill(
  state: IdentityDrillState,
  fromUnitIds: string[],
  targetUnitId: string
): IdentityDrillReport {
  const next = cloneState(state);
  const epoch = nextEpoch(next);
  const from = new Set(fromUnitIds);
  const creditsBefore = totalCredits(next);

  next.units = next.units.map((unit) => {
    if (from.has(unit.id)) {
      return { ...unit, epoch, supersededByUnitId: targetUnitId };
    }
    if (unit.id === targetUnitId) {
      return {
        ...unit,
        epoch,
        supersedesUnitIds: Array.from(
          new Set([...(unit.supersedesUnitIds ?? []), ...fromUnitIds])
        ),
      };
    }
    return unit;
  });

  next.contactConsumptions = dedupeContacts(
    next.contactConsumptions.map((contact) =>
      from.has(contact.unitId)
        ? { ...contact, unitId: targetUnitId, unitIdentityEpoch: epoch }
        : contact.unitId === targetUnitId
          ? { ...contact, unitIdentityEpoch: epoch }
          : contact
    )
  );
  next.savedUnitIds = next.savedUnitIds.map((unitId) =>
    from.has(unitId) ? targetUnitId : unitId
  );
  next.reviewUnitIds = next.reviewUnitIds.map((unitId) =>
    from.has(unitId) ? targetUnitId : unitId
  );
  next.searchOrder = next.searchOrder
    .map((unitId) => (from.has(unitId) ? targetUnitId : unitId))
    .filter((unitId, index, values) => values.indexOf(unitId) === index);

  const anomalies = validateState(next);
  const creditsAfter = totalCredits(next);
  if (creditsBefore !== creditsAfter) {
    anomalies.push("entitlement credit total changed during merge");
  }

  return {
    kind: "MERGE",
    resultingEpoch: epoch,
    anomalies,
    entitlementCreditsBefore: creditsBefore,
    entitlementCreditsAfter: creditsAfter,
  };
}

export function runSyntheticIdentitySplitDrill(
  state: IdentityDrillState,
  sourceUnitId: string,
  targetUnitIds: string[]
): IdentityDrillReport {
  const next = cloneState(state);
  const epoch = nextEpoch(next);
  const targets = new Set(targetUnitIds);
  const creditsBefore = totalCredits(next);

  next.units = next.units.map((unit) => {
    if (unit.id === sourceUnitId || targets.has(unit.id)) {
      return {
        ...unit,
        epoch,
        supersedesUnitIds:
          unit.id === sourceUnitId
            ? unit.supersedesUnitIds
            : Array.from(new Set([...(unit.supersedesUnitIds ?? []), sourceUnitId])),
      };
    }
    return unit;
  });

  next.contactConsumptions = dedupeContacts(
    next.contactConsumptions.map((contact, index) => {
      if (contact.unitId !== sourceUnitId) return contact;
      const target = targetUnitIds[index % targetUnitIds.length] ?? sourceUnitId;
      return { ...contact, unitId: target, unitIdentityEpoch: epoch };
    })
  );
  next.savedUnitIds = next.savedUnitIds.map((unitId, index) =>
    unitId === sourceUnitId
      ? targetUnitIds[index % targetUnitIds.length] ?? sourceUnitId
      : unitId
  );
  next.reviewUnitIds = next.reviewUnitIds.map((unitId, index) =>
    unitId === sourceUnitId
      ? targetUnitIds[index % targetUnitIds.length] ?? sourceUnitId
      : unitId
  );
  next.searchOrder = next.searchOrder.flatMap((unitId) =>
    unitId === sourceUnitId ? targetUnitIds : [unitId]
  );

  const anomalies = validateState(next);
  const creditsAfter = totalCredits(next);
  if (creditsBefore !== creditsAfter) {
    anomalies.push("entitlement credit total changed during split");
  }

  return {
    kind: "SPLIT",
    resultingEpoch: epoch,
    anomalies,
    entitlementCreditsBefore: creditsBefore,
    entitlementCreditsAfter: creditsAfter,
  };
}
