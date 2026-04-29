import "server-only";

import type { ParsedSearchParams, RawSearchParams } from "@/lib/search-params";
import type {
  ListingData,
  MapListingData,
  PaginatedResultHybrid,
} from "@/lib/data";
import { getReadEmbeddingVersion } from "@/lib/embeddings/version";
import { currentProjectionEpoch } from "@/lib/projections/epoch";
import { prisma } from "@/lib/prisma";
import {
  decodeCursorAny,
  encodeSnapshotCursor,
  type SnapshotCursor,
} from "@/lib/search/hash";
import {
  buildPhase04SearchSpec,
  getPhase04SearchSpecHash,
  type SearchAdmissionError,
  type SearchSpec,
} from "@/lib/search/search-spec";
import { RANKING_VERSION } from "@/lib/search/ranking";
import {
  createQuerySnapshot,
  loadValidQuerySnapshot,
  PHASE04_SNAPSHOT_VERSION,
  toSnapshotResponseMeta,
  type SnapshotExpiredReason,
} from "@/lib/search/query-snapshots";
import type { ProjectionReadEligibility } from "@/lib/search/projection-read-eligibility";
import { getProjectionReadEligibility } from "@/lib/search/projection-read-eligibility";
import {
  SEARCH_RESPONSE_VERSION,
  type SearchMapState,
} from "@/lib/search/search-response";
import type { SearchV2Map, SearchV2Response, SearchV2Mode } from "./types";
import {
  determineMode,
  shouldIncludePins,
  transformToListItems,
  transformToMapResponse,
} from "./transform";
import {
  buildPublicAvailability,
  type PublicAvailability,
} from "./public-availability";
import { searchV2MapToListings } from "./v2-map-data";
import {
  isPhase04ForceClustersOnlyActive,
  isPhase04ForceListOnlyActive,
} from "@/lib/flags/phase04";
import { recordSearchSnapshotHoleRatio } from "./search-telemetry";
import type { SearchV2Params, SearchV2Result } from "./search-v2-service";

const DEFAULT_UNIT_IDENTITY_EPOCH_FLOOR = 1;

type ProjectionReadUnsupportedError = {
  code: "projection_read_unsupported";
  message: string;
  status: 400;
  unsupportedReasons: ProjectionReadEligibility["unsupportedReasons"];
};

type ProjectionSearchCountResult =
  | { ok: true; count: number | null }
  | { ok: false; error: SearchAdmissionError | ProjectionReadUnsupportedError };

type SqlValue = string | number | boolean | Date | null | string[];

type RawSqlClient = {
  $queryRawUnsafe: <T>(sql: string, ...params: SqlValue[]) => Promise<T>;
};

const rawSql = prisma as unknown as RawSqlClient;

interface ProjectionUnitRow {
  unitKey: string;
  unitId: string;
  unitIdentityEpoch: number;
  representativeInventoryId: string;
  inventoryIds: string[];
  fromPrice: number | null;
  roomCategories: string[];
  earliestAvailableFrom: Date | null;
  matchingInventoryCount: number;
  publicPoint: string | null;
  publicCellId: string | null;
  publicAreaName: string | null;
  displayTitle: string | null;
  displaySubtitle: string | null;
  heroImageUrl: string | null;
  projectionEpoch: bigint;
  sourceVersion: bigint;
}

interface RawProjectionUnitRow {
  unit_key: string;
  unit_id: string;
  unit_identity_epoch: number | string;
  representative_inventory_id: string | null;
  inventory_ids: string[] | string | null;
  from_price: string | number | null;
  room_categories: string[] | string | null;
  earliest_available_from: Date | string | null;
  matching_inventory_count: number | string;
  public_point: string | null;
  public_cell_id: string | null;
  public_area_name: string | null;
  display_title: string | null;
  display_subtitle: string | null;
  hero_image_url: string | null;
  projection_epoch: bigint | number | string;
  source_version: bigint | number | string;
}

interface ParsedUnitKey {
  unitId: string;
  unitIdentityEpoch: number;
  key: string;
}

function getFirstValue(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toStringArray(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value))
    return value.filter((item) => typeof item === "string");
  if (typeof value !== "string" || value.length === 0) return [];
  if (value.startsWith("{") && value.endsWith("}")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => item.replace(/^"|"$/g, "").trim())
      .filter(Boolean);
  }
  return [value];
}

