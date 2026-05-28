import type { TransactionClient } from "@/lib/db/with-actor";

export interface ProjectionCoordinates {
  lat: number;
  lng: number;
}

export interface PublicGeocodeFields {
  exactPointWkt: string;
  publicPointWkt: string;
  publicCellId: string;
}

export type PhysicalUnitGeocodePointStorage = "geography" | "text";

export async function getPhysicalUnitGeocodePointStorage(
  tx: Pick<TransactionClient, "$queryRaw">
): Promise<PhysicalUnitGeocodePointStorage> {
  const rows = await tx.$queryRaw<
    {
      exactPointType: string | null;
      publicPointType: string | null;
    }[]
  >`
    SELECT
      MAX(CASE WHEN column_name = 'exact_point' THEN udt_name END) AS "exactPointType",
      MAX(CASE WHEN column_name = 'public_point' THEN udt_name END) AS "publicPointType"
    FROM information_schema.columns
    WHERE table_name = 'physical_units'
      AND column_name IN ('exact_point', 'public_point')
  `;

  const row = rows[0];
  return row?.exactPointType === "geography" &&
    row?.publicPointType === "geography"
    ? "geography"
    : "text";
}

export function buildPublicGeocodeFields(
  coordinates: ProjectionCoordinates
): PublicGeocodeFields {
  const { lat, lng } = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Projection coordinates must be finite numbers");
  }

  const publicLat = Math.round(lat * 100) / 100;
  const publicLng = Math.round(lng * 100) / 100;

  return {
    exactPointWkt: `POINT(${lng} ${lat})`,
    publicPointWkt: `POINT(${publicLng} ${publicLat})`,
    publicCellId: `${publicLat.toFixed(2)},${publicLng.toFixed(2)}`,
  };
}
