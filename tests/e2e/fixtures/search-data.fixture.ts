export interface SearchBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const SEARCH_SF_BOUNDS = {
  minLat: 37.7,
  maxLat: 37.85,
  minLng: -122.52,
  maxLng: -122.35,
} as const satisfies SearchBounds;

export function searchBoundsParams(
  bounds: SearchBounds = SEARCH_SF_BOUNDS
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("maxLat", bounds.maxLat.toFixed(3));
  params.set("maxLng", bounds.maxLng.toFixed(3));
  params.set("minLat", bounds.minLat.toFixed(3));
  params.set("minLng", bounds.minLng.toFixed(3));
  return params;
}

export function searchUrl(
  params: Record<string, string | number | boolean | null | undefined> = {},
  options: { bounds?: SearchBounds | false } = {}
): string {
  const query =
    options.bounds === false
      ? new URLSearchParams()
      : searchBoundsParams(options.bounds ?? SEARCH_SF_BOUNDS);

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(key, String(value));
  }

  const queryString = query.toString();
  return queryString ? `/search?${queryString}` : "/search";
}
