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

export interface ResolvedPublicAvailability extends PublicAvailability {
  effectiveAvailableSlots: number;
  isValid: boolean;
  isPubliclyAvailable: boolean;
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

export interface PublicAvailabilityListingInput
  extends BuildPublicAvailabilityInput {
  id?: string;
  status?: string | null;
  statusReason?: string | null;
}

export interface LegacyAvailabilitySnapshotLike {
  totalSlots?: number | null;
  effectiveAvailableSlots?: number | null;
}

interface ResolvePublicAvailabilityOptions {
  now?: Date;
  legacySnapshot?: LegacyAvailabilitySnapshotLike | null;
}

interface ResolvePublicAvailabilityForListingsOptions {
  now?: Date;
  legacyAvailabilityByListing?: Map<string, LegacyAvailabilitySnapshotLike>;
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

function isFutureOrSameDay(
  candidateDate: string | null,
  reference: Date
): boolean {
  if (!candidateDate) {
    return true;
  }

  const normalizedReference = reference.toISOString().slice(0, 10);
  return candidateDate >= normalizedReference;
}

export function isHostManagedAvailabilityValid(
  listing: PublicAvailabilityListingInput,
  now: Date = new Date()
): boolean {
  if (listing.availabilitySource !== "HOST_MANAGED") {
    return false;
  }

  const availability = buildPublicAvailability(listing);
  const openSlots = listing.openSlots;

  if (listing.status !== "ACTIVE") {
    return false;
  }

  if (typeof openSlots !== "number" || !Number.isFinite(openSlots)) {
    return false;
  }

  if (availability.totalSlots < 1) {
    return false;
  }

  if (openSlots < 0 || openSlots > availability.totalSlots) {
    return false;
  }

  if (!availability.availableFrom) {
    return false;
  }

  if (!isFutureOrSameDay(availability.availableUntil, now)) {
    return false;
  }

  if (
    availability.availableUntil &&
    availability.availableUntil < availability.availableFrom
  ) {
    return false;
  }

  if (availability.minStayMonths < 1) {
    return false;
  }

  if (openSlots === 0) {
    return false;
  }

  return true;
}

export function buildHostManagedPublicAvailability(
  listing: PublicAvailabilityListingInput,
  now: Date = new Date()
): ResolvedPublicAvailability {
  const availability = buildPublicAvailability({
    ...listing,
    availabilitySource: "HOST_MANAGED",
  });
  const isValid = isHostManagedAvailabilityValid(listing, now);

  return {
    ...availability,
    effectiveAvailableSlots: isValid ? availability.openSlots : 0,
    isValid,
    isPubliclyAvailable: isValid,
  };
}

export function buildLegacyPublicAvailability(
  listing: PublicAvailabilityListingInput,
  legacySnapshot?: LegacyAvailabilitySnapshotLike | null
): ResolvedPublicAvailability {
  const effectiveAvailableSlots = toSafeCount(
    legacySnapshot?.effectiveAvailableSlots ??
      listing.availableSlots ??
      listing.openSlots,
    0
  );
  const totalSlots = Math.max(
    effectiveAvailableSlots,
    toSafeCount(
      legacySnapshot?.totalSlots ?? listing.totalSlots,
      effectiveAvailableSlots
    )
  );
  const availability = buildPublicAvailability({
    ...listing,
    availabilitySource: "LEGACY_BOOKING",
    openSlots: effectiveAvailableSlots,
    totalSlots,
  });

  return {
    ...availability,
    effectiveAvailableSlots,
    isValid: true,
    isPubliclyAvailable: listing.status === "ACTIVE",
  };
}

export function resolvePublicAvailability(
  listing: PublicAvailabilityListingInput,
  options: ResolvePublicAvailabilityOptions = {}
): ResolvedPublicAvailability {
  if (listing.availabilitySource === "HOST_MANAGED") {
    return buildHostManagedPublicAvailability(listing, options.now);
  }

  return buildLegacyPublicAvailability(listing, options.legacySnapshot);
}

export function resolvePublicAvailabilityForListings<
  T extends { id: string } & PublicAvailabilityListingInput,
>(
  listings: T[],
  options: ResolvePublicAvailabilityForListingsOptions = {}
): Map<string, ResolvedPublicAvailability> {
  return new Map(
    listings.map((listing) => [
      listing.id,
      resolvePublicAvailability(listing, {
        now: options.now,
        legacySnapshot: options.legacyAvailabilityByListing?.get(listing.id),
      }),
    ])
  );
}
