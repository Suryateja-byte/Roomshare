export type PublicAvailabilitySource = "LEGACY_BOOKING" | "HOST_MANAGED";

export type FreshnessBucket =
  | "NOT_APPLICABLE"
  | "UNCONFIRMED"
  | "NORMAL"
  | "REMINDER"
  | "STALE"
  | "AUTO_PAUSE_DUE";

export type PublicStatus =
  | "AVAILABLE"
  | "FULL"
  | "CLOSED"
  | "PAUSED"
  | "NEEDS_RECONFIRMATION";

export interface PublicAvailability {
  availabilitySource: PublicAvailabilitySource;
  openSlots: number;
  totalSlots: number;
  availableFrom: string | null;
  availableUntil: string | null;
  minStayMonths: number;
  lastConfirmedAt: string | null;
}

export interface FreshnessReadModel {
  freshnessBucket: FreshnessBucket;
  searchEligible: boolean;
  staleAt: string | null;
  autoPauseAt: string | null;
  publicStatus: PublicStatus;
}

export interface ResolvedPublicAvailability
  extends PublicAvailability,
    FreshnessReadModel {
  effectiveAvailableSlots: number;
  isValid: boolean;
  isPubliclyAvailable: boolean;
}

export interface PublicSearchEligibilityInput {
  needsMigrationReview?: boolean | null;
  statusReason?: string | null;
  resolvedAvailability: ResolvedPublicAvailability;
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

interface BuildFreshnessReadModelOptions {
  now?: Date;
  isValid?: boolean;
  isPubliclyAvailable?: boolean;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const REMINDER_THRESHOLD_DAYS = 14;
export const STALE_THRESHOLD_DAYS = 21;
export const AUTO_PAUSE_THRESHOLD_DAYS = 30;

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

function addDaysToIsoString(value: string, days: number): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getTime() + days * DAY_IN_MS).toISOString();
}

function resolvePublicStatus(
  status: string | null | undefined,
  statusReason: string | null | undefined
): PublicStatus {
  if (status === "ACTIVE") {
    return "AVAILABLE";
  }

  if (status === "RENTED") {
    return statusReason === "NO_OPEN_SLOTS" ? "FULL" : "CLOSED";
  }

  if (statusReason === "STALE_AUTO_PAUSE") {
    return "NEEDS_RECONFIRMATION";
  }

  return "PAUSED";
}

function resolveHostManagedFreshness(
  lastConfirmedAt: Date | string | null | undefined,
  now: Date
): Pick<FreshnessReadModel, "freshnessBucket" | "staleAt" | "autoPauseAt"> {
  const normalizedLastConfirmedAt = toIsoString(lastConfirmedAt);

  if (!normalizedLastConfirmedAt) {
    return {
      freshnessBucket: "UNCONFIRMED",
      staleAt: null,
      autoPauseAt: null,
    };
  }

  const reminderAt = addDaysToIsoString(
    normalizedLastConfirmedAt,
    REMINDER_THRESHOLD_DAYS
  );
  const staleAt = addDaysToIsoString(
    normalizedLastConfirmedAt,
    STALE_THRESHOLD_DAYS
  );
  const autoPauseAt = addDaysToIsoString(
    normalizedLastConfirmedAt,
    AUTO_PAUSE_THRESHOLD_DAYS
  );
  const nowTime = now.getTime();
  const reminderAtTime = reminderAt ? new Date(reminderAt).getTime() : null;
  const staleAtTime = staleAt ? new Date(staleAt).getTime() : null;
  const autoPauseAtTime = autoPauseAt ? new Date(autoPauseAt).getTime() : null;

  if (autoPauseAtTime !== null && nowTime >= autoPauseAtTime) {
    return {
      freshnessBucket: "AUTO_PAUSE_DUE",
      staleAt,
      autoPauseAt,
    };
  }

  if (staleAtTime !== null && nowTime >= staleAtTime) {
    return {
      freshnessBucket: "STALE",
      staleAt,
      autoPauseAt,
    };
  }

  if (reminderAtTime !== null && nowTime >= reminderAtTime) {
    return {
      freshnessBucket: "REMINDER",
      staleAt,
      autoPauseAt,
    };
  }

  return {
    freshnessBucket: "NORMAL",
    staleAt,
    autoPauseAt,
  };
}

export function buildFreshnessReadModel(
  listing: PublicAvailabilityListingInput,
  options: BuildFreshnessReadModelOptions = {}
): FreshnessReadModel {
  const publicStatus = resolvePublicStatus(listing.status, listing.statusReason);

  if (listing.availabilitySource !== "HOST_MANAGED") {
    return {
      freshnessBucket: "NOT_APPLICABLE",
      searchEligible: listing.status === "ACTIVE",
      staleAt: null,
      autoPauseAt: null,
      publicStatus,
    };
  }

  const freshness = resolveHostManagedFreshness(
    listing.lastConfirmedAt,
    options.now ?? new Date()
  );
  const isPubliclyAvailable =
    options.isPubliclyAvailable ?? listing.status === "ACTIVE";
  const isValid = options.isValid ?? isPubliclyAvailable;

  return {
    ...freshness,
    publicStatus,
    searchEligible:
      isValid &&
      isPubliclyAvailable &&
      freshness.freshnessBucket !== "STALE" &&
      freshness.freshnessBucket !== "AUTO_PAUSE_DUE",
  };
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
  const freshnessReadModel = buildFreshnessReadModel(listing, {
    now,
    isValid,
    isPubliclyAvailable: isValid,
  });

  return {
    ...availability,
    effectiveAvailableSlots: isValid ? availability.openSlots : 0,
    isValid,
    isPubliclyAvailable: isValid,
    ...freshnessReadModel,
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
  const freshnessReadModel = buildFreshnessReadModel({
    ...listing,
    availabilitySource: "LEGACY_BOOKING",
  });

  return {
    ...availability,
    effectiveAvailableSlots,
    isValid: true,
    isPubliclyAvailable: listing.status === "ACTIVE",
    ...freshnessReadModel,
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

export function isListingEligibleForPublicSearch(
  input: PublicSearchEligibilityInput
): boolean {
  return (
    input.resolvedAvailability.searchEligible &&
    input.needsMigrationReview !== true &&
    input.statusReason !== "MIGRATION_REVIEW"
  );
}
