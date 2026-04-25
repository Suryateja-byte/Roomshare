import { normalizeAddress } from "@/lib/search/normalize-address";

describe("search/normalize-address", () => {
  it("normalizes a basic address payload", () => {
    expect(
      normalizeAddress({
        address: "123 Main St.",
        city: "Austin",
        state: "TX",
        zip: "78701",
      })
    ).toBe("123 main st austin tx 78701");
  });

  it("canonicalizes supported unit keywords to a single unit token", () => {
    const variants = [
      "123 Main apartment 4B",
      "123 Main apt 4B",
      "123 Main suite 4B",
      "123 Main ste 4B",
      "123 Main unit 4B",
    ];

    expect(
      variants.map((address) =>
        normalizeAddress({
          address,
          city: "Austin",
          state: "TX",
          zip: "78701",
        })
      )
    ).toEqual([
      "123 main unit 4b austin tx 78701",
      "123 main unit 4b austin tx 78701",
      "123 main unit 4b austin tx 78701",
      "123 main unit 4b austin tx 78701",
      "123 main unit 4b austin tx 78701",
    ]);
  });

  it("preserves hash-prefixed unit tokens", () => {
    expect(
      normalizeAddress({
        address: "123 Main St. # 4B",
        city: "Austin",
        state: "TX",
        zip: "78701",
      })
    ).toBe("123 main st #4b austin tx 78701");
  });

  it("treats #4b and unit 4b as distinct normalized addresses", () => {
    const hashAddress = normalizeAddress({
      address: "123 Main #4B",
      city: "Austin",
      state: "TX",
      zip: "78701",
    });
    const unitAddress = normalizeAddress({
      address: "123 Main unit 4B",
      city: "Austin",
      state: "TX",
      zip: "78701",
    });

    expect(hashAddress).toBe("123 main #4b austin tx 78701");
    expect(unitAddress).toBe("123 main unit 4b austin tx 78701");
    expect(hashAddress).not.toBe(unitAddress);
  });

  it("is safe with null and undefined input", () => {
    expect(
      normalizeAddress({
        address: null,
        city: undefined,
        state: null,
        zip: undefined,
      })
    ).toBe("");
  });

  it("collapses repeated whitespace and strips trailing unit noise", () => {
    expect(
      normalizeAddress({
        address: "  123   Main --- Apt   4B   ",
        city: "  Austin ",
        state: " TX ",
        zip: " 78701 ",
      })
    ).toBe("123 main unit 4b austin tx 78701");

    expect(
      normalizeAddress({
        address: "123 Main unit",
        city: "Austin",
        state: "TX",
        zip: "78701",
      })
    ).toBe("123 main austin tx 78701");
  });

  it("stays deterministic across a parity fixture set", () => {
    const fixtures = [
      { address: "123 Main St.", city: "Austin", state: "TX", zip: "78701" },
      { address: "123 Main St #4B", city: "Austin", state: "TX", zip: "78701" },
      { address: "123 Main St Apt 4B", city: "Austin", state: "TX", zip: "78701" },
      { address: "500 Elm Apartment 9", city: "Dallas", state: "TX", zip: "75201" },
      { address: "500 Elm Suite 9", city: "Dallas", state: "TX", zip: "75201" },
      { address: "500 Elm Ste 9", city: "Dallas", state: "TX", zip: "75201" },
      { address: "88 Market #12", city: "San Francisco", state: "CA", zip: "94105" },
      { address: "88 Market Unit 12", city: "San Francisco", state: "CA", zip: "94105" },
      { address: "７７ King St", city: "Seattle", state: "WA", zip: "98101" },
      { address: "77 King St.", city: "Seattle", state: "WA", zip: "98101" },
      { address: "42 Broadway unit", city: "New York", state: "NY", zip: "10004" },
      { address: "42 Broadway #", city: "New York", state: "NY", zip: "10004" },
      { address: "10 Pine---Road", city: "Denver", state: "CO", zip: "80203" },
      { address: "10 Pine Road", city: "Denver", state: "CO", zip: "80203" },
      { address: "350 Lake View Apt4", city: "Chicago", state: "IL", zip: "60601" },
      { address: "350 Lake View #4", city: "Chicago", state: "IL", zip: "60601" },
      { address: null, city: "Madison", state: "WI", zip: "53703" },
      { address: "200 Oak St", city: null, state: "OR", zip: "97035" },
      { address: "15 Cedar Ct", city: "Portland", state: undefined, zip: "97205" },
      { address: "9 River Rd", city: "Boise", state: "ID", zip: undefined },
      { address: "1600 Pennsylvania Ave NW", city: "Washington", state: "DC", zip: "20500" },
      { address: "1 Infinite Loop", city: "Cupertino", state: "CA", zip: "95014" },
    ] satisfies Array<{
      address: string | null | undefined;
      city: string | null | undefined;
      state: string | null | undefined;
      zip: string | null | undefined;
    }>;

    const firstRun = fixtures.map((fixture) => normalizeAddress(fixture));
    const secondRun = fixtures.map((fixture) =>
      normalizeAddress({
        address: fixture.address,
        city: fixture.city,
        state: fixture.state,
        zip: fixture.zip,
      })
    );

    expect(secondRun).toEqual(firstRun);
    expect(firstRun).toHaveLength(22);
  });
});
