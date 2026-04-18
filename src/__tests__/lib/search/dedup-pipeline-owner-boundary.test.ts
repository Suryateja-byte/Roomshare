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
    normalizedAddress: "123 main st austin tx 78701",
    location: {
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    ...overrides,
  };
}

describe("applyServerDedup owner boundary", () => {
  it("never merges rows across owners", () => {
    const rows = [
      createRow({ id: "listing-a", ownerId: "owner-1" }),
      createRow({ id: "listing-b", ownerId: "owner-2" }),
    ];

    const result = applyServerDedup(rows, { enabled: true, limit: 12 });

    expect(result.canonicals).toHaveLength(2);
    expect(result.canonicals.map((row) => row.id)).toEqual([
      "listing-a",
      "listing-b",
    ]);
  });
});
