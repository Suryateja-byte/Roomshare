jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
    querySnapshot: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/embeddings/version", () => ({
  getReadEmbeddingVersion: jest.fn(() => "embed-v1"),
}));

import { prisma } from "@/lib/prisma";
import type { ParsedSearchParams } from "@/lib/search-params";
import { encodeSnapshotCursor } from "@/lib/search/cursor";
import {
  executeProjectionSearchV2,
  getProjectionSearchCount,
  hydratePhase04MapSnapshot,
} from "@/lib/search/projection-search";
import { PHASE04_SNAPSHOT_VERSION } from "@/lib/search/query-snapshots";
import { RANKING_VERSION } from "@/lib/search/ranking";
import { SEARCH_RESPONSE_VERSION } from "@/lib/search/search-response";
import {
  buildPhase04SearchSpec,
  getPhase04SearchSpecHash,
} from "@/lib/search/search-spec";
import { getReadEmbeddingVersion } from "@/lib/embeddings/version";

const mockQueryRawUnsafe = prisma.$queryRawUnsafe as jest.Mock;
const mockSnapshotCreate = prisma.querySnapshot.create as jest.Mock;
const mockSnapshotFindUnique = prisma.querySnapshot.findUnique as jest.Mock;
const mockGetReadEmbeddingVersion = getReadEmbeddingVersion as jest.Mock;

function parsed(
  overrides: Partial<ParsedSearchParams> = {}
): ParsedSearchParams {
  return {
    requestedPage: 1,
    sortOption: "recommended",
    filterParams: {},
    boundsRequired: false,
    browseMode: false,
    ...overrides,
  };
}

function projectionRow(overrides: Record<string, unknown> = {}) {
  const unitId = String(overrides.unit_id ?? "unit-1");
  const epoch = Number(overrides.unit_identity_epoch ?? 1);
  const inventoryIds =
    (overrides.inventory_ids as string[] | undefined) ?? [`${unitId}-inv-1`];

  return {
    unit_key: `${unitId}:${epoch}`,
    unit_id: unitId,
    unit_identity_epoch: epoch,
    representative_inventory_id:
      overrides.representative_inventory_id ?? inventoryIds[0],
    inventory_ids: inventoryIds,
    from_price: overrides.from_price ?? "1200",
    room_categories: overrides.room_categories ?? ["PRIVATE_ROOM"],
    earliest_available_from:
      overrides.earliest_available_from ?? new Date("2026-05-01T00:00:00Z"),
    matching_inventory_count: overrides.matching_inventory_count ?? inventoryIds.length,
    public_point: overrides.public_point ?? "POINT(-122.4200 37.7700)",
    public_cell_id: overrides.public_cell_id ?? "37.77,-122.42",
    public_area_name: overrides.public_area_name ?? "Mission",
    display_title: overrides.display_title ?? `Room in ${unitId}`,
    display_subtitle: overrides.display_subtitle ?? "Projection-safe summary",
    hero_image_url: overrides.hero_image_url ?? null,
    projection_epoch: overrides.projection_epoch ?? BigInt(1),
    source_version: overrides.source_version ?? BigInt(1),
  };
}

function createSnapshotMock() {
  mockSnapshotCreate.mockImplementation(async ({ data }) => ({
    id: "snapshot-phase04",
    createdAt: new Date("2026-04-23T00:00:00Z"),
    expiresAt: data.expiresAt,
    ...data,
  }));
}

function phase04QueryHash(pageSize = 2): string {
  const specResult = buildPhase04SearchSpec({
    parsed: parsed(),
    rawParams: {},
    pageSize,
    versions: {
      projectionEpoch: BigInt(1),
      embeddingVersion: "embed-v1",
      rankerProfileVersion: RANKING_VERSION,
      unitIdentityEpochFloor: 1,
    },
  });
  if (!specResult.ok) {
    throw new Error("test SearchSpec should be valid");
  }
  return getPhase04SearchSpecHash(specResult.spec);
}

