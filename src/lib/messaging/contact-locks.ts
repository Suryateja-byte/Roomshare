import "server-only";

import type { TransactionClient } from "@/lib/db/with-actor";
import type { PublicAvailabilitySource } from "@/lib/search/public-availability";
import type { ListingStatus } from "@prisma/client";

export type LockedListingRow = {
  ownerId: string;
  status: ListingStatus;
  statusReason: string | null;
  needsMigrationReview: boolean;
  availabilitySource?: PublicAvailabilitySource | null;
  availableSlots: number;
  totalSlots: number;
  openSlots: number | null;
  moveInDate: Date | null;
  availableUntil: Date | null;
  minStayMonths: number;
  lastConfirmedAt: Date | null;
  physicalUnitId: string | null;
};

export type LockedPhysicalUnitRow = {
  unitIdentityEpoch: number;
  supersededByUnitId: string | null;
};

// Phase 01 read-path isolation: these queries reference canonical-inventory
// columns/tables, so they must live outside src/app/ and src/components/
// (enforced by phase01-read-path-isolation.test.ts).

export async function lockListingForContact(
  tx: TransactionClient,
  listingId: string
): Promise<LockedListingRow | undefined> {
  const [listingRow] = await tx.$queryRaw<LockedListingRow[]>`
    SELECT
      "ownerId",
      "status",
      "statusReason",
      FALSE AS "needsMigrationReview",
      "availableSlots",
      "totalSlots",
      "openSlots",
      "moveInDate",
      "availableUntil",
      "minStayMonths",
      "lastConfirmedAt",
      "physical_unit_id" AS "physicalUnitId"
    FROM "Listing"
    WHERE "id" = ${listingId}
    FOR UPDATE
  `;
  return listingRow;
}

export async function lockPhysicalUnitForContact(
  tx: TransactionClient,
  unitId: string
): Promise<LockedPhysicalUnitRow | undefined> {
  const [unit] = await tx.$queryRaw<LockedPhysicalUnitRow[]>`
    SELECT
      "unit_identity_epoch" AS "unitIdentityEpoch",
      "superseded_by_unit_id" AS "supersededByUnitId"
    FROM "physical_units"
    WHERE "id" = ${unitId}
    FOR UPDATE
  `;
  return unit;
}
