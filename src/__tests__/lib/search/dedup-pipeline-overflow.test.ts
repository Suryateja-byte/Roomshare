import {
  applyServerDedup,
  type SearchRowForDedup,
} from "@/lib/search/dedup-pipeline";

function createRow(index: number, overrides: Partial<SearchRowForDedup> = {}): SearchRowForDedup {
  return {
    id: `listing-${index}`,
    ownerId: "owner-1",
    title: `Room ${index}`,
    price: 1000 + index,
    roomType: "private",
    moveInDate: `2026-06-${String((index % 28) + 1).padStart(2, "0")}`,
    availableUntil: null,
    openSlots: 1,
    totalSlots: 2,
    normalizedAddress: `${index} main st austin tx 78701`,
    location: {
      address: `${index} Main St`,
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    ...overrides,
  };
}

describe("applyServerDedup overflow", () => {
  it("flags a canonical when a sibling appears beyond limit plus lookAhead", () => {
    const rows = Array.from({ length: 37 }, (_, index) => createRow(index + 1));
    rows.push(
      createRow(38, {
        id: "listing-overflow-sibling",
        title: "Room 1",
        price: 1001,
        normalizedAddress: "1 main st austin tx 78701",
        moveInDate: "2026-08-01",
      })
    );

    const result = applyServerDedup(rows, {
      enabled: true,
      limit: 20,
      lookAhead: 16,
    });

    const overflowCanonical = result.canonicals.find((row) => row.id === "listing-1");
    expect(overflowCanonical?.groupSummary.groupOverflow).toBe(true);
    expect(Array.from(result.overflowCanonicalIds)).toEqual(["listing-1"]);
    expect(result.metrics.overflowCount).toBe(1);
  });
});
