jest.mock("@/lib/prisma", () => ({
  prisma: {
    querySnapshot: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  createQuerySnapshot,
  loadValidQuerySnapshot,
  PHASE04_SNAPSHOT_VERSION,
  QUERY_SNAPSHOT_MAX_LISTING_IDS,
  QUERY_SNAPSHOT_MAX_UNIT_KEYS,
  toSnapshotResponseMeta,
} from "@/lib/search/query-snapshots";

const mockCreate = (prisma.querySnapshot.create as jest.Mock);
const mockFindUnique = (prisma.querySnapshot.findUnique as jest.Mock);

describe("query snapshots", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("trims and de-duplicates stored listing ids", async () => {
    mockCreate.mockImplementation(async ({ data }) => ({
      id: "snapshot-1",
      ...data,
    }));

    const orderedListingIds = [
      ...Array.from(
        { length: QUERY_SNAPSHOT_MAX_LISTING_IDS + 10 },
        (_, index) => `listing-${index}`
      ),
      "listing-0",
      "listing-1",
      "listing-2",
    ];

    const snapshot = await createQuerySnapshot({
      queryHash: "abcdef1234567890",
      backendSource: "v2",
      responseVersion: "2026-04-19.search-contract-v2",
      orderedListingIds,
      total: 10,
    });

    expect(snapshot.orderedListingIds).toHaveLength(
      QUERY_SNAPSHOT_MAX_LISTING_IDS
    );
    expect(new Set(snapshot.orderedListingIds).size).toBe(
      QUERY_SNAPSHOT_MAX_LISTING_IDS
    );
    expect(snapshot.orderedListingIds[0]).toBe("listing-0");
  });

  it("trims and de-duplicates Phase 04 ordered unit keys", async () => {
    mockCreate.mockImplementation(async ({ data }) => ({
      id: "snapshot-unit-keys",
      ...data,
    }));
    const orderedUnitKeys = [
      ...Array.from(
        { length: QUERY_SNAPSHOT_MAX_UNIT_KEYS + 10 },
        (_, index) => `unit-${index}:1`
      ),
      "unit-0:1",
      "unit-1:1",
    ];

    const snapshot = await createQuerySnapshot({
      queryHash: "abcdef1234567890",
      backendSource: "v2",
      responseVersion: "2026-04-19.search-contract-v2",
      snapshotVersion: PHASE04_SNAPSHOT_VERSION,
      projectionEpoch: BigInt(4),
      unitIdentityEpochFloor: 1,
      orderedListingIds: [],
      orderedUnitKeys,
      total: 10,
    });

    expect(snapshot.orderedUnitKeys).toHaveLength(QUERY_SNAPSHOT_MAX_UNIT_KEYS);
    expect(new Set(snapshot.orderedUnitKeys).size).toBe(
      QUERY_SNAPSHOT_MAX_UNIT_KEYS
    );
    expect(snapshot.orderedUnitKeys[0]).toBe("unit-0:1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectionEpoch: BigInt(4),
          unitIdentityEpochFloor: 1,
          snapshotVersion: PHASE04_SNAPSHOT_VERSION,
        }),
      })
    );
  });

  it("serializes Phase 04 snapshot metadata for responses", () => {
    const meta = toSnapshotResponseMeta({
      id: "snapshot-meta",
      queryHash: "abcdef1234567890",
      backendSource: "v2",
      responseVersion: "2026-04-19.search-contract-v2",
      projectionVersion: null,
      projectionEpoch: BigInt(9),
      embeddingVersion: "embed-v1",
      rankerProfileVersion: "ranker-v1",
      unitIdentityEpochFloor: 1,
      snapshotVersion: PHASE04_SNAPSHOT_VERSION,
    });

    expect(meta).toMatchObject({
      querySnapshotId: "snapshot-meta",
      projectionEpoch: "9",
      embeddingVersion: "embed-v1",
      rankerProfileVersion: "ranker-v1",
      unitIdentityEpochFloor: 1,
      snapshotVersion: PHASE04_SNAPSHOT_VERSION,
    });
  });

  it("returns snapshot_missing when the snapshot row is absent", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(loadValidQuerySnapshot("missing")).resolves.toEqual({
      ok: false,
      reason: "snapshot_missing",
    });
  });

  it("returns snapshot_expired when the snapshot TTL has elapsed", async () => {
    mockFindUnique.mockResolvedValue({
      id: "snapshot-1",
      queryHash: "abcdef1234567890",
      backendSource: "v2",
      responseVersion: "2026-04-19.search-contract-v2",
      projectionVersion: 3,
      embeddingVersion: null,
      rankerProfileVersion: null,
      orderedListingIds: ["listing-1"],
      mapPayload: null,
      total: 1,
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(Date.now() - 2000),
    });

    await expect(loadValidQuerySnapshot("expired")).resolves.toEqual({
      ok: false,
      reason: "snapshot_expired",
    });
  });
});
