import {
  applyServerDedup,
  type SearchRowForDedup,
} from "@/lib/search/dedup-pipeline";

function createRow(overrides: Partial<SearchRowForDedup> = {}): SearchRowForDedup {
  return {
    id: "listing-1",
    ownerId: "owner-1",
    title: "Private Room",
    price: 1000,
    roomType: "private",
    moveInDate: "2026-06-01",
    availableUntil: null,
    openSlots: 1,
    totalSlots: 2,
    normalizedAddress: null,
    location: {
      address: "123 Main St Apt 4B",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    ...overrides,
  };
}

describe("applyServerDedup pre-backfill fallback", () => {
  it("falls back to in-memory normalizeAddress when normalizedAddress is null", () => {
    const rows = [
      createRow({ id: "listing-a" }),
      createRow({
        id: "listing-b",
        moveInDate: "2026-06-15",
        location: {
          address: "123 MAIN ST apt 4b",
          city: "AUSTIN",
          state: "tx",
          zip: "78701",
        },
      }),
    ];

    const result = applyServerDedup(rows, { enabled: true, limit: 12 });

    expect(result.canonicals).toHaveLength(1);
    expect(result.canonicals[0].groupSummary.siblingIds).toEqual(["listing-b"]);
  });
});
