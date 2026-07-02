import {
  MAP_FETCH_MAX_LAT_SPAN,
  MAP_FETCH_MAX_LNG_SPAN,
  MAX_PAGE_SIZE,
} from "@/lib/constants";
import type { ParsedSearchParams, RawSearchParams } from "@/lib/search-params";
import type { FilterParams, SortOption } from "@/lib/search-types";
import { generateSearchQueryHash } from "./query-hash";

export const PHASE04_SEARCH_SPEC_VERSION = "2026-04-23.phase04-search-spec-v1";
export const PHASE04_DEEP_PAGE_CAP = 20;
export const PHASE04_MAX_OCCUPANTS = 20;
export const PHASE04_MAX_GAP_DAYS = 180;
export const PHASE04_MAX_RADIUS_METERS = 100_000;

export interface SearchSpecVersionTokens {
  projectionEpoch: bigint;
  embeddingVersion?: string | null;
  rankerProfileVersion?: string | null;
  unitIdentityEpochFloor: number;
}

export interface SearchSpec {
  version: string;
  filterParams: FilterParams;
  requestedOccupants: number;
  maxGapDays: number;
  page: number;
  pageSize: number;
  sort: SortOption;
  versions: SearchSpecVersionTokens;
}

export interface SearchAdmissionError {
  code:
    | "requested_occupants_too_high"
    | "max_gap_days_too_high"
    | "radius_too_broad"
    | "deep_paging_capped";
  message: string;
  status: 400;
}

