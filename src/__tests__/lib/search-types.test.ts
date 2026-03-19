import { sanitizeSearchQuery } from "@/lib/search-types";

describe("sanitizeSearchQuery HTML encoding removal", () => {
  it("preserves ampersand for FTS compatibility", () => {
    expect(sanitizeSearchQuery("Smith & Wesson")).toContain("&");
    expect(sanitizeSearchQuery("Smith & Wesson")).not.toContain("&amp;");
  });

  it("preserves angle brackets for FTS compatibility", () => {
    expect(sanitizeSearchQuery("price < 500")).toContain("<");
    expect(sanitizeSearchQuery("A > B")).toContain(">");
  });

  it("preserves R&B for music genre searches", () => {
    expect(sanitizeSearchQuery("R&B music")).toBe("R&B music");
  });
});
