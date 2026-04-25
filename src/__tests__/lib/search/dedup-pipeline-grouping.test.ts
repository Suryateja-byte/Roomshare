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
    moveInDate: "2026-06-15",
    availableUntil: null,
    openSlots: 1,
    totalSlots: 2,
    normalizedAddress: "123 main st san francisco ca 94105",
    location: {
      address: "123 Main St",
      city: "San Francisco",
      state: "CA",
      zip: "94105",
    },
    ...overrides,
  };
}

describe("applyServerDedup grouping", () => {
  it("collapses same-owner same-address rows into one canonical", () => {
    const rows = [
      createRow({ id: "listing-a", moveInDate: "2026-06-15", openSlots: 1 }),
      createRow({ id: "listing-b", moveInDate: "2026-06-01", openSlots: 2 }),
      createRow({ id: "listing-c", moveInDate: "2026-07-01", openSlots: 3 }),
      createRow({ id: "listing-d", moveInDate: "2026-08-01", openSlots: 4 }),
    ];

    const result = applyServerDedup(rows, {
      enabled: true,
      limit: 12,
      lookAhead: 16,
    });

    expect(result.canonicals).toHaveLength(1);
    expect(result.canonicals[0].id).toBe("listing-a");
    expect(result.canonicals[0].groupSummary.siblingIds).toEqual([
      "listing-b",
      "listing-c",
      "listing-d",
    ]);
    expect(result.canonicals[0].groupSummary.availableFromDates).toEqual([
      "2026-06-01",
      "2026-06-15",
      "2026-07-01",
      "2026-08-01",
    ]);
    expect(result.canonicals[0].groupSummary.combinedOpenSlots).toBe(10);
    expect(result.metrics).toEqual({
      rowsIn: 4,
      groupsOut: 1,
      maxGroupSize: 4,
      overflowCount: 0,
    });
  });
});
