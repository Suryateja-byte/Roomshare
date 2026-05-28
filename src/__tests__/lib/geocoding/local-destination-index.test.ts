import { searchLocalDestinationIndex } from "@/lib/geocoding/local-destination-index";

describe("local destination index", () => {
  it("returns Irving, TX without an external provider", () => {
    const results = searchLocalDestinationIndex("irving", { limit: 5 });

    expect(results[0]).toEqual(
      expect.objectContaining({
        id: "local:place:irving-tx",
        provider: "local",
        place_name: "Irving, TX",
        center: [-96.9489, 32.814],
        place_type: ["place"],
        requires_resolution: false,
      })
    );
  });

  it("does not emit address-like exact location results", () => {
    const results = searchLocalDestinationIndex("123 Main St", { limit: 5 });

    expect(JSON.stringify(results)).not.toMatch(/\b123\b|Main St/i);
    expect(
      results.every((result) => !result.place_type.includes("address"))
    ).toBe(true);
  });
});
