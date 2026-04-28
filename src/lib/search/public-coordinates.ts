export const PUBLIC_COORDINATE_DECIMALS = 2;

export function toPublicCoordinate(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Number(value.toFixed(PUBLIC_COORDINATE_DECIMALS));
}

export function toPublicCoordinates(input: { lat: number; lng: number }): {
  lat: number;
  lng: number;
} {
  return {
    lat: toPublicCoordinate(input.lat),
    lng: toPublicCoordinate(input.lng),
  };
}
