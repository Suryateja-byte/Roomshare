import { groupListings, type ListingLike } from "@/lib/search/dedup";

describe("search/dedup", () => {
  function createListing(overrides: Partial<ListingLike> = {}): ListingLike {
    return {
      id: "listing-1",
      ownerId: "owner-1",
      normalizedAddress: "123 main st austin tx 78701",
      priceCents: 100000,
      title: "Private Room",
      roomType: "private",
      moveInDate: "2026-06-01",
      availableUntil: null,
      openSlots: 1,
      totalSlots: 2,
      ...overrides,
    };
  }

  it("is deterministic for the same input", () => {
    const listings = [
      createListing({ id: "listing-a", moveInDate: "2026-06-10" }),
      createListing({ id: "listing-b", moveInDate: "2026-06-01", openSlots: 2 }),
      createListing({
        id: "listing-c",
        ownerId: "owner-2",
        moveInDate: "2026-07-01",
      }),
    ];

    expect(groupListings(listings)).toEqual(groupListings(listings));
  });

  it("keeps listings from different owners in separate groups", () => {
    const result = groupListings([
      createListing({ id: "listing-a", ownerId: "owner-1" }),
      createListing({ id: "listing-b", ownerId: "owner-2" }),
    ]);

    expect(result.canonicals).toHaveLength(2);
    expect(result.canonicals.map((listing) => listing.id)).toEqual([
      "listing-a",
      "listing-b",
    ]);
  });

  it("splits groups by room type", () => {
    const result = groupListings([
      createListing({ id: "listing-a", roomType: "private" }),
      createListing({ id: "listing-b", roomType: "shared" }),
    ]);

    expect(result.canonicals).toHaveLength(2);
    expect(result.canonicals.map((listing) => listing.id)).toEqual([
      "listing-a",
      "listing-b",
    ]);
  });

  it("preserves canonical source order by first occurrence", () => {
    const result = groupListings([
      createListing({ id: "group-a-1", title: "Private Room A" }),
      createListing({ id: "group-b-1", title: "Private Room B" }),
      createListing({ id: "group-a-2", title: "Private Room A", moveInDate: "2026-06-15" }),
      createListing({ id: "group-c-1", title: "Private Room C" }),
      createListing({ id: "group-b-2", title: "Private Room B", moveInDate: "2026-07-01" }),
    ]);

    expect(result.canonicals.map((listing) => listing.id)).toEqual([
      "group-a-1",
      "group-b-1",
      "group-c-1",
    ]);
  });

  it("merges slot counts and date summaries for siblings", () => {
    const result = groupListings([
      createListing({
        id: "listing-a",
        moveInDate: "2026-06-10",
        openSlots: 1,
        totalSlots: 3,
      }),
      createListing({
        id: "listing-b",
        moveInDate: "2026-06-01",
        openSlots: 2,
        totalSlots: 3,
      }),
      createListing({
        id: "listing-c",
        moveInDate: new Date("2026-06-10T12:00:00.000Z"),
        openSlots: 3,
        totalSlots: 3,
      }),
    ]);

    expect(result.canonicals).toHaveLength(1);
    expect(result.canonicals[0].groupSummary).toEqual({
      groupKey: result.canonicals[0].groupKey,
      siblingIds: ["listing-b", "listing-c"],
      availableFromDates: ["2026-06-01", "2026-06-10"],
      combinedOpenSlots: 6,
      combinedTotalSlots: 9,
      groupOverflow: false,
    });
  });

  it("flags canonical overflow when duplicates appear beyond limit plus lookAhead", () => {
    const result = groupListings(
      [
        createListing({ id: "group-a-1", title: "Private Room A" }),
        createListing({ id: "group-b-1", title: "Private Room B" }),
        createListing({ id: "group-a-2", title: "Private Room A", moveInDate: "2026-06-15" }),
        createListing({ id: "group-a-3", title: "Private Room A", moveInDate: "2026-07-01" }),
      ],
      { limit: 1, lookAhead: 1 }
    );

    expect(result.canonicals[0].groupSummary.groupOverflow).toBe(true);
    expect(Array.from(result.overflowCanonicalIds)).toEqual(["group-a-1"]);
    expect(result.canonicals[1].groupSummary.groupOverflow).toBe(false);
  });

  it("does not mutate input listings and returns the same result on repeated calls", () => {
    const listings = [
      createListing({ id: "listing-a" }),
      createListing({ id: "listing-b", moveInDate: "2026-06-15" }),
    ];
    const original = JSON.parse(JSON.stringify(listings)) as ListingLike[];

    const first = groupListings(listings);
    const second = groupListings(listings);

    expect(listings).toEqual(original);
    expect(first).toEqual(second);
  });
});