function parseDate(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeProjectionRow(row: RawProjectionUnitRow): ProjectionUnitRow {
  const roomCategories = toStringArray(row.room_categories);
  const inventoryIds = toStringArray(row.inventory_ids);
  const representativeInventoryId =
    row.representative_inventory_id ?? inventoryIds[0] ?? row.unit_id;
  const unitIdentityEpoch = Number(row.unit_identity_epoch);
  return {
    unitKey: row.unit_key,
    unitId: row.unit_id,
    unitIdentityEpoch,
    representativeInventoryId,
    inventoryIds,
    fromPrice:
      row.from_price === null || row.from_price === undefined
        ? null
        : Number(row.from_price),
    roomCategories,
    earliestAvailableFrom: parseDate(row.earliest_available_from),
    matchingInventoryCount: Number(row.matching_inventory_count ?? 0),
    publicPoint: row.public_point,
    publicCellId: row.public_cell_id,
    publicAreaName: row.public_area_name,
    displayTitle: row.display_title,
    displaySubtitle: row.display_subtitle,
    heroImageUrl: row.hero_image_url,
    projectionEpoch: BigInt(row.projection_epoch ?? 1),
    sourceVersion: BigInt(row.source_version ?? 1),
  };
}

function parsePublicPoint(
  publicPoint: string | null,
  publicCellId: string | null
): { lat: number; lng: number } | null {
  const pointMatch = publicPoint?.match(
    /^POINT\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)$/i
  );
  if (pointMatch) {
    return {
      lng: Number(pointMatch[1]),
      lat: Number(pointMatch[2]),
    };
  }

  const cellParts = publicCellId?.split(",").map((part) => Number(part.trim()));
  if (
    cellParts &&
    cellParts.length === 2 &&
    Number.isFinite(cellParts[0]) &&
    Number.isFinite(cellParts[1])
  ) {
    return { lat: cellParts[0], lng: cellParts[1] };
  }

  return null;
}

function isInsideBounds(row: ProjectionUnitRow, spec: SearchSpec): boolean {
  const bounds = spec.filterParams.bounds;
  if (!bounds) return true;
  const point = parsePublicPoint(row.publicPoint, row.publicCellId);
  if (!point) return false;
  const lngInBounds =
    bounds.minLng <= bounds.maxLng
      ? point.lng >= bounds.minLng && point.lng <= bounds.maxLng
      : point.lng >= bounds.minLng || point.lng <= bounds.maxLng;
  return (
    point.lat >= bounds.minLat && point.lat <= bounds.maxLat && lngInBounds
  );
}

function parseUnitKeys(unitKeys: string[]): ParsedUnitKey[] {
  return unitKeys
    .map((key) => {
      const [unitId, epoch] = key.split(":");
      const unitIdentityEpoch = Number(epoch);
      return unitId && Number.isInteger(unitIdentityEpoch)
        ? { unitId, unitIdentityEpoch, key }
        : null;
    })
    .filter((item): item is ParsedUnitKey => Boolean(item));
}

function buildPublicAvailabilityForRow(
  row: ProjectionUnitRow
): PublicAvailability {
  return buildPublicAvailability({
    openSlots: row.matchingInventoryCount,
    availableSlots: row.matchingInventoryCount,
    totalSlots: row.matchingInventoryCount,
    moveInDate: row.earliestAvailableFrom ?? undefined,
    minStayMonths: 1,
  });
}

function buildGroupSummary(
  row: ProjectionUnitRow
): NonNullable<ListingData["groupSummary"]> {
  const firstDate = row.earliestAvailableFrom?.toISOString().slice(0, 10);
  const siblingIds = row.inventoryIds.filter(
    (id) => id !== row.representativeInventoryId
  );
  return {
    groupKey: row.unitKey,
    siblingIds,
    availableFromDates: firstDate ? [firstDate] : [],
    combinedOpenSlots: row.matchingInventoryCount,
    combinedTotalSlots: row.matchingInventoryCount,
    groupOverflow: false,
    members: row.inventoryIds.map((inventoryId, index) => ({
      listingId: inventoryId,
      availableFrom: firstDate ?? "",
      availableUntil: null,
      openSlots: index === 0 ? row.matchingInventoryCount : 0,
      totalSlots: row.matchingInventoryCount,
      isCanonical: inventoryId === row.representativeInventoryId,
      roomType: row.roomCategories[0] ?? null,
    })),
    windows: firstDate
      ? [
          {
            availableFrom: firstDate,
            availableUntil: null,
            openSlots: row.matchingInventoryCount,
          },
        ]
      : [],
  };
}

