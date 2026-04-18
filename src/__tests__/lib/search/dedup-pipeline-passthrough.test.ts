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

describe("applyServerDedup passthrough", () => {
  it("returns rows unchanged when the flag is disabled", () => {
    const rows = [
      createRow(),
      createRow({ id: "listing-2", title: "Shared Room", roomType: "shared" }),
    ];

    const result = applyServerDedup(rows, { enabled: false, limit: 12 });

    expect(result.canonicals).toEqual(rows);
    expect("groupKey" in result.canonicals[0]).toBe(false);
    expect("groupSummary" in result.canonicals[0]).toBe(false);
    expect(result.overflowCanonicalIds.size).toBe(0);
    expect(result.metrics).toEqual({
      rowsIn: 2,
      groupsOut: 2,
      maxGroupSize: 1,
      overflowCount: 0,
    });
  });
});