describe("Phase 04 projection search", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.PROJECTION_EPOCH = "1";
    delete process.env.ENABLE_SEMANTIC_SEARCH;
    delete process.env.KILL_SWITCH_DISABLE_SEMANTIC_SEARCH;
    delete process.env.KILL_SWITCH_FORCE_LIST_ONLY;
    delete process.env.KILL_SWITCH_FORCE_CLUSTERS_ONLY;
    mockGetReadEmbeddingVersion.mockReturnValue("embed-v1");
    createSnapshotMock();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("reads projections, returns one grouped result per unit key, and stores v4 snapshot keys", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      projectionRow({
        unit_id: "unit-a",
        representative_inventory_id: "inv-a1",
        inventory_ids: ["inv-a1", "inv-a2"],
      }),
      projectionRow({
        unit_id: "unit-b",
        representative_inventory_id: "inv-b1",
        inventory_ids: ["inv-b1"],
      }),
    ]);

    const result = await executeProjectionSearchV2({
      parsed: parsed(),
      params: { rawParams: {}, limit: 1, includeMap: true },
    });

    expect(result.response?.list.fullItems).toHaveLength(1);
    expect(result.response?.list.fullItems?.[0]?.groupKey).toBe("unit-a:1");
    expect(result.response?.list.fullItems?.[0]?.groupSummary?.members).toHaveLength(
      2
    );
    expect(result.response?.meta).toMatchObject({
      querySnapshotId: "snapshot-phase04",
      projectionEpoch: "1",
      embeddingVersion: "embed-v1",
      snapshotVersion: PHASE04_SNAPSHOT_VERSION,
    });
    expect(result.response?.list.nextCursor).toEqual(expect.any(String));
    expect(mockSnapshotCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderedListingIds: ["inv-a1", "inv-b1"],
          orderedUnitKeys: ["unit-a:1", "unit-b:1"],
          snapshotVersion: PHASE04_SNAPSHOT_VERSION,
        }),
      })
    );
    const sql = String(mockQueryRawUnsafe.mock.calls[0][0]);
    expect(sql).toContain("inventory_search_projection");
    expect(sql).toContain("unit_public_projection");
    expect(sql).toContain("GROUP BY");
    expect(sql).not.toContain("search_doc");
  });

  it("pins semantic candidates to the read embedding version", async () => {
    process.env.ENABLE_SEMANTIC_SEARCH = "true";
    mockQueryRawUnsafe.mockResolvedValueOnce([projectionRow()]);

    await executeProjectionSearchV2({
      parsed: parsed({ filterParams: { query: "sunny quiet room" } }),
      params: { rawParams: { q: "sunny quiet room" }, limit: 12 },
    });

    const sql = String(mockQueryRawUnsafe.mock.calls[0][0]);
    const params = mockQueryRawUnsafe.mock.calls[0].slice(1);
    expect(sql).toContain("semantic_inventory_projection");
    expect(sql).toContain("sem.publish_status = 'PUBLISHED'");
    expect(params).toContain("embed-v1");
  });

  it("falls back to filter-only projection reads when semantic search is disabled", async () => {
    process.env.ENABLE_SEMANTIC_SEARCH = "true";
    process.env.KILL_SWITCH_DISABLE_SEMANTIC_SEARCH = "true";
    mockQueryRawUnsafe.mockResolvedValueOnce([projectionRow()]);

    await executeProjectionSearchV2({
      parsed: parsed({ filterParams: { query: "sunny quiet room" } }),
      params: { rawParams: { q: "sunny quiet room" }, limit: 12 },
    });

    expect(String(mockQueryRawUnsafe.mock.calls[0][0])).not.toContain(
      "semantic_inventory_projection"
    );
  });

  it("rejects v4 snapshot cursors after an embedding-version hash mismatch", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      projectionRow({ unit_id: "unit-a", representative_inventory_id: "inv-a1" }),
      projectionRow({ unit_id: "unit-b", representative_inventory_id: "inv-b1" }),
    ]);

    const firstPage = await executeProjectionSearchV2({
      parsed: parsed(),
      params: { rawParams: {}, limit: 1 },
    });
    const cursor = firstPage.response?.list.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    if (!cursor) throw new Error("expected first page to return a v4 cursor");

    mockGetReadEmbeddingVersion.mockReturnValue("embed-v2");
    const secondPage = await executeProjectionSearchV2({
      parsed: parsed(),
      params: { rawParams: { cursor }, limit: 1 },
    });

    expect(secondPage.snapshotExpired).toMatchObject({
      reason: "search_contract_changed",
    });
    expect(mockSnapshotFindUnique).not.toHaveBeenCalled();
  });

  it("hydrates snapshot pages by filtering missing units and backfilling holes", async () => {
    const queryHash = phase04QueryHash(2);
    const cursor = encodeSnapshotCursor({
      v: 4,
      snapshotId: "snapshot-phase04",
      page: 1,
      pageSize: 2,
      queryHash,
      responseVersion: SEARCH_RESPONSE_VERSION,
      snapshotVersion: PHASE04_SNAPSHOT_VERSION,
    });
    mockSnapshotFindUnique.mockResolvedValue({
      id: "snapshot-phase04",
      queryHash,
      backendSource: "v2",
      responseVersion: SEARCH_RESPONSE_VERSION,
      projectionVersion: null,
      projectionEpoch: BigInt(1),
      embeddingVersion: "embed-v1",
      rankerProfileVersion: "2026-04-19.search-ranker-v1",
      unitIdentityEpochFloor: 1,
      snapshotVersion: PHASE04_SNAPSHOT_VERSION,
      orderedListingIds: ["inv-a1", "inv-b1", "inv-c1"],
      orderedUnitKeys: ["unit-a:1", "unit-b:1", "unit-c:1"],
      mapPayload: null,
      total: 3,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date("2026-04-23T00:00:00Z"),
    });
    mockQueryRawUnsafe.mockResolvedValueOnce([
      projectionRow({ unit_id: "unit-a", representative_inventory_id: "inv-a1" }),
      projectionRow({ unit_id: "unit-c", representative_inventory_id: "inv-c1" }),
    ]);

    const result = await executeProjectionSearchV2({
      parsed: parsed(),
      params: { rawParams: { cursor }, limit: 2 },
    });

    expect(result.response?.list.fullItems?.map((item) => item.id)).toEqual([
      "inv-a1",
      "inv-c1",
    ]);
    expect(result.response?.list.nextCursor).toBeNull();
  });

  it("hydrates Phase 04 map snapshots from ordered unit keys", async () => {
    mockSnapshotFindUnique.mockResolvedValue({
      id: "snapshot-phase04",
      queryHash: "hash-phase04",
      backendSource: "v2",
      responseVersion: SEARCH_RESPONSE_VERSION,
      projectionVersion: null,
      projectionEpoch: BigInt(1),
      embeddingVersion: "embed-v1",
      rankerProfileVersion: "2026-04-19.search-ranker-v1",
      unitIdentityEpochFloor: 1,
      snapshotVersion: PHASE04_SNAPSHOT_VERSION,
      orderedListingIds: ["inv-a1"],
      orderedUnitKeys: ["unit-a:1"],
      mapPayload: null,
      total: 1,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date("2026-04-23T00:00:00Z"),
    });
    mockQueryRawUnsafe.mockResolvedValueOnce([
      projectionRow({ unit_id: "unit-a", representative_inventory_id: "inv-a1" }),
    ]);

    const result = await hydratePhase04MapSnapshot({
      querySnapshotId: "snapshot-phase04",
    });

    expect(result).toMatchObject({
      kind: "ok",
      meta: {
        querySnapshotId: "snapshot-phase04",
        snapshotVersion: PHASE04_SNAPSHOT_VERSION,
      },
    });
    if ("kind" in result && result.kind === "ok") {
      expect(result.data.listings).toHaveLength(1);
    }
  });

  it("applies Phase 04 map kill switches", async () => {
    mockQueryRawUnsafe.mockResolvedValue([projectionRow()]);

    process.env.KILL_SWITCH_FORCE_LIST_ONLY = "true";
    const listOnly = await executeProjectionSearchV2({
      parsed: parsed(),
      params: { rawParams: {}, limit: 12, includeMap: true },
    });
    expect(listOnly.response?.map.geojson.features).toHaveLength(0);

    jest.clearAllMocks();
    createSnapshotMock();
    mockQueryRawUnsafe.mockResolvedValue([projectionRow()]);
    delete process.env.KILL_SWITCH_FORCE_LIST_ONLY;
    process.env.KILL_SWITCH_FORCE_CLUSTERS_ONLY = "true";
    const clustersOnly = await executeProjectionSearchV2({
      parsed: parsed(),
      params: { rawParams: {}, limit: 12, includeMap: true },
    });
    expect(clustersOnly.response?.map.geojson.features).toHaveLength(1);
    expect(clustersOnly.response?.map.pins).toBeUndefined();
  });

  it("returns projection-backed limited counts with admission errors", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([projectionRow(), projectionRow()]);

    await expect(
      getProjectionSearchCount({
        parsed: parsed(),
        rawParams: {},
      })
    ).resolves.toEqual({ ok: true, count: 2 });

    await expect(
      getProjectionSearchCount({
        parsed: parsed(),
        rawParams: { requested_occupants: "21" },
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "requested_occupants_too_high" },
    });
  });
});