function projectionRowToListing(row: ProjectionUnitRow): ListingData {
  const point = parsePublicPoint(row.publicPoint, row.publicCellId) ?? {
    lat: 0,
    lng: 0,
  };
  const publicAvailability = buildPublicAvailabilityForRow(row);
  const roomType = row.roomCategories[0] ?? undefined;
  const title =
    row.displayTitle ??
    (row.publicAreaName
      ? `Available room in ${row.publicAreaName}`
      : "Available room");
  const description =
    row.displaySubtitle ??
    `${row.matchingInventoryCount} matching inventory${
      row.matchingInventoryCount === 1 ? "" : "ies"
    }`;

  return {
    id: row.representativeInventoryId,
    title,
    description,
    price: row.fromPrice ?? 0,
    images: row.heroImageUrl ? [row.heroImageUrl] : [],
    availableSlots: publicAvailability.openSlots,
    totalSlots: publicAvailability.totalSlots,
    amenities: [],
    houseRules: [],
    householdLanguages: [],
    roomType,
    moveInDate: row.earliestAvailableFrom ?? undefined,
    location: {
      city: row.publicAreaName ?? "Roomshare",
      state: "",
      lat: point.lat,
      lng: point.lng,
    },
    publicAvailability,
    availabilitySource: publicAvailability.availabilitySource,
    openSlots: publicAvailability.openSlots,
    availableUntil: null,
    minStayMonths: 1,
    groupKey: row.unitKey,
    groupSummary: buildGroupSummary(row),
    groupContext: {
      siblingCount: Math.max(0, row.matchingInventoryCount - 1),
      dateCount: row.earliestAvailableFrom ? 1 : 0,
      completeness: "complete",
      secondaryLabel: description,
      contextKey: row.unitKey,
    },
  };
}

function projectionRowsToMapListings(
  rows: ProjectionUnitRow[]
): MapListingData[] {
  return rows
    .map(projectionRowToListing)
    .filter(
      (listing) => !(listing.location.lat === 0 && listing.location.lng === 0)
    )
    .map((listing) => ({
      id: listing.id,
      title: listing.title,
      price: listing.price,
      availableSlots: listing.availableSlots,
      totalSlots: listing.totalSlots,
      images: listing.images,
      roomType: listing.roomType,
      moveInDate: listing.moveInDate,
      location: {
        city: listing.location.city,
        state: listing.location.state,
        lat: listing.location.lat,
        lng: listing.location.lng,
      },
      publicAvailability: listing.publicAvailability,
      availabilitySource: listing.availabilitySource,
      openSlots: listing.openSlots,
      availableUntil: listing.availableUntil,
      minStayMonths: listing.minStayMonths,
      groupKey: listing.groupKey,
      groupSummary: listing.groupSummary,
      groupContext: listing.groupContext,
    }));
}

function getSortClause(sort: SearchSpec["sort"]): string {
  switch (sort) {
    case "price_desc":
      return "MIN(isp.price) DESC, MIN(isp.available_from) ASC, upp.unit_id ASC";
    case "newest":
      return "MAX(isp.updated_at) DESC, MIN(isp.price) ASC, upp.unit_id ASC";
    case "rating":
    case "recommended":
      return "COUNT(isp.inventory_id) DESC, MIN(isp.price) ASC, upp.unit_id ASC";
    case "price_asc":
    default:
      return "MIN(isp.price) ASC, MIN(isp.available_from) ASC, upp.unit_id ASC";
  }
}

function addParam(params: SqlValue[], value: SqlValue): string {
  params.push(value);
  return `$${params.length}`;
}

