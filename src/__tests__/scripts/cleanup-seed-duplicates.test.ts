import {
  computeGroupSignature,
  groupDuplicates,
  parseCliArgs,
} from "../../../scripts/cfm/cleanup-seed-duplicates";

function row(overrides: Partial<Parameters<typeof computeGroupSignature>[0]> = {}) {
  return {
    ownerId: "owner-1",
    title: "Private Room · San Francisco",
    moveInDate: "2026-05-01",
    price: 1000,
    availableSlots: 2,
    totalSlots: 2,
    locationAddress: "123 Main St",
    locationCity: "San Francisco",
    locationState: "CA",
    locationZip: "94102",
    ...overrides,
  };
}

function listingRow(overrides: {
  id: string;
  createdAt?: string;
  moveInDate?: string | null;
  ownerId?: string;
  title?: string;
  price?: number;
}) {
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? "owner-1",
    title: overrides.title ?? "Private Room · San Francisco",
    price: overrides.price ?? 1000,
    moveInDate: overrides.moveInDate ?? "2026-05-01",
    availableSlots: 2,
    totalSlots: 2,
    createdAt: overrides.createdAt ?? "2026-04-01T12:00:00.000Z",
    latitude: 37.77,
    longitude: -122.41,
    locationAddress: "123 Main St",
    locationCity: "San Francisco",
    locationState: "CA",
    locationZip: "94102",
  };
}

describe("parseCliArgs", () => {
  it("accepts --title-prefix alone", () => {
    const args = parseCliArgs(["--title-prefix=Private Room"]);
    expect(args.titlePrefix).toBe("Private Room");
    expect(args.ownerIds).toBeNull();
    expect(args.apply).toBe(false);
  });

  it("accepts --owner-ids alone, comma-split", () => {
    const args = parseCliArgs(["--owner-ids=u1,u2, u3"]);
    expect(args.ownerIds).toEqual(["u1", "u2", "u3"]);
  });

  it("rejects missing scope", () => {
    expect(() => parseCliArgs([])).toThrow(/title-prefix or --owner-ids/);
  });

  it("rejects both --apply and --dry-run", () => {
    expect(() =>
      parseCliArgs(["--apply", "--dry-run", "--title-prefix=X"])
    ).toThrow(/either --apply or --dry-run/);
  });
});

describe("computeGroupSignature", () => {
  it("is deterministic and normalizes title/address", () => {
    expect(
      computeGroupSignature(
        row({ title: "  Private   Room · San Francisco  " })
      )
    ).toEqual(computeGroupSignature(row()));
  });

  it("separates different ownerIds", () => {
    expect(computeGroupSignature(row({ ownerId: "owner-a" }))).not.toEqual(
      computeGroupSignature(row({ ownerId: "owner-b" }))
    );
  });

  it("separates different moveInDates", () => {
    expect(
      computeGroupSignature(row({ moveInDate: "2026-05-01" }))
    ).not.toEqual(computeGroupSignature(row({ moveInDate: "2026-06-01" })));
  });
});

describe("groupDuplicates", () => {
  it("groups rows with identical signature within the createdAt window", () => {
    const base = "2026-04-18T10:00:00.000Z";
    const rows = [
      listingRow({ id: "a", createdAt: base }),
      listingRow({
        id: "b",
        createdAt: "2026-04-18T10:00:30.000Z", // 30s after
      }),
      listingRow({
        id: "c",
        createdAt: "2026-04-18T10:00:45.000Z", // 45s after
      }),
    ];

    const groups = groupDuplicates(rows, 60);
    expect(groups).toHaveLength(1);
    expect(groups[0].keeper.id).toBe("a");
    expect(groups[0].deletable.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("skips deletables outside the createdAt window", () => {
    const rows = [
      listingRow({ id: "a", createdAt: "2026-04-18T10:00:00.000Z" }),
      listingRow({
        id: "b",
        createdAt: "2026-04-18T12:00:00.000Z", // 2h later — outside 60s window
      }),
    ];
    const groups = groupDuplicates(rows, 60);
    expect(groups).toHaveLength(0);
  });

  it("does NOT merge rows with different moveInDates (CFM-legitimate clones)", () => {
    const rows = [
      listingRow({
        id: "cfm-a",
        moveInDate: "2026-05-01",
        createdAt: "2026-04-18T10:00:00.000Z",
      }),
      listingRow({
        id: "cfm-b",
        moveInDate: "2026-06-01",
        createdAt: "2026-04-18T10:00:10.000Z",
      }),
    ];
    const groups = groupDuplicates(rows, 60);
    expect(groups).toHaveLength(0);
  });

  it("does NOT cross owners", () => {
    const base = "2026-04-18T10:00:00.000Z";
    const rows = [
      listingRow({ id: "a", ownerId: "owner-1", createdAt: base }),
      listingRow({
        id: "b",
        ownerId: "owner-2",
        createdAt: "2026-04-18T10:00:10.000Z",
      }),
    ];
    const groups = groupDuplicates(rows, 60);
    expect(groups).toHaveLength(0);
  });

  it("orders by createdAt so the oldest is kept", () => {
    const rows = [
      listingRow({ id: "new", createdAt: "2026-04-18T10:00:30.000Z" }),
      listingRow({ id: "old", createdAt: "2026-04-18T10:00:00.000Z" }),
      listingRow({ id: "mid", createdAt: "2026-04-18T10:00:15.000Z" }),
    ];
    const groups = groupDuplicates(rows, 60);
    expect(groups[0].keeper.id).toBe("old");
    expect(groups[0].deletable.map((r) => r.id).sort()).toEqual([
      "mid",
      "new",
    ]);
  });
});
