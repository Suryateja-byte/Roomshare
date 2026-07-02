/**
 * @jest-environment node
 *
 * refreshSeedListingFreshness — keeps seed-owned listings inside the 21-day
 * host-managed freshness window on demo deployments (see seed-freshness.ts).
 */

const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      mockTransaction(cb),
  },
}));

const mockMarkListingsDirtyInTx = jest.fn();
jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingsDirtyInTx: (...args: unknown[]) =>
    mockMarkListingsDirtyInTx(...args),
}));

import {
  getSeedOwnerDomains,
  refreshSeedListingFreshness,
} from "@/lib/listings/seed-freshness";

const tx = {
  listing: { findMany: mockFindMany, updateMany: mockUpdateMany },
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SEED_FRESHNESS_OWNER_DOMAINS;
  mockTransaction.mockImplementation((cb) => cb(tx));
});

describe("getSeedOwnerDomains", () => {
  it("defaults to roomshare.dev", () => {
    expect(getSeedOwnerDomains()).toEqual(["roomshare.dev"]);
  });

  it("parses a comma-separated, whitespace-tolerant, lowercased allowlist", () => {
    process.env.SEED_FRESHNESS_OWNER_DOMAINS = " Roomshare.dev , demo.Test ,";
    expect(getSeedOwnerDomains()).toEqual(["roomshare.dev", "demo.test"]);
  });
});

describe("refreshSeedListingFreshness", () => {
  it("re-stamps only stale ACTIVE seed-owned listings and marks them dirty in the same tx", async () => {
    mockFindMany.mockResolvedValue([{ id: "l1" }, { id: "l2" }]);
    mockUpdateMany.mockResolvedValue({ count: 2 });

    const result = await refreshSeedListingFreshness();

    expect(result).toEqual({ refreshed: 2 });
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("ACTIVE");
    expect(where.lastConfirmedAt.lt).toBeInstanceOf(Date);
    // ~14-day threshold (allow scheduling jitter of a minute)
    const ageMs = Date.now() - where.lastConfirmedAt.lt.getTime();
    expect(ageMs).toBeGreaterThan(13.9 * 24 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan(14.1 * 24 * 60 * 60 * 1000);
    expect(where.owner.OR).toEqual([
      { email: { endsWith: "@roomshare.dev", mode: "insensitive" } },
    ]);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["l1", "l2"] } },
      data: { lastConfirmedAt: expect.any(Date) },
    });
    expect(mockMarkListingsDirtyInTx).toHaveBeenCalledWith(
      tx,
      ["l1", "l2"],
      "listing_updated"
    );
  });

  it("is a no-op when nothing is stale", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await refreshSeedListingFreshness();

    expect(result).toEqual({ refreshed: 0 });
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockMarkListingsDirtyInTx).not.toHaveBeenCalled();
  });

  it("builds one endsWith filter per allowlisted domain", async () => {
    process.env.SEED_FRESHNESS_OWNER_DOMAINS = "roomshare.dev,demo.test";
    mockFindMany.mockResolvedValue([]);

    await refreshSeedListingFreshness();

    expect(mockFindMany.mock.calls[0][0].where.owner.OR).toEqual([
      { email: { endsWith: "@roomshare.dev", mode: "insensitive" } },
      { email: { endsWith: "@demo.test", mode: "insensitive" } },
    ]);
  });

  it("refuses to run with an empty domain allowlist", async () => {
    process.env.SEED_FRESHNESS_OWNER_DOMAINS = " , ";

    const result = await refreshSeedListingFreshness();

    expect(result).toEqual({ refreshed: 0 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
