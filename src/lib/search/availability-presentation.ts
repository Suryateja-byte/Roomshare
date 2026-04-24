import type {
  FreshnessBucket,
  PublicAvailability,
  PublicStatus,
} from "@/lib/search/public-availability";
import type { GroupContextPresentation } from "@/lib/search-types";

export type AvailabilityPresentationState =
  | "available"
  | "partial"
  | "filled"
  | "full"
  | "closed"
  | "paused"
  | "needs-reconfirmation";

export type AvailabilityPublicAvailability = PublicAvailability & {
  publicStatus?: PublicStatus;
  freshnessBucket?: FreshnessBucket;
};

export interface AvailabilityPresentation {
  primaryLabel: string;
  ariaLabel: string;
  state: AvailabilityPresentationState;
  primaryKey: string;
  presentationKey: string;
  secondaryGroupLabel?: string;
}

interface AvailabilityPresentationInput {
  availableSlots?: number | null;
  totalSlots?: number | null;
  publicAvailability?: AvailabilityPublicAvailability | null;
  groupContext?: GroupContextPresentation | null;
}

function toSafeCount(value: number | null | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function normalizeSlotCounts(
  availableSlots: number | null | undefined,
  totalSlots: number | null | undefined
): { openSlots: number; totalSlots: number } {
  const safeOpenSlots = toSafeCount(availableSlots, 0);
  const safeTotalSlots = Math.max(toSafeCount(totalSlots, safeOpenSlots || 1), 1);

  return {
    openSlots: Math.min(safeOpenSlots, safeTotalSlots),
    totalSlots: safeTotalSlots,
  };
}

function resolveStatusBucket(
  publicAvailability: AvailabilityPublicAvailability | null | undefined
): AvailabilityPresentationState | null {
  if (!publicAvailability) {
    return null;
  }

  const { publicStatus, freshnessBucket } = publicAvailability;

  if (
    freshnessBucket === "STALE" ||
    freshnessBucket === "AUTO_PAUSE_DUE" ||
    publicStatus === "NEEDS_RECONFIRMATION"
  ) {
    return "needs-reconfirmation";
  }

  if (publicStatus === "CLOSED") {
    return "closed";
  }

  if (publicStatus === "PAUSED") {
    return "paused";
  }

  if (publicStatus === "FULL") {
    return "full";
  }

  return null;
}

function buildPrimaryPresentation(
  statusBucket: AvailabilityPresentationState | null,
  openSlots: number,
  totalSlots: number
): Pick<AvailabilityPresentation, "primaryLabel" | "ariaLabel" | "state"> {
  if (statusBucket === "needs-reconfirmation") {
    return {
      primaryLabel: "Needs reconfirmation",
      ariaLabel: "Needs reconfirmation",
      state: "needs-reconfirmation",
    };
  }

  if (statusBucket === "closed") {
    return {
      primaryLabel: "Closed",
      ariaLabel: "Closed",
      state: "closed",
    };
  }

  if (statusBucket === "paused") {
    return {
      primaryLabel: "Paused",
      ariaLabel: "Paused",
      state: "paused",
    };
  }

  if (statusBucket === "full") {
    return {
      primaryLabel: "Full",
      ariaLabel: "Full",
      state: "full",
    };
  }

  if (totalSlots <= 1) {
    if (openSlots > 0) {
      return {
        primaryLabel: "Available",
        ariaLabel: "Available",
        state: "available",
      };
    }

    return {
      primaryLabel: "Filled",
      ariaLabel: "Filled",
      state: "filled",
    };
  }

  if (openSlots === 0) {
    return {
      primaryLabel: "Filled",
      ariaLabel: "Filled",
      state: "filled",
    };
  }

  if (openSlots === totalSlots) {
    return {
      primaryLabel: `All ${totalSlots} open`,
      ariaLabel: `All ${totalSlots} open`,
      state: "available",
    };
  }

  return {
    primaryLabel: `${openSlots} of ${totalSlots} open`,
    ariaLabel: `${openSlots} of ${totalSlots} open`,
    state: "partial",
  };
}

export function createGroupContextPresentation(input: {
  siblingCount: number;
  dateCount: number;
  completeness: "complete" | "partial";
}): GroupContextPresentation {
  const siblingCount = Math.max(0, toSafeCount(input.siblingCount, 0));
  const dateCount = Math.max(0, toSafeCount(input.dateCount, 0));
  const completeness =
    input.completeness === "complete" ? "complete" : "partial";

  return {
    siblingCount,
    dateCount,
    completeness,
    secondaryLabel:
      completeness === "complete" && siblingCount > 0
        ? `Also available on ${siblingCount} similar date${siblingCount === 1 ? "" : "s"}`
        : undefined,
    contextKey: `siblings:${siblingCount}|dates:${dateCount}|completeness:${completeness}`,
  };
}

export function normalizeGroupContext(
  groupContext: GroupContextPresentation | null | undefined
): GroupContextPresentation | null {
  if (!groupContext) {
    return null;
  }

  const normalized = createGroupContextPresentation({
    siblingCount: groupContext.siblingCount,
    dateCount: groupContext.dateCount,
    completeness: groupContext.completeness,
  });

  if (
    normalized.completeness !== "complete" ||
    normalized.siblingCount <= 0 ||
    normalized.dateCount <= 1
  ) {
    return null;
  }

  return {
    ...normalized,
    secondaryLabel:
      groupContext.secondaryLabel?.trim() || normalized.secondaryLabel,
  };
}

export function getAvailabilityPresentation({
  availableSlots,
  totalSlots,
  publicAvailability,
  groupContext,
}: AvailabilityPresentationInput): AvailabilityPresentation {
  const normalizedSlots = normalizeSlotCounts(
    publicAvailability?.openSlots ?? availableSlots,
    publicAvailability?.totalSlots ?? totalSlots
  );
  const statusBucket = resolveStatusBucket(publicAvailability);
  const primary = buildPrimaryPresentation(
    statusBucket,
    normalizedSlots.openSlots,
    normalizedSlots.totalSlots
  );
  const normalizedGroupContext = normalizeGroupContext(groupContext);

  const primaryKey = [
    `state:${primary.state}`,
    `open:${normalizedSlots.openSlots}`,
    `total:${normalizedSlots.totalSlots}`,
    `status:${publicAvailability?.publicStatus ?? "unknown"}`,
    `freshness:${publicAvailability?.freshnessBucket ?? "unknown"}`,
  ].join("|");

  return {
    ...primary,
    primaryKey,
    presentationKey: `${primaryKey}|group:${normalizedGroupContext?.contextKey ?? "none"}`,
    secondaryGroupLabel: normalizedGroupContext?.secondaryLabel,
  };
}
