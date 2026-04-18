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

describe("applyServerDedup slot variance merge", () => {
  it("merges open slot variance into one group summary", () => {
    const rows = [
      createRow({ id: "listing-a", openSlots: 1 }),
      createRow({ id: "listing-b", openSlots: 2, moveInDate: "2026-06-15" }),
      createRow({ id: "listing-c", openSlots: 3, moveInDate: "2026-07-01" }),
    ];

    const result = applyServerDedup(rows, { enabled: true, limit: 12 });

    expect(result.canonicals).toHaveLength(1);
    expect(result.canonicals[0].groupSummary.combinedOpenSlots).toBe(6);
  });
});