function getFirstRaw(
  raw: RawSearchParams | Record<string, string | string[] | undefined>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = raw[key as keyof typeof raw];
    if (Array.isArray(value)) {
      if (value[0]) return value[0];
    } else if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositiveFloat(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Engine-independent admission caps (P2-3).
 *
 * The occupants>20 and deep-page>20 rejections are pure cost/perf gates that
 * must run on EVERY read engine, not just the dev-default projection path —
 * otherwise a request that 400s in dev (projection ON) runs an expensive scan
 * in prod (SearchDoc, flag OFF). executeSearchV2 hoists this ahead of the engine
 * branch; buildPhase04SearchSpec still calls it so the projection count fast-path
 * (getProjectionSearchCount) keeps rejecting these independently.
 *
 * Reads the RAW occupants value (unclamped) so occupants>20 is a hard 400 even
 * though the parser clamps the canonical capacity filter to <=20.
 *
 * NOTE: the bounds-span cap is deliberately NOT hoisted — wide-view default-sort
 * browse is a supported prod UX on the list path (the map query clamps its own
 * bounds separately), so the span limit stays projection-only, below.
 */
export function evaluateSearchAdmissionCaps(input: {
  parsed: ParsedSearchParams;
  rawParams: RawSearchParams | Record<string, string | string[] | undefined>;
}): SearchAdmissionError | null {
  const rawOccupants = parsePositiveInt(
    getFirstRaw(input.rawParams, [
      "requested_occupants",
      "requestedOccupants",
      "occupants",
      "guests",
      "minSlots",
      "minAvailableSlots",
    ])
  );
  if (rawOccupants !== null && rawOccupants > PHASE04_MAX_OCCUPANTS) {
    return {
      code: "requested_occupants_too_high",
      message: `requested_occupants must be <= ${PHASE04_MAX_OCCUPANTS}`,
      status: 400,
    };
  }

  if (input.parsed.requestedPage > PHASE04_DEEP_PAGE_CAP) {
    return {
      code: "deep_paging_capped",
      message: `page must be <= ${PHASE04_DEEP_PAGE_CAP}`,
      status: 400,
    };
  }

  return null;
}

export function buildPhase04SearchSpec(input: {
  parsed: ParsedSearchParams;
  rawParams: RawSearchParams | Record<string, string | string[] | undefined>;
  pageSize: number;
  versions: SearchSpecVersionTokens;
}): { ok: true; spec: SearchSpec } | { ok: false; error: SearchAdmissionError } {
  const admissionError = evaluateSearchAdmissionCaps({
    parsed: input.parsed,
    rawParams: input.rawParams,
  });
  if (admissionError) {
    return { ok: false, error: admissionError };
  }

  const maxGapDays =
    parseNonNegativeInt(
      getFirstRaw(input.rawParams, ["max_gap_days", "maxGapDays"])
    ) ?? PHASE04_MAX_GAP_DAYS;
  if (maxGapDays > PHASE04_MAX_GAP_DAYS) {
    return {
      ok: false,
      error: {
        code: "max_gap_days_too_high",
        message: `max_gap_days must be <= ${PHASE04_MAX_GAP_DAYS}`,
        status: 400,
      },
    };
  }

  const requestedRadius = parsePositiveFloat(
    getFirstRaw(input.rawParams, ["radius", "radiusMeters", "radius_meters"])
  );
  if (requestedRadius !== null && requestedRadius > PHASE04_MAX_RADIUS_METERS) {
    return {
      ok: false,
      error: {
        code: "radius_too_broad",
        message: `radius must be <= ${PHASE04_MAX_RADIUS_METERS} meters`,
        status: 400,
      },
    };
  }

  const bounds = input.parsed.filterParams.bounds;
  if (bounds) {
    const latSpan = Math.abs(bounds.maxLat - bounds.minLat);
    const lngSpan =
      bounds.minLng <= bounds.maxLng
        ? Math.abs(bounds.maxLng - bounds.minLng)
        : 180 - bounds.minLng + (bounds.maxLng + 180);
    if (latSpan > MAP_FETCH_MAX_LAT_SPAN || lngSpan > MAP_FETCH_MAX_LNG_SPAN) {
      return {
        ok: false,
        error: {
          code: "radius_too_broad",
          message: "search bounds are too broad",
          status: 400,
        },
      };
    }
  }

  // P2-4: single source of truth — the parser resolves every occupants alias
  // (occupants/guests/requested_occupants/minSlots) into
  // filterParams.minAvailableSlots, so the projection SQL, the SearchDoc filter,
  // and the query hash all read the same canonical capacity value. Pathological
  // occupants>20 is rejected above via the raw, unclamped admission read.
  const requestedOccupants = input.parsed.filterParams.minAvailableSlots ?? 1;
  const page = input.parsed.requestedPage;
  const pageSize = Math.max(1, Math.min(input.pageSize, MAX_PAGE_SIZE));
  return {
    ok: true,
    spec: {
      version: PHASE04_SEARCH_SPEC_VERSION,
      filterParams: input.parsed.filterParams,
      requestedOccupants,
      maxGapDays,
      page,
      pageSize,
      sort: input.parsed.sortOption,
      versions: input.versions,
    },
  };
}

export function getPhase04SearchSpecHash(spec: SearchSpec): string {
  return generateSearchQueryHash({
    query: spec.filterParams.query,
    vibeQuery: spec.filterParams.vibeQuery,
    minPrice: spec.filterParams.minPrice,
    maxPrice: spec.filterParams.maxPrice,
    amenities: spec.filterParams.amenities,
    houseRules: spec.filterParams.houseRules,
    languages: spec.filterParams.languages,
    roomType: spec.filterParams.roomType,
    leaseDuration: spec.filterParams.leaseDuration,
    moveInDate: spec.filterParams.moveInDate,
    endDate: spec.filterParams.endDate,
    genderPreference: spec.filterParams.genderPreference,
    householdGender: spec.filterParams.householdGender,
    bookingMode: spec.filterParams.bookingMode,
    minAvailableSlots: spec.requestedOccupants,
    nearMatches: spec.filterParams.nearMatches,
    bounds: spec.filterParams.bounds,
    projectionEpoch: spec.versions.projectionEpoch,
    embeddingVersion: spec.versions.embeddingVersion ?? null,
    rankerProfileVersion: spec.versions.rankerProfileVersion ?? null,
    unitIdentityEpochFloor: spec.versions.unitIdentityEpochFloor,
  });
}
