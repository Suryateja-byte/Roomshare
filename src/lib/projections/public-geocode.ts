export interface ProjectionCoordinates {
  lat: number;
  lng: number;
}

export interface PublicGeocodeFields {
  exactPointWkt: string;
  publicPointWkt: string;
  publicCellId: string;
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