function normalizeRoomCategory(roomType: string | undefined): string | null {
  if (!roomType || roomType === "any") return null;
  return roomType
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

async function queryProjectionUnitRows(
  spec: SearchSpec,
  opts: { unitKeys?: string[] } = {}
): Promise<ProjectionUnitRow[]> {
  const parsedUnitKeys = opts.unitKeys ? parseUnitKeys(opts.unitKeys) : [];
  if (opts.unitKeys && parsedUnitKeys.length === 0) {
    return [];
  }

  const params: SqlValue[] = [];
  const where = [
    "isp.publish_status IN ('PUBLISHED', 'STALE_PUBLISHED')",
    "upp.matching_inventory_count > 0",
  ];

  if (spec.filterParams.minPrice !== undefined) {
    where.push(
      `isp.price >= ${addParam(params, spec.filterParams.minPrice)}::NUMERIC`
    );
  }
  if (spec.filterParams.maxPrice !== undefined) {
    where.push(
      `isp.price <= ${addParam(params, spec.filterParams.maxPrice)}::NUMERIC`
    );
  }

  const roomCategory = normalizeRoomCategory(spec.filterParams.roomType);
  if (roomCategory) {
    where.push(`isp.room_category = ${addParam(params, roomCategory)}`);
  }

  if (spec.filterParams.bookingMode === "WHOLE_UNIT") {
    where.push("isp.room_category = 'ENTIRE_PLACE'");
  } else if (spec.filterParams.bookingMode === "SHARED") {
    where.push("isp.room_category <> 'ENTIRE_PLACE'");
  }

  if (
    spec.filterParams.genderPreference &&
    spec.filterParams.genderPreference !== "any"
  ) {
    where.push(
      `(isp.gender_preference IS NULL OR isp.gender_preference = ${addParam(
        params,
        spec.filterParams.genderPreference
      )})`
    );
  }
  if (
    spec.filterParams.householdGender &&
    spec.filterParams.householdGender !== "any"
  ) {
    where.push(
      `(isp.household_gender IS NULL OR isp.household_gender = ${addParam(
        params,
        spec.filterParams.householdGender
      )})`
    );
  }

  if (spec.filterParams.moveInDate) {
    const moveIn = addParam(params, spec.filterParams.moveInDate);
    const gapDays = addParam(params, spec.maxGapDays);
    where.push(
      `isp.available_from <= (${moveIn}::DATE + (${gapDays}::INTEGER * INTERVAL '1 day'))`
    );
    where.push(
      `(isp.available_until IS NULL OR isp.available_until >= ${moveIn}::DATE)`
    );
  }

  const occupants = addParam(params, spec.requestedOccupants);
  where.push(`(
	    (isp.room_category = 'SHARED_ROOM' AND COALESCE(isp.open_beds, 0) >= ${occupants}::INTEGER)
	    OR
	    (isp.room_category <> 'SHARED_ROOM' AND COALESCE(isp.capacity_guests, isp.open_beds, isp.total_beds, 0) >= ${occupants}::INTEGER)
	  )`);

  if (spec.filterParams.bounds) {
    const cellExpr = "COALESCE(isp.public_cell_id, upp.public_cell_id)";
    const numericCellPattern = "^-?[0-9]+(\\.[0-9]+)?,-?[0-9]+(\\.[0-9]+)?$";
    const latExpr = `(CASE WHEN ${cellExpr} ~ '${numericCellPattern}' THEN split_part(${cellExpr}, ',', 1)::DOUBLE PRECISION END)`;
    const lngExpr = `(CASE WHEN ${cellExpr} ~ '${numericCellPattern}' THEN split_part(${cellExpr}, ',', 2)::DOUBLE PRECISION END)`;
    const minLat = addParam(params, spec.filterParams.bounds.minLat);
    const maxLat = addParam(params, spec.filterParams.bounds.maxLat);
    const minLng = addParam(params, spec.filterParams.bounds.minLng);
    const maxLng = addParam(params, spec.filterParams.bounds.maxLng);

    where.push(
      `${latExpr} BETWEEN ${minLat}::DOUBLE PRECISION AND ${maxLat}::DOUBLE PRECISION`
    );
    where.push(
      spec.filterParams.bounds.minLng <= spec.filterParams.bounds.maxLng
        ? `${lngExpr} BETWEEN ${minLng}::DOUBLE PRECISION AND ${maxLng}::DOUBLE PRECISION`
        : `(${lngExpr} >= ${minLng}::DOUBLE PRECISION OR ${lngExpr} <= ${maxLng}::DOUBLE PRECISION)`
    );
  }

  if (parsedUnitKeys.length > 0) {
    const tupleClause = parsedUnitKeys
      .map((entry) => {
        const unitId = addParam(params, entry.unitId);
        const epoch = addParam(params, entry.unitIdentityEpoch);
        return `(${unitId}, ${epoch}::INTEGER)`;
      })
      .join(", ");
    where.push(`(upp.unit_id, upp.unit_identity_epoch) IN (${tupleClause})`);
  }

  const sql = `
    SELECT
      (upp.unit_id || ':' || upp.unit_identity_epoch::TEXT) AS unit_key,
      upp.unit_id,
      upp.unit_identity_epoch,
      (array_agg(isp.inventory_id ORDER BY isp.price ASC, isp.available_from ASC, isp.inventory_id ASC))[1] AS representative_inventory_id,
      array_agg(isp.inventory_id ORDER BY isp.price ASC, isp.available_from ASC, isp.inventory_id ASC) AS inventory_ids,
      MIN(isp.price)::TEXT AS from_price,
      array_agg(DISTINCT isp.room_category ORDER BY isp.room_category) AS room_categories,
      MIN(isp.available_from) AS earliest_available_from,
      COUNT(DISTINCT isp.inventory_id)::INTEGER AS matching_inventory_count,
      COALESCE(upp.public_point, (array_agg(isp.public_point ORDER BY isp.price ASC, isp.available_from ASC, isp.inventory_id ASC) FILTER (WHERE isp.public_point IS NOT NULL))[1]) AS public_point,
      COALESCE(upp.public_cell_id, (array_agg(isp.public_cell_id ORDER BY isp.price ASC, isp.available_from ASC, isp.inventory_id ASC) FILTER (WHERE isp.public_cell_id IS NOT NULL))[1]) AS public_cell_id,
      COALESCE(upp.public_area_name, (array_agg(isp.public_area_name ORDER BY isp.price ASC, isp.available_from ASC, isp.inventory_id ASC) FILTER (WHERE isp.public_area_name IS NOT NULL))[1]) AS public_area_name,
      upp.display_title,
      upp.display_subtitle,
      upp.hero_image_url,
      GREATEST(upp.projection_epoch, MAX(isp.projection_epoch)) AS projection_epoch,
      GREATEST(upp.source_version, MAX(isp.source_version)) AS source_version
    FROM inventory_search_projection isp
    INNER JOIN unit_public_projection upp
      ON upp.unit_id = isp.unit_id
     AND upp.unit_identity_epoch = isp.unit_identity_epoch_written_at
    WHERE ${where.join("\n      AND ")}
    GROUP BY
      upp.unit_id, upp.unit_identity_epoch, upp.public_point, upp.public_cell_id,
      upp.public_area_name, upp.display_title, upp.display_subtitle,
      upp.hero_image_url, upp.projection_epoch, upp.source_version
    ORDER BY ${getSortClause(spec.sort)}
    LIMIT 256
  `;

  const rows = await rawSql.$queryRawUnsafe<RawProjectionUnitRow[]>(
    sql,
    ...params
  );
  return rows
    .map(normalizeProjectionRow)
    .filter((row) => isInsideBounds(row, spec));
}

async function fetchProjectionRowsByUnitKeys(
  unitKeys: string[],
  spec?: SearchSpec
): Promise<ProjectionUnitRow[]> {
  const parsed = parseUnitKeys(unitKeys);
  if (parsed.length === 0) return [];

  if (spec) {
    const rows = await queryProjectionUnitRows(spec, { unitKeys });
    const byKey = new Map(rows.map((row) => [row.unitKey, row]));
    return parsed
      .map((entry) => byKey.get(entry.key))
      .filter(Boolean) as ProjectionUnitRow[];
  }

  const params: SqlValue[] = [];
  const tupleClause = parsed
    .map((entry) => {
      const unitId = addParam(params, entry.unitId);
      const epoch = addParam(params, entry.unitIdentityEpoch);
      return `(${unitId}, ${epoch}::INTEGER)`;
    })
    .join(", ");

  const sql = `
    SELECT
      (upp.unit_id || ':' || upp.unit_identity_epoch::TEXT) AS unit_key,
      upp.unit_id,
      upp.unit_identity_epoch,
      (array_agg(isp.inventory_id ORDER BY isp.price ASC, isp.available_from ASC, isp.inventory_id ASC))[1] AS representative_inventory_id,
      array_agg(isp.inventory_id ORDER BY isp.price ASC, isp.available_from ASC, isp.inventory_id ASC) AS inventory_ids,
      MIN(isp.price)::TEXT AS from_price,
      array_agg(DISTINCT isp.room_category ORDER BY isp.room_category) AS room_categories,
      MIN(isp.available_from) AS earliest_available_from,
      COUNT(DISTINCT isp.inventory_id)::INTEGER AS matching_inventory_count,
      upp.public_point,
      upp.public_cell_id,
      upp.public_area_name,
      upp.display_title,
      upp.display_subtitle,
      upp.hero_image_url,
      GREATEST(upp.projection_epoch, MAX(isp.projection_epoch)) AS projection_epoch,
      GREATEST(upp.source_version, MAX(isp.source_version)) AS source_version
    FROM unit_public_projection upp
    INNER JOIN inventory_search_projection isp
      ON isp.unit_id = upp.unit_id
     AND isp.unit_identity_epoch_written_at = upp.unit_identity_epoch
     AND isp.publish_status IN ('PUBLISHED', 'STALE_PUBLISHED')
    WHERE (upp.unit_id, upp.unit_identity_epoch) IN (${tupleClause})
      AND upp.matching_inventory_count > 0
    GROUP BY
      upp.unit_id, upp.unit_identity_epoch, upp.public_point, upp.public_cell_id,
      upp.public_area_name, upp.display_title, upp.display_subtitle,
      upp.hero_image_url, upp.projection_epoch, upp.source_version
  `;

  const rows = await rawSql.$queryRawUnsafe<RawProjectionUnitRow[]>(
    sql,
    ...params
  );
  const byKey = new Map(
    rows.map((row) => [row.unit_key, normalizeProjectionRow(row)])
  );
  return parsed
    .map((entry) => byKey.get(entry.key))
    .filter(Boolean) as ProjectionUnitRow[];
}

function emptyMap(): SearchV2Map {
  return {
    geojson: { type: "FeatureCollection", features: [] },
  };
}

function buildMap(rows: ProjectionUnitRow[]): SearchV2Map {
  if (isPhase04ForceListOnlyActive()) {
    return emptyMap();
  }
  const mapListings = projectionRowsToMapListings(rows);
  const response = transformToMapResponse(mapListings);
  if (isPhase04ForceClustersOnlyActive()) {
    return {
      geojson: response.geojson,
      truncated: response.truncated,
      totalCandidates: response.totalCandidates,
    };
  }
  return response;
}

function getMode(map: SearchV2Map): SearchV2Mode {
  if (isPhase04ForceClustersOnlyActive()) {
    return "geojson";
  }
  if (isPhase04ForceListOnlyActive()) {
    return "pins";
  }
  const count = map.geojson.features.length;
  return shouldIncludePins(count) && map.pins ? "pins" : determineMode(count);
}

function buildSnapshotCursor(input: {
  snapshotId: string;
  page: number;
  pageSize: number;
  queryHash: string;
}): string {
  return encodeSnapshotCursor({
    v: 4,
    snapshotId: input.snapshotId,
    page: input.page,
    pageSize: input.pageSize,
    queryHash: input.queryHash,
    responseVersion: SEARCH_RESPONSE_VERSION,
    snapshotVersion: PHASE04_SNAPSHOT_VERSION,
  });
}

function buildSnapshotExpired(
  queryHash: string,
  reason: SnapshotExpiredReason
): NonNullable<SearchV2Result["snapshotExpired"]> {
  return { queryHash, reason };
}

function buildProjectionUnsupportedError(
  eligibility: ProjectionReadEligibility
): ProjectionReadUnsupportedError {
  return {
    code: "projection_read_unsupported",
    message: "Phase04 projection reads do not support this search spec",
    status: 400,
    unsupportedReasons: eligibility.unsupportedReasons,
  };
}

function buildResult(input: {
  rows: ProjectionUnitRow[];
  allRowsForMap: ProjectionUnitRow[];
  total: number;
  queryHash: string;
  querySnapshotId?: string;
  nextCursor: string | null;
  versions: SearchSpec["versions"];
  includeMap: boolean;
}): SearchV2Result {
  const items = input.rows.map(projectionRowToListing);
  const map = input.includeMap ? buildMap(input.allRowsForMap) : emptyMap();
  const meta = {
    queryHash: input.queryHash,
    ...(input.querySnapshotId
      ? { querySnapshotId: input.querySnapshotId }
      : {}),
    generatedAt: new Date().toISOString(),
    mode: getMode(map),
    projectionEpoch: String(input.versions.projectionEpoch),
    ...(input.versions.embeddingVersion
      ? { embeddingVersion: input.versions.embeddingVersion }
      : {}),
    ...(input.versions.rankerProfileVersion
      ? { rankerProfileVersion: input.versions.rankerProfileVersion }
      : {}),
    unitIdentityEpochFloor: input.versions.unitIdentityEpochFloor,
    snapshotVersion: PHASE04_SNAPSHOT_VERSION,
  };
  const paginatedResult: PaginatedResultHybrid<ListingData> = {
    items,
    total: input.total,
    page: null,
    limit: input.rows.length,
    totalPages: null,
    hasNextPage: input.nextCursor !== null,
    hasPrevPage: false,
    nextCursor: input.nextCursor,
  };
  const response: SearchV2Response = {
    meta,
    list: {
      items: transformToListItems(items),
      fullItems: items,
      nextCursor: input.nextCursor,
      total: input.total,
    },
    map,
  };
  return { response, paginatedResult };
}

async function hydratePhase04Snapshot(input: {
  cursor: SnapshotCursor;
  queryHash: string;
  includeMap: boolean;
  spec: SearchSpec;
}): Promise<SearchV2Result> {
  if (input.cursor.v !== 4) {
    return {
      response: null,
      paginatedResult: null,
      snapshotExpired: buildSnapshotExpired(
        input.queryHash,
        "search_contract_changed"
      ),
    };
  }
  if (
    input.cursor.queryHash !== input.queryHash ||
    input.cursor.responseVersion !== SEARCH_RESPONSE_VERSION ||
    input.cursor.snapshotVersion !== PHASE04_SNAPSHOT_VERSION
  ) {
    return {
      response: null,
      paginatedResult: null,
      snapshotExpired: buildSnapshotExpired(
        input.queryHash,
        "search_contract_changed"
      ),
    };
  }

  const snapshotResult = await loadValidQuerySnapshot(input.cursor.snapshotId);
  if (!snapshotResult.ok) {
    return {
      response: null,
      paginatedResult: null,
      snapshotExpired: buildSnapshotExpired(
        input.queryHash,
        snapshotResult.reason
      ),
    };
  }
  const snapshot = snapshotResult.snapshot;
  if (
    snapshot.queryHash !== input.queryHash ||
    snapshot.responseVersion !== SEARCH_RESPONSE_VERSION ||
    snapshot.snapshotVersion !== PHASE04_SNAPSHOT_VERSION
  ) {
    return {
      response: null,
      paginatedResult: null,
      snapshotExpired: buildSnapshotExpired(
        input.queryHash,
        "search_contract_changed"
      ),
    };
  }

  const unitKeys = snapshot.orderedUnitKeys ?? [];
  const visibleRows = await fetchProjectionRowsByUnitKeys(unitKeys, input.spec);
  const holeCount = Math.max(0, unitKeys.length - visibleRows.length);
  recordSearchSnapshotHoleRatio({
    route: "search-page-ssr",
    queryHash: input.queryHash,
    querySnapshotId: snapshot.id,
    holeCount,
    consideredCount: unitKeys.length,
  });

  const start = (input.cursor.page - 1) * input.cursor.pageSize;
  const pageRows = visibleRows.slice(start, start + input.cursor.pageSize);
  const hasNext = start + input.cursor.pageSize < visibleRows.length;
  const nextCursor = hasNext
    ? buildSnapshotCursor({
        snapshotId: snapshot.id,
        page: input.cursor.page + 1,
        pageSize: input.cursor.pageSize,
        queryHash: snapshot.queryHash,
      })
    : null;

  return buildResult({
    rows: pageRows,
    allRowsForMap: visibleRows,
    total: visibleRows.length,
    queryHash: snapshot.queryHash,
    querySnapshotId: snapshot.id,
    nextCursor,
    versions: {
      projectionEpoch: BigInt(snapshot.projectionEpoch ?? 1),
      embeddingVersion: snapshot.embeddingVersion,
      rankerProfileVersion: snapshot.rankerProfileVersion,
      unitIdentityEpochFloor:
        snapshot.unitIdentityEpochFloor ?? DEFAULT_UNIT_IDENTITY_EPOCH_FLOOR,
    },
    includeMap: input.includeMap,
  });
}

export async function executeProjectionSearchV2(input: {
  params: SearchV2Params;
  parsed: ParsedSearchParams;
}): Promise<SearchV2Result> {
  const shouldIncludeMap = input.params.includeMap !== false;
  const cursorStr = getFirstValue(input.params.rawParams.cursor);
  const embeddingVersion = getReadEmbeddingVersion();
  const versions = {
    projectionEpoch: currentProjectionEpoch(),
    embeddingVersion,
    rankerProfileVersion: RANKING_VERSION,
    unitIdentityEpochFloor: DEFAULT_UNIT_IDENTITY_EPOCH_FLOOR,
  };
  const specResult = buildPhase04SearchSpec({
    parsed: input.parsed,
    rawParams: input.params.rawParams as RawSearchParams,
    pageSize: input.params.limit ?? 12,
    versions,
  });
  if (!specResult.ok) {
    return {
      response: null,
      paginatedResult: null,
      admissionError: specResult.error,
    };
  }
  const spec = specResult.spec;
  const queryHash = getPhase04SearchSpecHash(spec);
  const eligibility = getProjectionReadEligibility(input.parsed);
  if (!eligibility.supported) {
    if (cursorStr) {
      const decoded = decodeCursorAny(cursorStr, spec.sort);
      if (decoded?.type === "snapshot" && decoded.cursor.v === 4) {
        return {
          response: null,
          paginatedResult: null,
          snapshotExpired: buildSnapshotExpired(
            queryHash,
            "search_contract_changed"
          ),
        };
      }
    }

    return {
      response: null,
      paginatedResult: null,
      error: "projection_read_unsupported",
      projectionReadUnsupported: eligibility,
    };
  }

  if (cursorStr) {
    const decoded = decodeCursorAny(cursorStr, spec.sort);
    if (decoded?.type === "snapshot") {
      return hydratePhase04Snapshot({
        cursor: decoded.cursor,
        queryHash,
        includeMap: shouldIncludeMap,
        spec,
      });
    }
  }

  const rows = await queryProjectionUnitRows(spec);
  const pageRows = rows.slice(0, spec.pageSize);
  const mapPayload = shouldIncludeMap ? buildMap(rows) : null;
  const querySnapshot = await createQuerySnapshot({
    queryHash,
    backendSource: "v2",
    responseVersion: SEARCH_RESPONSE_VERSION,
    projectionEpoch: versions.projectionEpoch,
    embeddingVersion: versions.embeddingVersion,
    rankerProfileVersion: versions.rankerProfileVersion,
    unitIdentityEpochFloor: versions.unitIdentityEpochFloor,
    snapshotVersion: PHASE04_SNAPSHOT_VERSION,
    orderedListingIds: rows.map((row) => row.representativeInventoryId),
    orderedUnitKeys: rows.map((row) => row.unitKey),
    mapPayload,
    total: rows.length,
  });
  const nextCursor =
    spec.pageSize < rows.length
      ? buildSnapshotCursor({
          snapshotId: querySnapshot.id,
          page: 2,
          pageSize: spec.pageSize,
          queryHash,
        })
      : null;

  return buildResult({
    rows: pageRows,
    allRowsForMap: rows,
    total: rows.length,
    queryHash,
    querySnapshotId: querySnapshot.id,
    nextCursor,
    versions,
    includeMap: shouldIncludeMap,
  });
}

export async function hydratePhase04MapSnapshot(input: {
  querySnapshotId: string;
  queryHash?: string | null;
}): Promise<
  | SearchMapState
  | {
      error: "snapshot_expired";
      snapshotExpired: { queryHash: string; reason: SnapshotExpiredReason };
    }
> {
  const snapshotResult = await loadValidQuerySnapshot(input.querySnapshotId);
  const queryHash = input.queryHash ?? "";
  if (!snapshotResult.ok) {
    return {
      error: "snapshot_expired",
      snapshotExpired: {
        queryHash,
        reason: snapshotResult.reason,
      },
    };
  }
  const snapshot = snapshotResult.snapshot;
  const requestedQueryHash = input.queryHash?.trim() ?? "";
  if (
    snapshot.snapshotVersion !== PHASE04_SNAPSHOT_VERSION ||
    snapshot.responseVersion !== SEARCH_RESPONSE_VERSION ||
    (requestedQueryHash.length > 0 && snapshot.queryHash !== requestedQueryHash)
  ) {
    return {
      error: "snapshot_expired",
      snapshotExpired: {
        queryHash: requestedQueryHash || snapshot.queryHash,
        reason: "search_contract_changed",
      },
    };
  }
  if (snapshot.mapPayload) {
    const storedMap = snapshot.mapPayload as unknown as SearchV2Map;
    return {
      kind: "ok",
      data: {
        listings: searchV2MapToListings(storedMap),
        ...(storedMap.truncated !== undefined
          ? { truncated: storedMap.truncated }
          : {}),
        ...(storedMap.totalCandidates !== undefined
          ? { totalCandidates: storedMap.totalCandidates }
          : {}),
      },
      meta: toSnapshotResponseMeta(snapshot),
    };
  }
  const rows = await fetchProjectionRowsByUnitKeys(
    snapshot.orderedUnitKeys ?? []
  );
  const map = buildMap(rows);
  return {
    kind: "ok",
    data: {
      listings: projectionRowsToMapListings(rows),
      ...(map.truncated !== undefined ? { truncated: map.truncated } : {}),
    },
    meta: toSnapshotResponseMeta(snapshot),
  };
}

export async function getProjectionSearchCount(input: {
  parsed: ParsedSearchParams;
  rawParams: RawSearchParams | Record<string, string | string[] | undefined>;
}): Promise<ProjectionSearchCountResult> {
  const versions = {
    projectionEpoch: currentProjectionEpoch(),
    embeddingVersion: getReadEmbeddingVersion(),
    rankerProfileVersion: RANKING_VERSION,
    unitIdentityEpochFloor: DEFAULT_UNIT_IDENTITY_EPOCH_FLOOR,
  };
  const specResult = buildPhase04SearchSpec({
    parsed: input.parsed,
    rawParams: input.rawParams,
    pageSize: 100,
    versions,
  });
  if (!specResult.ok) return { ok: false, error: specResult.error };
  const eligibility = getProjectionReadEligibility(input.parsed);
  if (!eligibility.supported) {
    return { ok: false, error: buildProjectionUnsupportedError(eligibility) };
  }
  const rows = await queryProjectionUnitRows(specResult.spec);
  return { ok: true, count: rows.length > 100 ? null : rows.length };
}
