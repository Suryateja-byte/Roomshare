import "server-only";

import type { ActorContext, TransactionClient } from "@/lib/db/with-actor";
import { setActorContext } from "@/lib/db/with-actor";
import { isPhase01CanonicalWritesEnabled } from "@/lib/flags/phase01";
import { isKillSwitchActive } from "@/lib/flags/phase02";
import type { RawAddressInput } from "@/lib/identity/canonical-address";
import { resolveOrCreateUnit } from "@/lib/identity/resolve-or-create-unit";
import { isPublicSearchBlockedStatusReason } from "@/lib/listings/moderation-write-lock";
import { logger } from "@/lib/logger";
import { appendOutboxEvent } from "@/lib/outbox/append";
import type { ProjectionCoordinates } from "@/lib/projections/public-geocode";
import { rebuildInventorySearchProjection } from "@/lib/projections/inventory-projection";
import { rebuildUnitPublicProjection } from "@/lib/projections/unit-projection";
import type { TombstoneReason } from "@/lib/projections/tombstone";
import { handleTombstone } from "@/lib/projections/tombstone";

type ListingStatusForCanonical = "ACTIVE" | "PAUSED" | "RENTED" | string;
type CanonicalRoomCategory = "ENTIRE_PLACE" | "PRIVATE_ROOM" | "SHARED_ROOM";
type CanonicalPublishStatus =
  | "PENDING_GEOCODE"
  | "PENDING_PROJECTION"
  | "SUPPRESSED"
  | "PAUSED"
  | "ARCHIVED";

export class CanonicalInventorySyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalInventorySyncError";
  }
}

export interface CanonicalListingInventoryListing {
  id: string;
  physicalUnitId?: string | null;
  price: number | string | { toString(): string };
  roomType?: string | null;
  bookingMode?: string | null;
  totalSlots: number;
  availableSlots?: number | null;
  openSlots?: number | null;
  moveInDate?: Date | string | null;
  availableUntil?: Date | string | null;
  minStayMonths?: number | null;
  status: ListingStatusForCanonical;
  statusReason?: string | null;
  version?: number | null;
  genderPreference?: string | null;
  householdGender?: string | null;
}

export interface SyncCanonicalListingInventoryInput {
  listing: CanonicalListingInventoryListing;
  address: RawAddressInput;
  actor: ActorContext;
  requestId?: string;
  trustedCoordinates?: ProjectionCoordinates;
}

function toBigIntVersion(value: number | null | undefined): bigint {
  return BigInt(
    Math.max(1, Number.isFinite(Number(value)) ? Number(value) : 1)
  );
}

function parseSlotCount(
  value: number | null | undefined,
  field: string,
  min: number
): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < min) {
    throw new CanonicalInventorySyncError(
      `Canonical inventory ${field} must be an integer >= ${min}`
    );
  }
  return count;
}

function parsePositivePrice(
  value: CanonicalListingInventoryListing["price"]
): number {
  const price = Number(typeof value === "object" ? value.toString() : value);
  if (!Number.isFinite(price) || price <= 0) {
    throw new CanonicalInventorySyncError(
      "Canonical inventory price must be positive"
    );
  }
  return price;
}

