import { LAT_OFFSET_DEGREES } from "@/lib/constants";

export type SearchLocationBoundsTuple = [
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
];

export interface SearchLocationBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function deriveSearchBoundsFromPoint(
  lat: number,
  lng: number
): SearchLocationBoundsTuple {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngOffset = cosLat < 0.01 ? 180 : LAT_OFFSET_DEGREES / cosLat;

  return [
    Math.max(-180, lng - lngOffset),
    Math.max(-90, lat - LAT_OFFSET_DEGREES),
    Math.min(180, lng + lngOffset),
    Math.min(90, lat + LAT_OFFSET_DEGREES),
  ];
}

export function boundsTupleToObject(
  bounds: SearchLocationBoundsTuple
): SearchLocationBounds {
  return {
    minLng: bounds[0],
    minLat: bounds[1],
    maxLng: bounds[2],
    maxLat: bounds[3],
  };
}
