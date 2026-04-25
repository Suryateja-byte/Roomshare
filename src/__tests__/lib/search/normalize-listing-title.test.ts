import { normalizeListingTitle } from "@/lib/search/normalize-listing-title";

describe("search/normalize-listing-title", () => {
  it("applies NFKC normalization before lowercasing", () => {
    expect(normalizeListingTitle("ｆｕｌｌｗｉｄｔｈ Loft")).toBe("fullwidth loft");
  });

  it("collapses punctuation into spaces", () => {
    expect(normalizeListingTitle("Loft!!! + den / w? view")).toBe(
      "loft den w view"
    );
  });

  it("collapses repeated whitespace to a single space", () => {
    expect(normalizeListingTitle("Private   Room\t\nDowntown")).toBe(
      "private room downtown"
    );
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeListingTitle("   Garden Studio   ")).toBe("garden studio");
  });

  it("normalizes mixed case consistently", () => {
    expect(normalizeListingTitle("MiXeD CaSe ROOM")).toBe("mixed case room");
  });
});