function toDateOnly(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function classifyRoomCategory(input: {
  roomType?: string | null;
  bookingMode?: string | null;
}): CanonicalRoomCategory {
  if (input.bookingMode === "WHOLE_UNIT") return "ENTIRE_PLACE";
  const roomType = input.roomType;
  if (roomType === "Entire Place") return "ENTIRE_PLACE";
  if (roomType === "Shared Room") return "SHARED_ROOM";
  return "PRIVATE_ROOM";
}

function isVisibleListing(input: {
  status: ListingStatusForCanonical;
  statusReason?: string | null;
  openSlots: number;
  moveInDate: Date | null;
}): boolean {
  return (
    input.status === "ACTIVE" &&
    !isPublicSearchBlockedStatusReason(input.statusReason) &&
    input.openSlots > 0 &&
    input.moveInDate !== null
  );
}

function hiddenPublishStatus(input: {
  status: ListingStatusForCanonical;
  statusReason?: string | null;
}): "SUPPRESSED" | "PAUSED" | "ARCHIVED" {
  if (input.statusReason === "SUPPRESSED") return "SUPPRESSED";
  if (
    input.statusReason === "ADMIN_PAUSED" ||
    input.statusReason === "MIGRATION_REVIEW"
  ) {
    return "PAUSED";
  }
  return input.status === "PAUSED" ? "PAUSED" : "ARCHIVED";
}

export function resolveCanonicalPublishStatus(input: {
  status: ListingStatusForCanonical;
  statusReason?: string | null;
  openSlots: number;
  moveInDate: Date | null;
  geocodeStatus: string;
}): CanonicalPublishStatus {
  if (isVisibleListing(input)) {
    return input.geocodeStatus === "COMPLETE"
      ? "PENDING_PROJECTION"
      : "PENDING_GEOCODE";
  }

  return hiddenPublishStatus({
    status: input.status,
    statusReason: input.statusReason,
  });
}

function tombstoneReason(status: CanonicalPublishStatus): TombstoneReason {
  if (status === "SUPPRESSED") return "SUPPRESSION";
  if (status === "PAUSED") return "PAUSE";
  if (status === "ARCHIVED") return "ARCHIVE";
  return "TOMBSTONE";
}

function buildInventoryShape(input: {
  roomCategory: CanonicalRoomCategory;
  openSlots: number;
  totalSlots: number;
  genderPreference?: string | null;
  householdGender?: string | null;
}): {
  capacityGuests: number | null;
  totalBeds: number | null;
  openBeds: number | null;
  genderPreference: string | null;
  householdGender: string | null;
} {
  const totalSlots = Math.max(1, input.totalSlots);
  const openSlots = Math.max(0, input.openSlots);

  if (input.roomCategory === "SHARED_ROOM") {
    return {
      capacityGuests: null,
      totalBeds: totalSlots,
      openBeds: openSlots,
      genderPreference: input.genderPreference ?? null,
      householdGender: input.householdGender ?? null,
    };
  }

  return {
    capacityGuests: Math.max(1, openSlots || totalSlots),
    totalBeds: null,
    openBeds: null,
    genderPreference:
      input.roomCategory === "ENTIRE_PLACE"
        ? null
        : (input.genderPreference ?? null),
    householdGender:
      input.roomCategory === "ENTIRE_PLACE"
        ? null
        : (input.householdGender ?? null),
  };
}

function coerceUnitEpoch(value: number | string | bigint): number {
  return Number(value);
}

function coerceSourceVersion(value: number | string | bigint): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

export type SyncCanonicalListingInventorySkipped = {
  skipped: true;
  reason: "phase01_flag_off";
};

export type SyncCanonicalListingInventoryStaleSkipped = {
  skipped: true;
  reason: "stale_source_version";
  inventoryId: string;
  currentPublishStatus: string;
  currentSourceVersion: bigint;
};

export type SyncCanonicalListingInventorySynced = {
  skipped?: false;
  unitId: string;
  inventoryId: string;
  publishStatus: CanonicalPublishStatus;
  sourceVersion: bigint;
};

export type SyncCanonicalListingInventoryResult =
  | SyncCanonicalListingInventorySkipped
  | SyncCanonicalListingInventoryStaleSkipped
  | SyncCanonicalListingInventorySynced;

export async function syncCanonicalListingInventory(
  tx: TransactionClient,
  input: SyncCanonicalListingInventoryInput
): Promise<SyncCanonicalListingInventoryResult> {
  if (!isPhase01CanonicalWritesEnabled()) {
    // Emergency stop (FEATURE_PHASE01_CANONICAL_WRITES=false): skip all
    // canonical-pipeline writes (unit resolve, inventory upsert, outbox
    // appends, inline projection rebuilds). The host listing write and
    // search-doc dirty marking happen outside this function and are
    // unaffected. See docs/migration/cfm-phase01-emergency-stop.md.
    logger.sync.info("cfm.canonical.phase01_writes_skipped_count", {
      reason: "flag_off",
      seam: "syncCanonicalListingInventory",
      listingId: input.listing.id,
    });
    return { skipped: true, reason: "phase01_flag_off" };
  }

  const listing = input.listing;
  const roomCategory = classifyRoomCategory({
    roomType: listing.roomType,
    bookingMode: listing.bookingMode,
  });
  const totalSlots = parseSlotCount(listing.totalSlots, "totalSlots", 1);
  const openSlots = parseSlotCount(
    listing.openSlots ?? listing.availableSlots ?? listing.totalSlots,
    "openSlots",
    0
  );
  if (openSlots > totalSlots) {
    throw new CanonicalInventorySyncError(
      "Canonical inventory openSlots cannot exceed totalSlots"
    );
  }
  const moveInDate = toDateOnly(listing.moveInDate);
  const visible = isVisibleListing({
    status: listing.status,
    statusReason: listing.statusReason,
    openSlots,
    moveInDate,
  });

  if (
    listing.status === "ACTIVE" &&
    !isPublicSearchBlockedStatusReason(listing.statusReason) &&
    openSlots > 0 &&
    !moveInDate
  ) {
    throw new CanonicalInventorySyncError(
      "Active canonical inventory requires a move-in date"
    );
  }

  let availableFrom = moveInDate ?? todayDateOnly();
  let availableUntil = toDateOnly(listing.availableUntil);
  if (availableUntil && availableUntil < availableFrom) {
    if (visible) {
      throw new CanonicalInventorySyncError(
        "Canonical inventory available_until cannot be before available_from"
      );
    }
    availableUntil = null;
    availableFrom = moveInDate ?? todayDateOnly();
  }

  const unit = await resolveOrCreateUnit(tx, {
    address: input.address,
    actor: input.actor,
    requestId: input.requestId,
    trustedCoordinates: input.trustedCoordinates,
  });

  const publishStatus = resolveCanonicalPublishStatus({
    status: listing.status,
    statusReason: listing.statusReason,
    openSlots,
    moveInDate,
    geocodeStatus: unit.geocodeStatus,
  });

  const previousRows = await tx.$queryRaw<
    {
      unit_id: string;
      unit_identity_epoch_written_at: number | string;
      source_version: bigint | number | string;
    }[]
  >`
    SELECT unit_id, unit_identity_epoch_written_at, source_version
    FROM listing_inventories
    WHERE id = ${listing.id}
    LIMIT 1
  `;
  const previous = previousRows[0] ?? null;

  await setActorContext(tx, { role: "system", id: null });

  if (listing.physicalUnitId !== unit.unitId) {
    await tx.listing.update({
      where: { id: listing.id },
      data: { physicalUnitId: unit.unitId },
    });
  }

  const shape = buildInventoryShape({
    roomCategory,
    openSlots,
    totalSlots,
    genderPreference: listing.genderPreference,
    householdGender: listing.householdGender,
  });
  const sourceVersion = toBigIntVersion(listing.version);
  const price = parsePositivePrice(listing.price);
  const leaseMinMonths = Math.max(1, Number(listing.minStayMonths ?? 1));
  const inventoryKey = `listing:${listing.id}`;

  const upsertedRows = await tx.$queryRaw<
    {
      id: string;
      unit_id: string;
      unit_identity_epoch_written_at: number | string;
      publish_status: CanonicalPublishStatus;
      source_version: bigint | number | string;
    }[]
  >`
    INSERT INTO listing_inventories (
      id, unit_id, unit_identity_epoch_written_at, inventory_key,
      room_category, space_label, capacity_guests, total_beds, open_beds,
      available_from, available_until, availability_range, price,
      lease_min_months, lease_max_months, lease_negotiable,
      gender_preference, household_gender, lifecycle_status, publish_status,
      source_version, row_version, canonicalizer_version, canonical_address_hash,
      privacy_version, supersedes_unit_ids, superseded_by_unit_id,
      created_at, updated_at
    )
    VALUES (
      ${listing.id},
      ${unit.unitId},
      ${unit.unitIdentityEpoch},
      ${inventoryKey},
      ${roomCategory},
      ${null},
      ${shape.capacityGuests}::INTEGER,
      ${shape.totalBeds}::INTEGER,
      ${shape.openBeds}::INTEGER,
      ${availableFrom}::DATE,
      ${availableUntil}::DATE,
      tstzrange(
        ${availableFrom}::DATE::TIMESTAMPTZ,
        (${availableUntil}::DATE + INTERVAL '1 day')::TIMESTAMPTZ,
        '[)'
      ),
      ${price}::NUMERIC,
      ${leaseMinMonths}::INTEGER,
      ${null}::INTEGER,
      ${false},
      ${shape.genderPreference},
      ${shape.householdGender},
      'ACTIVE',
      ${publishStatus},
      ${sourceVersion}::BIGINT,
      1,
      ${unit.canonicalizerVersion},
      ${unit.canonicalAddressHash},
      1,
      ARRAY[]::TEXT[],
      ${null},
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      unit_id                         = EXCLUDED.unit_id,
      unit_identity_epoch_written_at  = EXCLUDED.unit_identity_epoch_written_at,
      inventory_key                   = EXCLUDED.inventory_key,
      room_category                   = EXCLUDED.room_category,
      space_label                     = EXCLUDED.space_label,
      capacity_guests                 = EXCLUDED.capacity_guests,
      total_beds                      = EXCLUDED.total_beds,
      open_beds                       = EXCLUDED.open_beds,
      available_from                  = EXCLUDED.available_from,
      available_until                 = EXCLUDED.available_until,
      availability_range              = EXCLUDED.availability_range,
      price                           = EXCLUDED.price,
      lease_min_months                = EXCLUDED.lease_min_months,
      lease_max_months                = EXCLUDED.lease_max_months,
      lease_negotiable                = EXCLUDED.lease_negotiable,
      gender_preference               = EXCLUDED.gender_preference,
      household_gender                = EXCLUDED.household_gender,
      lifecycle_status                = EXCLUDED.lifecycle_status,
      publish_status                  = EXCLUDED.publish_status,
      source_version                  = EXCLUDED.source_version,
      row_version                     = listing_inventories.row_version + 1,
      last_published_version          = CASE
        WHEN EXCLUDED.publish_status IN ('PENDING_GEOCODE', 'PENDING_PROJECTION')
          THEN listing_inventories.last_published_version
        ELSE NULL
      END,
      canonicalizer_version           = EXCLUDED.canonicalizer_version,
      canonical_address_hash          = EXCLUDED.canonical_address_hash,
      privacy_version                 = EXCLUDED.privacy_version,
      supersedes_unit_ids             = EXCLUDED.supersedes_unit_ids,
      superseded_by_unit_id           = EXCLUDED.superseded_by_unit_id,
      updated_at                      = NOW()
    WHERE EXCLUDED.source_version >= listing_inventories.source_version
    RETURNING id, unit_id, unit_identity_epoch_written_at, publish_status, source_version
  `;

  const upserted = upsertedRows[0];
  if (!upserted) {
    // Stale write: a newer writer (e.g. a moderator pause/suppress) already
    // committed a higher source_version. Skip ALL fan-out — the newer writer
    // owns the canonical state and has already done its own fan-out.
    const currentRows = await tx.$queryRaw<
      { publish_status: string; source_version: bigint | number | string }[]
    >`
      SELECT publish_status, source_version
      FROM listing_inventories
      WHERE id = ${listing.id}
      LIMIT 1
    `;
    const current = currentRows[0];
    if (!current) {
      throw new CanonicalInventorySyncError(
        "Canonical inventory upsert returned no row"
      );
    }
    logger.sync.warn("cfm.canonical.stale_sync_skipped_count", {
      listingId: listing.id,
      attemptedSourceVersion: sourceVersion.toString(),
      currentSourceVersion: String(current.source_version),
      currentPublishStatus: current.publish_status,
    });
    return {
      skipped: true,
      reason: "stale_source_version",
      inventoryId: listing.id,
      currentPublishStatus: current.publish_status,
      currentSourceVersion: coerceSourceVersion(current.source_version),
    };
  }

  if (previous && previous.unit_id !== unit.unitId) {
    await handleTombstone(tx, {
      unitId: previous.unit_id,
      inventoryId: listing.id,
      reason: "TOMBSTONE",
      unitIdentityEpoch: coerceUnitEpoch(
        previous.unit_identity_epoch_written_at
      ),
      sourceVersion: coerceSourceVersion(previous.source_version),
    });
  }

  const eventSourceVersion = coerceSourceVersion(upserted.source_version);
  const eventUnitEpoch = coerceUnitEpoch(
    upserted.unit_identity_epoch_written_at
  );

  if (publishStatus === "PENDING_PROJECTION") {
    await appendOutboxEvent(tx, {
      aggregateType: "LISTING_INVENTORY",
      aggregateId: listing.id,
      kind: "INVENTORY_UPSERTED",
      payload: {
        unitId: unit.unitId,
        inventoryKey,
        listingId: listing.id,
        requestId: input.requestId ?? null,
      },
      sourceVersion: eventSourceVersion,
      unitIdentityEpoch: eventUnitEpoch,
      priority: 100,
    });

    if (!isKillSwitchActive("disable_new_publication")) {
      await rebuildInventorySearchProjection(tx, {
        unitId: unit.unitId,
        inventoryId: listing.id,
        sourceVersion: eventSourceVersion,
        unitIdentityEpoch: eventUnitEpoch,
      });
      await rebuildUnitPublicProjection(tx, unit.unitId, eventUnitEpoch);
    } else {
      // Kill switch means "stop publishing new data" — the INVENTORY_UPSERTED
      // event above is still appended, so the drain converges the projections
      // once the switch lifts. Tombstone/hide paths are deliberately ungated.
      logger.sync.info("cfm.canonical.inline_rebuild_skipped_count", {
        reason: "kill_switch_disable_new_publication",
        listingId: listing.id,
      });
    }
  } else {
    await handleTombstone(tx, {
      unitId: unit.unitId,
      inventoryId: listing.id,
      reason: tombstoneReason(publishStatus),
      unitIdentityEpoch: eventUnitEpoch,
      sourceVersion: eventSourceVersion,
    });
  }

  return {
    unitId: unit.unitId,
    inventoryId: listing.id,
    publishStatus,
    sourceVersion: eventSourceVersion,
  };
}
