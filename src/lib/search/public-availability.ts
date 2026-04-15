export type PublicAvailabilitySource = "LEGACY_BOOKING" | "HOST_MANAGED";

export interface PublicAvailability {
  availabilitySource: PublicAvailabilitySource;
  openSlots: number;
  totalSlots: number;
  availableFrom: string | null;
  availableUntil: string | null;
  minStayMonths: number;
  lastConfirmedAt: string | null;
}

export interface BuildPublicAvailabilityInput {
  availabilitySource?: PublicAvailabilitySource | null;
  openSlots?: number | null;
  availableSlots?: number | null;
  totalSlots?: number | null;
  availableFrom?: Date | string | null;
  moveInDate?: Date | string | null;
  availableUntil?: Date | string | null;
  minStayMonths?: number | null;
  lastConfirmedAt?: Date | string | null;
}

function toSafeCount(value: number | null | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function toDateOnlyString(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const dateOnlyMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateOnlyMatch) {
      return dateOnlyMatch[1];
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export function buildPublicAvailability(
  input: BuildPublicAvailabilityInput
): PublicAvailability {
  const openSlots = toSafeCount(input.openSlots ?? input.availableSlots, 0);
  const totalSlots = Math.max(
    openSlots,
    toSafeCount(input.totalSlots, openSlots)
  );

  return {
    availabilitySource: input.availabilitySource ?? "LEGACY_BOOKING",
    openSlots,
    totalSlots,
    availableFrom: toDateOnlyString(input.availableFrom ?? input.moveInDate),
    availableUntil: toDateOnlyString(input.availableUntil),
    minStayMonths: Math.max(1, toSafeCount(input.minStayMonths, 1)),
    lastConfirmedAt: toIsoString(input.lastConfirmedAt),
  };
}
