import "server-only";

import { Prisma, BookingStatus } from "@prisma/client";

export type BookingAuditAction =
  | "CREATED"
  | "HELD"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export type BookingAuditActorType = "USER" | "HOST" | "SYSTEM" | "ADMIN";

// PII keys that must never appear in audit details
// Fix 5: Include compound variants (tenantEmail, hostName, etc.)
const PII_KEYS = new Set([
  "email",
  "phone",
  "name",
  "address",
  "firstName",
  "lastName",
  "fullName",
  "phoneNumber",
  "tenantEmail",
  "tenantName",
  "hostEmail",
  "hostName",
]);

function stripPii(
  details?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!PII_KEYS.has(key)) clean[key] = value;
  }
  return clean;
}

/**
 * Insert an audit row inside the calling transaction.
 * Always enabled — audit trail must never be silently disabled.
 * Errors propagate — rolling back the parent TX (no unaudited transitions).
 */
export async function logBookingAudit(
  tx: Prisma.TransactionClient,
  params: {
    bookingId: string;
    action: BookingAuditAction;
    // Fix 6: Use BookingStatus from @prisma/client for type safety
    previousStatus: BookingStatus | null;
    newStatus: BookingStatus;
    actorId: string | null;
    actorType: BookingAuditActorType;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
  }
): Promise<void> {
  await tx.bookingAuditLog.create({
    data: {
      bookingId: params.bookingId,
      action: params.action,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      actorId: params.actorId,
      actorType: params.actorType,
      details: stripPii(params.details) as Prisma.InputJsonValue | undefined,
      ipAddress: params.ipAddress,
    },
  });
}
