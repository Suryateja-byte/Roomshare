import { formatPrice, formatPriceCompact } from "@/lib/format";

describe("formatPrice", () => {
  it("formats regular price", () => expect(formatPrice(800)).toBe("$800"));
  it("formats price with comma", () =>
    expect(formatPrice(1500)).toBe("$1,500"));
  it("returns Free for 0", () => expect(formatPrice(0)).toBe("Free"));
  it("returns $0 for negative", () => expect(formatPrice(-5)).toBe("$0"));
  it("returns $0 for NaN", () => expect(formatPrice(NaN)).toBe("$0"));
  it("returns $0 for Infinity", () => expect(formatPrice(Infinity)).toBe("$0"));
});

describe("formatPriceCompact", () => {
  it("compacts 10000 to $10k", () =>
    expect(formatPriceCompact(10000)).toBe("$10k"));
  it("formats 1500 normally", () =>
    expect(formatPriceCompact(1500)).toBe("$1,500"));
});
