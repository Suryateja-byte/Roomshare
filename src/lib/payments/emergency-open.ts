import "server-only";

import type { ContactKind } from "@prisma/client";
import type { TransactionClient } from "@/lib/db/with-actor";
import { recordAuditEvent } from "@/lib/audit/events";

export async function recordEmergencyOpenGrant(
  tx: TransactionClient,
  input: {
    userId: string;
    listingId: string;
    unitId: string;
    unitIdentityEpoch: number;
    contactKind: ContactKind;
  }
) {
  await recordAuditEvent(tx, {
    kind: "EMERGENCY_GRANT",
    actor: { role: "system", id: null },
    aggregateType: "contact_consumption",
    aggregateId: input.listingId,
    details: {
      userId: input.userId,
      unitId: input.unitId,
      contactKind: input.contactKind,
      reason: "emergency_open_paywall",
    },
    unitIdentityEpoch: input.unitIdentityEpoch,
  });

  await tx.fraudAuditJob.create({
    data: {
      status: "SCHEDULED",
      reason: "fraud_audit_after_emergency_open_paywall",
      metadata: {
        userId: input.userId,
        listingId: input.listingId,
        unitId: input.unitId,
        contactKind: input.contactKind,
      },
    },
  });
}
