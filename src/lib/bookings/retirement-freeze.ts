import { features } from "@/lib/env";
import { logger } from "@/lib/logger";

export type LegacyBookingCreateKind = "booking" | "hold";

export type LegacyBookingMutationAction =
  | "accept"
  | "reject"
  | "cancel"
  | "other";

export type LegacyBookingMutationGate = {
  blocked: boolean;
  reason: "flag_off" | "admin_bypass";
  code: "CFM_LEGACY_MUTATION_BLOCKED" | "CFM_LEGACY_MUTATION_ADMIN_BYPASS";
};

export function isBookingRetirementFreezeEnabled(): boolean {
  return features.bookingRetirementFreeze === true;
}

export function getLegacyBookingRetirementResult(kind: LegacyBookingCreateKind): {
  success: false;
  error: string;
  code: string;
} {
  logger.sync.info("cfm.booking.create_blocked_count", {
    reason: "retirement_freeze",
    kind,
  });

  return {
    success: false,
    error: "Booking requests are disabled. Contact the host instead.",
    code: "LEGACY_DRAIN_COMPLETE",
  };
}

export function getLegacyBookingMutationGate(
  isAdmin: boolean
): LegacyBookingMutationGate {
  return {
    blocked: !isAdmin,
    reason: isAdmin ? "admin_bypass" : "flag_off",
    code: isAdmin
      ? "CFM_LEGACY_MUTATION_ADMIN_BYPASS"
      : "CFM_LEGACY_MUTATION_BLOCKED",
  };
}
