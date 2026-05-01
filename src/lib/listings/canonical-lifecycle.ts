import "server-only";

import type { ActorContext, TransactionClient } from "@/lib/db/with-actor";
import { syncCanonicalListingInventory } from "@/lib/listings/canonical-inventory";
import type { TombstoneReason } from "@/lib/projections/tombstone";
import { handleTombstone } from "@/lib/projections/tombstone";

type ExistingInventoryRow = {
  unitId: string;
  unitIdentityEpoch: number | string;
  sourceVersion: bigint | number | string;
};

type TombstonePublishStatus = "PAUSED" | "SUPPRESSED" | "ARCHIVED";

function toBigInt(value: bigint | number | string): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function lifecycleReasonForListing(input: {
  status: string;
  statusReason?: string | null;
}): TombstoneReason {
  if (input.statusReason === "SUPPRESSED") return "SUPPRESSION";
  if (input.status === "PAUSED") return "PAUSE";
  return "ARCHIVE";
}

function publishStatusForReason(reason: TombstoneReason): TombstonePublishStatus {
  if (reason === "SUPPRESSION") return "SUPPRESSED";
  if (reason === "PAUSE") return "PAUSED";
  return "ARCHIVED";
}

async function tombstoneExistingInventoryInTx(
  tx: TransactionClient,
  listingId: string,
  reason: TombstoneReason
) {
  const publishStatus = publishStatusForReason(reason);
  const lifecycleStatus =
    publishStatus === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
  const rows = await tx.$queryRaw<ExistingInventoryRow[]>`
    UPDATE listing_inventories
    SET publish_status = ${publishStatus},
        lifecycle_status = ${lifecycleStatus},
        source_version = source_version + 1,
        row_version = row_version + 1,
        updated_at = NOW()
    WHERE id = ${listingId}
    RETURNING
      unit_id AS "unitId",
      unit_identity_epoch_written_at AS "unitIdentityEpoch",
      source_version AS "sourceVersion"
  `;
  const row = rows[0];

  if (!row) {
    return { action: "missing_inventory" } as const;
  }

  const tombstone = await handleTombstone(tx, {
    unitId: row.unitId,
    inventoryId: listingId,
    reason,
    unitIdentityEpoch: Number(row.unitIdentityEpoch),
    sourceVersion: toBigInt(row.sourceVersion),
  });

  return { action: "tombstoned", tombstone } as const;
}

export async function tombstoneCanonicalInventoryInTx(
  tx: TransactionClient,
  listingId: string,
  reason: TombstoneReason = "TOMBSTONE"
) {
  return tombstoneExistingInventoryInTx(tx, listingId, reason);
}

export async function syncListingLifecycleProjectionInTx(
  tx: TransactionClient,
  listingId: string,
  actor: ActorContext
) {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      physicalUnitId: true,
      price: true,
      roomType: true,
      totalSlots: true,
      availableSlots: true,
      openSlots: true,
      moveInDate: true,
      availableUntil: true,
      minStayMonths: true,
      status: true,
      statusReason: true,
      version: true,
      genderPreference: true,
      householdGender: true,
      location: {
        select: {
          address: true,
          city: true,
          state: true,
          zip: true,
        },
      },
    },
  });

  if (!listing) {
    return { action: "missing_listing" } as const;
  }

  if (!listing.location) {
    return tombstoneExistingInventoryInTx(
      tx,
      listingId,
      lifecycleReasonForListing(listing)
    );
  }

  const sync = await syncCanonicalListingInventory(tx, {
    listing,
    address: {
      address: listing.location.address,
      city: listing.location.city,
      state: listing.location.state,
      zip: listing.location.zip,
    },
    actor,
  });

  return { action: "synced", sync } as const;
}
